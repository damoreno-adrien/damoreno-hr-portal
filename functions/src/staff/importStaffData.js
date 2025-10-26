/* functions/src/staff/importStaffData.js */

const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { parse: csvParseSync } = require('csv-parse/sync');
const { parse: dateParse, isValid: isDateValid, isEqual: isDateEqual } = require('date-fns');

const db = getFirestore();

// --- Configuration ---
// *** JOB FIELDS REMOVED from required headers ***
const REQUIRED_HEADERS = [
    'email', 'firstname', 'lastname', 'nickname', 'startdate'
    // 'department', 'position', 'paytype', 'rate' // Removed
];
const OPTIONAL_PROFILE_FIELDS = [
    'phoneNumber', 'birthdate', 'bankAccount', 'address',
    'emergencyContactName', 'emergencyContactPhone', 'status', 'endDate'
];
// const JOB_FIELDS = [...] // Removed
const DEFAULT_PASSWORD = "Welcome123!";


// --- Helpers ---
const parseImportDate = (dateString) => { /* ... keep as is ... */
     if (!dateString) return null;
    try {
        const parsedDate = dateParse(dateString, 'dd/MM/yyyy', new Date());
        if (isDateValid(parsedDate)) return Timestamp.fromDate(parsedDate);
        console.warn(`Invalid date format encountered: "${dateString}"`); return null;
    } catch (e) { console.warn(`Error parsing date: "${dateString}"`, e); return null; }
};
const areValuesEqual = (val1, val2) => { /* ... keep as is ... */
     if (val1 instanceof Timestamp && val2 instanceof Timestamp) {
        try {
            if (isDateValid(val1.toDate()) && isDateValid(val2.toDate())) return isDateEqual(val1.toDate(), val2.toDate());
        } catch (e) {} return val1.isEqual(val2);
    }
    if (typeof val1 === 'number' || typeof val2 === 'number') return Number(val1) === Number(val2);
    const v1IsEmpty = val1 === null || val1 === undefined || val1 === '';
    const v2IsEmpty = val2 === null || val2 === undefined || val2 === '';
    if (v1IsEmpty && v2IsEmpty) return true;
    return val1 === val2;
};
// const getCurrentJob = (...) // Removed - No longer needed here


// --- Main Function ---
exports.importStaffDataHandler = functions.https.onCall({
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (request) => {
    // --- Auth Checks --- (remain the same)
     if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");
    // ... (rest of auth/role check) ...
     const callerUid = request.auth.uid;
    try {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") throw new HttpsError("permission-denied", "Only managers can import staff data.");
        console.log(`importStaffData: Authorized manager ${callerUid}.`);
    } catch(err) { throw new HttpsError("internal", "Failed to verify user role.", err.message); }


    // --- Input Validation --- (remains the same)
     const { csvData, confirm } = request.data;
    if (!csvData || typeof csvData !== 'string') throw new HttpsError("invalid-argument", "CSV data string is required.");
    const isDryRun = !confirm;
    console.log(`importStaffData: Running in ${isDryRun ? 'dry run' : 'execution'} mode.`);


    // --- Variables for Results --- (remain the same)
    let analysisResults = [];
    let overallErrors = [];

    try {
        // --- Parse CSV & Header Validation --- (updates required headers check)
        console.log("importStaffData: Parsing CSV data...");
        const records = csvParseSync(csvData, { columns: true, skip_empty_lines: true, trim: true });
        if (records.length === 0) return { result: "CSV file was empty.", analysis: { creates: [], updates: [], noChanges: [], errors: [] } };
        console.log(`importStaffData: Parsed ${records.length} records.`);

        console.log("importStaffData: Validating CSV headers...");
        const headers = Object.keys(records[0]).map(h => h.toLowerCase());
        const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h.toLowerCase())); // Use updated REQUIRED_HEADERS
        if (missingHeaders.length > 0) throw new HttpsError("invalid-argument", `Missing required CSV columns: ${missingHeaders.join(', ')}`);
        const hasStaffIdColumn = headers.includes('staffid');
        console.log(`importStaffData: Headers validated. Has staffId column: ${hasStaffIdColumn}`);


        // --- Analyze Each Record ---
        console.log("importStaffData: Analyzing records...");
        for (let index = 0; index < records.length; index++) {
            const record = records[index];
            const rowNum = index + 2;
            let analysis = { rowNum, action: 'error', details: null, errors: [], staffId: null, email: null, displayName: null };

            try {
                // Helper to get value
                const getRecordValue = (key) => { /* ... keep as is ... */
                    const actualHeader = Object.keys(record).find(h => h.toLowerCase() === key.toLowerCase());
                    return actualHeader ? record[actualHeader]?.trim() : undefined;
                };

                // Basic Row Validation (uses updated REQUIRED_HEADERS)
                const missingRequiredCheck = REQUIRED_HEADERS.filter(h => { /* ... keep as is ... */
                    const value = getRecordValue(h);
                    return value === null || value === undefined || value === '';
                });
                if (missingRequiredCheck.length > 0) throw new Error(`Missing/empty required data for: ${missingRequiredCheck.join(', ')}`);

                // Extract Key Fields (No job fields needed here)
                const staffIdFromCsv = hasStaffIdColumn ? getRecordValue('staffId') : undefined;
                const email = getRecordValue('email');
                if (typeof email !== 'string' || !email.includes('@')) throw new Error(`Invalid email format`);

                analysis.email = email;
                analysis.displayName = getRecordValue('nickname') || `${getRecordValue('firstName')} ${getRecordValue('lastName')}`;

                // --- Prepare Potential Profile Data (NO jobData) ---
                const csvProfileData = {
                    firstName: getRecordValue('firstName'),
                    lastName: getRecordValue('lastName'),
                    nickname: getRecordValue('nickname'),
                    email: email,
                    startDate: parseImportDate(getRecordValue('startDate')),
                    ...(OPTIONAL_PROFILE_FIELDS.reduce((acc, field) => { /* ... keep as is ... */
                        const csvValue = getRecordValue(field);
                        if (csvValue !== undefined) {
                             if (field === 'birthdate' || field === 'endDate') { acc[field] = parseImportDate(csvValue); }
                             else { acc[field] = csvValue === '' ? null : csvValue; }
                        } return acc;
                    }, {}))
                };
                if (csvProfileData.status === undefined || csvProfileData.status === null) csvProfileData.status = 'active';

                // const csvJobData = { ... }; // REMOVED

                // --- Find Existing User/Profile --- (remains the same logic)
                let existingProfile = null;
                let existingUid = null;
                if (staffIdFromCsv) { /* ... find by ID ... */
                     const profileSnap = await db.collection('staff_profiles').doc(staffIdFromCsv).get();
                     if (profileSnap.exists) { existingProfile = profileSnap.data(); existingUid = staffIdFromCsv; }
                     else throw new Error(`staffId "${staffIdFromCsv}" not found`);
                } else { /* ... find by email ... */
                      try {
                        const authUser = await admin.auth().getUserByEmail(email);
                        existingUid = authUser.uid;
                        const profileSnap = await db.collection('staff_profiles').doc(existingUid).get();
                        if (profileSnap.exists) existingProfile = profileSnap.data();
                        else existingProfile = null; // Mark as null if profile doc missing
                      } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
                 }
                analysis.staffId = existingUid; // Store found UID or null

                // --- Determine Action & Changes (Profile Only) ---
                if (existingUid) { // User exists
                    if (existingProfile) { // Profile also exists -> Update or No Change
                        analysis.action = 'update';
                        analysis.displayName = existingProfile.nickname || `${existingProfile.firstName} ${existingProfile.lastName}`;

                        let changes = {};
                        let requiresProfileUpdate = false;

                        // Compare ONLY profile fields
                        Object.keys(csvProfileData).forEach(key => {
                            if (!areValuesEqual(csvProfileData[key], existingProfile[key])) {
                                changes[key] = { from: existingProfile[key] ?? null, to: csvProfileData[key] };
                                requiresProfileUpdate = true;
                            }
                        });

                        // *** REMOVED Job Comparison Logic ***

                        if (requiresProfileUpdate) { // Only check profile update flag
                            analysis.details = changes;
                            analysis.dataForUpdate = {
                               profileData: csvProfileData, // Store intended data
                               // newJobData removed
                            };
                            console.log(`importStaffData: Row ${rowNum} - Marked for UPDATE. Changes:`, changes);
                        } else {
                            analysis.action = 'nochange';
                            analysis.details = null;
                            console.log(`importStaffData: Row ${rowNum} - Marked as NO CHANGE.`);
                        }
                    } else { // Auth User exists, Profile doc does NOT -> Create Profile
                         analysis.action = 'create';
                         analysis.details = { ...csvProfileData }; // Details only contain profile data
                         analysis.dataForCreate = {
                           profileData: csvProfileData,
                           // jobData removed
                         };
                         console.log(`importStaffData: Row ${rowNum} - Marked for CREATE profile for UID: ${existingUid}`);
                    }
                } else { // User does NOT exist -> Create User & Profile
                    analysis.action = 'create';
                    analysis.details = { ...csvProfileData }; // Details only contain profile data
                    analysis.dataForCreate = {
                       profileData: csvProfileData,
                       // jobData removed
                    };
                    console.log(`importStaffData: Row ${rowNum} - Marked for CREATE new user and profile.`);
                }

            } catch (error) { // Row-specific error handling remains the same
                analysis.action = 'error';
                const errorMessage = error.message || 'Unknown processing error';
                analysis.errors.push(errorMessage);
                console.error(`Error processing row ${rowNum}:`, error);
                overallErrors.push(`Row ${rowNum}: ${errorMessage}`);
            }
            analysisResults.push(analysis);
        } // End of record processing loop
        console.log("importStaffData: Finished analyzing all records.");


        // --- Dry Run vs Execution Phase ---
        if (isDryRun) {
            // Return Analysis Summary (remains the same structure)
            console.log("importStaffData: Dry run complete. Returning analysis.");
             const summary = analysisResults.reduce((acc, cur) => { /* ... keep as is ... */
                const key = cur.action + (cur.action.endsWith('s') ? '' : 's');
                 if (!acc[key]) acc[key] = []; acc[key].push(cur); return acc;
            }, { creates: [], updates: [], noChanges: [], errors: [] });
            return { analysis: summary };

        } else {
            // --- Execute Confirmed Actions (Simplified) ---
            console.log("importStaffData: Executing confirmed import...");
            let recordsCreated = 0;
            let recordsUpdated = 0;
            const writePromises = [];
            const finalExecutionErrors = [];

            analysisResults.forEach(res => {
                // --- EXECUTE CREATE USER + PROFILE ---
                if (res.action === 'create' && res.dataForCreate && res.staffId === null) {
                    writePromises.push((async () => {
                        const { profileData } = res.dataForCreate; // No jobData needed
                        console.log(`importStaffData: Executing CREATE for row ${res.rowNum}, email: ${profileData.email}`);
                        const batch = db.batch();
                        const newUserRecord = await admin.auth().createUser({ /* ... */
                             email: profileData.email, password: DEFAULT_PASSWORD, displayName: profileData.nickname || `${profileData.firstName} ${profileData.lastName}`,
                        });
                        const newUserId = newUserRecord.uid;
                        batch.set(db.collection('users').doc(newUserId), { role: 'staff' });
                        batch.set(db.collection('staff_profiles').doc(newUserId), {
                            ...profileData, // Contains all parsed profile fields
                            uid: newUserId,
                            jobHistory: [], // *** Initialize jobHistory as EMPTY array ***
                            bonusStreak: 0,
                            createdAt: FieldValue.serverTimestamp(),
                        });
                        await batch.commit();
                        recordsCreated++;
                        console.log(`importStaffData: Row ${res.rowNum} - Successfully committed create.`);
                    })().catch(err => { /* ... error handling ... */
                         const errorMsg = `Row ${res.rowNum} (Create Failed): ${err.message}`; finalExecutionErrors.push(errorMsg); console.error(errorMsg, err);
                    }));
                }
                // --- EXECUTE CREATE PROFILE ONLY ---
                else if (res.action === 'create' && res.dataForCreate && res.staffId !== null) {
                     writePromises.push((async () => {
                        const { profileData } = res.dataForCreate; // No jobData needed
                        const userId = res.staffId;
                        console.log(`importStaffData: Executing CREATE PROFILE for row ${res.rowNum}, UID: ${userId}`);
                        const staffRef = db.collection('staff_profiles').doc(userId);
                         await staffRef.set({ // Use set since doc doesn't exist
                            ...profileData,
                            uid: userId,
                            jobHistory: [], // *** Initialize jobHistory as EMPTY array ***
                            bonusStreak: 0,
                            createdAt: FieldValue.serverTimestamp(),
                         });
                         recordsUpdated++; // Count as update overall
                         console.log(`importStaffData: Row ${res.rowNum} - Successfully committed create profile.`);
                     })().catch(err => { /* ... error handling ... */
                          const errorMsg = `Row ${res.rowNum} (Create Profile Failed): ${err.message}`; finalExecutionErrors.push(errorMsg); console.error(errorMsg, err);
                     }));
                }
                // --- EXECUTE UPDATE PROFILE ---
                else if (res.action === 'update' && res.dataForUpdate && res.staffId) {
                    writePromises.push((async () => {
                         const userId = res.staffId;
                         console.log(`importStaffData: Executing UPDATE for row ${res.rowNum}, UID: ${userId}`);
                         const staffRef = db.collection('staff_profiles').doc(userId);
                         const { profileData } = res.dataForUpdate; // No newJobData

                         // Fetch profile again for safety check (optional but recommended)
                         const currentSnap = await staffRef.get();
                         if (!currentSnap.exists) throw new Error("Profile disappeared before update");
                         const currentProfile = currentSnap.data();

                         let updatePayload = {};
                         let requiresUpdate = false;

                         // Re-check profile changes ONLY
                         Object.keys(profileData).forEach(key => {
                             if (!areValuesEqual(profileData[key], currentProfile[key])) {
                                 updatePayload[key] = profileData[key];
                                 requiresUpdate = true;
                             }
                         });

                          // *** REMOVED Job update check ***

                         if (requiresUpdate) {
                            console.log(`importStaffData: Row ${res.rowNum} - Applying update payload:`, updatePayload);
                            await staffRef.update(updatePayload);
                            recordsUpdated++;
                         } else {
                             console.log(`importStaffData: Row ${res.rowNum} - No update applied on final check.`);
                         }
                    })().catch(err => { /* ... error handling ... */
                         const errorMsg = `Row ${res.rowNum} (Update Failed): ${err.message}`; finalExecutionErrors.push(errorMsg); console.error(errorMsg, err);
                    }));
                } else if (res.action === 'error') { // Collect analysis errors (remains same)
                     res.errors.forEach(errMsg => { /* ... */ const fullMsg = `Row ${res.rowNum}: ${errMsg}`; if (!finalExecutionErrors.includes(fullMsg)) finalExecutionErrors.push(fullMsg); });
                }
            });

            // Wait for writes and return summary (remains same structure)
            await Promise.allSettled(writePromises);
            console.log("importStaffData: All write operations settled.");
            const allErrors = [...overallErrors.filter(e => !finalExecutionErrors.some(fe => fe.startsWith(e.split(':')[0]))), ...finalExecutionErrors];
            const finalSummaryMessage = `Import finished. Processed: ${records.length}. Created: ${recordsCreated}. Updated: ${recordsUpdated}. Errors: ${allErrors.length}.`;
            console.log(finalSummaryMessage);
             if (allErrors.length > 0) console.error("importStaffData: Final import errors:", allErrors);
            return { result: finalSummaryMessage, errors: allErrors, defaultPassword: (recordsCreated > 0) ? DEFAULT_PASSWORD : null };
        }

    } catch (error) { // General error handling (remains same)
        console.error("importStaffData: Critical error during import process:", error);
        if (error instanceof HttpsError) throw error;
         return { result: `Import failed with a critical error: ${error.message}`, errors: [`General Error: ${error.message}`, ...overallErrors], analysis: null };
    }
});