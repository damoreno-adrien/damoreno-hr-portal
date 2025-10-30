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

const parseDateString = (dateString) => {
    if (!dateString) return null;
    const formatsToTry = ['yyyy-MM-dd', 'dd-MM-yy', 'dd-MM-yyyy'];
    for (const format of formatsToTry) {
        const dt = DateTime.fromFormat(dateString, format, { zone: THAILAND_TIMEZONE });
        if (dt.isValid) {
            return dt.toFormat('yyyy-MM-dd');
        }
    }
    return null;
};

const parseDateTimeToTimestampLuxon = (dateString, timeString) => {
    if (!dateString || !timeString) return null;
    
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
                let attendanceDocId = hasAttendanceDocId ? getRecordValue('attendanceDocId') : null;
                const staffId = getRecordValue('staffId');
                const rawDate = getRecordValue('date');
                const staffName = getRecordValue('staffName') || '';
                
                const date = parseDateString(rawDate);
                
                if (!date) {
                    throw new Error(`Missing or invalid required data for: date (Could not parse '${rawDate}'. Must be YYYY-MM-DD, dd-MM-yy, or dd-MM-yyyy)`);
                }
                
                if (!staffId || staffId.length < 5) {
                    throw new Error(`Invalid or missing staffId`);
                }

                // --- *** LOGIC FIX: Generate the ID consistently *** ---
                const expectedDocId = `${staffId}_${date}`;
                if (hasAttendanceDocId && attendanceDocId && attendanceDocId !== expectedDocId) {
                    // If an ID is provided but it doesn't match our format, trust it but log a warning.
                    console.warn(`Row ${rowNum}: Provided attendanceDocId '${attendanceDocId}' does not match expected format '${expectedDocId}'. Using provided ID.`);
                } else {
                    // Use the formatted, predictable ID
                    attendanceDocId = expectedDocId;
                }
                // --- *** END LOGIC FIX *** ---

                analysis.attendanceDocId = attendanceDocId; // This is now ALWAYS the formatted ID
                analysis.staffId = staffId;
                analysis.date = date;
                analysis.staffName = staffName;

                // c. --- Prepare Potential Firestore Data ---
                const csvAttendanceData = {
                    staffId: staffId,
                    date: date,
                    staffName: staffName,
                    checkInTime: parseDateTimeToTimestampLuxon(date, getRecordValue('checkInTime')),
                    checkOutTime: parseDateTimeToTimestampLuxon(date, getRecordValue('checkOutTime')),
                    breakStart: parseDateTimeToTimestampLuxon(date, getRecordValue('breakStartTime')),
                    breakEnd: parseDateTimeToTimestampLuxon(date, getRecordValue('breakEndTime')),
                };

                // d. --- Find Existing Attendance Record in Firestore ---
                let existingRecord = null;
                let attendanceRef = null;

                // --- *** LOGIC FIX: Always find by the formatted ID *** ---
                console.log(`importAttendanceData: Row ${rowNum} - Checking for doc with ID: ${attendanceDocId}`);
                attendanceRef = db.collection('attendance').doc(attendanceDocId);
                const docSnap = await attendanceRef.get();
                if (docSnap.exists) {
                    existingRecord = docSnap.data();
                    console.log(`importAttendanceData: Row ${rowNum} - Successfully found existing record.`);
                } else {
                    console.log(`importAttendanceData: Row ${rowNum} - No existing record found. Will proceed with create action if checkInTime is present.`);
                    existingRecord = null;
                }
                // --- *** END LOGIC FIX *** ---

                // e. --- Determine Action (Create, Update, NoChange) ---
                if (existingRecord) {
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

                } else {
                    // ** Case: Create New Record **
                    if (csvAttendanceData.checkInTime) {
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
                        analysis.action = 'nochange';
                        analysis.details = null;
                        console.log(`importAttendanceData: Row ${rowNum} - Marked as NO CHANGE (no existing record and no new check-in time).`);
                    }
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

            // --- *** LOGIC FIX: Use Batch write for creates/updates *** ---
            const batch = db.batch();

            analysisResults.forEach(res => {
                // Get the consistent document reference
                const docRef = db.collection('attendance').doc(res.attendanceDocId);

                if (res.action === 'create' && res.dataForCreate) {
                    console.log(`importAttendanceData: Executing CREATE for row ${res.rowNum}, DocID: ${res.attendanceDocId}`);
                    batch.set(docRef, {
                        ...res.dataForCreate,
                        createdAt: FieldValue.serverTimestamp()
                    });
                    recordsCreated++;
                }
                else if (res.action === 'update' && res.dataForUpdate) {
                    console.log(`importAttendanceData: Executing UPDATE for row ${res.rowNum}, DocID: ${res.attendanceDocId}`);
                    batch.update(docRef, {
                        ...res.dataForUpdate.updateData,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    recordsUpdated++;
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

            try {
                await batch.commit();
                console.log("importAttendanceData: Batch commit successful.");
            } catch (batchError) {
                console.error("importAttendanceData: CRITICAL Batch Commit Error:", batchError);
                finalExecutionErrors.push(`Batch Write Failed: ${batchError.message}. Some records may not have saved.`);
            }
            // --- *** END LOGIC FIX *** ---

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