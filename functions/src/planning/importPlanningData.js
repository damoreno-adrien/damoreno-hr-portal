/* functions/src/planning/importPlanningData.js */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');
const { parse: csvParseSync } = require('csv-parse/sync');
const { DateTime } = require('luxon');

const db = admin.firestore();

// --- Configuration ---
const REQUIRED_HEADERS_STAFFID = ['staffid', 'staffid'];
const REQUIRED_HEADERS_DATE = ['date'];
// --- RENAMED for clarity ---
const OPTIONAL_SCHEDULEID_HEADERS = ['scheduleid', 'scheduleid'];
const THAILAND_TIMEZONE = 'Asia/Bangkok';

// --- HELPER ---
const getRecordValue = (record, possibleNames) => {
    const recordKeys = Object.keys(record);
    for (const name of possibleNames) {
        const actualHeader = recordKeys.find(h => h.toLowerCase() === name.toLowerCase());
        if (actualHeader && record[actualHeader] !== undefined) {
            return record[actualHeader].trim();
        }
    }
    return undefined;
};

// --- HELPER to parse multiple date formats ---
const parseDateString = (dateString) => {
    if (!dateString) return null;
    const formatsToTry = ['yyyy-MM-dd', 'dd-MM-yy', 'dd-MM-yyyy'];
    for (const format of formatsToTry) {
        const dt = DateTime.fromFormat(dateString, format, { zone: THAILAND_TIMEZONE });
        if (dt.isValid) {
            return dt.toFormat('yyyy-MM-dd'); // Return in standard format
        }
    }
    return null;
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

        console.log("importPlanningData: Validating CSV headers...");
        const headers = Object.keys(records[0]).map(h => h.toLowerCase());
        const hasStaffId = REQUIRED_HEADERS_STAFFID.some(key => headers.includes(key));
        const hasDate = REQUIRED_HEADERS_DATE.some(key => headers.includes(key));

        const missingRequired = [];
        if (!hasStaffId) missingRequired.push('staffId');
        if (!hasDate) missingRequired.push('date');

        if (missingRequired.length > 0) {
            console.error(`importPlanningData: Missing required headers: ${missingRequired.join(', ')}`);
            throw new HttpsError("invalid-argument", `Missing required columns in CSV: ${missingRequired.join(', ')}`);
        }
        console.log("importPlanningData: Headers validated.");

        // 5. --- Analyze Each Record ---
        console.log("importPlanningData: Analyzing records...");
        for (let index = 0; index < records.length; index++) {
            const record = records[index];
            const rowNum = index + 2;
            let analysis = { rowNum, action: 'error', details: null, errors: [], scheduleId: null, staffId: null, date: null, staffName: null };

            try {
                // --- UPDATED Value Extraction ---
                const staffId = getRecordValue(record, REQUIRED_HEADERS_STAFFID);
                const rawDate = getRecordValue(record, REQUIRED_HEADERS_DATE);
                const date = parseDateString(rawDate);
                
                // We get scheduleId from CSV but won't use it to find the doc
                // We *always* use staffId + date to build the ID
                const csvScheduleId = getRecordValue(record, OPTIONAL_SCHEDULEID_HEADERS);

                analysis.staffId = staffId;
                analysis.date = date;
                analysis.scheduleId = csvScheduleId; // Store what was in the CSV for reference

                // a. --- Row-Level Validation (Required Fields) ---
                if (!staffId || !date) {
                    let errorMsg = "Missing required data for: ";
                    if (!staffId) errorMsg += "staffId ";
                    if (!date) errorMsg += `date (Could not parse: '${rawDate}')`;
                    throw new Error(errorMsg);
                }
                
                // b. --- Prepare Firestore Data ---
                const staffName = getRecordValue(record, ['staffname', 'staffName']) || null;
                const type = getRecordValue(record, ['type'])?.toLowerCase() || 'work';
                const startTime = getRecordValue(record, ['starttime', 'startTime']) || null;
                const endTime = getRecordValue(record, ['endtime', 'endTime']) || null;
                const notes = getRecordValue(record, ['notes']) || null;

                analysis.staffName = staffName;

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
                // --- *** LOGIC CORRECTION *** ---
                // We *always* build the doc ID from staffId and date.
                // This makes the logic consistent with ShiftModal and the export function.
                
                let scheduleRef;
                let existingRecord = null;

                const docId = `${staffId}_${date}`;
                scheduleRef = db.collection('schedules').doc(docId);
                const docSnap = await scheduleRef.get();
                
                if (docSnap.exists) {
                    existingRecord = docSnap.data();
                }
                
                // Store the *actual* doc ID we are acting on
                analysis.scheduleId = scheduleRef.id; 
                
                // --- END LOGIC CORRECTION ---
                
                // d. --- Determine Action (Create, Update, NoChange) ---
                if (existingRecord) {
                    // ** Case: Update or No Change **
                    analysis.action = 'update';
                    let changes = {};
                    let requiresUpdate = false;
                    
                    for (const key of ['staffName', 'type', 'startTime', 'endTime', 'notes']) {
                        const csvValue = csvScheduleData[key];
                        const existingValue = existingRecord[key] || null;
                        
                        // Handle 'off' vs null comparison
                        const csvValueNormalized = (key === 'type' && (csvValue === 'off' || csvValue === null)) ? 'off' : csvValue;
                        const existingValueNormalized = (key === 'type' && (existingValue === 'off' || existingValue === null)) ? 'off' : existingValue;

                        if (csvValueNormalized !== existingValueNormalized) {
                            // Special check: If type is changing to 'off', don't flag times if they are already null
                            if (key === 'type' && csvValueNormalized === 'off') {
                                changes[key] = { from: existingValue, to: csvValue };
                                requiresUpdate = true;
                            } else {
                                changes[key] = { from: existingValue, to: csvValue };
                                requiresUpdate = true;
                            }
                        }
                    }

                    if (requiresUpdate) {
                        analysis.details = changes;
                    } else {
                        analysis.action = 'nochange';
                    }
                } else {
                    // ** Case: Create New Record (or No Change if 'off') **
                    // --- *** LOGIC CORRECTION *** ---
                    // If the record doesn't exist, we only "create" it if
                    // the CSV specifies a 'work' shift.
                    // If the CSV says 'off', and it doesn't exist, that's "nochange".
                    
                    const effectiveType = csvScheduleData.type || 'work'; // Default to work
                    
                    if (effectiveType === 'off') {
                        // It's 'off' in the CSV and doesn't exist in DB. No change needed.
                        analysis.action = 'nochange';
                    } else if (effectiveType === 'work' && (!csvScheduleData.startTime || !csvScheduleData.endTime)) {
                        // It's a 'work' day but has no times. Treat as 'off'. No change needed.
                        analysis.action = 'nochange';
                    } else {
                        // It's a 'work' day with times. Create it.
                        analysis.action = 'create';
                        analysis.details = csvScheduleData; // Show all new data
                    }
                    // --- END LOGIC CORRECTION ---
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
            
            // --- *** BUG FIX (TYPO) *** ---
            // The key 'noChanges' must be 'nochanges' to match `action: 'nochange'` + 's'
            const summary = analysisResults.reduce((acc, cur) => {
                acc[cur.action + 's'].push(cur);
                return acc;
            }, { creates: [], updates: [], nochanges: [], errors: [] }); 
            // --- END BUG FIX ---
            
            // Rename 'nochanges' back to 'noChanges' for the frontend modal
            const finalSummary = {
                creates: summary.creates,
                updates: summary.updates,
                noChanges: summary.nochanges, // Rename here
                errors: summary.errors
            };

            return { analysis: finalSummary };
            
        } else {
            // --- Execute Confirmed Writes ---
            console.log("importPlanningData: Executing confirmed import writes...");
            const batch = db.batch();
            let recordsCreated = 0;
            let recordsUpdated = 0;
            const finalExecutionErrors = [];

            analysisResults.forEach(res => {
                // We only write 'create' or 'update'
                if (res.action === 'create' || res.action === 'update') {
                    const docRef = db.collection('schedules').doc(res.scheduleId);
                    
                    let dataToSave;
                    
                    // Re-build the data object from the original record, not analysis
                    // This ensures we get the *intended* data, not just 'details'
                    const originalRecord = records[res.rowNum - 2];
                    dataToSave = {
                        staffId: res.staffId, // From analysis
                        date: res.date,       // From analysis
                        staffName: getRecordValue(originalRecord, ['staffname', 'staffName']) || null,
                        type: getRecordValue(originalRecord, ['type'])?.toLowerCase() || 'work',
                        startTime: getRecordValue(originalRecord, ['starttime', 'startTime']) || null,
                        endTime: getRecordValue(originalRecord, ['endtime', 'endTime']) || null,
                        notes: getRecordValue(originalRecord, ['notes']) || null,
                    };

                    // Handle "off" days: if type is 'off', clear times
                    if (dataToSave.type === 'off') {
                        dataToSave.startTime = null;
                        dataToSave.endTime = null;
                        dataToSave.notes = getRecordValue(originalRecord, ['notes']) || null; // Keep notes for 'off' days
                    }
                    
                    batch.set(docRef, dataToSave); 
                    
                    if (res.action === 'create') recordsCreated++;
                    if (res.action === 'update') recordsUpdated++;
                    
                } else if (res.action === 'error') {
                    res.errors.forEach(errMsg => finalExecutionErrors.push(`Row ${res.rowNum}: ${errMsg}`));
                }
                // 'nochange' actions are correctly ignored
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