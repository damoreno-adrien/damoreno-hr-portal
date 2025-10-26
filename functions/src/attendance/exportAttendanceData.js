/* functions/src/attendance/exportAttendanceData.js */

const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { Parser } = require('json2csv');
const { DateTime } = require('luxon'); // Use Luxon

const db = getFirestore();
const THAILAND_TIMEZONE = 'Asia/Bangkok';

/**
 * Helper to format Firestore Timestamp into HH:mm:ss string in local timezone.
 */
const formatTimeForExportLuxon = (timestamp) => {
    // ... (keep the existing formatTimeForExportLuxon function) ...
    if (!timestamp || !(timestamp instanceof Timestamp)) return '';
    try {
        const jsDate = timestamp.toDate();
        const dtUtc = DateTime.fromJSDate(jsDate);
        if (!dtUtc.isValid) return '';
        const dtLocal = dtUtc.setZone(THAILAND_TIMEZONE);
        return dtLocal.toFormat('HH:mm:ss');
    } catch (e) { console.error("Error formatting timestamp:", timestamp, e); return ''; }
};

/**
 * Fetches staff names in bulk.
 */
const getStaffNames = async (staffIds) => {
    // ... (keep the existing getStaffNames function) ...
    const namesMap = new Map();
    if (staffIds.size === 0) return namesMap;
    const staffIdArray = Array.from(staffIds);
    const MAX_IN_QUERY_SIZE = 30;
    const promises = [];
    for (let i = 0; i < staffIdArray.length; i += MAX_IN_QUERY_SIZE) {
        const batchIds = staffIdArray.slice(i, i + MAX_IN_QUERY_SIZE);
        const q = db.collection('staff_profiles').where(admin.firestore.FieldPath.documentId(), 'in', batchIds);
        promises.push(q.get());
    }
    try {
        const snapshots = await Promise.all(promises);
        snapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
                const data = doc.data();
                const name = data.nickname || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown';
                namesMap.set(doc.id, name);
            });
        });
    } catch (error) { console.error("Error fetching staff names:", error); }
    return namesMap;
};

/**
 * Generates date strings (YYYY-MM-DD) for a given range.
 */
const generateDateRange = (startDateStr, endDateStr) => {
    const dates = [];
    let current = DateTime.fromISO(startDateStr, { zone: THAILAND_TIMEZONE });
    const end = DateTime.fromISO(endDateStr, { zone: THAILAND_TIMEZONE });

    if (!current.isValid || !end.isValid) {
        console.error("Invalid date range provided to generateDateRange");
        return [];
    }

    while (current <= end) {
        dates.push(current.toISODate()); // Format as YYYY-MM-DD
        current = current.plus({ days: 1 });
    }
    return dates;
};


exports.exportAttendanceDataHandler = onCall({
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (request) => {
    console.log("exportAttendanceDataHandler: Function started.");

    // Auth & Role Checks (remain the same)
    if (!request.auth) throw new OnCallHttpsError("unauthenticated", "Authentication required.");
    const callerUid = request.auth.uid;
    // ... (rest of auth/role check) ...
    try { const callerDoc = await db.collection("users").doc(callerUid).get(); if (!callerDoc.exists || callerDoc.data().role !== "manager") throw new OnCallHttpsError("permission-denied", "Manager role required."); } catch(err) { throw new OnCallHttpsError("internal", "Failed to verify role.", err.message); }

    // Input Validation (remains the same)
    const { startDate, endDate } = request.data;
    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
         throw new OnCallHttpsError("invalid-argument", "Valid 'startDate' and 'endDate' (YYYY-MM-DD) required.");
    }
    console.log(`exportAttendanceDataHandler: Exporting range ${startDate} to ${endDate}`);

    try {
        // --- 1. Fetch ALL Data (Attendance, Schedules, Staff) ---

        // Query attendance
        const attendanceQuery = db.collection("attendance")
            .where("date", ">=", startDate)
            .where("date", "<=", endDate);
        const attendanceSnap = await attendanceQuery.get();
        const attendanceMap = new Map(); // Key: "staffId_date", Value: {id: docId, ...data}
        attendanceSnap.forEach(doc => {
            const data = doc.data();
            attendanceMap.set(`${data.staffId}_${data.date}`, { id: doc.id, ...data });
        });
        console.log(`exportAttendanceDataHandler: Found ${attendanceMap.size} attendance records.`);

        // Query schedules
        const schedulesQuery = db.collection("schedules")
            .where("date", ">=", startDate)
            .where("date", "<=", endDate);
        const schedulesSnap = await schedulesQuery.get();
        const schedulesMap = new Map(); // Key: "staffId_date", Value: schedule data
        schedulesSnap.forEach(doc => {
            const data = doc.data();
            schedulesMap.set(`${data.staffId}_${data.date}`, data);
        });
        console.log(`exportAttendanceDataHandler: Found ${schedulesMap.size} schedule records.`);

        // Determine relevant staff IDs
        const staffIdsInPeriod = new Set();
        attendanceMap.forEach((val, key) => staffIdsInPeriod.add(key.split('_')[0]));
        schedulesMap.forEach((val, key) => staffIdsInPeriod.add(key.split('_')[0]));

        if (staffIdsInPeriod.size === 0) {
            console.log("exportAttendanceDataHandler: No attendance or schedule data found for the period.");
            const filename = `attendance_export_${startDate}_to_${endDate}_${DateTime.now().setZone(THAILAND_TIMEZONE).toFormat('yyyyMMddHHmmss')}.csv`;
            return { csvData: "", filename: filename };
        }

        // Fetch staff names
        console.log(`exportAttendanceDataHandler: Fetching names for ${staffIdsInPeriod.size} staff IDs...`);
        const staffNamesMap = await getStaffNames(staffIdsInPeriod);
        console.log(`exportAttendanceDataHandler: Retrieved ${staffNamesMap.size} staff names.`);


        // --- 2. Process Data: Iterate Staff & Dates ---
        const records = [];
        const dateRange = generateDateRange(startDate, endDate); // Get all dates in the range

        for (const staffId of staffIdsInPeriod) {
            const staffName = staffNamesMap.get(staffId) || 'Unknown'; // Get name

            for (const dateStr of dateRange) {
                const key = `${staffId}_${dateStr}`;
                const attendance = attendanceMap.get(key);
                const schedule = schedulesMap.get(key);

                // Skip if neither attendance nor schedule exists for this staff/day
                if (!attendance && !schedule) {
                    continue;
                }

                let status = 'Unknown';
                let checkInTs = null;
                let checkOutTs = null;
                let breakStartTs = null;
                let breakEndTs = null;

                if (attendance) {
                    // Attendance record exists
                    checkInTs = attendance.checkInTime; // Firestore Timestamp or null
                    checkOutTs = attendance.checkOutTime;
                    breakStartTs = attendance.breakStart;
                    breakEndTs = attendance.breakEnd;

                    if (schedule && schedule.type === 'Work' && schedule.startTime) {
                        // Check for lateness if scheduled for work
                        if (checkInTs) {
                            try {
                                const scheduledCheckInStr = `${dateStr}T${schedule.startTime}`;
                                const scheduledDt = DateTime.fromISO(scheduledCheckInStr, { zone: THAILAND_TIMEZONE });
                                const actualCheckInDt = DateTime.fromJSDate(checkInTs.toDate()).setZone(THAILAND_TIMEZONE);

                                if (scheduledDt.isValid && actualCheckInDt.isValid && actualCheckInDt > scheduledDt) {
                                    const lateMinutes = Math.round(actualCheckInDt.diff(scheduledDt, 'minutes').minutes);
                                    status = `Late (${lateMinutes}m)`;
                                } else if (actualCheckInDt.isValid) {
                                    status = 'Present'; // On time or early
                                } else {
                                     status = 'Present (Time Invalid)';
                                }
                            } catch (e) {
                                console.warn(`Error comparing times for ${key}:`, e);
                                status = 'Present (Time Error)';
                            }
                        } else {
                            status = 'Present (No Check-in)'; // Should not happen if attendance exists, but safety check
                        }
                    } else if (schedule && schedule.type === 'Off') {
                         status = 'Worked on Day Off'; // Attended but was scheduled off
                    }
                    else {
                        status = 'Present (Unscheduled)'; // Attended but no schedule or schedule wasn't 'Work'
                    }
                } else {
                    // No attendance record
                    if (schedule && schedule.type === 'Work') {
                        status = 'Absent';
                    } else if (schedule && schedule.type === 'Off') {
                        status = 'Off';
                    } else {
                        // No attendance, no schedule - already skipped by the 'continue' above
                        // If we wanted to include these, status would be 'No Schedule'
                        continue; // Should not be reached, but ensures we skip
                    }
                }

                // Add record to the list
                records.push({
                    attendanceDocId: attendance ? attendance.id : '', // Include ID only if record exists
                    staffId: staffId,
                    staffName: staffName,
                    date: dateStr,
                    // *** ADDED Status Column ***
                    attendanceStatus: status,
                    // Format times (will be empty string if Timestamp is null)
                    checkInTime: formatTimeForExportLuxon(checkInTs),
                    checkOutTime: formatTimeForExportLuxon(checkOutTs),
                    breakStartTime: formatTimeForExportLuxon(breakStartTs),
                    breakEndTime: formatTimeForExportLuxon(breakEndTs),
                });
            } // end date loop
        } // end staff loop

        // Sort final records (optional, but nice)
        records.sort((a, b) => a.staffName.localeCompare(b.staffName) || a.date.localeCompare(b.date));


        // --- 3. Generate CSV ---
        // Define CSV fields including the new status column
        const fields = [
            'attendanceDocId', 'staffId', 'staffName', 'date',
            'attendanceStatus', // *** ADDED ***
            'checkInTime', 'checkOutTime', 'breakStartTime', 'breakEndTime'
        ];

        const json2csvParser = new Parser({ fields, excelStrings: true });
        const csv = json2csvParser.parse(records);
        console.log("exportAttendanceDataHandler: CSV generated successfully.");

        const filename = `attendance_export_${startDate}_to_${endDate}_${DateTime.now().setZone(THAILAND_TIMEZONE).toFormat('yyyyMMddHHmmss')}.csv`;
        console.log(`exportAttendanceDataHandler: Generated filename: ${filename}`);

        return { csvData: csv, filename: filename };

    } catch (error) { // Error handling (remains the same)
        console.error("exportAttendanceDataHandler: Error during export:", error);
        if (error instanceof OnCallHttpsError) throw error;
        throw new OnCallHttpsError("internal", `An unexpected error occurred. ${error.message}`, error.stack);
    }
});