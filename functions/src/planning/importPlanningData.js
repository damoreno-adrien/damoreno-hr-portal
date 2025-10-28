/* functions/src/planning/importPlanningData.js */

const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');
const { parse: csvParseSync } = require('csv-parse/sync');
const { DateTime } = require('luxon');

const db = getFirestore();
const THAILAND_TIMEZONE = 'Asia/Bangkok';

// Headers we expect from the exportPlanningData CSV
const REQUIRED_HEADERS = ['staffid', 'date'];
const ALL_EXPECTED_HEADERS = ['staffid', 'staffname', 'date', 'type', 'starttime', 'endtime', 'notes'];

/**
 * Validates HH:mm time format.
 * @param {string} timeString The time string to validate.
 * @returns {boolean} True if valid HH:mm format, false otherwise.
 */
const isValidTimeFormat = (timeString) => {
    if (!timeString) return false; // Allow empty strings (for "Off")
    return /^\d{2}:\d{2}$/.test(timeString);
};

exports.importPlanningDataHandler = functions.https.onCall({
    region: "asia-southeast1", // Match your export function region
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (request) => {
    // 1. --- Authentication and Authorization ---
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const callerUid = request.auth.uid;
    try {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") {
            throw new HttpsError("permission-denied", "Manager role required.");
        }
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
            return { result: "CSV file was empty or contained no data rows.", analysis: { creates: [], updates: [], noChanges: [], errors: [] } };
        }

        console.log("importPlanningData: Validating CSV headers...");
        const headers = Object.keys(records[0]).map(h => h.toLowerCase());
        const missingRequired = REQUIRED_HEADERS.filter(h => !headers.includes(h.toLowerCase()));
        if (missingRequired.length > 0) {
            throw new HttpsError("invalid-argument", `Missing required columns in CSV: ${missingRequired.join(', ')}`);
        }
        console.log("importPlanningData: Headers validated.");

        // 5. --- Analyze Each Record ---
        console.log("importPlanningData: Analyzing records...");
        for (let index = 0; index < records.length; index++) {
            const record = records[index];
            const rowNum = index + 2;
            let analysis = { rowNum, action: 'error', details: null, errors: [], staffId: null, date: null, staffName: null };

            try {
                const getRecordValue = (key) => {
                    const actualHeader = Object.keys(record).find(h => h.toLowerCase() === key.toLowerCase());
                    return actualHeader ? record[actualHeader]?.trim() : undefined;
                };

                // a. --- Extract and Validate Key Fields ---
                const staffId = getRecordValue('staffId');
                const date = getRecordValue('date');
                const staffName = getRecordValue('staffName') || '';

                analysis.staffId = staffId;
                analysis.date = date;
                analysis.staffName = staffName;

                if (!staffId) throw new Error("Missing or empty data for: staffId");
                if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                    throw new Error("Missing or invalid data for: date (Must be YYYY-MM-DD)");
                }

                // b. --- Prepare Firestore Data ---
                let scheduleType = getRecordValue('type')?.toLowerCase() || 'off';
                let startTime = getRecordValue('startTime') || null;
                let endTime = getRecordValue('endTime') || null;
                const notes = getRecordValue('notes') || null;

                // Infer 'work' type if times are provided but type isn't
                if (startTime && endTime && scheduleType !== 'work') {
                    scheduleType = 'work';
                }
                
                // Handle 'off' type: clear times
                if (scheduleType === 'off') {
                    startTime = null;
                    endTime = null;
                }
                
                // Validate time formats if 'work'
                if (scheduleType === 'work') {
                    if (!isValidTimeFormat(startTime)) throw new Error(`Invalid startTime format: "${startTime}" (Must be HH:mm)`);
                    if (!isValidTimeFormat(endTime)) throw new Error(`Invalid endTime format: "${endTime}" (Must be HH:mm)`);
                    if (startTime >= endTime) throw new Error(`Invalid time range: startTime (${startTime}) must be before endTime (${endTime})`);
                }
                
                const csvScheduleData = {
                    staffId,
                    staffName,
                    date,
                    type: scheduleType,
                    startTime,
                    endTime,
                    notes
                };

                // c. --- Find Existing Record ---
                // We use a consistent doc ID for schedules: staffId_date
                const docId = `${staffId}_${date}`;
                const scheduleRef = db.collection('schedules').doc(docId);
                const docSnap = await scheduleRef.get();
                const existingRecord = docSnap.exists ? docSnap.data() : null;

                // d. --- Determine Action (Create, Update, NoChange) ---
                if (existingRecord) {
                    analysis.action = 'update';
                    let changes = {};
                    let requiresUpdate = false;

                    // Compare all relevant fields
                    for (const key of ['type', 'startTime', 'endTime', 'notes', 'staffName']) {
                        const csvValue = csvScheduleData[key] ?? null;
                        const existingValue = existingRecord[key] ?? null;
                        if (csvValue !== existingValue) {
                            changes[key] = { from: existingValue, to: csvValue };
                            requiresUpdate = true;
                        }
                    }

                    if (requiresUpdate) {
                        analysis.details = changes;
                        analysis.dataForUpdate = csvScheduleData;
                    } else {
                        analysis.action = 'nochange';
                        analysis.details = null;
                    }
                } else {
                    // No existing record, this is a new schedule
                    analysis.action = 'create';
                    analysis.details = csvScheduleData;
                    analysis.dataForCreate = csvScheduleData;
                }

            } catch (error) {
                analysis.action = 'error';
                const errorMessage = error.message || 'Unknown processing error';
                analysis.errors.push(errorMessage);
                overallErrors.push(`Row ${rowNum}: ${errorMessage}`);
            }
            analysisResults.push(analysis);
        } // --- End of record loop ---
        console.log("importPlanningData: Finished analyzing records.");

        // 6. --- Return Analysis or Execute Writes ---
        const summary = analysisResults.reduce((acc, cur) => {
            const key = cur.action + 's'; // creates, updates, nochanges, errors
            if (!acc[key]) acc[key] = [];
            acc[key].push(cur);
            return acc;
        }, { creates: [], updates: [], noChanges: [], errors: [] });
            
        if (isDryRun) {
            console.log("importPlanningData: Dry run complete. Returning analysis.");
            return { analysis: summary };

        } else {
            // --- Execute Confirmed Writes ---
            console.log("importPlanningData: Executing confirmed writes...");
            let recordsCreated = 0;
            let recordsUpdated = 0;
            const writePromises = [];
            const finalExecutionErrors = [];

            analysisResults.forEach(res => {
                const docId = `${res.staffId}_${res.date}`;
                const scheduleRef = db.collection('schedules').doc(docId);
                
                if (res.action === 'create' && res.dataForCreate) {
                    writePromises.push((async () => {
                        await setDoc(scheduleRef, res.dataForCreate, { merge: false }); // Create new
                        recordsCreated++;
                    })().catch(err => {
                        finalExecutionErrors.push(`Row ${res.rowNum} (Create Failed): ${err.message}`);
                    }));
                } else if (res.action === 'update' && res.dataForUpdate) {
                     writePromises.push((async () => {
                        await setDoc(scheduleRef, res.dataForUpdate, { merge: true }); // Update/Overwrite
                        recordsUpdated++;
                    })().catch(err => {
                        finalExecutionErrors.push(`Row ${res.rowNum} (Update Failed): ${err.message}`);
                    }));
                }
            });

            await Promise.allSettled(writePromises);
            console.log("importPlanningData: All write operations settled.");

            const allErrors = [...overallErrors, ...finalExecutionErrors];
            const finalSummaryMessage = `Planning import finished. Processed: ${records.length}. Created: ${recordsCreated}. Updated: ${recordsUpdated}. Errors: ${allErrors.length}.`;
            
            return {
                result: finalSummaryMessage,
                errors: allErrors,
            };
        }
    } catch (error) {
        console.error("importPlanningData: CRITICAL error:", error);
        if (error instanceof HttpsError) throw error;
        return {
            result: `Import failed with a critical error: ${error.message}`,
            errors: [`General Error: ${error.message}`, ...overallErrors],
            analysis: null
        };
    }
});
