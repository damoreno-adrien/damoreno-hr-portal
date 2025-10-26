/* functions/src/staff/importStaffData.js */

const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { parse: csvParseSync } = require('csv-parse/sync'); // Renamed to avoid conflict
const { parse: dateParse, isValid: isDateValid } = require('date-fns'); // <-- FIX 1: Import date-fns

const db = getFirestore();

// --- Configuration ---
const REQUIRED_HEADERS = [
    'email', 'firstname', 'lastname', 'nickname', 'startdate',
    'department', 'position', 'paytype', 'rate'
];
const DEFAULT_PASSWORD = "Welcome123!";


/**
 * FIX 1: Helper to parse 'dd/MM/yyyy' strings into Firestore Timestamps
 * Returns null if the date string is empty or invalid.
 */
const parseImportDate = (dateString) => {
    if (!dateString) return null; // Handle empty strings

    try {
        const parsedDate = dateParse(dateString, 'dd/MM/yyyy', new Date());
        if (isDateValid(parsedDate)) {
            return Timestamp.fromDate(parsedDate); // Convert to Firestore Timestamp
        }
        return null; // Invalid date format
    } catch (e) {
        console.warn(`Could not parse date: "${dateString}"`, e);
        return null; // Error during parsing
    }
};

/**
 * FIX 2: Helper to check if the job from CSV is the same as the current job.
 */
const isSameJob = (csvJob, currentJob) => {
    if (!currentJob) return false; // If no current job, this is definitely a new one
    
    // Compare the key fields.
    return csvJob.position === currentJob.position &&
           csvJob.department === currentJob.department &&
           csvJob.payType === currentJob.payType &&
           Number(csvJob.rate) === Number(currentJob.rate);
};


exports.importStaffDataHandler = functions.https.onCall({
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB"
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
        const records = csvParseSync(csvData, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });

        if (records.length === 0) {
            return { result: "CSV file was empty or contained no data rows." };
        }

        // --- Header Validation (Case-Insensitive) ---
        const headers = Object.keys(records[0]).map(h => h.toLowerCase());
        const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) {
            // Note: We don't require 'staffId' as it might be a new user
            throw new HttpsError("invalid-argument", `Missing required columns in CSV (case-insensitive check failed for): ${missingHeaders.join(', ')}`);
        }

        // --- Process Each Record ---
        const results = await Promise.allSettled(records.map(async (record, index) => {
            recordsProcessed++;
            const rowNum = index + 2;

            const getRecordValue = (key) => {
                const actualHeader = Object.keys(record).find(h => h.toLowerCase() === key.toLowerCase());
                return actualHeader ? record[actualHeader] : undefined;
            };

            // --- Row Validation (Checks for null, undefined, or empty strings) ---
            const missingRequiredCheck = REQUIRED_HEADERS.filter(h => {
                const value = getRecordValue(h);
                return value === null || value === undefined || String(value).trim() === '';
            });

            if (missingRequiredCheck.length > 0) {
                console.error(`Row ${rowNum} validation failed. Missing/Empty required fields: ${missingRequiredCheck.join(', ')}. Record data:`, record);
                throw new Error(`Row ${rowNum}: Missing or empty required data for column(s): ${missingRequiredCheck.join(', ')}`);
            }

            // *** REFACTOR: Get staffId AND email ***
            const staffId = getRecordValue('staffId'); // Will be undefined if column is missing
            const email = getRecordValue('email');
            const payType = getRecordValue('payType');

            if (typeof email !== 'string' || !email.includes('@')) {
                throw new Error(`Row ${rowNum}: Invalid email format: ${email}`);
            }
            if (payType !== 'Monthly' && payType !== 'Hourly') {
                throw new Error(`Row ${rowNum}: Invalid payType. Must be 'Monthly' or 'Hourly'. Value found: ${payType}`);
            }

            // --- Prepare Firestore Data Object (with FIXED dates) ---
            const staffData = {
                firstName: getRecordValue('firstName'),
                lastName: getRecordValue('lastName'),
                nickname: getRecordValue('nickname'),
                email: email,
                // *** FIX 1: Use date parser ***
                startDate: parseImportDate(getRecordValue('startDate')),
                phoneNumber: getRecordValue('phoneNumber') || null,
                birthdate: parseImportDate(getRecordValue('birthdate')), // Use parser here too
                bankAccount: getRecordValue('bankAccount') || null,
                address: getRecordValue('address') || null,
                emergencyContactName: getRecordValue('emergencyContactName') || null,
                emergencyContactPhone: getRecordValue('emergencyContactPhone') || null,
                status: getRecordValue('status') || 'active', // Allow status update
                // Note: bonusStreak is handled in the update logic
            };
            const jobData = {
                position: getRecordValue('position'),
                department: getRecordValue('department'),
                // *** FIX 1: Use date parser ***
                startDate: parseImportDate(getRecordValue('startDate')),
                payType: payType,
                rate: Number(getRecordValue('rate')) || 0,
            };

            // --- REFACTOR: Find user by staffId first, then email ---
            let userRecord = null;
            let existingProfile = null;
            let staffRef;

            if (staffId) {
                // Priority: Find by ID
                staffRef = db.collection('staff_profiles').doc(staffId);
                const profileSnap = await staffRef.get();
                if (profileSnap.exists) {
                    existingProfile = profileSnap.data();
                    userRecord = { uid: staffId }; // Mock userRecord
                } else {
                    throw new Error(`Row ${rowNum}: staffId "${staffId}" not found in database.`);
                }
            } else {
                // Fallback: Find by Email
                try {
                    const authUser = await admin.auth().getUserByEmail(email);
                    userRecord = { uid: authUser.uid }; // Use the found UID
                    staffRef = db.collection('staff_profiles').doc(userRecord.uid);
                    const profileSnap = await staffRef.get();
                    if (profileSnap.exists) { existingProfile = profileSnap.data(); }
                } catch (error) {
                    if (error.code !== 'auth/user-not-found') {
                        throw new Error(`Row ${rowNum}: Error checking user ${email}: ${error.message}`);
                    }
                    // User not found, will proceed to create
                }
            }

            // --- Create or Update ---
            if (userRecord && existingProfile) { // User Exists - Update
                
                // *** FIX 2: Check if job is a duplicate ***
                const existingJobHistory = existingProfile.jobHistory || [];
                const currentJob = existingJobHistory.length > 0 
                    ? [...existingJobHistory].sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis())[0]
                    : null;
                
                const isNewJob = !isSameJob(jobData, currentJob);
                
                let updateData = { ...staffData, bonusStreak: existingProfile.bonusStreak ?? 0 };

                if (isNewJob) {
                    // Only add to history if it's different
                    updateData.jobHistory = FieldValue.arrayUnion(jobData);
                }
                
                await staffRef.update(updateData);
                return { action: 'updated', email: email };

            } else { // User Doesn't Exist - Create
                const batch = db.batch();
                const newUserRecord = await admin.auth().createUser({
                    email: email,
                    password: DEFAULT_PASSWORD,
                    displayName: staffData.nickname,
                });
                const newUserId = newUserRecord.uid;
                const userRef = db.collection('users').doc(newUserId);
                staffRef = db.collection('staff_profiles').doc(newUserId);
                batch.set(userRef, { role: 'staff' });
                batch.set(staffRef, {
                    ...staffData,
                    uid: newUserId,
                    jobHistory: [jobData],
                    bonusStreak: 0, // Set default for new user
                    createdAt: FieldValue.serverTimestamp(),
                });
                await batch.commit();
                return { action: 'created', email: email };
            }
        }));

        // --- Tally Results ---
        results.forEach((result, index) => {
            const rowNum = index + 2;
            if (result.status === 'fulfilled') {
                if (result.value.action === 'created') recordsCreated++;
                if (result.value.action === 'updated') recordsUpdated++;
            } else {
                const reasonMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
                errors.push(`${reasonMessage}`); // Simplified error message
            }
        });

    } catch (error) {
        console.error("Error during staff import:", error);
        if (error instanceof HttpsError) throw error;
        errors.push(`General Error: ${error.message}`);
    }

    // --- Return Summary ---
    const summaryMessage = `Import finished. Processed: ${recordsProcessed}. Created: ${recordsCreated}. Updated: ${recordsUpdated}. Errors: ${errors.length}.`;
    console.log(summaryMessage);
    if (errors.length > 0) console.error("Import errors:", errors);

    return {
        result: summaryMessage,
        errors: errors,
        defaultPassword: (recordsCreated > 0) ? DEFAULT_PASSWORD : null
    };
});