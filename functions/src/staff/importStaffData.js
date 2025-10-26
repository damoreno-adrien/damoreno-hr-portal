/* functions/src/staff/importStaffData.js */

const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { parse: csvParseSync } = require('csv-parse/sync');
const { parse: dateParse, isValid: isDateValid, isEqual: isDateEqual } = require('date-fns');

// Initialize Firestore (admin SDK should already be initialized in index.js)
const db = getFirestore();

// --- Configuration ---
// Required headers for the CSV file (profile details only)
const REQUIRED_HEADERS = [
    'email', 'firstname', 'lastname', 'nickname', 'startdate'
];
// Optional profile fields that can be included in the CSV
const OPTIONAL_PROFILE_FIELDS = [
    'phoneNumber', 'birthdate', 'bankAccount', 'address',
    'emergencyContactName', 'emergencyContactPhone', 'status', 'endDate'
];
// Default password for newly created users
const DEFAULT_PASSWORD = "Welcome123!";


// --- Helper Functions ---

/**
 * Parses 'dd/MM/yyyy' date strings into Firestore Timestamps.
 * Handles empty strings and invalid formats gracefully.
 * @param {string|null|undefined} dateString The date string to parse.
 * @returns {Timestamp|null} Firestore Timestamp or null if invalid/empty.
 */
const parseImportDate = (dateString) => {
    if (!dateString) return null; // Handle empty/null/undefined input

    try {
        // Explicitly parse using the expected format 'dd/MM/yyyy'
        const parsedDate = dateParse(dateString, 'dd/MM/yyyy', new Date());
        if (isDateValid(parsedDate)) {
            return Timestamp.fromDate(parsedDate); // Convert valid JS Date to Firestore Timestamp
        }
        // Log invalid formats for debugging but return null
        console.warn(`importStaffData/parseDate: Invalid date format encountered: "${dateString}" (Expected dd/MM/yyyy)`);
        return null;
    } catch (e) {
        // Log errors during parsing but return null
        console.warn(`importStaffData/parseDate: Error parsing date: "${dateString}"`, e);
        return null;
    }
};

/**
 * Compares two values, correctly handling Firestore Timestamps,
 * numbers vs strings, and nullish values (null, undefined, empty string).
 * @param {*} val1 First value to compare.
 * @param {*} val2 Second value to compare.
 * @returns {boolean} True if values are considered equal, false otherwise.
 */
const areValuesEqual = (val1, val2) => {
    // Compare Firestore Timestamps using date-fns for accuracy
    if (val1 instanceof Timestamp && val2 instanceof Timestamp) {
        try {
            // Convert to JS Date only if both are valid Timestamps
            const date1 = val1.toDate();
            const date2 = val2.toDate();
            if (isDateValid(date1) && isDateValid(date2)) {
                return isDateEqual(date1, date2);
            }
        } catch (e) {
            // Fallback to Firestore's isEqual if conversion fails
            console.warn("importStaffData/areValuesEqual: Error converting Timestamps to Dates for comparison, falling back.", e);
            return val1.isEqual(val2);
        }
        // If conversion failed, rely on Firestore's native comparison
        return val1.isEqual(val2);
    }

    // Compare numbers robustly (treat string numbers as numbers)
    if (typeof val1 === 'number' || typeof val2 === 'number') {
        return Number(val1) === Number(val2);
    }

    // Treat null, undefined, and empty string as equivalent for optional fields
    const v1IsEmpty = val1 === null || val1 === undefined || val1 === '';
    const v2IsEmpty = val2 === null || val2 === undefined || val2 === '';
    if (v1IsEmpty && v2IsEmpty) return true;

    // Standard strict equality for all other cases
    return val1 === val2;
};


// --- Main Cloud Function ---
exports.importStaffDataHandler = functions.https.onCall({
    region: "us-central1",    // Match region with export function if necessary
    timeoutSeconds: 540,      // Allow ample time for processing large files
    memory: "1GiB"            // Allocate more memory if needed
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
    const { csvData, confirm } = request.data; // Get CSV data and confirmation flag
    if (!csvData || typeof csvData !== 'string') {
        console.error("importStaffData: Invalid argument - csvData missing or not a string.");
        throw new HttpsError("invalid-argument", "CSV data string is required.");
    }
    const isDryRun = !confirm; // Determine if this is a dry run (analysis only)
    console.log(`importStaffData: Running in ${isDryRun ? 'dry run' : 'execution'} mode.`);

    // 3. --- Initialization ---
    let analysisResults = []; // To store analysis outcome for each row
    let overallErrors = [];   // To store general errors encountered during processing

    try {
        // 4. --- CSV Parsing and Header Validation ---
        console.log("importStaffData: Parsing CSV data...");
        const records = csvParseSync(csvData, {
            columns: true,           // Treat first row as headers
            skip_empty_lines: true, // Ignore empty rows
            trim: true               // Trim whitespace from headers and values
        });
        console.log(`importStaffData: Parsed ${records.length} records from CSV.`);

        // Handle empty CSV file
        if (records.length === 0) {
            console.log("importStaffData: CSV file was empty or contained no data rows.");
            return { result: "CSV file was empty or contained no data rows.", analysis: { creates: [], updates: [], noChanges: [], errors: [] } };
        }

        // Validate required headers (case-insensitive)
        console.log("importStaffData: Validating CSV headers...");
        const headers = Object.keys(records[0]).map(h => h.toLowerCase()); // Get headers from first record
        const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h.toLowerCase()));
        if (missingHeaders.length > 0) {
            console.error(`importStaffData: Missing required headers: ${missingHeaders.join(', ')}`);
            throw new HttpsError("invalid-argument", `Missing required columns in CSV: ${missingHeaders.join(', ')}`);
        }
        const hasStaffIdColumn = headers.includes('staffid'); // Check if optional staffId column exists
        console.log(`importStaffData: Headers validated. Has staffId column: ${hasStaffIdColumn}`);


        // 5. --- Analyze Each Record ---
        console.log("importStaffData: Analyzing records...");
        for (let index = 0; index < records.length; index++) {
            const record = records[index];
            const rowNum = index + 2; // Row number in the original CSV file (1-based + header)
            // Initialize analysis object for this row
            let analysis = { rowNum, action: 'error', details: null, errors: [], staffId: null, email: null, displayName: null };

            try {
                // Helper to safely get and trim value from record using case-insensitive key
                const getRecordValue = (key) => {
                    const actualHeader = Object.keys(record).find(h => h.toLowerCase() === key.toLowerCase());
                    return actualHeader ? record[actualHeader]?.trim() : undefined;
                };

                // a. --- Row-Level Validation ---
                const missingRequiredCheck = REQUIRED_HEADERS.filter(h => {
                    const value = getRecordValue(h);
                    return value === null || value === undefined || value === ''; // Check for empty required fields
                });
                if (missingRequiredCheck.length > 0) {
                    throw new Error(`Missing/empty required data for: ${missingRequiredCheck.join(', ')}`);
                }

                // b. --- Extract and Validate Key Fields ---
                const staffIdFromCsv = hasStaffIdColumn ? getRecordValue('staffId') : undefined;
                const email = getRecordValue('email');
                if (typeof email !== 'string' || !email.includes('@')) {
                    throw new Error(`Invalid email format`);
                }

                // Store email/name early for better error reporting/summary display
                analysis.email = email;
                analysis.displayName = getRecordValue('nickname') || `${getRecordValue('firstName')} ${getRecordValue('lastName')}`;

                // c. --- Prepare Potential Firestore Data (Profile Only) ---
                const csvProfileData = {
                    firstName: getRecordValue('firstName'),
                    lastName: getRecordValue('lastName'),
                    nickname: getRecordValue('nickname'),
                    email: email, // Use validated email
                    startDate: parseImportDate(getRecordValue('startDate')), // Use date parser
                    // Include optional fields, converting empty strings to null
                    ...(OPTIONAL_PROFILE_FIELDS.reduce((acc, field) => {
                        const csvValue = getRecordValue(field);
                        if (csvValue !== undefined) { // Check if column exists in CSV
                             if (field === 'birthdate' || field === 'endDate') {
                                // Store parsed date (Timestamp or null)
                                acc[field] = parseImportDate(csvValue);
                            } else {
                                // Treat empty string in optional fields as null for DB consistency
                                acc[field] = csvValue === '' ? null : csvValue;
                            }
                        }
                        // If column doesn't exist, field is omitted from csvProfileData
                        return acc;
                    }, {}))
                };
                // Ensure 'status' defaults to 'active' if not provided or empty
                if (!csvProfileData.status) {
                    csvProfileData.status = 'active';
                }

                // d. --- Find Existing User/Profile in Firestore ---
                let existingProfile = null; // Holds Firestore profile data if found
                let existingUid = null;     // Holds Firebase Auth UID if found

                if (staffIdFromCsv) { // Prioritize finding by staffId if provided
                    const profileSnap = await db.collection('staff_profiles').doc(staffIdFromCsv).get();
                    if (profileSnap.exists) {
                        existingProfile = profileSnap.data();
                        existingUid = staffIdFromCsv;
                         console.log(`importStaffData: Row ${rowNum} - Found existing profile by staffId: ${existingUid}`);
                    } else {
                        // If ID is provided but doesn't exist, it's an error for this row
                        throw new Error(`staffId "${staffIdFromCsv}" not found in database.`);
                    }
                } else { // Fallback to finding by email if staffId wasn't provided or found
                     console.log(`importStaffData: Row ${rowNum} - No valid staffId, searching by email: ${email}`);
                    try {
                        // Check Firebase Auth first
                        const authUser = await admin.auth().getUserByEmail(email);
                        existingUid = authUser.uid; // Found user in Auth
                        // Now check if a corresponding profile document exists in Firestore
                        const profileSnap = await db.collection('staff_profiles').doc(existingUid).get();
                        if (profileSnap.exists) {
                            existingProfile = profileSnap.data(); // Both Auth user and Firestore profile exist
                            console.log(`importStaffData: Row ${rowNum} - Found existing auth user and profile by email. UID: ${existingUid}`);
                        } else {
                             console.log(`importStaffData: Row ${rowNum} - Found auth user by email but NO profile doc. UID: ${existingUid}. Will create profile.`);
                             existingProfile = null; // Mark profile as non-existent
                        }
                    } catch (error) {
                        // Handle expected "user not found" error
                        if (error.code === 'auth/user-not-found') {
                            console.log(`importStaffData: Row ${rowNum} - No existing user found by email. Will create new user.`);
                            // Both existingUid and existingProfile remain null, triggering 'create' logic
                        } else {
                            // Rethrow unexpected errors during user lookup
                            console.error(`importStaffData: Row ${rowNum} - Error checking auth user ${email}:`, error);
                            throw new Error(`Error checking user ${email}: ${error.message}`);
                        }
                    }
                }
                // Store the determined UID (or null) in the analysis result
                analysis.staffId = existingUid;

                // e. --- Determine Action (Create, Update, NoChange) and Calculate Changes ---
                if (existingUid) { // User exists in Firebase Auth

                    if (existingProfile) { // Firestore profile document also exists -> Potential Update or No Change
                         analysis.action = 'update'; // Assume update initially
                         // Use name from existing profile for consistency in summary
                         analysis.displayName = existingProfile.nickname || `${existingProfile.firstName} ${existingProfile.lastName}`;

                        let changes = {}; // Store specific field changes
                        let requiresUpdate = false; // Flag if any changes are detected

                        // Compare ONLY profile fields from CSV against existing Firestore data
                        Object.keys(csvProfileData).forEach(key => {
                            // Use areValuesEqual for robust comparison (handles Timestamps, nulls etc.)
                            if (!areValuesEqual(csvProfileData[key], existingProfile[key])) {
                                changes[key] = { from: existingProfile[key] ?? null, to: csvProfileData[key] };
                                requiresUpdate = true;
                            }
                        });

                        // Finalize analysis for this row
                        if (requiresUpdate) {
                            analysis.details = changes; // Record the detected changes
                            // Store the intended profile data for the execution phase
                            analysis.dataForUpdate = {
                               profileData: csvProfileData
                            };
                            console.log(`importStaffData: Row ${rowNum} - Marked for UPDATE. Changes detected:`, changes);
                        } else {
                            analysis.action = 'nochange'; // No differences found
                            analysis.details = null; // Clear details
                            console.log(`importStaffData: Row ${rowNum} - Marked as NO CHANGE.`);
                        }
                    } else { // Auth User exists, but Firestore Profile doc does NOT -> Create Profile
                         analysis.action = 'create'; // Action is to create the profile document
                         analysis.details = { ...csvProfileData }; // Details show the profile data to be created
                         // Store data needed for creation during execution phase
                         analysis.dataForCreate = {
                           profileData: csvProfileData
                         };
                         console.log(`importStaffData: Row ${rowNum} - Marked for CREATE profile (user exists) for UID: ${existingUid}`);
                    }

                } else { // User does NOT exist in Firebase Auth -> Create New User & Profile
                    analysis.action = 'create';
                    analysis.details = { ...csvProfileData }; // Details show the profile data to be created
                    // Store data needed for creation during execution phase
                    analysis.dataForCreate = {
                       profileData: csvProfileData
                    };
                    console.log(`importStaffData: Row ${rowNum} - Marked for CREATE new user and profile.`);
                }

            } catch (error) { // Catch errors specific to processing this row
                analysis.action = 'error';
                const errorMessage = error.message || 'Unknown processing error';
                analysis.errors.push(errorMessage);
                console.error(`importStaffData: Error processing row ${rowNum}:`, error);
                // Add row-specific errors to the overall list for the final function summary
                overallErrors.push(`Row ${rowNum}: ${errorMessage}`);
            }
            // Add the completed analysis for this row to the results array
            analysisResults.push(analysis);
        } // --- End of record processing loop ---
        console.log("importStaffData: Finished analyzing all records.");


        // 6. --- Return Analysis (Dry Run) or Execute Writes (Confirm) ---
        if (isDryRun) {
            // --- Return Analysis Summary ---
            console.log("importStaffData: Dry run complete. Returning analysis summary.");
            // Group analysis results by action type for the frontend modal
            const summary = analysisResults.reduce((acc, cur) => {
                const key = cur.action + (cur.action.endsWith('s') ? '' : 's'); // creates, updates, noChanges, errors
                 if (!acc[key]) acc[key] = []; // Initialize array if not present
                 acc[key].push(cur);
                 return acc;
            }, { creates: [], updates: [], noChanges: [], errors: [] }); // Ensure all keys are initialized

            return { analysis: summary }; // Return the structured summary

        } else {
            // --- Execute Confirmed Actions ---
            console.log("importStaffData: Executing confirmed import writes...");
            let recordsCreated = 0; // Count new Auth users created
            let recordsUpdated = 0; // Count Firestore profile docs created/updated
            const writePromises = []; // Array to hold all async write operations
            const finalExecutionErrors = []; // Collect errors specifically from this execution phase

            // Iterate through the analysis results to perform writes
            analysisResults.forEach(res => {
                // --- EXECUTE CREATE USER + PROFILE ---
                // Check if action is 'create', data exists, and staffId is null (meaning new user)
                if (res.action === 'create' && res.dataForCreate && res.staffId === null) {
                    writePromises.push((async () => {
                        const { profileData } = res.dataForCreate; // Get the prepared profile data
                        console.log(`importStaffData: Executing CREATE for row ${res.rowNum}, email: ${profileData.email}`);
                        const batch = db.batch(); // Use Firestore batch for atomic writes

                        // 1. Create Firebase Auth user
                        const newUserRecord = await admin.auth().createUser({
                            email: profileData.email,
                            password: DEFAULT_PASSWORD,
                            displayName: profileData.nickname || `${profileData.firstName} ${profileData.lastName}`,
                        });
                        const newUserId = newUserRecord.uid;
                        console.log(`importStaffData: Row ${res.rowNum} - Created auth user ${newUserId}`);

                        // 2. Set user role in 'users' collection
                        batch.set(db.collection('users').doc(newUserId), { role: 'staff' });

                        // 3. Set staff profile in 'staff_profiles' collection
                        batch.set(db.collection('staff_profiles').doc(newUserId), {
                            ...profileData, // Include all parsed profile fields
                            uid: newUserId, // Link to the auth UID
                            jobHistory: [], // Initialize jobHistory as an EMPTY array
                            bonusStreak: 0, // Default bonus streak
                            createdAt: FieldValue.serverTimestamp(), // Add creation timestamp
                        });

                        // 4. Commit the batch
                        await batch.commit();
                        recordsCreated++; // Increment count of new users created
                        console.log(`importStaffData: Row ${res.rowNum} - Successfully committed create batch.`);
                    })().catch(err => {
                        // Catch errors during the create process for this row
                        const errorMsg = `Row ${res.rowNum} (Create Failed): ${err.message}`;
                        finalExecutionErrors.push(errorMsg);
                        console.error(errorMsg, err);
                    }));
                }
                // --- EXECUTE CREATE PROFILE ONLY (for existing auth user) ---
                // Check if action is 'create', data exists, and staffId is NOT null
                else if (res.action === 'create' && res.dataForCreate && res.staffId !== null) {
                    writePromises.push((async () => {
                        const { profileData } = res.dataForCreate;
                        const userId = res.staffId; // Use the existing UID from analysis
                        console.log(`importStaffData: Executing CREATE PROFILE ONLY for row ${res.rowNum}, UID: ${userId}`);
                        const staffRef = db.collection('staff_profiles').doc(userId);
                        // Use set() because the document doesn't exist yet
                         await staffRef.set({
                            ...profileData,
                            uid: userId, // Link to the auth UID
                            jobHistory: [], // Initialize jobHistory as an EMPTY array
                            bonusStreak: 0, // Default bonus streak
                            createdAt: FieldValue.serverTimestamp(), // Add creation timestamp
                         });
                         // Count this as an 'update' in the summary, as the user already existed in Auth
                         recordsUpdated++;
                         console.log(`importStaffData: Row ${res.rowNum} - Successfully committed create profile.`);
                     })().catch(err => {
                         // Catch errors during profile creation for existing user
                         const errorMsg = `Row ${res.rowNum} (Create Profile Failed): ${err.message}`;
                         finalExecutionErrors.push(errorMsg);
                         console.error(errorMsg, err);
                     }));
                }
                // --- EXECUTE UPDATE PROFILE ---
                // Check if action is 'update', data exists, and staffId is known
                else if (res.action === 'update' && res.dataForUpdate && res.staffId) {
                    writePromises.push((async () => {
                         const userId = res.staffId;
                         console.log(`importStaffData: Executing UPDATE for row ${res.rowNum}, UID: ${userId}`);
                         // Get the Firestore document reference using the staffId
                         const staffRef = db.collection('staff_profiles').doc(userId);
                         const { profileData } = res.dataForUpdate; // Get intended profile data

                         // Fetch profile again right before update for safety (optional but avoids race conditions)
                         const currentSnap = await staffRef.get();
                         if (!currentSnap.exists) throw new Error("Profile document disappeared before update could occur");
                         const currentProfile = currentSnap.data();

                         let updatePayload = {}; // Object to hold only the fields that actually need updating
                         let requiresUpdate = false;

                         // Re-check profile changes against the *current* Firestore data
                         Object.keys(profileData).forEach(key => {
                             if (!areValuesEqual(profileData[key], currentProfile[key])) {
                                 updatePayload[key] = profileData[key]; // Add changed field to payload
                                 requiresUpdate = true;
                             }
                         });

                         // Only perform the update if changes are still needed
                         if (requiresUpdate) {
                            console.log(`importStaffData: Row ${res.rowNum} - Applying final update payload:`, updatePayload);
                            await staffRef.update(updatePayload);
                            recordsUpdated++; // Increment count of updated profiles
                         } else {
                             console.log(`importStaffData: Row ${res.rowNum} - No update applied on final check (data already matched).`);
                             // Optionally, you could decrement an 'updatesPlanned' count here if tracking precisely
                         }
                    })().catch(err => {
                         // Catch errors during the update process for this row
                         const errorMsg = `Row ${res.rowNum} (Update Failed): ${err.message}`;
                         finalExecutionErrors.push(errorMsg);
                         console.error(errorMsg, err);
                     }));
                }
                 // Collect errors identified during the analysis phase into the final error list
                else if (res.action === 'error') {
                     res.errors.forEach(errMsg => {
                        const fullMsg = `Row ${res.rowNum}: ${errMsg}`;
                        // Avoid duplicating errors if they were already added to overallErrors
                        if (!finalExecutionErrors.includes(fullMsg) && !overallErrors.some(e => e.startsWith(`Row ${res.rowNum}:`))) {
                            finalExecutionErrors.push(fullMsg);
                        }
                    });
                }
            }); // End of forEach loop iterating through analysis results

            // Wait for all asynchronous database write operations to complete or fail
            await Promise.allSettled(writePromises);
            console.log("importStaffData: All write operations have settled.");

            // --- Return Final Execution Summary ---
            // Combine errors from analysis (overallErrors) and execution (finalExecutionErrors)
            // Simple de-duplication based on row number prefix
            const uniqueRowErrors = new Map();
             [...overallErrors, ...finalExecutionErrors].forEach(e => {
                 const rowPrefix = e.match(/^Row \d+:/)?.[0];
                 if (rowPrefix && !uniqueRowErrors.has(rowPrefix)) {
                     uniqueRowErrors.set(rowPrefix, e);
                 } else if (!rowPrefix && !uniqueRowErrors.has(e)) { // Keep general errors
                     uniqueRowErrors.set(e, e);
                 }
             });
            const allErrors = Array.from(uniqueRowErrors.values());


            const finalSummaryMessage = `Import finished. Processed: ${records.length}. Created: ${recordsCreated}. Updated: ${recordsUpdated}. Errors: ${allErrors.length}.`;
            console.log(finalSummaryMessage);
             if (allErrors.length > 0) console.error("importStaffData: Final import errors encountered:", allErrors);

            // Return the final result object to the frontend
            return {
                result: finalSummaryMessage,
                errors: allErrors, // Return the combined & de-duplicated list of errors
                defaultPassword: (recordsCreated > 0) ? DEFAULT_PASSWORD : null // Include default password if new users were created
            };
        }

    } catch (error) { // Catch critical errors (e.g., during parsing, header check)
        console.error("importStaffData: CRITICAL error during import process:", error);
        // Ensure HttpsError is thrown back to client for known types (like permission denied, invalid args)
        if (error instanceof HttpsError) throw error;
        // Package other unexpected errors nicely for the client
         return {
            result: `Import failed with a critical error: ${error.message}`,
            // Include row-specific errors if any occurred before the critical failure
            errors: [`General Error: ${error.message}`, ...overallErrors],
             analysis: null // Indicate analysis was likely incomplete or failed
        };
    }
});