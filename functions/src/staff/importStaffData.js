/* functions/src/staff/importStaffData.js */

const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { parse: csvParseSync } = require('csv-parse/sync');
const { parse: dateParse, isValid: isDateValid, isEqual: isDateEqual } = require('date-fns'); // Added isEqual

const db = getFirestore();

// --- Configuration ---
const REQUIRED_HEADERS = [
    'email', 'firstname', 'lastname', 'nickname', 'startdate',
    'department', 'position', 'paytype', 'rate'
];
const OPTIONAL_PROFILE_FIELDS = [ // Fields directly on the profile document
    'phoneNumber', 'birthdate', 'bankAccount', 'address',
    'emergencyContactName', 'emergencyContactPhone', 'status', 'endDate' // Added status, endDate
];
const JOB_FIELDS = ['position', 'department', 'payType', 'rate', 'startDate']; // Added startDate for job comparison

const DEFAULT_PASSWORD = "Welcome123!";


// --- Helpers ---

/**
 * Parses 'dd/MM/yyyy' strings into Firestore Timestamps.
 * Returns null if the date string is empty or invalid.
 */
const parseImportDate = (dateString) => {
    if (!dateString) return null;
    try {
        const parsedDate = dateParse(dateString, 'dd/MM/yyyy', new Date());
        if (isDateValid(parsedDate)) {
            return Timestamp.fromDate(parsedDate);
        }
        console.warn(`Invalid date format encountered: "${dateString}"`);
        return null;
    } catch (e) {
        console.warn(`Error parsing date: "${dateString}"`, e);
        return null;
    }
};

/**
 * Compares two values, handling Firestore Timestamps correctly.
 */
const areValuesEqual = (val1, val2) => {
    if (val1 instanceof Timestamp && val2 instanceof Timestamp) {
        // Use date-fns for robust comparison if available and valid
        try {
            if (isDateValid(val1.toDate()) && isDateValid(val2.toDate())) {
                return isDateEqual(val1.toDate(), val2.toDate());
            }
        } catch (e) { /* Fallback to simple comparison */ }
        // Fallback for invalid dates or if date-fns fails
        return val1.isEqual(val2);
    }
    // Handle potential number vs string comparison for rate
    if (typeof val1 === 'number' || typeof val2 === 'number') {
        return Number(val1) === Number(val2);
    }
    // Handle null/undefined vs empty string equivalence for optional fields
    const v1IsEmpty = val1 === null || val1 === undefined || val1 === '';
    const v2IsEmpty = val2 === null || val2 === undefined || val2 === '';
    if (v1IsEmpty && v2IsEmpty) return true;

    return val1 === val2;
};

/**
 * Gets the most recent job from a job history array.
 */
const getCurrentJob = (jobHistory) => {
    if (!jobHistory || jobHistory.length === 0) return null;
    return [...jobHistory].sort((a, b) => {
        const timeA = a.startDate instanceof Timestamp ? a.startDate.toMillis() : 0;
        const timeB = b.startDate instanceof Timestamp ? b.startDate.toMillis() : 0;
        return timeB - timeA; // Descending order
    })[0];
};

// --- Main Function ---

exports.importStaffDataHandler = functions.https.onCall({
    region: "us-central1", // Keep consistent
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
    const { csvData, confirm } = request.data; // Get 'confirm' flag
    if (!csvData || typeof csvData !== 'string') {
        throw new HttpsError("invalid-argument", "CSV data string is required.");
    }
    const isDryRun = !confirm; // If confirm is not explicitly true, it's a dry run

    // --- Variables for Results ---
    let analysisResults = []; // Stores detailed analysis for each row
    let errors = []; // Stores processing errors

    try {
        // --- Parse CSV Data ---
        const records = csvParseSync(csvData, { columns: true, skip_empty_lines: true, trim: true });
        if (records.length === 0) {
            return { result: "CSV file was empty or contained no data rows.", analysis: { creates: [], updates: [], noChanges: [], errors: [] } };
        }

        // --- Header Validation ---
        const headers = Object.keys(records[0]).map(h => h.toLowerCase());
        const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) {
            throw new HttpsError("invalid-argument", `Missing required columns in CSV: ${missingHeaders.join(', ')}`);
        }
        const hasStaffIdColumn = headers.includes('staffid');

        // --- Analyze Each Record ---
        for (let index = 0; index < records.length; index++) {
            const record = records[index];
            const rowNum = index + 2;
            let analysis = { rowNum, action: 'error', details: null, errors: [] };

            try {
                const getRecordValue = (key) => {
                    const actualHeader = Object.keys(record).find(h => h.toLowerCase() === key.toLowerCase());
                    return actualHeader ? record[actualHeader]?.trim() : undefined; // Ensure trimming
                };

                // --- Basic Row Validation ---
                const missingRequiredCheck = REQUIRED_HEADERS.filter(h => {
                    const value = getRecordValue(h);
                    return value === null || value === undefined || value === '';
                });
                if (missingRequiredCheck.length > 0) {
                    throw new Error(`Missing/empty required data for: ${missingRequiredCheck.join(', ')}`);
                }

                const staffId = hasStaffIdColumn ? getRecordValue('staffId') : undefined;
                const email = getRecordValue('email');
                const payType = getRecordValue('payType');

                if (typeof email !== 'string' || !email.includes('@')) throw new Error(`Invalid email format`);
                if (!['Monthly', 'Hourly'].includes(payType)) throw new Error(`Invalid payType`);
                const rate = Number(getRecordValue('rate'));
                if (isNaN(rate)) throw new Error(`Invalid rate (must be a number)`);

                // --- Prepare Potential Data ---
                const csvProfileData = {
                    firstName: getRecordValue('firstName'),
                    lastName: getRecordValue('lastName'),
                    nickname: getRecordValue('nickname'),
                    email: email,
                    startDate: parseImportDate(getRecordValue('startDate')),
                    // Include optional fields only if they have a value in the CSV
                    ...(OPTIONAL_PROFILE_FIELDS.reduce((acc, field) => {
                        const csvValue = getRecordValue(field);
                        // Special handling for dates
                        if (field === 'birthdate' || field === 'endDate') {
                            const parsedDate = parseImportDate(csvValue);
                            if (parsedDate !== null) acc[field] = parsedDate;
                        } else if (csvValue !== undefined) { // Check if column exists
                             // Treat empty string in optional fields as null for DB
                            acc[field] = csvValue === '' ? null : csvValue;
                        }
                        return acc;
                    }, {}))
                };
                 // Ensure status has a default if missing/empty
                if (!csvProfileData.status) csvProfileData.status = 'active';


                const csvJobData = {
                    position: getRecordValue('position'),
                    department: getRecordValue('department'),
                    startDate: parseImportDate(getRecordValue('startDate')), // Job start date uses profile start date from CSV
                    payType: payType,
                    rate: rate,
                };


                // --- Find Existing User/Profile ---
                let existingProfile = null;
                let existingUid = null;
                let staffRef;

                if (staffId) {
                    staffRef = db.collection('staff_profiles').doc(staffId);
                    const profileSnap = await staffRef.get();
                    if (profileSnap.exists) {
                        existingProfile = profileSnap.data();
                        existingUid = staffId;
                    } else throw new Error(`staffId "${staffId}" not found`);
                } else {
                    try {
                        const authUser = await admin.auth().getUserByEmail(email);
                        existingUid = authUser.uid;
                        staffRef = db.collection('staff_profiles').doc(existingUid);
                        const profileSnap = await staffRef.get();
                        if (profileSnap.exists) existingProfile = profileSnap.data();
                    } catch (error) {
                        if (error.code !== 'auth/user-not-found') throw error; // Rethrow unexpected errors
                        // User not found by email, will be a 'create' action
                    }
                }

                // --- Determine Action & Changes ---
                if (existingProfile && existingUid) { // Potential Update
                    analysis.action = 'update';
                    analysis.staffId = existingUid;
                    analysis.email = existingProfile.email; // Use existing email for display
                    analysis.displayName = existingProfile.nickname || `${existingProfile.firstName} ${existingProfile.lastName}`;

                    let changes = {};
                    let requiresProfileUpdate = false;
                    let newJobDataForHistory = null;

                    // Compare profile fields
                    Object.keys(csvProfileData).forEach(key => {
                        if (!areValuesEqual(csvProfileData[key], existingProfile[key])) {
                            changes[key] = { from: existingProfile[key] ?? null, to: csvProfileData[key] };
                            requiresProfileUpdate = true;
                        }
                    });

                    // Compare job fields (against current job)
                    const currentJob = getCurrentJob(existingProfile.jobHistory);
                    let requiresJobHistoryUpdate = false;
                    if (!currentJob || JOB_FIELDS.some(key => !areValuesEqual(csvJobData[key], currentJob[key]))) {
                        // Job is different or doesn't exist, needs to be added
                        changes['job'] = { from: currentJob ?? 'None', to: csvJobData };
                        requiresJobHistoryUpdate = true;
                        newJobDataForHistory = csvJobData;
                    }

                    if (requiresProfileUpdate || requiresJobHistoryUpdate) {
                        analysis.details = changes;
                        analysis.dataForUpdate = { // Store data needed for the actual update
                           profileData: requiresProfileUpdate ? csvProfileData : {}, // Only include fields that changed
                           newJobData: newJobDataForHistory,
                           staffRef: staffRef // Store ref for execution phase
                        };
                    } else {
                        analysis.action = 'nochange'; // No differences found
                    }

                } else { // Create
                    analysis.action = 'create';
                    analysis.email = email;
                    analysis.displayName = csvProfileData.nickname || `${csvProfileData.firstName} ${csvProfileData.lastName}`;
                    analysis.details = { ...csvProfileData, job: csvJobData };
                     analysis.dataForCreate = { // Store data needed for creation
                       profileData: csvProfileData,
                       jobData: csvJobData
                    };
                }

            } catch (error) {
                analysis.action = 'error';
                analysis.errors.push(error.message || 'Unknown processing error');
                console.error(`Error processing row ${rowNum}:`, error);
                errors.push(`Row ${rowNum}: ${error.message}`); // Add to overall errors
            }
            analysisResults.push(analysis);
        } // End of loop

        // --- Dry Run vs Execution ---
        if (isDryRun) {
            // --- Return Analysis Summary ---
            const summary = analysisResults.reduce((acc, cur) => {
                acc[cur.action === 'error' ? 'errors' : cur.action + 's'].push(cur);
                return acc;
            }, { creates: [], updates: [], noChanges: [], errors: [] });

            return { analysis: summary };

        } else {
            // --- Execute Confirmed Actions ---
            let recordsCreated = 0;
            let recordsUpdated = 0;
            const writePromises = [];

            analysisResults.forEach(res => {
                if (res.action === 'create' && res.dataForCreate) {
                     writePromises.push((async () => {
                        const { profileData, jobData } = res.dataForCreate;
                        const batch = db.batch();
                        const newUserRecord = await admin.auth().createUser({
                            email: profileData.email,
                            password: DEFAULT_PASSWORD,
                            displayName: profileData.nickname,
                        });
                        const newUserId = newUserRecord.uid;
                        batch.set(db.collection('users').doc(newUserId), { role: 'staff' });
                        batch.set(db.collection('staff_profiles').doc(newUserId), {
                            ...profileData,
                            uid: newUserId,
                            jobHistory: [jobData],
                            bonusStreak: 0,
                            createdAt: FieldValue.serverTimestamp(),
                        });
                        await batch.commit();
                        recordsCreated++;
                    })().catch(err => {
                        errors.push(`Row ${res.rowNum} (Create Failed): ${err.message}`);
                        // Update analysis result for final summary
                        res.action = 'error';
                        res.errors.push(`Database write failed: ${err.message}`);
                     }));
                } else if (res.action === 'update' && res.dataForUpdate) {
                    writePromises.push((async () => {
                         const { profileData, newJobData, staffRef } = res.dataForUpdate;
                         let updatePayload = { ...profileData }; // Start with profile changes
                         if (newJobData) {
                             updatePayload.jobHistory = FieldValue.arrayUnion(newJobData);
                         }
                         if (Object.keys(updatePayload).length > 0) { // Only update if there's something to change
                            await staffRef.update(updatePayload);
                         }
                         recordsUpdated++;
                    })().catch(err => {
                         errors.push(`Row ${res.rowNum} (Update Failed): ${err.message}`);
                         res.action = 'error';
                         res.errors.push(`Database write failed: ${err.message}`);
                     }));
                }
            });

            await Promise.allSettled(writePromises); // Wait for all writes to finish or fail

            // --- Return Final Execution Summary ---
            const finalSummaryMessage = `Import finished. Processed: ${records.length}. Created: ${recordsCreated}. Updated: ${recordsUpdated}. Errors: ${errors.length}.`;
            console.log(finalSummaryMessage);
             if (errors.length > 0) console.error("Final import errors:", errors);

            // Filter analysisResults to only include final errors for the report
            const finalErrorsList = analysisResults.filter(r => r.action === 'error').map(r => `Row ${r.rowNum}: ${r.errors.join('; ')}`);


            return {
                result: finalSummaryMessage,
                errors: finalErrorsList,
                defaultPassword: (recordsCreated > 0) ? DEFAULT_PASSWORD : null
            };
        }

    } catch (error) {
        console.error("Critical error during staff import process:", error);
        // Ensure HttpsError is thrown for client
        if (error instanceof HttpsError) throw error;
        // Package other errors nicely
         return {
            result: `Import failed with a critical error: ${error.message}`,
            errors: [`General Error: ${error.message}`, ...errors], // Include row-specific errors if any occurred before crash
             analysis: null // Indicate analysis might be incomplete
        };
    }
});