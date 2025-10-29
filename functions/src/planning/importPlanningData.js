/* functions/src/planning/importPlanningData.js */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');
const { parse: csvParseSync } = require('csv-parse/sync');
// --- ADDED LUXON for robust date parsing ---
const { DateTime } = require('luxon');

// Use V8 syntax for db, consistent with your other functions
const db = admin.firestore();

// --- Configuration ---
const REQUIRED_HEADERS_STAFFID = ['staffid', 'staffid'];
const REQUIRED_HEADERS_DATE = ['date'];
const OPTIONAL_SCHEDULEID = ['scheduleid', 'scheduleid'];
const THAILAND_TIMEZONE = 'Asia/Bangkok';

// --- NEW HELPER ---
/**
 * Gets a value from a CSV record object by checking a list of possible header names.
 * Checks are case-insensitive.
 */
const getRecordValue = (record, possibleNames) => {
    const recordKeys = Object.keys(record);
    for (const name of possibleNames) {
        // Find the actual header key in the record that matches (case-insensitive)
        const actualHeader = recordKeys.find(h => h.toLowerCase() === name.toLowerCase());
        if (actualHeader && record[actualHeader] !== undefined) {
            return record[actualHeader].trim();
        }
    }
    return undefined; // Return undefined if no value found
};

// --- NEW HELPER to parse multiple date formats ---
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
        const dt = DateTime.fromFormat(dateString, format, { zone: THAILAND_TIMEZONE });
        if (dt.isValid) {
            return dt.toFormat('yyyy-MM-dd'); // Return in standard format
        }
    }
    
    return null; // Could not parse
};


// --- Main Cloud Function ---
exports.importPlanningDataHandler = onCall({
    region: "asia-southeast1",
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (request) => {
    // 1. --- Authentication and Authorization ---
    if (!request.auth) {
        console.error("importPlanningData: Unauthenticated access attempt.");
        throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const callerUid = request.auth.uid;
    try {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") {
            console.error(`importPlanningData: Permission denied for user ${callerUid}.`);
            throw new HttpsError("permission-denied", "Manager role required.");
        }
        console.log(`importPlanningData: Authorized manager ${callerUid}.`);
    } catch (err) {
        console.error(`importPlanningData: Error verifying role for user ${callerUid}:`, err);
        throw new HttpsError("internal", "Failed to verify user role.", err.message);
    }

    // 2. --- Input Validation ---
    const { csvData, confirm } = request.data;
    if (!csvData || typeof csvData !== 'string') {
        throw new HttpsError("invalid-argument", "CSV data string is required.");
    }
    const isDryRun = !confirm;
    console.log(`importPlanningData: Running in ${isDryRun ? 'dry run' : 'execution'} mode.`);

    // 3. --- Initialization ---
    let analysisResults = [];
    let overallErrors = [];

    try {
        // 4. --- CSV Parsing and Header Validation ---
        console.log("importPlanningData: Parsing CSV data...");
        const records = csvParseSync(csvData, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });
        console.log(`importPlanningData: Parsed ${records.length} records.`);

        if (records.length === 0) {
            return { result: "CSV file was empty.", analysis: { creates: [], updates: [], noChanges: [], errors: [] } };
        }

        // --- UPDATED Header Validation ---
        console.log("importPlanningData: Validating CSV headers...");
        const headers = Object.keys(records[0]).map(h => h.toLowerCase());

        // Check if *at least one* of the required ID spellings is present
        const hasStaffId = REQUIRED_HEADERS_STAFFID.some(key => headers.includes(key));
        const hasDate = REQUIRED_HEADERS_DATE.some(key => headers.includes(key));

        const missingRequired = [];
        if (!hasStaffId) missingRequired.push('staffId'); // User-friendly name
        if (!hasDate) missingRequired.push('date');

        if (missingRequired.length > 0) {
            console.error(`importPlanningData: Missing required headers: ${missingRequired.join(', ')}`);
            throw new HttpsError("invalid-argument", `Missing required columns in CSV: ${missingRequired.join(', ')}`);
        }
        console.log("importPlanningData: Headers validated.");
        // --- END UPDATED Validation ---


        // 5. --- Analyze Each Record ---
        console.log("importPlanningData: Analyzing records...");
        for (let index = 0; index < records.length; index++) {
            const record = records[index];
            const rowNum = index + 2;
            let analysis = { rowNum, action: 'error', details: null, errors: [], scheduleId: null, staffId: null, date: null, staffName: null };

            try {
                // --- UPDATED Value Extraction ---
                // Use the new helper to get values, checking multiple key spellings
                const staffId = getRecordValue(record, REQUIRED_HEADERS_STAFFID);
                const rawDate = getRecordValue(record, REQUIRED_HEADERS_DATE);
                const scheduleId = getRecordValue(record, OPTIONAL_SCHEDULEID); // Can be null/undefined

                // --- NEW Date Parsing ---
                const date = parseDateString(rawDate);

                // Add to analysis object early
                analysis.staffId = staffId;
                analysis.date = date; // Store the *parsed* date
                analysis.scheduleId = scheduleId;

                // a. --- Row-Level Validation (Required Fields) ---
                if (!staffId || !date) {
                    let errorMsg = "Missing required data for: ";
                    if (!staffId) errorMsg += "staffId ";
                    if (!date) errorMsg += `date (Could not parse: '${rawDate}')`;
                    throw new Error(errorMsg);
                }
                // --- REMOVED REGEX CHECK ---
                // The parseDateString function already validates the format.
                
                // b. --- Prepare Firestore Data ---
                // Get all potential values from the CSV
                const staffName = getRecordValue(record, ['staffname', 'staffName']) || null;
                const type = getRecordValue(record, ['type'])?.toLowerCase() || 'work';
                const startTime = getRecordValue(record, ['starttime', 'startTime']) || null;
                const endTime = getRecordValue(record, ['endtime', 'endTime']) || null;
                const notes = getRecordValue(record, ['notes']) || null;

                analysis.staffName = staffName; // Store for modal display

                // Build the data object to be saved
                const csvScheduleData = {
                    staffId,
                    date,
                    staffName,
                    type,
                    startTime,
                    endTime,
                    notes,
                };
                
                // c. --- Determine Firestore Document Reference ---
                let scheduleRef;
                let existingRecord = null;

                if (scheduleId) {
                    // Strategy 1: scheduleId is provided. Use it.
                    scheduleRef = db.collection('schedules').doc(scheduleId);
                    const docSnap = await scheduleRef.get();
                    if (docSnap.exists) {
                        existingRecord = docSnap.data();
                        // Sanity check
                        if (existingRecord.staffId !== staffId || existingRecord.date !== date) {
                            throw new Error(`Data mismatch: scheduleId ${scheduleId} belongs to a different staff/date.`);
                        }
                    } else {
                        // This is an error. If an ID is provided, it should exist.
                        throw new Error(`scheduleId "${scheduleId}" not found in database. Cannot update.`);
                    }
                } else {
                    // Strategy 2: No scheduleId. Use staffId + date to build the doc ID.
                    // This is the standard doc ID format from ShiftModal.jsx
                    const docId = `${staffId}_${date}`;
                    scheduleRef = db.collection('schedules').doc(docId);
                    const docSnap = await scheduleRef.get();
                    if (docSnap.exists) {
                        existingRecord = docSnap.data();
                    }
                }
                
                analysis.scheduleId = scheduleRef.id; // Store the actual doc ID we're acting on

                // d. --- Determine Action (Create, Update, NoChange) ---
                if (existingRecord) {
                    // ** Case: Update or No Change **
                    analysis.action = 'update';
                    let changes = {};
                    let requiresUpdate = false;
                    
                    // Compare all fields
                    for (const key of ['staffName', 'type', 'startTime', 'endTime', 'notes']) {
                        const csvValue = csvScheduleData[key];
                        const existingValue = existingRecord[key] || null; // Treat missing field as null
                        
                        // --- FIX for 'type' field comparison ---
                        const csvValueNormalized = (key === 'type' && csvValue === null) ? 'off' : csvValue;
                        const existingValueNormalized = (key === 'type' && existingValue === null) ? 'off' : existingValue;

                        if (csvValueNormalized !== existingValueNormalized) {
                            changes[key] = { from: existingValue, to: csvValue };
                            requiresUpdate = true;
                        }
                    }

                    if (requiresUpdate) {
                        analysis.details = changes;
                    } else {
                        analysis.action = 'nochange';
                    }
                } else {
                    // ** Case: Create New Record **
                    analysis.action = 'create';
                    analysis.details = csvScheduleData; // Show all new data
                }

            } catch (error) { // Catch errors specific to this row
                analysis.action = 'error';
                const errorMessage = error.message || 'Unknown processing error';
                analysis.errors.push(errorMessage);
                overallErrors.push(`Row ${rowNum}: ${errorMessage}`);
            }
            analysisResults.push(analysis);
        } // --- End of record analysis loop ---
        console.log("importPlanningData: Finished analyzing all records.");

        // 6. --- Return Analysis (Dry Run) or Execute Writes (Confirm) ---
        if (isDryRun) {
            console.log("importPlanningData: Dry run complete. Returning analysis.");
            const summary = analysisResults.reduce((acc, cur) => {
                acc[cur.action + 's'].push(cur);
                return acc;
            }, { creates: [], updates: [], noChanges: [], errors: [] });
            return { analysis: summary };
        } else {
            // --- Execute Confirmed Writes ---
            console.log("importPlanningData: Executing confirmed import writes...");
            const batch = db.batch();
            let recordsCreated = 0;
            let recordsUpdated = 0;
            const finalExecutionErrors = [];

            analysisResults.forEach(res => {
                if (res.action === 'create' || res.action === 'update') {
                    const docRef = db.collection('schedules').doc(res.scheduleId);
                    
                    // --- UPDATED LOGIC for setDoc ---
                    // We now use res.details (which is csvScheduleData)
                    // and ensure 'type' is 'off' if null
                    let dataToSave = res.details;
                    if (res.action === 'update') {
                        // For updates, we must merge the *full* new object
                        // The 'details' object only contains the *changes*
                        // So we rebuild the object from the analysis row
                        dataToSave = {
                            staffId: res.staffId,
                            date: res.date,
                            staffName: res.staffName,
                            type: getRecordValue(records[res.rowNum - 2], ['type'])?.toLowerCase() || 'work',
                            startTime: getRecordValue(records[res.rowNum - 2], ['starttime', 'startTime']) || null,
                            endTime: getRecordValue(records[res.rowNum - 2], ['endtime', 'endTime']) || null,
                            notes: getRecordValue(records[res.rowNum - 2], ['notes']) || null,
                        };
                    }
                    
                    // Handle "off" days: if type is 'off', clear times
                    if (dataToSave.type === 'off') {
                        dataToSave.startTime = null;
                        dataToSave.endTime = null;
                    }
                    
                    batch.set(docRef, dataToSave); 
                    
                    if (res.action === 'create') recordsCreated++;
                    if (res.action === 'update') recordsUpdated++;
                } else if (res.action === 'error') {
                    res.errors.forEach(errMsg => finalExecutionErrors.push(`Row ${res.rowNum}: ${errMsg}`));
                }
            });

            await batch.commit();
            console.log("importPlanningData: All write operations committed.");

            const finalSummaryMessage = `Planning import finished. Processed: ${records.length}. Created: ${recordsCreated}. Updated: ${recordsUpdated}. Errors: ${finalExecutionErrors.length}.`;
            console.log(finalSummaryMessage);
            return {
                result: finalSummaryMessage,
                errors: finalExecutionErrors,
            };
        }

    } catch (error) { // Catch critical errors
        console.error("importPlanningData: CRITICAL error:", error);
        if (error instanceof HttpsError) throw error;
        return {
            result: `Import failed with a critical error: ${error.message}`,
            errors: [`General Error: ${error.message}`, ...overallErrors],
            analysis: null
        };
    }
});