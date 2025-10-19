const { HttpsError, https } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { parse } = require('csv-parse/sync'); // For synchronous parsing

const db = getFirestore();

// --- Configuration ---
const REQUIRED_HEADERS = [
    'email', 'firstName', 'lastName', 'nickname', 'startDate', 
    'department', 'position', 'payType', 'rate'
];
const ALL_EXPECTED_HEADERS = [ // Includes optional fields
    'email', 'firstName', 'lastName', 'nickname', 'startDate', 
    'department', 'position', 'payType', 'rate',
    'phoneNumber', 'birthdate', 'bankAccount', 'address',
    'emergencyContactName', 'emergencyContactPhone'
];
const DEFAULT_PASSWORD = "Welcome123!"; // Default password for new users

exports.importStaffDataHandler = https.onCall({ 
    region: "us-central1", 
    timeoutSeconds: 540, // Increase timeout for potentially long imports
    memory: "1GiB"       // Increase memory for parsing larger files
}, async (request) => {
    // --- Auth Checks ---
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can import staff data.");
    }

    // --- Input Validation ---
    const { csvData } = request.data;
    if (!csvData || typeof csvData !== 'string') {
        throw new HttpsError("invalid-argument", "CSV data string is required.");
    }

    // --- Variables for Summary ---
    let recordsProcessed = 0;
    let recordsCreated = 0;
    let recordsUpdated = 0;
    let errors = [];

    try {
        // --- Parse CSV Data ---
        const records = parse(csvData, {
            columns: true,       // Treat first row as headers
            skip_empty_lines: true,
            trim: true,          // Trim whitespace from values
            cast: (value, context) => {
                // Basic type casting (can add more specific casting if needed)
                if (context.column === 'rate') return Number(value) || 0;
                // Add casting for dates if necessary, though YYYY-MM-DD strings are okay for Firestore
                return value;
            }
        });

        if (records.length === 0) {
            return { result: "CSV file was empty or contained no data rows." };
        }

        // --- Header Validation ---
        const headers = Object.keys(records[0]);
        const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) {
            throw new HttpsError("invalid-argument", `Missing required columns in CSV: ${missingHeaders.join(', ')}`);
        }
        
        // --- Process Each Record ---
        // Use Promise.allSettled to process rows concurrently but wait for all
        const results = await Promise.allSettled(records.map(async (record, index) => {
            recordsProcessed++;
            const rowNum = index + 2; // +1 for header row, +1 for 0-index

            // --- Basic Row Validation ---
            const missingRequired = REQUIRED_HEADERS.filter(h => !record[h]);
            if (missingRequired.length > 0) {
                throw new Error(`Row ${rowNum}: Missing required data for column(s): ${missingRequired.join(', ')}`);
            }
            if (typeof record.email !== 'string' || !record.email.includes('@')) {
                throw new Error(`Row ${rowNum}: Invalid email format: ${record.email}`);
            }
            if (record.payType !== 'Monthly' && record.payType !== 'Hourly') {
                 throw new Error(`Row ${rowNum}: Invalid payType. Must be 'Monthly' or 'Hourly'.`);
            }
            // Add more specific validation (date formats, department exists?) if needed

            // --- Prepare Firestore Data Object ---
            const staffData = {
                firstName: record.firstName,
                lastName: record.lastName,
                nickname: record.nickname,
                email: record.email,
                startDate: record.startDate, // Assuming YYYY-MM-DD format
                phoneNumber: record.phoneNumber || null,
                birthdate: record.birthdate || null, // Assuming YYYY-MM-DD format
                bankAccount: record.bankAccount || null,
                address: record.address || null,
                emergencyContactName: record.emergencyContactName || null,
                emergencyContactPhone: record.emergencyContactPhone || null,
                status: 'active', // Always set new/updated users to active
                bonusStreak: 0, // Default for new users
            };
            const jobData = {
                position: record.position,
                department: record.department,
                startDate: record.startDate,
                payType: record.payType,
                rate: record.rate, // Already cast to Number
            };

            // --- Check if User Exists ---
            let userRecord;
            let existingProfile = null;
            try {
                userRecord = await admin.auth().getUserByEmail(record.email);
                const profileSnap = await db.collection('staff_profiles').doc(userRecord.uid).get();
                if (profileSnap.exists) {
                    existingProfile = profileSnap.data();
                }
            } catch (error) {
                if (error.code !== 'auth/user-not-found') {
                    throw new Error(`Row ${rowNum}: Error checking user ${record.email}: ${error.message}`); // Re-throw unexpected errors
                }
                // User not found - proceed to create
            }

            // --- Create or Update ---
            const batch = db.batch(); // Use a batch for atomicity per row
            
            if (userRecord) { // User Exists - Update
                const staffRef = db.collection('staff_profiles').doc(userRecord.uid);
                // Update profile data, keeping existing job history and potentially bonus streak
                batch.update(staffRef, { 
                    ...staffData, 
                    jobHistory: FieldValue.arrayUnion(jobData), // Add new job entry
                    bonusStreak: existingProfile?.bonusStreak ?? 0 // Keep existing streak if profile found
                });
                return { action: 'updated', email: record.email };
                
            } else { // User Doesn't Exist - Create
                const newUserRecord = await admin.auth().createUser({
                    email: record.email,
                    password: DEFAULT_PASSWORD,
                    displayName: record.nickname,
                });
                const newUserId = newUserRecord.uid;

                const userRef = db.collection('users').doc(newUserId);
                const staffRef = db.collection('staff_profiles').doc(newUserId);

                batch.set(userRef, { role: 'staff' });
                batch.set(staffRef, {
                    ...staffData,
                    uid: newUserId,
                    jobHistory: [jobData], // Start with the imported job
                    createdAt: FieldValue.serverTimestamp(),
                });
                await batch.commit(); // Commit immediately after creating user
                return { action: 'created', email: record.email };
            }
        }));

        // --- Tally Results ---
        results.forEach((result, index) => {
            const rowNum = index + 2;
            if (result.status === 'fulfilled') {
                if (result.value.action === 'created') recordsCreated++;
                if (result.value.action === 'updated') recordsUpdated++;
            } else {
                errors.push(`Row ${rowNum}: ${result.reason.message}`);
            }
        });

    } catch (error) {
        // Handle parsing errors or general function errors
        console.error("Error during staff import:", error);
        if (error instanceof HttpsError) throw error; // Re-throw HttpsErrors
        errors.push(`General Error: ${error.message}`); // Add other errors to the list
    }

    // --- Return Summary ---
    const summaryMessage = `Import finished. Processed: ${recordsProcessed}. Created: ${recordsCreated}. Updated: ${recordsUpdated}. Errors: ${errors.length}.`;
    console.log(summaryMessage);
    if (errors.length > 0) console.error("Import errors:", errors);

    return { 
        result: summaryMessage, 
        errors: errors, // Send detailed errors back to the frontend
        defaultPassword: errors.length < recordsProcessed ? DEFAULT_PASSWORD : null // Only show password if some succeeded
    };
});