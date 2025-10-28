/* functions/src/attendance/exportAttendanceData.js */

const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// --- FIX: Use V8-style imports ---
// We only need Timestamp from the 'firebase-admin/firestore' path
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { Parser } = require('json2csv');
const { DateTime } = require('luxon');

// --- FIX: Initialize db using V8-style ---
// This assumes admin.initializeApp() is called elsewhere (e.g., in index.js)
// This V8-style 'db' object has the .collection() method, matching your auth block.
const db = admin.firestore();
const THAILAND_TIMEZONE = 'Asia/Bangkok';

// --- Helpers (formatTimeForExportLuxon, getStaffNames, generateDateRange) ---
const formatTimeForExportLuxon = (timestamp) => {
    if (!timestamp || !(timestamp instanceof Timestamp)) return '';
    try {
        const jsDate = timestamp.toDate();
        const dtUtc = DateTime.fromJSDate(jsDate);
        if (!dtUtc.isValid) return '';
        const dtLocal = dtUtc.setZone(THAILAND_TIMEZONE);
        return dtLocal.toFormat('HH:mm:ss');
    } catch (e) {
        console.error("Error formatting timestamp:", timestamp, e);
        return '';
    }
};

const getStaffNames = async (staffIds) => {
    const namesMap = new Map();
    if (staffIds.size === 0) return namesMap;
    const staffIdArray = Array.from(staffIds);
    const MAX_IN_QUERY_SIZE = 30;
    const promises = [];
    for (let i = 0; i < staffIdArray.length; i += MAX_IN_QUERY_SIZE) {
        const batchIds = staffIdArray.slice(i, i + MAX_IN_QUERY_SIZE);
        // --- FIX: Use V8 query syntax ---
        const q = db.collection('staff_profiles').where(admin.firestore.FieldPath.documentId(), 'in', batchIds);
        promises.push(q.get()); // --- FIX: Use .get() instead of getDocs(q) ---
    }
    try {
        const snapshots = await Promise.all(promises);
        snapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
                const data = doc.data();
                if (!data) return;
                const name = data.nickname || (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : null) || data.firstName || 'Unknown';
                namesMap.set(doc.id, name.trim());
            });
        });
    } catch (error) {
        console.error("Error fetching staff names:", error);
    }
    return namesMap;
};

const generateDateRange = (startDateStr, endDateStr) => {
    const dates = [];
    let current = DateTime.fromISO(startDateStr, { zone: THAILAND_TIMEZONE });
    const end = DateTime.fromISO(endDateStr, { zone: THAILAND_TIMEZONE });
    if (!current.isValid || !end.isValid || current > end) {
        console.error("Invalid date range:", startDateStr, endDateStr);
        return [];
    }
    while (current <= end) {
        dates.push(current.toISODate());
        current = current.plus({ days: 1 });
    }
    return dates;
};
// --- End Helpers ---

exports.exportAttendanceDataHandler = onCall({
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (request) => {
    console.log("exportAttendanceDataHandler: Function execution started.");

    // 1. --- Authentication and Authorization ---
    if (!request.auth) throw new OnCallHttpsError("unauthenticated", "Authentication required.");
    const callerUid = request.auth.uid;
    try {
        // This V8 syntax was already correct and working per your logs
        const callerDoc = await db.collection("users").doc(callerUid).get();

        if (!callerDoc.exists || callerDoc.data().role !== "manager") {
            const roleFound = !callerDoc.exists ? 'No document' : callerDoc.data().role;
            console.error(`exportAttendanceDataHandler: Permission denied for user ${callerUid}. Role check failed (Role found: ${roleFound}).`);
            throw new OnCallHttpsError("permission-denied", "Manager role required.");
        }
        console.log(`exportAttendanceDataHandler: User ${callerUid} authorized as manager.`);
    } catch (err) {
        console.error(`exportAttendanceDataHandler: Error verifying manager role for ${callerUid}:`, err);
        if (err instanceof OnCallHttpsError) throw err;
        throw new OnCallHttpsError("internal", `Failed to verify user role. ${err.message}`, err.stack);
    }

    // 2. --- Input Validation (Date Range) --- (Keep as is)
    const { startDate, endDate } = request.data;
    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new OnCallHttpsError("invalid-argument", "Valid 'startDate' and 'endDate' (YYYY-MM-DD) required.");
    if (startDate > endDate) throw new OnCallHttpsError("invalid-argument", "Start date cannot be after end date.");
    console.log(`Exporting attendance data for range ${startDate} to ${endDate}`);


    try {
        // --- 3. Fetch All Necessary Data Concurrently ---
        const dateRange = generateDateRange(startDate, endDate);
        const filename = `attendance_export_${startDate}_to_${endDate}_${DateTime.now().setZone(THAILAND_TIMEZONE).toFormat('yyyyMMddHHmmss')}.csv`;
        if (dateRange.length === 0) return { csvData: "", filename: filename };

        // --- FIX: Use V8 query syntax (.collection().where().get()) ---
        const attendancePromise = db.collection("attendance").where("date", ">=", startDate).where("date", "<=", endDate).get();
        const schedulesPromise = db.collection("schedules").where("date", ">=", startDate).where("date", "<=", endDate).get();

        // --- LOGIC FIX: Reworked leave query to handle date ranges ---
        // This query finds all leave requests that *overlap* with the report's date range.
        // It fetches leave ending on or after the report starts...
        const leaveQuery = db.collection("leave_requests")
            .where("status", "==", "approved")
            .where("endDate", ">=", startDate); // ...and we will manually filter the rest.
        const leavePromise = leaveQuery.get();

        const [attendanceSnap, schedulesSnap, leaveSnap] = await Promise.all([attendancePromise, schedulesPromise, leavePromise]);

        // Process snapshots into maps
        const attendanceMap = new Map();
        attendanceSnap.forEach(doc => {
            const data = doc.data();
            if (data.staffId && data.date) { // Add guard clause
                attendanceMap.set(`${data.staffId}_${data.date}`, { id: doc.id, ...data });
            }
        });

        // --- LOGIC FIX: Add guard clause to schedulesMap processing ---
        const schedulesMap = new Map();
        schedulesSnap.forEach(doc => {
            const data = doc.data();
            if (data.staffId && data.date) { // Ensure staffId and date exist
                schedulesMap.set(`${data.staffId}_${data.date}`, data);
            }
        });

        // --- LOGIC FIX: Reworked leaveMap processing to handle date ranges ---
        // This assumes leave_requests docs have string fields 'startDate' and 'endDate'
        const leaveMap = new Map();
        const reportStartDt = DateTime.fromISO(startDate, { zone: THAILAND_TIMEZONE });
        const reportEndDt = DateTime.fromISO(endDate, { zone: THAILAND_TIMEZONE });

        leaveSnap.forEach(doc => {
            const data = doc.data();
            // Check for required fields in leave doc
            if (!data.staffId || !data.startDate || !data.endDate) return;

            // Manual filter for the second part of the overlap:
            // Skip leave that starts *after* the report ends.
            if (data.startDate > endDate) return;

            // Iterate through each day of the approved leave
            let current = DateTime.fromISO(data.startDate, { zone: THAILAND_TIMEZONE });
            const leaveEnd = DateTime.fromISO(data.endDate, { zone: THAILAND_TIMEZONE });

            if (!current.isValid || !leaveEnd.isValid) return; // Skip invalid leave dates

            while (current <= leaveEnd) {
                // Only add dates that are *also* inside the report's date range
                if (current >= reportStartDt && current <= reportEndDt) {
                    const dateStr = current.toISODate();
                    leaveMap.set(`${data.staffId}_${dateStr}`, data);
                }
                current = current.plus({ days: 1 });
            }
        });

        console.log(`Fetched: ${attendanceMap.size} attendance, ${schedulesMap.size} schedules, ${leaveMap.size} leave days.`);

        // --- 4. Determine Relevant Staff and Fetch Names ---
        const staffIdsInPeriod = new Set();
        attendanceMap.forEach((val, key) => staffIdsInPeriod.add(key.split('_')[0]));
        schedulesMap.forEach((val, key) => staffIdsInPeriod.add(key.split('_')[0]));
        leaveMap.forEach((val, key) => staffIdsInPeriod.add(key.split('_')[0]));
        
        if (staffIdsInPeriod.size === 0) {
             console.log("No relevant staff found for the period. Returning empty CSV.");
            return { csvData: "", filename: filename };
        }
        const staffNamesMap = await getStaffNames(staffIdsInPeriod); // Uses V8 syntax internally now

        // --- 5. Process Data: Iterate Staff & Dates to Build CSV Rows ---
        const records = [];
        for (const staffId of staffIdsInPeriod) {
            const staffName = staffNamesMap.get(staffId) || 'Unknown';
            for (const dateStr of dateRange) {
                const key = `${staffId}_${dateStr}`;
                const attendance = attendanceMap.get(key);
                const schedule = schedulesMap.get(key);
                const approvedLeave = leaveMap.get(key);

                // --- LOGIC FIX: This check is key ---
                // We process a row if *any* data exists for this staff/date combo
                if (schedule || attendance || approvedLeave) {
                    let status = 'Unknown';
                    const checkInTs = attendance?.checkInTime;

                    // --- **** THIS IS THE KEY LOGIC FIX **** ---
                    // Infer "work" status from the presence of a startTime,
                    // since the 'type' field is missing from the database.
                    const isOffSchedule = schedule && typeof schedule.type === 'string' && schedule.type.toLowerCase() === 'off';
                    const isWorkSchedule = schedule && !isOffSchedule && schedule.startTime; // Assumes if not "off" and has startTime, it's "work"
                    // --- **** END OF FIX **** ---

                    const scheduledStartTimeStr = (isWorkSchedule && schedule.startTime) ? schedule.startTime : null;

                    if (attendance) {
                        if (scheduledStartTimeStr) {
                            // Work day, checked in
                            if (checkInTs) {
                                try {
                                    const schDt = DateTime.fromISO(`${dateStr}T${scheduledStartTimeStr}`, { zone: THAILAND_TIMEZONE });
                                    const actDt = DateTime.fromJSDate(checkInTs.toDate()).setZone(THAILAND_TIMEZONE);
                                    if (schDt.isValid && actDt.isValid && actDt > schDt) {
                                        status = `Late (${Math.ceil(actDt.diff(schDt, 'minutes').minutes)}m)`;
                                    } else if (actDt.isValid) {
                                        status = 'Present';
                                    } else {
                                        status = 'Present (Check-in Invalid)';
                                    }
                                } catch (e) {
                                    status = 'Present (Time Error)';
                                }
                            } else {
                                // Has attendance doc but no check-in time?
                                status = 'Present (No Check-in?)';
                            }
                        } else if (isOffSchedule) {
                            // Day off, but checked in
                            status = 'Worked on Day Off';
                        } else {
                            // Unscheduled, but checked in
                            status = 'Present (Unscheduled)';
                        }
                    } else {
                        // No attendance record for this day
                        if (approvedLeave) {
                            status = 'Leave';
                        } else if (isWorkSchedule) {
                            status = 'Absent';
                        } else if (isOffSchedule) {
                            status = 'Off';
                        } else {
                            // No attendance, no leave, no schedule
                            // We can skip this day entirely
                            continue;
                        }
                    }
                    
                    // We push the record if a status was determined
                    if (status !== 'Unknown') {
                        records.push({
                            attendanceDocId: attendance ? attendance.id : '',
                            staffId,
                            staffName,
                            date: dateStr,
                            attendanceStatus: status,
                            checkInTime: formatTimeForExportLuxon(attendance?.checkInTime),
                            checkOutTime: formatTimeForExportLuxon(attendance?.checkOutTime),
                            breakStartTime: formatTimeForExportLuxon(attendance?.breakStart),
                            breakEndTime: formatTimeForExportLuxon(attendance?.breakEnd),
                        });
                    }
                }
            }
        }
        records.sort((a, b) => a.staffName.localeCompare(b.staffName) || a.date.localeCompare(b.date));

        // --- 6. Generate CSV Output ---
        const fields = ['attendanceDocId', 'staffId', 'staffName', 'date', 'attendanceStatus', 'checkInTime', 'checkOutTime', 'breakStartTime', 'breakEndTime'];
        const json2csvParser = new Parser({ fields, excelStrings: true });
        const csv = json2csvParser.parse(records);
        console.log(`Generated filename: ${filename}`);
        return { csvData: csv, filename: filename };

    } catch (error) { // Error handling
        console.error("Unhandled error:", error);
        if (error instanceof OnCallHttpsError) throw error;
        throw new OnCallHttpsError("internal", `Error: ${error.message}`, error.stack);
    }
}); // End of exports.exportAttendanceDataHandler

