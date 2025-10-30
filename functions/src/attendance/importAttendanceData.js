/* functions/src/attendance/importAttendanceData.js */

const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { parse: csvParseSync } = require('csv-parse/sync');
const { DateTime } = require('luxon');
const { isEqual: isDateEqual, isValid: isJsDateValid } = require('date-fns');

const db = getFirestore();

// --- Configuration ---
const THAILAND_TIMEZONE = 'Asia/Bangkok';
const REQUIRED_HEADERS = ['staffid', 'date'];
const ALL_EXPECTED_HEADERS = [
    'attendancedocid', 'staffid', 'staffname', 'date',
    'checkintime', 'checkouttime', 'breakstarttime', 'breakendtime'
];
const TIME_FIELDS_MAP = {
    checkintime: 'checkInTime',
    checkouttime: 'checkOutTime',
    breakstarttime: 'breakStart',
    breakendtime: 'breakEnd'
};


// --- Helpers ---

// *** NEW HELPER FUNCTION ***
/**
 * Parses a date string from a CSV.
 * Tries "yyyy-MM-dd", "dd-MM-yy", and "dd-MM-yyyy".
 * @param {string} dateString The date string from the CSV.
 * @returns {string | null} A valid "yyyy-MM-dd" string or null.
 */
const parseDateString = (dateString) => {
    if (!dateString) return null;

    // List of formats to try
    const formatsToTry = [
        'yyyy-MM-dd', // Format 1: 2025-10-23
        'dd-MM-yy',   // Format 2: 23-10-25
        'dd-MM-yyyy'  // Format 3: 23-10-2025
    ];

    for (const format of formatsToTry) {
        // Use Luxon to parse, specifying the local timezone
        const dt = DateTime.fromFormat(dateString, format, { zone: THAILAND_TIMEZONE });
        if (dt.isValid) {
            return dt.toFormat('yyyy-MM-dd'); // Return in standard yyyy-MM-dd format
        }
    }
    
    return null; // Could not parse
};
// *** END NEW HELPER FUNCTION ***


/**
 * Parses a date string (YYYY-MM-DD) and time string (HH:mm or HH:mm:ss)
 * into a Firestore Timestamp, interpreting the time in the specified timezone using Luxon.
 */
const parseDateTimeToTimestampLuxon = (dateString, timeString) => {
    if (!dateString || !timeString) return null;

    // Date validation is now handled *before* this function is called,
    // so we can trust dateString is YYYY-MM-DD.
    
    const timeFormat = timeString.length === 5 ? 'HH:mm' : 'HH:mm:ss';
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(timeString)) {
        console.warn(`parseDateTimeLuxon: Invalid time format: "${timeString}"`);
        return null;
    }

    const dateTimeString = `${dateString}T${timeString}`;

    try {
        const dt = DateTime.fromISO(dateTimeString, { zone: THAILAND_TIMEZONE });
        if (!dt.isValid) {
            console.warn(`parseDateTimeLuxon: Invalid combined date/time: "${dateTimeString}". Reason: ${dt.invalidReason || dt.invalidExplanation}`);
            return null;
        }
        return Timestamp.fromDate(dt.toJSDate());
    } catch (e) {
        console.error(`parseDateTimeLuxon: Unexpected error parsing "${dateTimeString}":`, e);
        return null;
    }
};


/**
 * Compares two values, correctly handling Firestore Timestamps,
 * numbers vs strings, and nullish values (null, undefined, empty string).
 */
const areValuesEqual = (val1, val2) => {
    if (val1 instanceof Timestamp && val2 instanceof Timestamp) {
        try {
            const date1 = val1.toDate();
            const date2 = val2.toDate();
            if (isJsDateValid(date1) && isJsDateValid(date2)) {
                return isDateEqual(date1, date2);
            }
        } catch (e) {
            console.warn("areValuesEqual: Error converting Timestamps to Dates for comparison, falling back.", e);
        }
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


// --- Main Cloud Function ---
exports.importAttendanceDataHandler = functions.https.onCall({
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB"
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
    const { csvData, confirm } = request.data;
    if (!csvData || typeof csvData !== 'string') {
        console.error("importAttendanceData: Invalid argument - csvData missing or not a string.");
        throw new HttpsError("invalid-argument", "CSV data string is required.");
    }
    const isDryRun = !confirm;
    console.log(`importAttendanceData: Running in ${isDryRun ? 'dry run' : 'execution'} mode.`);

    // 3. --- Initialization ---
    let analysisResults = [];
    let overallErrors = [];

    try {
        // 4. --- CSV Parsing and Header Validation ---
        console.log("importAttendanceData: Parsing CSV data...");
        const records = csvParseSync(csvData, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });
        console.log(`importAttendanceData: Parsed ${records.length} records.`);

        if (records.length === 0) {
            console.log("importAttendanceData: CSV file was empty.");
            return { result: "CSV file was empty or contained no data rows.", analysis: { creates: [], updates: [], noChanges: [], errors: [] } };
        }

        console.log("importAttendanceData: Validating CSV headers...");
        const headers = Object.keys(records[0]).map(h => h.toLowerCase());
        const missingRequired = REQUIRED_HEADERS.filter(h => !headers.includes(h.toLowerCase()));
        if (missingRequired.length > 0) {
            console.error(`importAttendanceData: Missing required headers: ${missingRequired.join(', ')}`);
            throw new HttpsError("invalid-argument", `Missing required columns in CSV: ${missingRequired.join(', ')}`);
        }
        const hasAttendanceDocId = headers.includes('attendancedocid');
        console.log(`importAttendanceData: Headers validated. Has attendanceDocId column: ${hasAttendanceDocId}`);


        // 5. --- Analyze Each Record ---
        console.log("importAttendanceData: Analyzing records...");
        for (let index = 0; index < records.length; index++) {
            const record = records[index];
            const rowNum = index + 2;
            let analysis = { rowNum, action: 'error', details: null, errors: [], attendanceDocId: null, staffId: null, date: null, staffName: null };

            try {
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
                const rawDate = getRecordValue('date'); // e.g., "01-10-25"
                const staffName = getRecordValue('staffName') || '';

                // *** THIS IS THE FIX ***
                // Use the new helper to parse and validate the date string
                const date = parseDateString(rawDate); // Returns "2025-10-01" or null
                
                if (!date) {
                    throw new Error(`Missing or invalid required data for: date (Could not parse '${rawDate}'. Must be YYYY-MM-DD, dd-MM-yy, or dd-MM-yyyy)`);
                }
                // *** END FIX ***
                
                // Basic check for staffId format
                if (!staffId || staffId.length < 5) {
                    throw new Error(`Invalid or missing staffId`);
                }

                // Store identifiers in analysis object
                analysis.attendanceDocId = attendanceDocId;
                analysis.staffId = staffId;
                analysis.date = date; // Store the *parsed* YYYY-MM-DD date
                analysis.staffName = staffName;

                // c. --- Prepare Potential Firestore Data (Parsing Times using Luxon) ---
                const csvAttendanceData = {
                    staffId: staffId,
                    date: date, // Use the parsed YYYY-MM-DD date
                    staffName: staffName,
                    checkInTime: parseDateTimeToTimestampLuxon(date, getRecordValue('checkInTime')),
                    checkOutTime: parseDateTimeToTimestampLuxon(date, getRecordValue('checkOutTime')),
                    breakStart: parseDateTimeToTimestampLuxon(date, getRecordValue('breakStartTime')),
                    breakEnd: parseDateTimeToTimestampLuxon(date, getRecordValue('breakEndTime')),
                };

                // d. --- Find Existing Attendance Record in Firestore ---
                let existingRecord = null;
                let attendanceRef = null;

                if (attendanceDocId) {
                    // ** Strategy 1: Find by provided Document ID **
                    console.log(`importAttendanceData: Row ${rowNum} - Attempting to find record by attendanceDocId: ${attendanceDocId}`);
                    attendanceRef = db.collection('attendance').doc(attendanceDocId);
                    const docSnap = await attendanceRef.get();
                    if (docSnap.exists) {
                        existingRecord = docSnap.data();
                        if (existingRecord.staffId !== staffId || existingRecord.date !== date) {
                            console.error(`importAttendanceData: Row ${rowNum} - Data mismatch error. Doc ${attendanceDocId} has staff ${existingRecord.staffId} on ${existingRecord.date}, but CSV row has staff ${staffId} on ${date}.`);
                            throw new Error(`Data mismatch: Record found by attendanceDocId (${attendanceDocId}) has different staffId/date than CSV row.`);
                        }
                         console.log(`importAttendanceData: Row ${rowNum} - Successfully found existing record by attendanceDocId.`);
                    } else {
                        console.error(`importAttendanceData: Row ${rowNum} - Error: attendanceDocId "${attendanceDocId}" not found in database.`);
                        throw new Error(`attendanceDocId "${attendanceDocId}" not found in database.`);
                    }
                } else {
                    // ** Strategy 2: No Document ID provided - Check for existing record **
                     console.log(`importAttendanceData: Row ${rowNum} - No attendanceDocId provided. Checking for existing record for staff ${staffId} on ${date}.`);
                     const q = db.collection('attendance').where('staffId', '==', staffId).where('date', '==', date).limit(1);
                     const querySnap = await q.get();
                     if (!querySnap.empty) {
                        const existingDocId = querySnap.docs[0].id;
                        console.warn(`importAttendanceData: Row ${rowNum} - Record already exists for ${staffId} on ${date} (Doc ID: ${existingDocId}) but no attendanceDocId was provided in CSV. Cannot create duplicate.`);
                        throw new Error(`Record already exists for ${staffId} on ${date}. To update it, export the data first to get the attendanceDocId ('${existingDocId}') and include it in your import CSV.`);
                     } else {
                         console.log(`importAttendanceData: Row ${rowNum} - No existing record found for ${staffId} on ${date}. Will proceed with create action.`);
                         existingRecord = null;
                         attendanceRef = null;
                     }
                }

                // e. --- Determine Action (Create, Update, NoChange) and Calculate Changes ---
                if (existingRecord && attendanceRef) {
                    // ** Case: Update or No Change **
                    analysis.action = 'update';
                    let changes = {};
                    let requiresUpdate = false;

                    Object.keys(TIME_FIELDS_MAP).forEach(csvKey => {
                        const firestoreKey = TIME_FIELDS_MAP[csvKey];
                        const csvValue = csvAttendanceData[firestoreKey];
                        const existingValue = existingRecord[firestoreKey];
                        if (!areValuesEqual(csvValue, existingValue)) {
                            changes[firestoreKey] = { from: existingValue ?? null, to: csvValue };
                            requiresUpdate = true;
                        }
                    });

                    if (requiresUpdate) {
                        analysis.details = changes;
                        analysis.dataForUpdate = {
                            updateData: {
                                checkInTime: csvAttendanceData.checkInTime,
                                checkOutTime: csvAttendanceData.checkOutTime,
                                breakStart: csvAttendanceData.breakStart,
                                breakEnd: csvAttendanceData.breakEnd,
                            }
                        };
                         console.log(`importAttendanceData: Row ${rowNum} - Marked for UPDATE. Changes:`, changes);
                    } else {
                        analysis.action = 'nochange';
                        analysis.details = null;
                         console.log(`importAttendanceData: Row ${rowNum} - Marked as NO CHANGE.`);
                    }

                } else if (!attendanceDocId && !existingRecord) {
                    // ** Case: Create New Record **
                    analysis.action = 'create';
                    analysis.details = {
                        checkInTime: csvAttendanceData.checkInTime,
                        checkOutTime: csvAttendanceData.checkOutTime,
                        breakStart: csvAttendanceData.breakStart,
                        breakEnd: csvAttendanceData.breakEnd,
                        staffName: csvAttendanceData.staffName
                    };
                    analysis.dataForCreate = csvAttendanceData;
                     console.log(`importAttendanceData: Row ${rowNum} - Marked for CREATE.`);

                } else {
                    console.error(`importAttendanceData: Row ${rowNum} - Reached unhandled analysis state. attendanceDocId: ${attendanceDocId}, existingRecord found: ${!!existingRecord}`);
                    throw new Error(`Internal error: Unhandled analysis state for row ${rowNum}.`);
                }

            } catch (error) {
                analysis.action = 'error';
                const errorMessage = error.message || 'Unknown processing error for row';
                analysis.errors.push(errorMessage);
                console.error(`importAttendanceData: Error processing row ${rowNum}:`, error);
                overallErrors.push(`Row ${rowNum}: ${errorMessage}`);
            }
            analysisResults.push(analysis);
        } // --- End of record analysis loop ---
        console.log("importAttendanceData: Finished analyzing all records.");


        // 6. --- Return Analysis (Dry Run) or Execute Writes (Confirm) ---
        if (isDryRun) {
            console.log("importAttendanceData: Dry run complete. Returning analysis summary.");
            const summary = analysisResults.reduce((acc, cur) => {
                const key = cur.action + (cur.action.endsWith('s') ? '' : 's');
                 if (!acc[key]) acc[key] = [];
                 acc[key].push(cur);
                 return acc;
            }, { creates: [], updates: [], noChanges: [], errors: [] });

            return { analysis: summary };

        } else {
            // --- Execute Confirmed Writes ---
            console.log("importAttendanceData: Executing confirmed import writes...");
            let recordsCreated = 0;
            let recordsUpdated = 0;
            const writePromises = [];
            const finalExecutionErrors = [];

            analysisResults.forEach(res => {
                if (res.action === 'create' && res.dataForCreate) {
                    writePromises.push((async () => {
                        console.log(`importAttendanceData: Executing CREATE for row ${res.rowNum}, Staff: ${res.staffId}, Date: ${res.date}`);
                        await db.collection('attendance').add({
                             ...res.dataForCreate,
                             createdAt: FieldValue.serverTimestamp()
                         });
                        recordsCreated++;
                        console.log(`importAttendanceData: Row ${res.rowNum} - Successfully committed create.`);
                    })().catch(err => {
                        const errorMsg = `Row ${res.rowNum} (Create Failed): ${err.message}`;
                        finalExecutionErrors.push(errorMsg);
                        console.error(errorMsg, err);
                    }));
                }
                else if (res.action === 'update' && res.dataForUpdate && res.attendanceDocId) {
                    writePromises.push((async () => {
                         const docId = res.attendanceDocId;
                         console.log(`importAttendanceData: Executing UPDATE for row ${res.rowNum}, DocID: ${docId}`);
                         const attendanceRef = db.collection('attendance').doc(docId);
                         const { updateData } = res.dataForUpdate;

                         await attendanceRef.update({
                             ...updateData,
                             updatedAt: FieldValue.serverTimestamp()
                         });
                         recordsUpdated++;
                         console.log(`importAttendanceData: Row ${res.rowNum} - Successfully committed update.`);
                    })().catch(err => {
                         const errorMsg = `Row ${res.rowNum} (Update Failed - Doc: ${res.attendanceDocId}): ${err.message}`;
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
            console.log("importAttendanceData: All write operations have settled.");

             const uniqueRowErrors = new Map();
             [...overallErrors, ...finalExecutionErrors].forEach(e => {
                 const rowPrefix = e.match(/^Row \d+:/)?.[0];
                 if (rowPrefix && !uniqueRowErrors.has(rowPrefix)) {
                     uniqueRowErrors.set(rowPrefix, e);
                 } else if (!rowPrefix && !uniqueRowErrors.has(e)) {
                     uniqueRowErrors.set(e, e);
                 }
             });
            const allErrors = Array.from(uniqueRowErrors.values());

            const finalSummaryMessage = `Attendance import finished. Processed: ${records.length}. Created: ${recordsCreated}. Updated: ${recordsUpdated}. Errors: ${allErrors.length}.`;
            console.log(finalSummaryMessage);
             if (allErrors.length > 0) console.error("importAttendanceData: Final import errors encountered:", allErrors);

            return {
                result: finalSummaryMessage,
                errors: allErrors,
            };
        }

    } catch (error) {
        console.error("importAttendanceData: CRITICAL error during import process:", error);
        if (error instanceof HttpsError) throw error;
         return {
            result: `Import failed with a critical error: ${error.message}`,
            errors: [`General Error: ${error.message}`, ...overallErrors],
             analysis: null
        };
    }
});