/* functions/src/attendance/exportAttendanceData.js */

const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
// Use specific imports needed
const { getFirestore, Timestamp, collection, query, where, getDocs } = require('firebase-admin/firestore');
const { Parser } = require('json2csv');
const { DateTime } = require('luxon'); // Use Luxon

const db = getFirestore();
const THAILAND_TIMEZONE = 'Asia/Bangkok';

// --- Helpers ---

/**
 * Helper to format Firestore Timestamp into HH:mm:ss string in local timezone using Luxon.
 * Returns empty string if invalid or null/undefined.
 */
const formatTimeForExportLuxon = (timestamp) => {
    if (!timestamp || !(timestamp instanceof Timestamp)) return '';
    try {
        const jsDate = timestamp.toDate();
        const dtUtc = DateTime.fromJSDate(jsDate);
        if (!dtUtc.isValid) {
            console.warn("formatTimeLuxon: Could not create valid DateTime from JSDate:", jsDate);
            return '';
        }
        const dtLocal = dtUtc.setZone(THAILAND_TIMEZONE);
        return dtLocal.toFormat('HH:mm:ss'); // 24-hour format with seconds
    } catch (e) {
        console.error("Error formatting timestamp with Luxon:", timestamp, e);
        return '';
    }
};

/**
 * Fetches staff names in bulk to minimize Firestore reads.
 * @param {Set<string>} staffIds Set of unique staff IDs.
 * @returns {Promise<Map<string, string>>} A Map: staffId -> displayName.
 */
const getStaffNames = async (staffIds) => {
    const namesMap = new Map();
    if (staffIds.size === 0) return namesMap;

    const staffIdArray = Array.from(staffIds);
    const MAX_IN_QUERY_SIZE = 30; // Firestore 'in' query limit
    const promises = [];

    // Batch queries for Firestore 'in' limit
    for (let i = 0; i < staffIdArray.length; i += MAX_IN_QUERY_SIZE) {
        const batchIds = staffIdArray.slice(i, i + MAX_IN_QUERY_SIZE);
        const q = query(collection(db, 'staff_profiles'), where(admin.firestore.FieldPath.documentId(), 'in', batchIds));
        promises.push(getDocs(q));
    }

    try {
        const querySnapshots = await Promise.all(promises);
        querySnapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
                const data = doc.data();
                const name = data.nickname
                          || (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : null)
                          || data.firstName
                          || 'Unknown';
                namesMap.set(doc.id, name.trim());
            });
        });
    } catch (error) {
        console.error("Error fetching staff names:", error);
        // Continue without names if lookup fails, but log the error
    }
    return namesMap;
};

/**
 * Generates an array of date strings (YYYY-MM-DD) for a given range using Luxon.
 * @param {string} startDateStr Start date in YYYY-MM-DD format.
 * @param {string} endDateStr End date in YYYY-MM-DD format.
 * @returns {string[]} Array of date strings or empty array if dates are invalid.
 */
const generateDateRange = (startDateStr, endDateStr) => {
    const dates = [];
    let current = DateTime.fromISO(startDateStr, { zone: THAILAND_TIMEZONE });
    const end = DateTime.fromISO(endDateStr, { zone: THAILAND_TIMEZONE });

    if (!current.isValid || !end.isValid || current > end) {
        console.error("Invalid date range provided to generateDateRange:", startDateStr, endDateStr);
        return [];
    }

    while (current <= end) {
        dates.push(current.toISODate()); // Add date in YYYY-MM-DD format
        current = current.plus({ days: 1 });
    }
    return dates;
};
// --- End Helpers ---


// --- Main Export Cloud Function ---
exports.exportAttendanceDataHandler = onCall({
    region: "us-central1",    // Ensure consistency
    timeoutSeconds: 300,      // Adjust if exports take longer
    memory: "512MiB"          // Adjust based on expected data volume
}, async (request) => {
    console.log("exportAttendanceDataHandler: Function execution started.");

    // 1. --- Authentication and Authorization ---
    if (!request.auth) {
        console.error("exportAttendanceDataHandler: Unauthenticated access attempt.");
        throw new OnCallHttpsError("unauthenticated", "Authentication required.");
    }
    const callerUid = request.auth.uid;
    try {
        // Use simpler .doc().get() for single document fetch
        const callerDoc = await db.collection("users").doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") {
            console.error(`exportAttendanceDataHandler: Permission denied for user ${callerUid}. Role check failed.`);
            throw new OnCallHttpsError("permission-denied", "Manager role required.");
        }
        console.log(`exportAttendanceDataHandler: User ${callerUid} authorized as manager.`);
    } catch(err) {
         console.error(`exportAttendanceDataHandler: Error verifying manager role for ${callerUid}:`, err);
         if (err instanceof OnCallHttpsError) throw err; // Re-throw specific errors
         // Pass original error message for clarity
         throw new OnCallHttpsError("internal", `Failed to verify user role. ${err.message}`, err.stack);
    }

    // 2. --- Input Validation (Date Range) ---
    const { startDate, endDate } = request.data;
    // Validate presence and format (YYYY-MM-DD)
    if (!startDate || !endDate || typeof startDate !== 'string' || typeof endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        console.error("exportAttendanceDataHandler: Invalid date range input:", startDate, endDate);
         throw new OnCallHttpsError("invalid-argument", "Valid 'startDate' and 'endDate' (YYYY-MM-DD strings) are required.");
    }
     // Validate logical order
     if (startDate > endDate) {
        console.error("exportAttendanceDataHandler: Start date cannot be after end date.");
        throw new OnCallHttpsError("invalid-argument", "Start date cannot be after end date.");
     }
    console.log(`exportAttendanceDataHandler: Exporting attendance data for range ${startDate} to ${endDate}`);


    try {
        // --- 3. Fetch All Necessary Data Concurrently ---
        const dateRange = generateDateRange(startDate, endDate); // Generate date strings for the period
        const filename = `attendance_export_${startDate}_to_${endDate}_${DateTime.now().setZone(THAILAND_TIMEZONE).toFormat('yyyyMMddHHmmss')}.csv`; // Define filename early

        if (dateRange.length === 0) {
             console.log("exportAttendanceDataHandler: Invalid date range resulted in zero days.");
             return { csvData: "", filename: filename }; // Return empty CSV if range is invalid
        }

        const attendancePromise = getDocs(query(collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate)));
        const schedulesPromise = getDocs(query(collection(db, "schedules"), where("date", ">=", startDate), where("date", "<=", endDate)));
        // *** IMPORTANT: Adjust leave query based on your actual Firestore structure ***
        const leavePromise = getDocs(query(
            collection(db, "leave_requests"),      // ASSUMED collection name
            where("status", "==", "approved"),     // ASSUMED status field and value
            where("date", ">=", startDate),        // ASSUMED date field name
            where("date", "<=", endDate)
        ));

        // Wait for all queries to complete
        const [attendanceSnap, schedulesSnap, leaveSnap] = await Promise.all([attendancePromise, schedulesPromise, leavePromise]);

        // Process snapshots into maps for efficient lookup
        const attendanceMap = new Map(); // Key: "staffId_date", Value: {id: docId, ...data}
        attendanceSnap.forEach(doc => { const data = doc.data(); attendanceMap.set(`${data.staffId}_${data.date}`, { id: doc.id, ...data }); });
        console.log(`exportAttendanceDataHandler: Fetched ${attendanceMap.size} attendance records.`);

        const schedulesMap = new Map(); // Key: "staffId_date", Value: schedule data
        schedulesSnap.forEach(doc => { const data = doc.data(); schedulesMap.set(`${data.staffId}_${data.date}`, data); });
        console.log(`exportAttendanceDataHandler: Fetched ${schedulesMap.size} schedule records.`);

        const leaveMap = new Map(); // Key: "staffId_date", Value: leave data (or true)
        leaveSnap.forEach(doc => { const data = doc.data(); if(data.staffId && data.date) leaveMap.set(`${data.staffId}_${data.date}`, data); });
        console.log(`exportAttendanceDataHandler: Fetched ${leaveMap.size} approved leave days.`);

        // --- 4. Determine Relevant Staff and Fetch Names ---
        const staffIdsInPeriod = new Set(); // Collect all unique staff IDs involved in this period
        attendanceMap.forEach((val, key) => staffIdsInPeriod.add(key.split('_')[0]));
        schedulesMap.forEach((val, key) => staffIdsInPeriod.add(key.split('_')[0]));
        leaveMap.forEach((val, key) => staffIdsInPeriod.add(key.split('_')[0]));

        // Handle case where no relevant data exists for the period
        if (staffIdsInPeriod.size === 0) {
            console.log("exportAttendanceDataHandler: No attendance, schedule, or leave data found for any staff in the period.");
            return { csvData: "", filename: filename }; // Return empty CSV
        }

        // Fetch names for all relevant staff IDs
        console.log(`exportAttendanceDataHandler: Fetching names for ${staffIdsInPeriod.size} unique staff IDs...`);
        const staffNamesMap = await getStaffNames(staffIdsInPeriod);
        console.log(`exportAttendanceDataHandler: Retrieved ${staffNamesMap.size} staff names.`);


        // --- 5. Process Data: Iterate Staff & Dates to Build CSV Rows ---
        const records = []; // Array to hold the final objects for CSV conversion

        // Loop through each relevant staff member
        for (const staffId of staffIdsInPeriod) {
            const staffName = staffNamesMap.get(staffId) || 'Unknown'; // Get fetched name or default

            // Loop through each day in the selected date range
            for (const dateStr of dateRange) {
                const key = `${staffId}_${dateStr}`; // Consistent key for lookups

                // Get data for this specific staff/day from the maps
                const attendance = attendanceMap.get(key);
                const schedule = schedulesMap.get(key);
                const approvedLeave = leaveMap.get(key);

                // Determine if a row should be generated (if any relevant data exists)
                if (schedule || attendance || approvedLeave) {
                    // --- Calculate Status ---
                    let status = 'Unknown'; // Default status
                    const checkInTs = attendance?.checkInTime; // Get Timestamp or undefined

                    // More robust schedule type checks (case-insensitive, handle null/undefined)
                    const isWorkSchedule = schedule && typeof schedule.type === 'string' && schedule.type.toLowerCase() === 'work';
                    const isOffSchedule = schedule && typeof schedule.type === 'string' && schedule.type.toLowerCase() === 'off';
                    // Get start time ONLY if it's a valid work schedule
                    const scheduledStartTimeStr = (isWorkSchedule && schedule.startTime) ? schedule.startTime : null;

                    if (attendance) { // Attendance record EXISTS for this day
                        if (scheduledStartTimeStr) { // Scheduled Time Exists (implies valid work schedule)
                             if (checkInTs) { // Check-in time exists
                                try {
                                    // Parse scheduled time and actual check-in time using Luxon
                                    const scheduledDt = DateTime.fromISO(`${dateStr}T${scheduledStartTimeStr}`, { zone: THAILAND_TIMEZONE });
                                    const actualCheckInDt = DateTime.fromJSDate(checkInTs.toDate()).setZone(THAILAND_TIMEZONE);
                                    // Check validity and compare
                                    if (scheduledDt.isValid && actualCheckInDt.isValid && actualCheckInDt > scheduledDt) {
                                        const lateMinutes = Math.ceil(actualCheckInDt.diff(scheduledDt, 'minutes').minutes);
                                        status = `Late (${lateMinutes}m)`; // Mark as late
                                    } else if (actualCheckInDt.isValid) {
                                        status = 'Present'; // On time or early
                                    } else {
                                         status = 'Present (Check-in Invalid)'; // Error state if timestamp is bad
                                    }
                                } catch (e) {
                                     console.warn(`Error comparing times for ${key}:`, e);
                                     status = 'Present (Time Error)'; // Error state during comparison
                                }
                             } else {
                                 status = 'Present (No Check-in?)'; // Data inconsistency
                             }
                        } else if (isOffSchedule) { // Attended but was scheduled Off
                             status = 'Worked on Day Off';
                        } else { // Attended without a known 'Work' schedule (or schedule missing details)
                             status = 'Present (Unscheduled)';
                        }
                    } else { // No attendance record FOUND for this day
                        if (approvedLeave) {
                            status = 'Leave'; // Primary status if on approved leave
                        } else if (isWorkSchedule) {
                            status = 'Absent'; // Scheduled for work, no attendance, not on leave
                        } else if (isOffSchedule) {
                            status = 'Off'; // Scheduled off, no attendance
                        } else {
                            // If schedule exists but isn't Work/Off, or no schedule exists (and not on leave)
                            // Skip these rows as they don't represent a clear status relevant to attendance/absence
                             if (schedule && !isWorkSchedule && !isOffSchedule) {
                                 console.log(`Skipping row for ${staffName} on ${dateStr} - schedule type is '${schedule.type}'`);
                                 continue; // Skip row
                             }
                             // If reached here, it means no attendance, no leave, no schedule - skipped by outer 'if' check already.
                             continue;
                        }
                    }

                    // --- Prepare Row Data for CSV ---
                    // Only add row if status was determined (i.e., not skipped)
                    if (status !== 'Unknown') {
                        records.push({
                            attendanceDocId: attendance ? attendance.id : '', // Include Firestore doc ID only if attendance exists
                            staffId: staffId,
                            staffName: staffName,
                            date: dateStr, // YYYY-MM-DD format
                            attendanceStatus: status, // The calculated status
                            // Format times using Luxon helper (returns '' if Timestamp is null/invalid)
                            checkInTime: formatTimeForExportLuxon(attendance?.checkInTime),
                            checkOutTime: formatTimeForExportLuxon(attendance?.checkOutTime),
                            breakStartTime: formatTimeForExportLuxon(attendance?.breakStart),
                            breakEndTime: formatTimeForExportLuxon(attendance?.breakEnd),
                        });
                    }
                } // End if (schedule || attendance || approvedLeave)
            } // End date loop
        } // End staff loop

        // Sort final records by staff name, then date (optional but helpful)
        records.sort((a, b) => a.staffName.localeCompare(b.staffName) || a.date.localeCompare(b.date));


        // --- 6. Generate CSV Output ---
        // Define the headers for the CSV file, including the new status column
        const fields = [
            'attendanceDocId',
            'staffId',
            'staffName',
            'date',
            'attendanceStatus', // Include the status
            'checkInTime',
            'checkOutTime',
            'breakStartTime',
            'breakEndTime'
        ];

        // Use json2csv Parser to convert the array of objects into a CSV string
        const json2csvParser = new Parser({ fields, excelStrings: true }); // excelStrings helps prevent issues in Excel
        const csv = json2csvParser.parse(records);
        console.log("exportAttendanceDataHandler: CSV generated successfully.");
        console.log(`exportAttendanceDataHandler: Generated filename: ${filename}`);

        // Return the CSV data and filename to the client
        return { csvData: csv, filename: filename };

    } catch (error) { // Catch any unexpected errors during the process
        console.error("exportAttendanceDataHandler: Unhandled error during export:", error);
        // Ensure OnCallHttpsError is thrown back to the client for proper handling
        if (error instanceof OnCallHttpsError) throw error;
        // Provide more context in the error message
        throw new OnCallHttpsError("internal", `An unexpected error occurred during export. ${error.message}`, error.stack);
    }
}); // End of exports.exportAttendanceDataHandler