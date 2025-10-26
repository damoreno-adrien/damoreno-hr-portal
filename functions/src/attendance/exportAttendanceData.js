/* functions/src/attendance/exportAttendanceData.js */

const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { Parser } = require('json2csv');
const { format: formatDateFns, isValid: isDateValid } = require('date-fns'); // Use date-fns for formatting

const db = getFirestore();

/**
 * Helper to format Firestore Timestamp into HH:mm:ss string.
 * Returns empty string if invalid or null/undefined.
 */
const formatTimeForExport = (timestamp) => {
    if (!timestamp || !(timestamp instanceof Timestamp)) return '';
    try {
        const date = timestamp.toDate();
        if (isDateValid(date)) {
            // Use 'HH:mm:ss' for 24-hour format with seconds
            return formatDateFns(date, 'HH:mm:ss');
        }
        return '';
    } catch (e) {
        console.error("Error formatting timestamp:", timestamp, e);
        return '';
    }
};

/**
 * Fetches staff names in bulk to avoid multiple reads.
 * @param {Set<string>} staffIds Set of staff IDs to fetch names for.
 * @returns {Promise<Map<string, string>>} Map of staffId -> displayName.
 */
const getStaffNames = async (staffIds) => {
    const namesMap = new Map();
    if (staffIds.size === 0) return namesMap;

    // Firestore 'in' query supports up to 30 elements per query
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
    } catch (error) {
        console.error("Error fetching staff names:", error);
        // Continue without names if lookup fails, but log it
    }
    return namesMap;
};


exports.exportAttendanceDataHandler = onCall({
    region: "us-central1", // Or your preferred region
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (request) => {
    console.log("exportAttendanceDataHandler: Function started.");

    // Auth & Role Checks (similar to staff export)
    if (!request.auth) throw new OnCallHttpsError("unauthenticated", "Authentication required.");
    const callerUid = request.auth.uid;
    try {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") throw new OnCallHttpsError("permission-denied", "Manager role required.");
        console.log(`exportAttendanceDataHandler: Authorized manager ${callerUid}.`);
    } catch(err) { throw new OnCallHttpsError("internal", "Failed to verify user role.", err.message); }

    // Input Validation: startDate and endDate
    const { startDate, endDate } = request.data;
    if (!startDate || !endDate || typeof startDate !== 'string' || typeof endDate !== 'string') {
        throw new OnCallHttpsError("invalid-argument", "Valid 'startDate' and 'endDate' (YYYY-MM-DD strings) are required.");
    }
    // Basic format check (could be more robust)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
         throw new OnCallHttpsError("invalid-argument", "Dates must be in YYYY-MM-DD format.");
    }
    console.log(`exportAttendanceDataHandler: Exporting range ${startDate} to ${endDate}`);


    try {
        // Query attendance collection within the date range
        const attendanceQuery = db.collection("attendance")
            .where("date", ">=", startDate)
            .where("date", "<=", endDate)
            .orderBy("date", "asc") // Optional: order by date
            .orderBy("staffId", "asc"); // Optional: then by staff

        const attendanceSnap = await attendanceQuery.get();
        console.log(`exportAttendanceDataHandler: Found ${attendanceSnap.size} attendance records.`);

        const filename = `attendance_export_${startDate}_to_${endDate}_${formatDateFns(new Date(), 'yyyyMMddHHmmss')}.csv`;

        if (attendanceSnap.empty) {
            console.log("exportAttendanceDataHandler: No records found for the period.");
            return { csvData: "", filename: filename }; // Return empty CSV
        }

        // Collect unique staff IDs for name lookup
        const staffIdsToLookup = new Set();
        attendanceSnap.forEach(doc => {
            const data = doc.data();
            if (data.staffId) staffIdsToLookup.add(data.staffId);
        });

        // Fetch staff names
        console.log(`exportAttendanceDataHandler: Fetching names for ${staffIdsToLookup.size} staff IDs...`);
        const staffNamesMap = await getStaffNames(staffIdsToLookup);
        console.log(`exportAttendanceDataHandler: Retrieved ${staffNamesMap.size} staff names.`);

        // Map documents to plain objects for CSV
        const records = attendanceSnap.docs.map(doc => {
            const data = doc.data();
            const staffId = data.staffId || '';
            const staffName = staffNamesMap.get(staffId) || data.staffName || 'Unknown'; // Use map, fallback to stored name, then unknown

            return {
                attendanceDocId: doc.id, // Include the document ID for import updates
                staffId: staffId,
                staffName: staffName,
                date: data.date || '', // Should be YYYY-MM-DD string
                checkInTime: formatTimeForExport(data.checkInTime),
                checkOutTime: formatTimeForExport(data.checkOutTime),
                breakStartTime: formatTimeForExport(data.breakStart), // Match Firestore field name
                breakEndTime: formatTimeForExport(data.breakEnd),     // Match Firestore field name
                // Calculated fields (optional for export, ignored on import)
                // totalHours: calculateHours(data.checkInTime, data.checkOutTime, data.breakStart, data.breakEnd),
            };
        });

        // Define CSV fields
        const fields = [
            'attendanceDocId', 'staffId', 'staffName', 'date',
            'checkInTime', 'checkOutTime', 'breakStartTime', 'breakEndTime'
            // 'totalHours' // Add if you include calculation
        ];

        // Generate CSV
        const json2csvParser = new Parser({ fields, excelStrings: true });
        const csv = json2csvParser.parse(records);
        console.log("exportAttendanceDataHandler: CSV generated successfully.");

        return { csvData: csv, filename: filename };

    } catch (error) {
        console.error("exportAttendanceDataHandler: Error during export:", error);
        if (error instanceof OnCallHttpsError) throw error;
        throw new OnCallHttpsError("internal", `An unexpected error occurred during export. ${error.message}`, error.stack);
    }
});