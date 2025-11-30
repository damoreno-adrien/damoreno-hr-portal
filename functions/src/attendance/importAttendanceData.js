/* functions/src/attendance/importAttendanceData.js */

const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { parse: csvParseSync } = require('csv-parse/sync');
const { DateTime } = require('luxon');
const { isEqual: isDateEqual, isValid: isJsDateValid } = require('date-fns');

const db = getFirestore();
const THAILAND_TIMEZONE = 'Asia/Bangkok';

// --- Helpers ---
const parseDateString = (dateString) => {
    if (!dateString) return null;
    const formatsToTry = [
        'yyyy-MM-dd', 'dd-MM-yyyy', 'd-M-yyyy', 'dd/MM/yyyy', 'd/M/yyyy',
        'dd-MM-yy', 'dd/MM/yy', 'd-M-yy', 'd/M/yy'
    ];
    for (const format of formatsToTry) {
        const dt = DateTime.fromFormat(dateString, format, { zone: THAILAND_TIMEZONE });
        if (dt.isValid) return dt.toISODate();
    }
    return null;
};

const parseDateTimeToTimestamp = (dateStr, timeStr) => {
    if (!dateStr || !timeStr || timeStr === '-' || timeStr.trim() === '') return null;
    
    let dt = DateTime.fromFormat(`${dateStr} ${timeStr}`, 'yyyy-MM-dd HH:mm', { zone: THAILAND_TIMEZONE });
    if (!dt.isValid) dt = DateTime.fromFormat(`${dateStr} ${timeStr}`, 'yyyy-MM-dd H:mm', { zone: THAILAND_TIMEZONE });
    if (!dt.isValid) dt = DateTime.fromFormat(`${dateStr} ${timeStr}`, 'yyyy-MM-dd HH:mm:ss', { zone: THAILAND_TIMEZONE });
    if (!dt.isValid) dt = DateTime.fromISO(timeStr, { zone: THAILAND_TIMEZONE });

    if (!dt.isValid) return null;
    return Timestamp.fromDate(dt.toJSDate());
};

const areValuesEqual = (val1, val2) => {
    if (val1 instanceof Timestamp && val2 instanceof Timestamp) return val1.isEqual(val2);
    if (!val1 && !val2) return true;
    return val1 === val2;
};

exports.importAttendanceDataHandler = functions.https.onCall({
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (request) => {
    
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const callerUid = request.auth.uid;
    
    const callerDoc = await db.collection("users").doc(callerUid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Manager role required.");
    }

    const { csvData, confirm } = request.data;
    if (!csvData) throw new HttpsError("invalid-argument", "No CSV data.");

    const isDryRun = !confirm;
    let analysisResults = [];

    try {
        const records = csvParseSync(csvData, {
            columns: header => header.map(h => h.toLowerCase().trim()),
            skip_empty_lines: true,
            trim: true
        });

        if (records.length === 0) return { result: "Empty CSV." };

        for (let index = 0; index < records.length; index++) {
            const row = records[index];
            const rowNum = index + 2;
            let analysis = { rowNum, action: 'skip', details: null, errors: [] };

            try {
                const staffId = row['staff id'] || row['staffid'];
                const rawDate = row['date'];
                let attendanceDocId = row['attendance doc id'] || row['attendancedocid'];
                
                if (!staffId || !rawDate) throw new Error("Missing Staff ID or Date");

                const date = parseDateString(rawDate);
                if (!date) throw new Error(`Invalid Date: ${rawDate}`);

                // --- FIX: ADD DATE TO ANALYSIS OBJECT ---
                analysis.date = date; // <--- This enables the "Date - Name" label in the modal
                // ----------------------------------------

                if (!attendanceDocId) {
                    attendanceDocId = `${staffId}_${date}`;
                }

                const rawCheckIn = row['check-in'] || row['checkintime'];
                const docRef = db.collection('attendance').doc(attendanceDocId);
                const docSnap = await docRef.get();
                const exists = docSnap.exists;

                if (!rawCheckIn || rawCheckIn === '-' || rawCheckIn.trim() === '') {
                    if (exists) {
                        analysis.action = 'delete';
                        analysis.docId = attendanceDocId;
                        analysis.name = docSnap.data().staffName || 'Unknown';
                        analysis.details = { note: "Deleting record because Check-In is empty in CSV" };
                    } else {
                        analysis.action = 'nochange'; 
                    }
                    analysisResults.push(analysis);
                    continue; 
                }
                
                let checkInTime = parseDateTimeToTimestamp(date, rawCheckIn);
                let checkOutTime = parseDateTimeToTimestamp(date, row['check-out'] || row['checkouttime']);
                let breakStart = parseDateTimeToTimestamp(date, row['break start'] || row['breakstarttime']);
                let breakEnd = parseDateTimeToTimestamp(date, row['break end'] || row['breakendtime']);

                if (checkInTime && checkOutTime && checkOutTime.toMillis() < checkInTime.toMillis()) {
                    checkOutTime = new Timestamp(checkOutTime.seconds + 86400, checkOutTime.nanoseconds);
                }
                
                const newData = {
                    staffId,
                    date,
                    staffName: row['staff name'] || row['staffname'] || 'Imported Staff',
                    checkInTime,
                    checkOutTime,
                    breakStart,
                    breakEnd
                };

                if (exists) {
                    const current = docSnap.data();
                    let updates = {};
                    let hasChanges = false;

                    ['checkInTime', 'checkOutTime', 'breakStart', 'breakEnd'].forEach(field => {
                        if (!areValuesEqual(current[field], newData[field])) {
                            updates[field] = newData[field];
                            hasChanges = true;
                        }
                    });

                    if (hasChanges) {
                        analysis.action = 'update';
                        analysis.details = updates;
                        analysis.docId = attendanceDocId;
                        analysis.updateData = updates;
                        analysis.name = current.staffName || newData.staffName;
                    } else {
                        analysis.action = 'nochange';
                    }
                } else {
                    analysis.action = 'create';
                    analysis.docId = attendanceDocId;
                    analysis.createData = newData;
                    analysis.name = newData.staffName;
                }

            } catch (err) {
                analysis.action = 'error';
                analysis.errors.push(err.message);
            }
            analysisResults.push(analysis);
        }

        if (isDryRun) {
            const summary = analysisResults.reduce((acc, cur) => {
                 const k = cur.action + 's'; 
                 if (!acc[k]) acc[k] = [];
                 acc[k].push(cur);
                 return acc;
            }, {});
            return { analysis: summary };
        } else {
            const batch = db.batch();
            let count = 0;
            
            analysisResults.forEach(res => {
                if (res.action === 'create') {
                    const ref = db.collection('attendance').doc(res.docId);
                    batch.set(ref, { ...res.createData, createdAt: FieldValue.serverTimestamp() });
                    count++;
                } else if (res.action === 'update') {
                    const ref = db.collection('attendance').doc(res.docId);
                    batch.update(ref, { ...res.updateData, updatedAt: FieldValue.serverTimestamp() });
                    count++;
                } else if (res.action === 'delete') {
                    const ref = db.collection('attendance').doc(res.docId);
                    batch.delete(ref);
                    count++;
                }
            });

            if (count > 0) await batch.commit();
            return { result: `Success! Processed ${count} records.` };
        }

    } catch (error) {
        throw new HttpsError("internal", error.message);
    }
});