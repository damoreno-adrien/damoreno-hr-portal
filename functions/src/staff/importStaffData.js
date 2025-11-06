/* functions/src/staff/importStaffData.js */

const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { parse: csvParseSync } = require('csv-parse/sync');
// --- UPDATED: Import parseISO as well ---
const { parse: dateParse, isValid: isDateValid, isEqual: isDateEqual, parseISO } = require('date-fns');

// Initialize Firestore (admin SDK should already be initialized in index.js)
const db = getFirestore();

// --- Configuration ---
const REQUIRED_HEADERS = [
    'email', 'firstname', 'lastname', 'nickname', 'startdate'
];
const OPTIONAL_PROFILE_FIELDS = [
    'phoneNumber', 'birthdate', 'bankAccount', 'address',
    'emergencyContactName', 'emergencyContactPhone', 'status', 'endDate'
];
const DEFAULT_PASSWORD = "Welcome123!";


// --- Helper Functions ---

/**
 * --- UPDATED: Smarter Date Parser (v3) ---
 * Tries to parse multiple date formats, including 'dd-MM-yy' and 'dd/MM/yyyy',
 * and correctly guesses the century for two-digit years.
 * @param {string|null|undefined} dateString The date string to parse.
 * @returns {Timestamp|null} Firestore Timestamp or null if invalid/empty.
 */
const parseImportDate = (dateString) => {
    if (!dateString) return null; // Handle empty/null/undefined input

    // 1. Try strict dd/MM/yyyy (e.g., "28/12/1996")
    try {
        // This regex matches dd/MM/yyyy or dd-MM-yyyy
        const longDateMatch = dateString.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (longDateMatch) {
            const [_, day, month, year] = longDateMatch;
            const isoStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            const date = parseISO(isoStr); // Use parseISO for yyyy-MM-dd
            if (isDateValid(date)) {
                return Timestamp.fromDate(date);
            }
        }
    } catch (e) { /* fall through */ }

    // 2. Try strict dd-MM-yy or dd/MM/yy (e.g., "02-02-23" or "27-05-98")
    try {
        // This regex matches dd-MM-yy or dd/MM/yy
        const shortDateMatch = dateString.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
        if (shortDateMatch) {
            const [_, day, month, shortYear] = shortDateMatch;
            const yearNum = parseInt(shortYear, 10);
            
            // --- This is the new logic ---
            // If year is > 50, assume 19xx. If 50 or less, assume 20xx.
            // So, '98' becomes 1998. '23' becomes 2023.
            const year = yearNum > 50 ? `19${shortYear}` : `20${shortYear}`;
            // --- End new logic ---
            
            const isoStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            const date = parseISO(isoStr); // Use parseISO for yyyy-MM-dd
            if (isDateValid(date)) {
                return Timestamp.fromDate(date);
            }
        }
    } catch (e) { /* fall through */ }
    
    // 3. Try yyyy-MM-dd as a fallback
    try {
        const date = parseISO(dateString); // Handles yyyy-MM-dd
         if (isDateValid(date)) {
            return Timestamp.fromDate(date);
        }
    } catch(e) { /* fall through */ }

    // 4. If all else fails, log the error
    console.warn(`importStaffData/parseDate: Invalid/unsupported date format: "${dateString}".`);
    return null;
};
// --- END UPDATED FUNCTION ---


/**
 * Compares two values, correctly handling Firestore Timestamps,
 * (Rest of the file is identical)
 */
const areValuesEqual = (val1, val2) => {
    // Compare Firestore Timestamps using date-fns for accuracy
    if (val1 instanceof Timestamp && val2 instanceof Timestamp) {
        try {
            const date1 = val1.toDate();
            const date2 = val2.toDate();
            if (isDateValid(date1) && isDateValid(date2)) {
                return isDateEqual(date1, date2);
            }
        } catch (e) {
            console.warn("importStaffData/areValuesEqual: Error converting Timestamps to Dates for comparison, falling back.", e);
            return val1.isEqual(val2);
        }
        return val1.isEqual(val2);
    }

    // Compare numbers robustly
    if (typeof val1 === 'number' || typeof val2 === 'number') {
        return Number(val1) === Number(val2);
    }

    // Treat null, undefined, and empty string as equivalent
    const v1IsEmpty = val1 === null || val1 === undefined || val1 === '';
    const v2IsEmpty = val2 === null || val2 === undefined || val2 === '';
    if (v1IsEmpty && v2IsEmpty) return true;

    // Standard strict equality
    return val1 === val2;
};


// --- Main Cloud Function ---
exports.importStaffDataHandler = functions.https.onCall({
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (request) => {
    // 1. --- Authentication and Authorization ---
    if (!request.auth) {
        console.error("importStaffData: Unauthenticated access attempt.");
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const callerUid = request.auth.uid;
    try {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") {
             console.error(`importStaffData: Permission denied for user ${callerUid}. Role: ${callerDoc.data()?.role}`);
            throw new HttpsError("permission-denied", "Only managers can import staff data.");
        }
         console.log(`importStaffData: Authorized manager ${callerUid}.`);
    } catch(err) {
         console.error(`importStaffData: Error verifying role for user ${callerUid}:`, err);
         throw new HttpsError("internal", "Failed to verify user role.", err.message);
    }

    // 2. --- Input Validation ---
    const { csvData, confirm } = request.data;
    if (!csvData || typeof csvData !== 'string') {
        console.error("importStaffData: Invalid argument - csvData missing or not a string.");
        throw new HttpsError("invalid-argument", "CSV data string is required.");
    }
    const isDryRun = !confirm;
    console.log(`importStaffData: Running in ${isDryRun ? 'dry run' : 'execution'} mode.`);

    // 3. --- Initialization ---
    let analysisResults = [];
    let overallErrors = [];

    try {
        // 4. --- CSV Parsing and Header Validation ---
        console.log("importStaffData: Parsing CSV data...");
        const records = csvParseSync(csvData, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });
        console.log(`importStaffData: Parsed ${records.length} records from CSV.`);

        if (records.length === 0) {
            console.log("importStaffData: CSV file was empty or contained no data rows.");
            return { result: "CSV file was empty or contained no data rows.", analysis: { creates: [], updates: [], noChanges: [], errors: [] } };
        }

        console.log("importStaffData: Validating CSV headers...");
        const headers = Object.keys(records[0]).map(h => h.toLowerCase());
        const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h.toLowerCase()));
        if (missingHeaders.length > 0) {
            console.error(`importStaffData: Missing required headers: ${missingHeaders.join(', ')}`);
            throw new HttpsError("invalid-argument", `Missing required columns in CSV: ${missingHeaders.join(', ')}`);
        }
        const hasStaffIdColumn = headers.includes('staffid');
        console.log(`importStaffData: Headers validated. Has staffId column: ${hasStaffIdColumn}`);


        // 5. --- Analyze Each Record ---
        console.log("importStaffData: Analyzing records...");
        for (let index = 0; index < records.length; index++) {
            const record = records[index];
            const rowNum = index + 2;
            let analysis = { rowNum, action: 'error', details: null, errors: [], staffId: null, email: null, displayName: null };

            try {
                const getRecordValue = (key) => {
                    const actualHeader = Object.keys(record).find(h => h.toLowerCase() === key.toLowerCase());
                    return actualHeader ? record[actualHeader]?.trim() : undefined;
                };

                const missingRequiredCheck = REQUIRED_HEADERS.filter(h => {
                    const value = getRecordValue(h);
                    return value === null || value === undefined || value === '';
                });
                if (missingRequiredCheck.length > 0) {
                    throw new Error(`Missing/empty required data for: ${missingRequiredCheck.join(', ')}`);
                }

                const staffIdFromCsv = hasStaffIdColumn ? getRecordValue('staffId') : undefined;
                const email = getRecordValue('email');
                if (typeof email !== 'string' || !email.includes('@')) {
                    throw new Error(`Invalid email format`);
                }

                analysis.email = email;
                analysis.displayName = getRecordValue('nickname') || `${getRecordValue('firstName')} ${getRecordValue('lastName')}`;

                const csvProfileData = {
                    firstName: getRecordValue('firstName'),
                    lastName: getRecordValue('lastName'),
                    nickname: getRecordValue('nickname'),
                    email: email,
                    startDate: parseImportDate(getRecordValue('startDate')),
                    ...(OPTIONAL_PROFILE_FIELDS.reduce((acc, field) => {
                        const csvValue = getRecordValue(field);
                        if (csvValue !== undefined) {
                             if (field === 'birthdate' || field === 'endDate') {
                                acc[field] = parseImportDate(csvValue);
                            } else {
                                acc[field] = csvValue === '' ? null : csvValue;
                            }
                        }
                        return acc;
                    }, {}))
                };
                if (!csvProfileData.status) {
                    csvProfileData.status = 'active';
                }
                
                // --- NEW: Check that required dates were parsed ---
                if (!csvProfileData.startDate) {
                    throw new Error(`Invalid or unparseable format for 'startdate'.`);
                }
                // Check birthdate only if it was provided but failed to parse
                if (getRecordValue('birthdate') && !csvProfileData.birthdate) {
                     throw new Error(`Invalid or unparseable format for 'birthdate'.`);
                }
                // ---

                let existingProfile = null;
                let existingUid = null;

                if (staffIdFromCsv) {
                    const profileSnap = await db.collection('staff_profiles').doc(staffIdFromCsv).get();
                    if (profileSnap.exists) {
                        existingProfile = profileSnap.data();
                        existingUid = staffIdFromCsv;
                         console.log(`importStaffData: Row ${rowNum} - Found existing profile by staffId: ${existingUid}`);
                    } else {
                        throw new Error(`staffId "${staffIdFromCsv}" not found in database.`);
                    }
                } else {
                     console.log(`importStaffData: Row ${rowNum} - No valid staffId, searching by email: ${email}`);
                    try {
                        const authUser = await admin.auth().getUserByEmail(email);
                        existingUid = authUser.uid;
                        const profileSnap = await db.collection('staff_profiles').doc(existingUid).get();
                        if (profileSnap.exists) {
                            existingProfile = profileSnap.data();
                            console.log(`importStaffData: Row ${rowNum} - Found existing auth user and profile by email. UID: ${existingUid}`);
                        } else {
                             console.log(`importStaffData: Row ${rowNum} - Found auth user by email but NO profile doc. UID: ${existingUid}. Will create profile.`);
                             existingProfile = null;
                        }
                    } catch (error) {
                        if (error.code === 'auth/user-not-found') {
                            console.log(`importStaffData: Row ${rowNum} - No existing user found by email. Will create new user.`);
                        } else {
                            console.error(`importStaffData: Row ${rowNum} - Error checking auth user ${email}:`, error);
                            throw new Error(`Error checking user ${email}: ${error.message}`);
                        }
                    }
                }
                analysis.staffId = existingUid;

                if (existingUid) {
                    if (existingProfile) {
                         analysis.action = 'update';
                         analysis.displayName = existingProfile.nickname || `${existingProfile.firstName} ${existingProfile.lastName}`;
                        let changes = {};
                        let requiresUpdate = false;
                        Object.keys(csvProfileData).forEach(key => {
                            if (!areValuesEqual(csvProfileData[key], existingProfile[key])) {
                                changes[key] = { from: existingProfile[key] ?? null, to: csvProfileData[key] };
                                requiresUpdate = true;
                            }
                        });

                        if (requiresUpdate) {
                            analysis.details = changes;
                            analysis.dataForUpdate = {
                               profileData: csvProfileData
                            };
                            console.log(`importStaffData: Row ${rowNum} - Marked for UPDATE. Changes detected:`, changes);
                        } else {
                            analysis.action = 'nochange';
                            analysis.details = null;
                            console.log(`importStaffData: Row ${rowNum} - Marked as NO CHANGE.`);
                        }
                    } else {
                         analysis.action = 'create';
                         analysis.details = { ...csvProfileData };
                         analysis.dataForCreate = {
                           profileData: csvProfileData
                         };
                         console.log(`importStaffData: Row ${rowNum} - Marked for CREATE profile (user exists) for UID: ${existingUid}`);
                    }

                } else {
                    analysis.action = 'create';
                    analysis.details = { ...csvProfileData };
                    analysis.dataForCreate = {
                       profileData: csvProfileData
                    };
                    console.log(`importStaffData: Row ${rowNum} - Marked for CREATE new user and profile.`);
                }

            } catch (error) {
                analysis.action = 'error';
                const errorMessage = error.message || 'Unknown processing error';
                analysis.errors.push(errorMessage);
                console.error(`importStaffData: Error processing row ${rowNum}:`, error);
                overallErrors.push(`Row ${rowNum}: ${errorMessage}`);
            }
            analysisResults.push(analysis);
        }
        console.log("importStaffData: Finished analyzing all records.");


        // 6. --- Return Analysis (Dry Run) or Execute Writes (Confirm) ---
        if (isDryRun) {
            console.log("importStaffData: Dry run complete. Returning analysis summary.");
            const summary = analysisResults.reduce((acc, cur) => {
                const key = cur.action + (cur.action.endsWith('s') ? '' : 's');
                 if (!acc[key]) acc[key] = [];
                 acc[key].push(cur);
                 return acc;
            }, { creates: [], updates: [], noChanges: [], errors: [] });

            return { analysis: summary };

        } else {
            // --- Execute Confirmed Actions ---
            console.log("importStaffData: Executing confirmed import writes...");
            let recordsCreated = 0;
            let recordsUpdated = 0;
            const writePromises = [];
            const finalExecutionErrors = [];

            analysisResults.forEach(res => {
                if (res.action === 'create' && res.dataForCreate && res.staffId === null) {
                    writePromises.push((async () => {
                        const { profileData } = res.dataForCreate;
                        console.log(`importStaffData: Executing CREATE for row ${res.rowNum}, email: ${profileData.email}`);
                        const batch = db.batch();

                        const newUserRecord = await admin.auth().createUser({
                            email: profileData.email,
                            password: DEFAULT_PASSWORD,
                            displayName: profileData.nickname || `${profileData.firstName} ${profileData.lastName}`,
                        });
                        const newUserId = newUserRecord.uid;
                        console.log(`importStaffData: Row ${res.rowNum} - Created auth user ${newUserId}`);

                        batch.set(db.collection('users').doc(newUserId), { role: 'staff' });
                        batch.set(db.collection('staff_profiles').doc(newUserId), {
                            ...profileData,
                            uid: newUserId,
                            jobHistory: [],
                            bonusStreak: 0,
                            createdAt: FieldValue.serverTimestamp(),
                        });

                        await batch.commit();
                        recordsCreated++;
                        console.log(`importStaffData: Row ${res.rowNum} - Successfully committed create batch.`);
                    })().catch(err => {
                        const errorMsg = `Row ${res.rowNum} (Create Failed): ${err.message}`;
                        finalExecutionErrors.push(errorMsg);
                        console.error(errorMsg, err);
                    }));
                }
                else if (res.action === 'create' && res.dataForCreate && res.staffId !== null) {
                    writePromises.push((async () => {
                        const { profileData } = res.dataForCreate;
                        const userId = res.staffId;
                        console.log(`importStaffData: Executing CREATE PROFILE ONLY for row ${res.rowNum}, UID: ${userId}`);
                        const staffRef = db.collection('staff_profiles').doc(userId);
                         await staffRef.set({
                            ...profileData,
                            uid: userId,
                            jobHistory: [],
                            bonusStreak: 0,
                            createdAt: FieldValue.serverTimestamp(),
                         });
                         recordsUpdated++;
                         console.log(`importStaffData: Row ${res.rowNum} - Successfully committed create profile.`);
                     })().catch(err => {
                         const errorMsg = `Row ${res.rowNum} (Create Profile Failed): ${err.message}`;
                         finalExecutionErrors.push(errorMsg);
                         console.error(errorMsg, err);
                     }));
                }
                else if (res.action === 'update' && res.dataForUpdate && res.staffId) {
                    writePromises.push((async () => {
                         const userId = res.staffId;
                         console.log(`importStaffData: Executing UPDATE for row ${res.rowNum}, UID: ${userId}`);
                         const staffRef = db.collection('staff_profiles').doc(userId);
                         const { profileData } = res.dataForUpdate;

                         const currentSnap = await staffRef.get();
                         if (!currentSnap.exists) throw new Error("Profile document disappeared before update could occur");
                         const currentProfile = currentSnap.data();

                         let updatePayload = {};
                         let requiresUpdate = false;

                         Object.keys(profileData).forEach(key => {
                             if (!areValuesEqual(profileData[key], currentProfile[key])) {
                                 updatePayload[key] = profileData[key];
                                 requiresUpdate = true;
                             }
                         });

                         if (requiresUpdate) {
                            console.log(`importStaffData: Row ${res.rowNum} - Applying final update payload:`, updatePayload);
                            await staffRef.update(updatePayload);
                            recordsUpdated++;
                         } else {
                             console.log(`importStaffData: Row ${res.rowNum} - No update applied on final check (data already matched).`);
                         }
                    })().catch(err => {
                         const errorMsg = `Row ${res.rowNum} (Update Failed): ${err.message}`;
                         finalExecutionErrors.push(errorMsg);
                         console.error(errorMsg, err);
                     }));
                }
                else if (res.action === 'error') {
                     res.errors.forEach(errMsg => {
                        const fullMsg = `Row ${res.rowNum}: ${errMsg}`;
                        if (!finalExecutionErrors.includes(fullMsg) && !overallErrors.some(e => e.startsWith(`Row ${res.rowNum}:`))) {
                            finalExecutionErrors.push(fullMsg);
                        }
                    });
                }
            });

            await Promise.allSettled(writePromises);
            console.log("importStaffData: All write operations have settled.");

            // --- THIS IS THE FIX for your typo ---
            const uniqueRowErrors = new Map();
             [...overallErrors, ...finalExecutionErrors].forEach(e => {
                 const rowPrefix = e.match(/^Row \d+:/)?.[0];
                 if (rowPrefix && !uniqueRowErrors.has(rowPrefix)) { // <-- Was 'rowPrafix'
                     uniqueRowErrors.set(rowPrefix, e);
                 } else if (!rowPrefix && !uniqueRowErrors.has(e)) {
                     uniqueRowErrors.set(e, e);
                 }
             });
            const allErrors = Array.from(uniqueRowErrors.values());
            // --- END FIX ---


            const finalSummaryMessage = `Import finished. Processed: ${records.length}. Created: ${recordsCreated}. Updated: ${recordsUpdated}. Errors: ${allErrors.length}.`;
            console.log(finalSummaryMessage);
             if (allErrors.length > 0) console.error("importStaffData: Final import errors encountered:", allErrors);

            return {
                result: finalSummaryMessage,
                errors: allErrors,
                defaultPassword: (recordsCreated > 0) ? DEFAULT_PASSWORD : null
            };
        }

    } catch (error) {
        console.error("importStaffData: CRITICAL error during import process:", error);
        if (error instanceof HttpsError) throw error;
         return {
            result: `Import failed with a critical error: ${error.message}`,
            errors: [`General Error: ${error.message}`, ...overallErrors],
             analysis: null
        };
    }
});