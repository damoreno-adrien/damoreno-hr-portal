/* functions/src/attendance/importAttendanceData.js */

const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { parse: csvParseSync } = require('csv-parse/sync');
const { DateTime } = require('luxon'); // *** USE LUXON ***
const { isEqual: isDateEqual, isValid: isJsDateValid } = require('date-fns'); // Keep for basic JS Date checks

const db = getFirestore();

// --- Configuration ---
const THAILAND_TIMEZONE = 'Asia/Bangkok'; // Your restaurant's timezone
const REQUIRED_HEADERS = ['staffid', 'date']; // Minimum required: staffId and date
const ALL_EXPECTED_HEADERS = [ // All headers we might process
    'attendancedocid', 'staffid', 'staffname', 'date',
    'checkintime', 'checkouttime', 'breakstarttime', 'breakendtime'
];
const TIME_FIELDS_MAP = { // Map CSV headers (lowercase) to Firestore field names
    checkintime: 'checkInTime',
    checkouttime: 'checkOutTime',
    breakstarttime: 'breakStart',
    breakendtime: 'breakEnd'
};


// --- Helpers ---

/**
 * Parses a date string (YYYY-MM-DD) and time string (HH:mm or HH:mm:ss)
 * into a Firestore Timestamp, interpreting the time in the specified timezone using Luxon.
 * Returns null if date/time is invalid or empty.
 * @param {string} dateString YYYY-MM-DD date.
 * @param {string} timeString HH:mm or HH:mm:ss time.
 * @returns {Timestamp|null} Firestore Timestamp (in UTC) or null.
 */
const parseDateTimeToTimestampLuxon = (dateString, timeString) => {
    if (!dateString || !timeString) return null;

    // Validate basic formats first
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        console.warn(`parseDateTimeLuxon: Invalid date format: "${dateString}"`);
        return null;
    }
    const timeFormat = timeString.length === 5 ? 'HH:mm' : 'HH:mm:ss'; // Choose Luxon format based on length
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(timeString)) {
        console.warn(`parseDateTimeLuxon: Invalid time format: "${timeString}"`);
        return null;
    }

    // Combine date and time using 'T' separator for ISO compatibility with Luxon
    const dateTimeString = `${dateString}T${timeString}`;

    try {
        // 1. Parse the string *specifying the local timezone* it represents
        const dt = DateTime.fromISO(dateTimeString, { zone: THAILAND_TIMEZONE });

        // 2. Check if parsing was successful using Luxon's validity check
        if (!dt.isValid) {
            console.warn(`parseDateTimeLuxon: Invalid combined date/time: "${dateTimeString}". Reason: ${dt.invalidReason || dt.invalidExplanation}`);
            return null;
        }

        // 3. Convert the valid Luxon DateTime object to a JS Date
        //    (JS Dates are UTC-based, which Firestore Timestamps use)
        //    and then create the Firestore Timestamp.
        return Timestamp.fromDate(dt.toJSDate());

    } catch (e) {
        // Catch any unexpected errors during Luxon parsing/conversion
        console.error(`parseDateTimeLuxon: Unexpected error parsing "${dateTimeString}":`, e);
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
    // Compare Firestore Timestamps
    if (val1 instanceof Timestamp && val2 instanceof Timestamp) {
        try {
            // Convert to JS Date for comparison if both are valid Timestamps
            const date1 = val1.toDate();
            const date2 = val2.toDate();
            // Use date-fns isValid for JS Date check
            if (isJsDateValid(date1) && isJsDateValid(date2)) {
                // Use date-fns isEqual for JS Date comparison
                return isDateEqual(date1, date2);
            }
        } catch (e) {
            // Log error and fallback to Firestore's isEqual
            console.warn("areValuesEqual: Error converting Timestamps to Dates for comparison, falling back.", e);
        }
        // Fallback to Firestore's native comparison if conversion fails or dates are invalid
        return val1.isEqual(val2);
    }

    // Compare numbers robustly (treat string numbers as numbers)
    if (typeof val1 === 'number' || typeof val2 === 'number') {
        return Number(val1) === Number(val2);
    }

    // Treat null, undefined, and empty string as equivalent
    const v1IsEmpty = val1 === null || val1 === undefined || val1 === '';
    const v2IsEmpty = val2 === null || val2 === undefined || val2 === '';
    if (v1IsEmpty && v2IsEmpty) return true;

    // Standard strict equality for all other types
    return val1 === val2;
};


// --- Main Cloud Function ---
exports.importAttendanceDataHandler = functions.https.onCall({
    region: "us-central1",    // Or your preferred/consistent region
    timeoutSeconds: 540,      // Generous timeout for potentially large files
    memory: "1GiB"            // Allocate sufficient memory
}, async (request) => {
    // 1. --- Authentication and Authorization ---
    if (!request.auth) {
        console.error("importAttendanceData: Unauthenticated access attempt.");
        throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const callerUid = request.auth.uid;
    try {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") {
             console.error(`importAttendanceData: Permission denied for user ${callerUid}. Role: ${callerDoc.data()?.role}`);
            throw new HttpsError("permission-denied", "Manager role required.");
        }
         console.log(`importAttendanceData: Authorized manager ${callerUid}.`);
    } catch(err) {
         console.error(`importAttendanceData: Error verifying role for user ${callerUid}:`, err);
         throw new HttpsError("internal", "Failed to verify user role.", err.message);
    }

    // 2. --- Input Validation ---
    const { csvData, confirm } = request.data; // Get CSV data and confirmation flag
    if (!csvData || typeof csvData !== 'string') {
        console.error("importAttendanceData: Invalid argument - csvData missing or not a string.");
        throw new HttpsError("invalid-argument", "CSV data string is required.");
    }
    const isDryRun = !confirm; // Determine if this is a dry run (analysis only)
    console.log(`importAttendanceData: Running in ${isDryRun ? 'dry run' : 'execution'} mode.`);

    // 3. --- Initialization ---
    let analysisResults = []; // Stores detailed analysis outcome for each row
    let overallErrors = [];   // Stores general errors or row errors aggregated

    try {
        // 4. --- CSV Parsing and Header Validation ---
        console.log("importAttendanceData: Parsing CSV data...");
        const records = csvParseSync(csvData, {
            columns: true,           // Use first row as headers
            skip_empty_lines: true, // Ignore blank rows
            trim: true               // Trim whitespace
        });
        console.log(`importAttendanceData: Parsed ${records.length} records.`);

        // Handle empty CSV
        if (records.length === 0) {
            console.log("importAttendanceData: CSV file was empty.");
            return { result: "CSV file was empty or contained no data rows.", analysis: { creates: [], updates: [], noChanges: [], errors: [] } };
        }

        // Validate required headers (case-insensitive)
        console.log("importAttendanceData: Validating CSV headers...");
        const headers = Object.keys(records[0]).map(h => h.toLowerCase());
        const missingRequired = REQUIRED_HEADERS.filter(h => !headers.includes(h.toLowerCase()));
        if (missingRequired.length > 0) {
            console.error(`importAttendanceData: Missing required headers: ${missingRequired.join(', ')}`);
            throw new HttpsError("invalid-argument", `Missing required columns in CSV: ${missingRequired.join(', ')}`);
        }
        // Check if the optional but important attendanceDocId column is present
        const hasAttendanceDocId = headers.includes('attendancedocid');
        console.log(`importAttendanceData: Headers validated. Has attendanceDocId column: ${hasAttendanceDocId}`);


        // 5. --- Analyze Each Record ---
        console.log("importAttendanceData: Analyzing records...");
        for (let index = 0; index < records.length; index++) {
            const record = records[index];
            const rowNum = index + 2; // CSV row number (1-based index + header row)
            // Initialize analysis object for this row
            let analysis = { rowNum, action: 'error', details: null, errors: [], attendanceDocId: null, staffId: null, date: null, staffName: null };

            try {
                // Helper to get value from record case-insensitively and trim
                const getRecordValue = (key) => {
                    const actualHeader = Object.keys(record).find(h => h.toLowerCase() === key.toLowerCase());
                    return actualHeader ? record[actualHeader]?.trim() : undefined;
                };

                // a. --- Row-Level Validation (Required Fields) ---
                const missingRequiredCheck = REQUIRED_HEADERS.filter(h => {
                    const value = getRecordValue(h);
                    return value === null || value === undefined || value === '';
                });
                if (missingRequiredCheck.length > 0) {
                    throw new Error(`Missing/empty required data for: ${missingRequiredCheck.join(', ')}`);
                }

                // b. --- Extract and Validate Key Identifying Fields ---
                const attendanceDocId = hasAttendanceDocId ? getRecordValue('attendanceDocId') : null;
                const staffId = getRecordValue('staffId');
                const date = getRecordValue('date'); // Expect YYYY-MM-DD string
                const staffName = getRecordValue('staffName') || ''; // Optional, for display/context

                // Store identifiers in analysis object early
                analysis.attendanceDocId = attendanceDocId;
                analysis.staffId = staffId;
                analysis.date = date;
                analysis.staffName = staffName; // Store provided name

                // Validate date format rigorously
                if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                    throw new Error(`Missing or invalid required data for: date (Must be YYYY-MM-DD)`);
                }
                // Basic check for staffId format if needed (e.g., length)
                if (!staffId || staffId.length < 5) { // Example check
                    throw new Error(`Invalid or missing staffId`);
                }

                // c. --- Prepare Potential Firestore Data (Parsing Times using Luxon) ---
                const csvAttendanceData = {
                    staffId: staffId,
                    date: date, // Keep as string, matches Firestore
                    staffName: staffName, // Store name from CSV if provided
                    // Use Luxon helper to parse time strings into Timestamps
                    checkInTime: parseDateTimeToTimestampLuxon(date, getRecordValue('checkInTime')),
                    checkOutTime: parseDateTimeToTimestampLuxon(date, getRecordValue('checkOutTime')),
                    breakStart: parseDateTimeToTimestampLuxon(date, getRecordValue('breakStartTime')),
                    breakEnd: parseDateTimeToTimestampLuxon(date, getRecordValue('breakEndTime')),
                };

                // d. --- Find Existing Attendance Record in Firestore ---
                let existingRecord = null; // Holds data from existing Firestore doc
                let attendanceRef = null;  // Holds reference to the Firestore doc

                if (attendanceDocId) {
                    // ** Strategy 1: Find by provided Document ID **
                    console.log(`importAttendanceData: Row ${rowNum} - Attempting to find record by attendanceDocId: ${attendanceDocId}`);
                    attendanceRef = db.collection('attendance').doc(attendanceDocId);
                    const docSnap = await attendanceRef.get();
                    if (docSnap.exists) {
                        existingRecord = docSnap.data();
                        // ** Sanity Check: ** Verify staffId and date in the found document match the CSV row
                        if (existingRecord.staffId !== staffId || existingRecord.date !== date) {
                            console.error(`importAttendanceData: Row ${rowNum} - Data mismatch error. Doc ${attendanceDocId} has staff ${existingRecord.staffId} on ${existingRecord.date}, but CSV row has staff ${staffId} on ${date}.`);
                            throw new Error(`Data mismatch: Record found by attendanceDocId (${attendanceDocId}) has different staffId/date than CSV row.`);
                        }
                         console.log(`importAttendanceData: Row ${rowNum} - Successfully found existing record by attendanceDocId.`);
                    } else {
                        // If ID is provided but document doesn't exist, this is an error for this row
                        console.error(`importAttendanceData: Row ${rowNum} - Error: attendanceDocId "${attendanceDocId}" not found in database.`);
                        throw new Error(`attendanceDocId "${attendanceDocId}" not found in database.`);
                    }
                } else {
                    // ** Strategy 2: No Document ID provided - Check if a record *already exists* for this staff+date **
                     console.log(`importAttendanceData: Row ${rowNum} - No attendanceDocId provided. Checking for existing record for staff ${staffId} on ${date}.`);
                     const q = db.collection('attendance').where('staffId', '==', staffId).where('date', '==', date).limit(1);
                     const querySnap = await q.get();
                     if (!querySnap.empty) {
                        // A record ALREADY exists, but the user didn't provide its ID in the CSV.
                        // To prevent accidental overwrites or duplicates when the user intends to *create*,
                        // we treat this as an error and ask them to provide the ID if they want to update.
                        const existingDocId = querySnap.docs[0].id;
                        console.warn(`importAttendanceData: Row ${rowNum} - Record already exists for ${staffId} on ${date} (Doc ID: ${existingDocId}) but no attendanceDocId was provided in CSV. Cannot create duplicate.`);
                        throw new Error(`Record already exists for ${staffId} on ${date}. To update it, export the data first to get the attendanceDocId ('${existingDocId}') and include it in your import CSV.`);
                     } else {
                         // No existing record found for this staff+date. This row intends to create a new record.
                         console.log(`importAttendanceData: Row ${rowNum} - No existing record found for ${staffId} on ${date}. Will proceed with create action.`);
                         existingRecord = null; // Ensure existingRecord is null for create path
                         attendanceRef = null; // No specific doc ref yet for create
                     }
                }

                // e. --- Determine Action (Create, Update, NoChange) and Calculate Changes ---
                if (existingRecord && attendanceRef) {
                    // ** Case: Update or No Change **
                    analysis.action = 'update'; // Assume update initially
                    let changes = {};           // To store detected differences
                    let requiresUpdate = false; // Flag if any changes are found

                    // Compare relevant time fields from CSV (parsed Timestamps) against existing Firestore Timestamps
                    Object.keys(TIME_FIELDS_MAP).forEach(csvKey => {
                        const firestoreKey = TIME_FIELDS_MAP[csvKey];
                        const csvValue = csvAttendanceData[firestoreKey]; // Parsed Timestamp or null
                        const existingValue = existingRecord[firestoreKey]; // Existing Timestamp or null/undefined
                        // Use robust comparison
                        if (!areValuesEqual(csvValue, existingValue)) {
                            changes[firestoreKey] = { from: existingValue ?? null, to: csvValue };
                            requiresUpdate = true;
                        }
                    });

                    // Optional: Compare staffName if you want to allow updating it via CSV
                    // if (!areValuesEqual(csvAttendanceData.staffName, existingRecord.staffName)) {
                    //     changes.staffName = { from: existingRecord.staffName ?? null, to: csvAttendanceData.staffName };
                    //     requiresUpdate = true;
                    // }

                    // Finalize analysis based on whether changes were detected
                    if (requiresUpdate) {
                        analysis.details = changes; // Store the specific changes found
                        // Store the data needed for the actual update during execution phase
                        analysis.dataForUpdate = {
                            updateData: { // Include only fields that are potentially updated
                                checkInTime: csvAttendanceData.checkInTime,
                                checkOutTime: csvAttendanceData.checkOutTime,
                                breakStart: csvAttendanceData.breakStart,
                                breakEnd: csvAttendanceData.breakEnd,
                                // staffName: csvAttendanceData.staffName // Optional
                            }
                        };
                         console.log(`importAttendanceData: Row ${rowNum} - Marked for UPDATE. Changes:`, changes);
                    } else {
                        // No differences found between CSV and Firestore data
                        analysis.action = 'nochange';
                        analysis.details = null; // Clear details
                         console.log(`importAttendanceData: Row ${rowNum} - Marked as NO CHANGE.`);
                    }

                } else if (!attendanceDocId && !existingRecord) {
                    // ** Case: Create New Record **
                    // This is triggered when no attendanceDocId was given AND no existing record was found for staff+date
                    analysis.action = 'create';
                    // Details show the data that will be created
                    analysis.details = {
                        checkInTime: csvAttendanceData.checkInTime,
                        checkOutTime: csvAttendanceData.checkOutTime,
                        breakStart: csvAttendanceData.breakStart,
                        breakEnd: csvAttendanceData.breakEnd,
                        staffName: csvAttendanceData.staffName // Include name if provided
                    };
                    // Store the full data needed for creation during execution phase
                    analysis.dataForCreate = csvAttendanceData;
                     console.log(`importAttendanceData: Row ${rowNum} - Marked for CREATE.`);

                } else {
                    // This state should not be logically reachable due to the error thrown earlier
                    // if a record exists but no ID was provided. Added as a safeguard.
                    console.error(`importAttendanceData: Row ${rowNum} - Reached unhandled analysis state. attendanceDocId: ${attendanceDocId}, existingRecord found: ${!!existingRecord}`);
                    throw new Error(`Internal error: Unhandled analysis state for row ${rowNum}.`);
                }

            } catch (error) { // Catch errors specific to processing this row
                analysis.action = 'error';
                const errorMessage = error.message || 'Unknown processing error for row';
                analysis.errors.push(errorMessage);
                console.error(`importAttendanceData: Error processing row ${rowNum}:`, error);
                // Add row-specific errors to the overall list for the final function summary
                overallErrors.push(`Row ${rowNum}: ${errorMessage}`);
            }
            // Add the completed analysis (or error details) for this row to the results array
            analysisResults.push(analysis);
        } // --- End of record analysis loop ---
        console.log("importAttendanceData: Finished analyzing all records.");


        // 6. --- Return Analysis (Dry Run) or Execute Writes (Confirm) ---
        if (isDryRun) {
            // --- Return Analysis Summary ---
            console.log("importAttendanceData: Dry run complete. Returning analysis summary.");
            // Group analysis results by action type for the frontend modal
            const summary = analysisResults.reduce((acc, cur) => {
                const key = cur.action + (cur.action.endsWith('s') ? '' : 's'); // creates, updates, noChanges, errors
                 if (!acc[key]) acc[key] = []; // Initialize array if not present
                 acc[key].push(cur);
                 return acc;
            }, { creates: [], updates: [], noChanges: [], errors: [] }); // Ensure all keys are initialized

            return { analysis: summary }; // Return the structured summary

        } else {
            // --- Execute Confirmed Writes ---
            console.log("importAttendanceData: Executing confirmed import writes...");
            let recordsCreated = 0; // Count new attendance docs created
            let recordsUpdated = 0; // Count attendance docs updated
            const writePromises = []; // Array to hold all async write operations
            const finalExecutionErrors = []; // Collect errors specifically from this execution phase

            // Iterate through the analysis results to perform necessary writes
            analysisResults.forEach(res => {
                // --- EXECUTE CREATE ---
                // Check if action is 'create' and dataForCreate exists
                if (res.action === 'create' && res.dataForCreate) {
                    writePromises.push((async () => {
                        console.log(`importAttendanceData: Executing CREATE for row ${res.rowNum}, Staff: ${res.staffId}, Date: ${res.date}`);
                        // Add the prepared data directly to the 'attendance' collection
                        // Firestore will automatically generate a document ID
                        await db.collection('attendance').add({
                             ...res.dataForCreate, // Contains parsed Timestamps, staffId, date, staffName
                             createdAt: FieldValue.serverTimestamp() // Add creation timestamp
                         });
                        recordsCreated++;
                        console.log(`importAttendanceData: Row ${res.rowNum} - Successfully committed create.`);
                    })().catch(err => {
                        // Catch errors during the create process for this row
                        const errorMsg = `Row ${res.rowNum} (Create Failed): ${err.message}`;
                        finalExecutionErrors.push(errorMsg);
                        console.error(errorMsg, err);
                    }));
                }
                // --- EXECUTE UPDATE ---
                // Check if action is 'update', dataForUpdate exists, and attendanceDocId is known
                else if (res.action === 'update' && res.dataForUpdate && res.attendanceDocId) {
                    writePromises.push((async () => {
                         const docId = res.attendanceDocId; // Get the document ID from analysis
                         console.log(`importAttendanceData: Executing UPDATE for row ${res.rowNum}, DocID: ${docId}`);
                         // Get the Firestore document reference
                         const attendanceRef = db.collection('attendance').doc(docId);
                         const { updateData } = res.dataForUpdate; // Get the payload containing fields to update

                         // Perform the update with the prepared data and add an update timestamp
                         await attendanceRef.update({
                             ...updateData, // Update with parsed Timestamps (or nulls)
                             updatedAt: FieldValue.serverTimestamp() // Add/update the update timestamp
                         });
                         recordsUpdated++;
                         console.log(`importAttendanceData: Row ${res.rowNum} - Successfully committed update.`);
                    })().catch(err => {
                         // Catch errors during the update process for this row
                         const errorMsg = `Row ${res.rowNum} (Update Failed - Doc: ${res.attendanceDocId}): ${err.message}`;
                         finalExecutionErrors.push(errorMsg);
                         console.error(errorMsg, err);
                     }));
                 }
                 // --- COLLECT ERRORS --- (from analysis phase)
                 // If the action was 'error' during analysis, collect those errors for the final summary
                else if (res.action === 'error') {
                     res.errors.forEach(errMsg => {
                        const fullMsg = `Row ${res.rowNum}: ${errMsg}`;
                        // Add if not already captured in overallErrors (basic check)
                        if (!finalExecutionErrors.includes(fullMsg) && !overallErrors.some(e => e.startsWith(`Row ${res.rowNum}:`))) {
                            finalExecutionErrors.push(fullMsg);
                        }
                    });
                }
            }); // End of forEach loop iterating through analysis results

            // Wait for all asynchronous database write operations to complete or fail
            await Promise.allSettled(writePromises);
            console.log("importAttendanceData: All write operations have settled.");

            // --- Return Final Execution Summary ---
            // Combine errors from analysis (overallErrors) and execution (finalExecutionErrors), removing duplicates
             const uniqueRowErrors = new Map();
             [...overallErrors, ...finalExecutionErrors].forEach(e => {
                 const rowPrefix = e.match(/^Row \d+:/)?.[0]; // Get "Row X:" prefix
                 if (rowPrefix && !uniqueRowErrors.has(rowPrefix)) { // Store first error per row number
                     uniqueRowErrors.set(rowPrefix, e);
                 } else if (!rowPrefix && !uniqueRowErrors.has(e)) { // Keep general errors
                     uniqueRowErrors.set(e, e);
                 }
             });
            const allErrors = Array.from(uniqueRowErrors.values());

            // Construct the final summary message
            const finalSummaryMessage = `Attendance import finished. Processed: ${records.length}. Created: ${recordsCreated}. Updated: ${recordsUpdated}. Errors: ${allErrors.length}.`;
            console.log(finalSummaryMessage);
             if (allErrors.length > 0) console.error("importAttendanceData: Final import errors encountered:", allErrors);

            // Return the result object to the frontend
            return {
                result: finalSummaryMessage,
                errors: allErrors, // Return the combined & de-duplicated list of errors
                // No default password needed for attendance import
            };
        } // End of execution block

    } catch (error) { // Catch critical errors (e.g., during parsing, header check, unexpected issues)
        console.error("importAttendanceData: CRITICAL error during import process:", error);
        // Ensure HttpsError is thrown back to client for known types
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