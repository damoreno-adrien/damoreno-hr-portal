/* functions/src/attendance/exportAttendanceData.js */

const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, Timestamp, collection, query, where, getDocs } = require('firebase-admin/firestore'); // Added collection, query, where, getDocs
const { Parser } = require('json2csv');
const { DateTime } = require('luxon'); // Use Luxon

const db = getFirestore();
const THAILAND_TIMEZONE = 'Asia/Bangkok'; // Ensure this matches import

/**
 * Helper to format Firestore Timestamp into HH:mm:ss string in local timezone using Luxon.
 * Returns empty string if invalid or null/undefined.
 */
const formatTimeForExportLuxon = (timestamp) => {
    if (!timestamp || !(timestamp instanceof Timestamp)) return '';
    try {
        // Convert Firestore Timestamp to JS Date (represents UTC moment)
        const jsDate = timestamp.toDate();

        // Create Luxon DateTime object FROM the JS Date (interprets it as UTC)
        const dtUtc = DateTime.fromJSDate(jsDate);
        if (!dtUtc.isValid) {
            console.warn("formatTimeLuxon: Could not create valid DateTime from JSDate:", jsDate);
            return '';
        }

        // Convert the UTC DateTime object TO the desired local timezone
        const dtLocal = dtUtc.setZone(THAILAND_TIMEZONE);

        // Format the local time as HH:mm:ss (24-hour format)
        return dtLocal.toFormat('HH:mm:ss');

    } catch (e) {
        console.error("Error formatting timestamp with Luxon:", timestamp, e);
        return '';
    }
};

/**
 * Fetches staff names in bulk to minimize Firestore reads.
 * @param {Set<string>} staffIds Set of unique staff IDs to fetch names for.
 * @returns {Promise<Map<string, string>>} A Map where keys are staff IDs and values are display names.
 */
const getStaffNames = async (staffIds) => {
    const namesMap = new Map();
    if (staffIds.size === 0) return namesMap; // Return empty map if no IDs provided

    // Firestore 'in' query supports up to 30 elements per query batch
    const staffIdArray = Array.from(staffIds);
    const MAX_IN_QUERY_SIZE = 30;
    const promises = []; // Array to hold promises for each query batch

    // Batch the queries
    for (let i = 0; i < staffIdArray.length; i += MAX_IN_QUERY_SIZE) {
        const batchIds = staffIdArray.slice(i, i + MAX_IN_QUERY_SIZE);
        // Query the 'staff_profiles' collection using the document ID (which is the staff ID)
        const q = query(collection(db, 'staff_profiles'), where(admin.firestore.FieldPath.documentId(), 'in', batchIds));
        promises.push(getDocs(q)); // Add the query promise to the array
    }

    try {
        // Execute all batched queries concurrently
        const querySnapshots = await Promise.all(promises);
        // Process results from all snapshots
        querySnapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
                const data = doc.data();
                // Determine the best display name (nickname > first+last > first > unknown)
                const name = data.nickname
                          || (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : null)
                          || data.firstName
                          || 'Unknown';
                namesMap.set(doc.id, name.trim()); // Store staffId -> name mapping
            });
        });
    } catch (error) {
        // Log error but continue, so export doesn't completely fail if name lookup has issues
        console.error("Error fetching staff names:", error);
    }
    return namesMap;
};

/**
 * Generates an array of date strings (YYYY-MM-DD) for a given date range using Luxon.
 * @param {string} startDateStr Start date in YYYY-MM-DD format.
 * @param {string} endDateStr End date in YYYY-MM-DD format.
 * @returns {string[]} Array of date strings or empty array if dates are invalid.
 */
const generateDateRange = (startDateStr, endDateStr) => {
    const dates = [];
    // Parse start and end dates using the local timezone
    let current = DateTime.fromISO(startDateStr, { zone: THAILAND_TIMEZONE });
    const end = DateTime.fromISO(endDateStr, { zone: THAILAND_TIMEZONE });

    // Validate parsed dates
    if (!current.isValid || !end.isValid || current > end) {
        console.error("Invalid date range provided to generateDateRange:", startDateStr, endDateStr);
        return []; // Return empty array for invalid range
    }

    // Loop from start date to end date (inclusive)
    while (current <= end) {
        dates.push(current.toISODate()); // Add date in YYYY-MM-DD format
        current = current.plus({ days: 1 }); // Move to the next day
    }
    return dates;
};


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
        const callerDoc = await getDocs(query(collection(db, "users"), where(admin.firestore.FieldPath.documentId(), '==', callerUid)));
        if (callerDoc.empty || callerDoc.docs[0].data().role !== "manager") {
            console.error(`exportAttendanceDataHandler: Permission denied for user ${callerUid}. Role check failed.`);
            throw new OnCallHttpsError("permission-denied", "Manager role required.");
        }
        console.log(`exportAttendanceDataHandler: User ${callerUid} authorized as manager.`);
    } catch(err) {
         console.error(`exportAttendanceDataHandler: Error verifying manager role for ${callerUid}:`, err);
         if (err instanceof OnCallHttpsError) throw err; // Re-throw specific errors
         throw new OnCallHttpsError("internal", "Failed to verify user role.", err.message);
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
        if (dateRange.length === 0) { // Handle invalid date range from helper
             console.log("exportAttendanceDataHandler: Invalid date range resulted in zero days.");
             const filename = `attendance_export_${startDate}_to_${endDate}_${DateTime.now().setZone(THAILAND_TIMEZONE).toFormat('yyyyMMddHHmmss')}.csv`;
             return { csvData: "", filename: filename };
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

        // Handle case where no data exists for the period
        if (staffIdsInPeriod.size === 0) {
            console.log("exportAttendanceDataHandler: No attendance, schedule, or leave data found for any staff in the period.");
            const filename = `attendance_export_${startDate}_to_${endDate}_${DateTime.now().setZone(THAILAND_TIMEZONE).toFormat('yyyyMMddHHmmss')}.csv`;
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

                    // Make schedule type checks robust (case-insensitive, handle null/undefined)
                    const isWorkSchedule = schedule?.type?.toLowerCase() === 'work';
                    const isOffSchedule = schedule?.type?.toLowerCase() === 'off';
                    const scheduledStartTimeStr = (isWorkSchedule && schedule?.startTime) ? schedule.startTime : null;

                    if (attendance) { // Attendance record EXISTS for this day
                        if (scheduledStartTimeStr) { // Scheduled Time Exists (implies work schedule)
                             if (checkInTs) { // Check-in time exists
                                try {
                                    // Parse scheduled time and actual check-in time using Luxon for comparison
                                    const scheduledDt = DateTime.fromISO(`${dateStr}T${scheduledStartTimeStr}`, { zone: THAILAND_TIMEZONE });
                                    const actualCheckInDt = DateTime.fromJSDate(checkInTs.toDate()).setZone(THAILAND_TIMEZONE);
                                    // Check validity and compare
                                    if (scheduledDt.isValid && actualCheckInDt.isValid && actualCheckInDt > scheduledDt) {
                                        const lateMinutes = Math.ceil(actualCheckInDt.diff(scheduledDt, 'minutes').minutes);
                                        status = `Late (${lateMinutes}m)`; // Mark as late
                                    } else if (actualCheckInDt.isValid) {
                                        status = 'Present'; // On time or early
                                    } else {
                                         status = 'Present (Check-in Invalid)'; // Error state
                                    }
                                } catch (e) {
                                     console.warn(`Error comparing times for ${key}:`, e);
                                     status = 'Present (Time Error)'; // Error state
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
                            // Neither attendance, schedule, nor leave.
                            // This state means no relevant data exists, so skip the row.
                            continue;
                        }
                    }

                    // --- Prepare Row Data for CSV ---
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

        // Generate filename including date range and timestamp
        const filename = `attendance_export_${startDate}_to_${endDate}_${DateTime.now().setZone(THAILAND_TIMEZONE).toFormat('yyyyMMddHHmmss')}.csv`;
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