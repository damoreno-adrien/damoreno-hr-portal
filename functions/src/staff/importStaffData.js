const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { parse } = require('csv-parse/sync');

const db = getFirestore();

// --- Configuration ---
const REQUIRED_HEADERS = [
    'email', 'firstname', 'lastname', 'nickname', 'startdate',
    'department', 'position', 'paytype', 'rate'
];
const DEFAULT_PASSWORD = "Welcome123!";

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
        const records = parse(csvData, {
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

            const email = getRecordValue('email');
            const payType = getRecordValue('payType');

            if (typeof email !== 'string' || !email.includes('@')) {
                throw new Error(`Row ${rowNum}: Invalid email format: ${email}`);
            }
            if (payType !== 'Monthly' && payType !== 'Hourly') {
                throw new Error(`Row ${rowNum}: Invalid payType. Must be 'Monthly' or 'Hourly'. Value found: ${payType}`);
            }

            // --- Prepare Firestore Data Object ---
            const staffData = {
                firstName: getRecordValue('firstName'),
                lastName: getRecordValue('lastName'),
                nickname: getRecordValue('nickname'),
                email: email,
                startDate: getRecordValue('startDate'),
                phoneNumber: getRecordValue('phoneNumber') || null,
                birthdate: getRecordValue('birthdate') || null,
                bankAccount: getRecordValue('bankAccount') || null,
                address: getRecordValue('address') || null,
                emergencyContactName: getRecordValue('emergencyContactName') || null,
                emergencyContactPhone: getRecordValue('emergencyContactPhone') || null,
                status: 'active',
                bonusStreak: 0,
            };
            const jobData = {
                position: getRecordValue('position'),
                department: getRecordValue('department'),
                startDate: getRecordValue('startDate'),
                payType: payType,
                rate: Number(getRecordValue('rate')) || 0,
            };

            // --- Check if User Exists ---
            let userRecord;
            let existingProfile = null;
            try {
                userRecord = await admin.auth().getUserByEmail(email);
                const profileSnap = await db.collection('staff_profiles').doc(userRecord.uid).get();
                if (profileSnap.exists) { existingProfile = profileSnap.data(); }
            } catch (error) {
                if (error.code !== 'auth/user-not-found') {
                    throw new Error(`Row ${rowNum}: Error checking user ${email}: ${error.message}`);
                }
            }

            // --- Create or Update ---
            if (userRecord) { // User Exists - Update
                const staffRef = db.collection('staff_profiles').doc(userRecord.uid);
                await staffRef.update({
                    ...staffData,
                    jobHistory: FieldValue.arrayUnion(jobData),
                    bonusStreak: existingProfile?.bonusStreak ?? 0
                });
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
                const staffRef = db.collection('staff_profiles').doc(newUserId);
                batch.set(userRef, { role: 'staff' });
                batch.set(staffRef, {
                    ...staffData,
                    uid: newUserId,
                    jobHistory: [jobData],
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
                errors.push(`Row ${rowNum}: ${reasonMessage}`);
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