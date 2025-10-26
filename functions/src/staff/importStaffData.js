/* functions/src/staff/importStaffData.js */

const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { parse: csvParseSync } = require('csv-parse/sync');
const { parse: dateParse, isValid: isDateValid, isEqual: isDateEqual } = require('date-fns');

const db = getFirestore();

// --- Configuration ---
const REQUIRED_HEADERS = [ /* ... keep as is ... */
    'email', 'firstname', 'lastname', 'nickname', 'startdate',
    'department', 'position', 'paytype', 'rate'
];
const OPTIONAL_PROFILE_FIELDS = [ /* ... keep as is ... */
    'phoneNumber', 'birthdate', 'bankAccount', 'address',
    'emergencyContactName', 'emergencyContactPhone', 'status', 'endDate'
];
const JOB_FIELDS = ['position', 'department', 'payType', 'rate', 'startDate'];
const DEFAULT_PASSWORD = "Welcome123!";


// --- Helpers ---
const parseImportDate = (dateString) => { /* ... keep as is ... */
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

const areValuesEqual = (val1, val2) => { /* ... keep as is ... */
    if (val1 instanceof Timestamp && val2 instanceof Timestamp) {
        try {
            if (isDateValid(val1.toDate()) && isDateValid(val2.toDate())) {
                return isDateEqual(val1.toDate(), val2.toDate());
            }
        } catch (e) { /* Fallback */ }
        return val1.isEqual(val2);
    }
    if (typeof val1 === 'number' || typeof val2 === 'number') {
        return Number(val1) === Number(val2);
    }
    const v1IsEmpty = val1 === null || val1 === undefined || val1 === '';
    const v2IsEmpty = val2 === null || val2 === undefined || val2 === '';
    if (v1IsEmpty && v2IsEmpty) return true;
    return val1 === val2;
};

const getCurrentJob = (jobHistory) => { /* ... keep as is ... */
    if (!jobHistory || jobHistory.length === 0) return null;
    return [...jobHistory].sort((a, b) => {
        const timeA = a.startDate instanceof Timestamp ? a.startDate.toMillis() : 0;
        const timeB = b.startDate instanceof Timestamp ? b.startDate.toMillis() : 0;
        return timeB - timeA;
    })[0];
};

// --- Main Function ---

exports.importStaffDataHandler = functions.https.onCall({
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (request) => {
    // --- Auth Checks ---
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") throw new HttpsError("permission-denied", "Only managers can import staff data.");

    // --- Input Validation ---
    const { csvData, confirm } = request.data;
    if (!csvData || typeof csvData !== 'string') throw new HttpsError("invalid-argument", "CSV data string is required.");
    const isDryRun = !confirm;

    // --- Variables for Results ---
    let analysisResults = [];
    let errors = []; // Overall function errors, distinct from row analysis errors

    try {
        // --- Parse CSV ---
        const records = csvParseSync(csvData, { columns: true, skip_empty_lines: true, trim: true });
        if (records.length === 0) return { result: "CSV file was empty.", analysis: { creates: [], updates: [], noChanges: [], errors: [] } };

        // --- Header Validation ---
        const headers = Object.keys(records[0]).map(h => h.toLowerCase());
        const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) throw new HttpsError("invalid-argument", `Missing required CSV columns: ${missingHeaders.join(', ')}`);
        const hasStaffIdColumn = headers.includes('staffid');

        // --- Analyze Each Record ---
        for (let index = 0; index < records.length; index++) {
            const record = records[index];
            const rowNum = index + 2;
            // Initialize analysis object with staffId placeholder
            let analysis = { rowNum, action: 'error', details: null, errors: [], staffId: null, email: null, displayName: null };

            try {
                // --- Get & Validate Row Data ---
                 const getRecordValue = (key) => { /* ... keep as is ... */
                    const actualHeader = Object.keys(record).find(h => h.toLowerCase() === key.toLowerCase());
                    return actualHeader ? record[actualHeader]?.trim() : undefined;
                 };
                const missingRequiredCheck = REQUIRED_HEADERS.filter(h => { /* ... keep as is ... */
                    const value = getRecordValue(h);
                    return value === null || value === undefined || value === '';
                });
                if (missingRequiredCheck.length > 0) throw new Error(`Missing/empty required data for: ${missingRequiredCheck.join(', ')}`);

                const staffIdFromCsv = hasStaffIdColumn ? getRecordValue('staffId') : undefined;
                const email = getRecordValue('email');
                const payType = getRecordValue('payType');
                if (typeof email !== 'string' || !email.includes('@')) throw new Error(`Invalid email format`);
                if (!['Monthly', 'Hourly'].includes(payType)) throw new Error(`Invalid payType`);
                const rate = Number(getRecordValue('rate'));
                if (isNaN(rate)) throw new Error(`Invalid rate (must be a number)`);

                // Store email/name early for error reporting if needed
                analysis.email = email;
                analysis.displayName = getRecordValue('nickname') || `${getRecordValue('firstName')} ${getRecordValue('lastName')}`;


                // --- Prepare Potential Data ---
                const csvProfileData = { /* ... keep as is ... */
                    firstName: getRecordValue('firstName'),
                    lastName: getRecordValue('lastName'),
                    nickname: getRecordValue('nickname'),
                    email: email,
                    startDate: parseImportDate(getRecordValue('startDate')),
                    ...(OPTIONAL_PROFILE_FIELDS.reduce((acc, field) => {
                        const csvValue = getRecordValue(field);
                        if (field === 'birthdate' || field === 'endDate') {
                            const parsedDate = parseImportDate(csvValue);
                            if (parsedDate !== null) acc[field] = parsedDate;
                        } else if (csvValue !== undefined) {
                            acc[field] = csvValue === '' ? null : csvValue;
                        }
                        return acc;
                    }, {}))
                };
                 if (!csvProfileData.status) csvProfileData.status = 'active';

                const csvJobData = { /* ... keep as is ... */
                    position: getRecordValue('position'),
                    department: getRecordValue('department'),
                    startDate: parseImportDate(getRecordValue('startDate')),
                    payType: payType,
                    rate: rate,
                };

                // --- Find Existing User/Profile ---
                let existingProfile = null;
                let existingUid = null;

                if (staffIdFromCsv) {
                    const profileSnap = await db.collection('staff_profiles').doc(staffIdFromCsv).get();
                    if (profileSnap.exists) {
                        existingProfile = profileSnap.data();
                        existingUid = staffIdFromCsv;
                    } else throw new Error(`staffId "${staffIdFromCsv}" not found`);
                } else {
                     try {
                        const authUser = await admin.auth().getUserByEmail(email);
                        existingUid = authUser.uid;
                        const profileSnap = await db.collection('staff_profiles').doc(existingUid).get();
                        if (profileSnap.exists) existingProfile = profileSnap.data();
                    } catch (error) {
                        if (error.code !== 'auth/user-not-found') throw error;
                    }
                }

                 // Store found staffId in analysis for execution phase
                 if (existingUid) analysis.staffId = existingUid;


                // --- Determine Action & Changes ---
                if (existingProfile && existingUid) { // Potential Update
                    analysis.action = 'update';
                    // Update display name from existing profile if available
                    analysis.displayName = existingProfile.nickname || `${existingProfile.firstName} ${existingProfile.lastName}`;

                    let changes = {};
                    let requiresProfileUpdate = false;
                    let newJobDataForHistory = null;

                    Object.keys(csvProfileData).forEach(key => { /* ... compare profile, keep as is ... */
                        if (!areValuesEqual(csvProfileData[key], existingProfile[key])) {
                            changes[key] = { from: existingProfile[key] ?? null, to: csvProfileData[key] };
                            requiresProfileUpdate = true;
                        }
                    });

                    const currentJob = getCurrentJob(existingProfile.jobHistory);
                    let requiresJobHistoryUpdate = false;
                    if (!currentJob || JOB_FIELDS.some(key => !areValuesEqual(csvJobData[key], currentJob[key]))) { /* ... compare job, keep as is ... */
                        changes['job'] = { from: currentJob ?? 'None', to: csvJobData };
                        requiresJobHistoryUpdate = true;
                        newJobDataForHistory = csvJobData;
                    }

                    if (requiresProfileUpdate || requiresJobHistoryUpdate) {
                        analysis.details = changes;
                        // *** FIX: DO NOT STORE staffRef HERE ***
                        analysis.dataForUpdate = {
                           profileData: csvProfileData, // Store full intended data
                           newJobData: newJobDataForHistory,
                           // staffRef is removed
                        };
                    } else {
                        analysis.action = 'nochange';
                    }

                } else { // Create
                    analysis.action = 'create';
                    analysis.details = { ...csvProfileData, job: csvJobData };
                    analysis.dataForCreate = {
                       profileData: csvProfileData,
                       jobData: csvJobData
                    };
                }

            } catch (error) {
                analysis.action = 'error';
                analysis.errors.push(error.message || 'Unknown processing error');
                console.error(`Error processing row ${rowNum}:`, error);
                errors.push(`Row ${rowNum}: ${error.message}`); // Add to overall errors list as well
            }
            analysisResults.push(analysis);
        } // End of loop

        // --- Dry Run vs Execution ---
        if (isDryRun) {
            // --- Return Analysis Summary (safe to return now) ---
            const summary = analysisResults.reduce((acc, cur) => {
                 // Group by action type for the frontend modal
                const key = cur.action + (cur.action.endsWith('s') ? '' : 's'); // creates, updates, noChanges, errors
                 if (!acc[key]) acc[key] = [];
                 acc[key].push(cur);
                 return acc;
            }, { creates: [], updates: [], noChanges: [], errors: [] });

            return { analysis: summary }; // Return the structured summary

        } else {
            // --- Execute Confirmed Actions ---
            let recordsCreated = 0;
            let recordsUpdated = 0;
            const writePromises = [];
            const finalErrorsList = []; // Collect errors during execution

            analysisResults.forEach(res => {
                if (res.action === 'create' && res.dataForCreate) {
                     writePromises.push((async () => { /* ... create logic, keep as is ... */
                        const { profileData, jobData } = res.dataForCreate;
                        const batch = db.batch();
                        const newUserRecord = await admin.auth().createUser({ /* ... */
                            email: profileData.email,
                            password: DEFAULT_PASSWORD,
                            displayName: profileData.nickname,
                        });
                        const newUserId = newUserRecord.uid;
                        batch.set(db.collection('users').doc(newUserId), { role: 'staff' });
                        batch.set(db.collection('staff_profiles').doc(newUserId), { /* ... */
                            ...profileData,
                            uid: newUserId,
                            jobHistory: [jobData],
                            bonusStreak: 0,
                            createdAt: FieldValue.serverTimestamp(),
                        });
                        await batch.commit();
                        recordsCreated++;
                    })().catch(err => {
                        finalErrorsList.push(`Row ${res.rowNum} (Create Failed): ${err.message}`);
                        console.error(`Row ${res.rowNum} Create Failed:`, err);
                    }));
                } else if (res.action === 'update' && res.dataForUpdate && res.staffId) { // Check staffId exists
                    writePromises.push((async () => {
                         // *** FIX: Get staffRef HERE using staffId from analysis ***
                         const staffRef = db.collection('staff_profiles').doc(res.staffId);
                         const { profileData, newJobData } = res.dataForUpdate;

                         // Fetch the profile *again* right before update to get the latest jobHistory
                         const currentSnap = await staffRef.get();
                         if (!currentSnap.exists) throw new Error("Profile disappeared before update");
                         const currentProfile = currentSnap.data();

                         let updatePayload = {};
                         let requiresUpdate = false;

                         // Re-check profile changes against current data
                         Object.keys(profileData).forEach(key => {
                             if (!areValuesEqual(profileData[key], currentProfile[key])) {
                                 updatePayload[key] = profileData[key];
                                 requiresUpdate = true;
                             }
                         });


                         // Re-check job changes against current data
                          if (newJobData) {
                               const currentJob = getCurrentJob(currentProfile.jobHistory);
                               // Double check if job still needs adding (in case of rapid changes)
                               if (!currentJob || JOB_FIELDS.some(key => !areValuesEqual(newJobData[key], currentJob[key]))) {
                                    updatePayload.jobHistory = FieldValue.arrayUnion(newJobData);
                                    requiresUpdate = true;
                               }
                          }

                         if (requiresUpdate) { // Only update if there's still something to change
                            await staffRef.update(updatePayload);
                         }
                         recordsUpdated++;
                    })().catch(err => {
                         finalErrorsList.push(`Row ${res.rowNum} (Update Failed): ${err.message}`);
                          console.error(`Row ${res.rowNum} Update Failed:`, err);
                     }));
                } else if (res.action === 'error') {
                    // Collect analysis errors into final errors
                     finalErrorsList.push(`Row ${res.rowNum}: ${res.errors.join('; ')}`);
                }
            });

            await Promise.allSettled(writePromises); // Wait for all writes

            // --- Return Final Execution Summary ---
            const finalSummaryMessage = `Import finished. Processed: ${records.length}. Created: ${recordsCreated}. Updated: ${recordsUpdated}. Errors: ${finalErrorsList.length}.`;
            console.log(finalSummaryMessage);
             if (finalErrorsList.length > 0) console.error("Final import errors:", finalErrorsList);

            return {
                result: finalSummaryMessage,
                errors: finalErrorsList, // Return only execution/analysis errors
                defaultPassword: (recordsCreated > 0) ? DEFAULT_PASSWORD : null
            };
        }

    } catch (error) {
        console.error("Critical error during staff import process:", error);
        if (error instanceof HttpsError) throw error;
         return {
            result: `Import failed with a critical error: ${error.message}`,
            errors: [`General Error: ${error.message}`, ...errors],
             analysis: null // Should not happen if parsing failed, but good practice
        };
    }
});