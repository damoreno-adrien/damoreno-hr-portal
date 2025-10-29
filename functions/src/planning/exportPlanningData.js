/* functions/src/planning/exportPlanningData.js */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require('firebase-admin/firestore'); // Import FieldValue
const { Parser } = require('json2csv');
const { DateTime } = require('luxon');

const db = admin.firestore();
const THAILAND_TIMEZONE = 'Asia/Bangkok';

/**
 * Generates an array of date strings in YYYY-MM-DD format.
 */
const generateDateRange = (startDateStr, endDateStr) => {
    const dates = [];
    let current = DateTime.fromISO(startDateStr, { zone: THAILAND_TIMEZONE });
    const end = DateTime.fromISO(endDateStr, { zone: THAILAND_TIMEZONE });
    if (!current.isValid || !end.isValid || current > end) {
        console.error("generateDateRange: Invalid date range:", startDateStr, endDateStr);
        return [];
    }
    while (current <= end) {
        dates.push(current.toISODate());
        current = current.plus({ days: 1 });
    }
    return dates;
};


exports.exportPlanningDataHandler = onCall({
    region: "asia-southeast1",
    timeoutSeconds: 300,
}, async (request) => {
    console.log("exportPlanningData: Function execution started.");

    // 1. --- Authentication and Authorization ---
    if (!request.auth) {
        console.error("exportPlanningData: Unauthenticated access attempt.");
        throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const callerUid = request.auth.uid;
    try {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") {
            console.error(`exportPlanningData: Permission denied for user ${callerUid}.`);
            throw new HttpsError("permission-denied", "Manager role required.");
        }
        console.log(`exportPlanningData: User ${callerUid} authorized as manager.`);
    } catch(err) {
         console.error(`exportPlanningData: Error verifying manager role for ${callerUid}:`, err);
         if (err instanceof HttpsError) throw err;
         throw new HttpsError("internal", "Failed to verify user role.", err.message);
    }

    // 2. --- Input Validation (Date Range & Staff) ---
    const { startDate, endDate, staffIds } = request.data;
     if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
         throw new HttpsError("invalid-argument", "Valid 'startDate' and 'endDate' (YYYY-MM-DD) required.");
     }
     
     // staffIds validation:
     const useAllStaff = !staffIds || !Array.isArray(staffIds) || staffIds.length === 0;
     if (useAllStaff) {
         console.log(`exportPlanningData: Exporting schedule data for ALL STAFF from ${startDate} to ${endDate}`);
     } else {
         console.log(`exportPlanningData: Exporting schedule data for ${staffIds.length} staff from ${startDate} to ${endDate}`);
     }

    try {
        // --- 3. Fetch Selected Staff ---
        let staffToProcess = [];
        
        if (useAllStaff) {
            // Option A: All active staff
            const staffQuery = db.collection('staff_profiles').where('status', '==', 'active');
            const staffSnap = await staffQuery.get();
            staffToProcess = staffSnap.docs.map(doc => ({
                id: doc.id,
                name: doc.data().nickname || doc.data().firstName || 'Unknown',
            }));
        } else {
            // Option B: Specific staff (Firestore 'in' query is limited to 30 items)
            // If you have more than 30 staff, we fetch them individually or in chunks.
            // For simplicity and given your restaurant's scale, we'll fetch them efficiently.
            
            // Chunk staffIds into groups of 30 for 'in' query
            const staffIdChunks = [];
            for (let i = 0; i < staffIds.length; i += 30) {
                staffIdChunks.push(staffIds.slice(i, i + 30));
            }

            const staffPromises = staffIdChunks.map(chunk =>
                db.collection('staff_profiles')
                    .where(FieldValue.documentId(), 'in', chunk)
                    .get()
            );

            const staffSnapshots = await Promise.all(staffPromises);
            
            staffSnapshots.forEach(snap => {
                snap.docs.forEach(doc => {
                    staffToProcess.push({
                        id: doc.id,
                        name: doc.data().nickname || doc.data().firstName || 'Unknown',
                    });
                });
            });
        }
        
        if (staffToProcess.length === 0) {
            console.log("exportPlanningData: No staff found to process.");
            return { csvData: "" };
        }
        console.log(`exportPlanningData: Found ${staffToProcess.length} staff to process.`);


        // --- 4. Fetch Existing Schedule Data ---
        let schedulesQuery = db.collection("schedules")
            .where("date", ">=", startDate)
            .where("date", "<=", endDate);

        // **MODIFICATION**: If specific staff are requested, filter schedules by staffId
        // This is more efficient than fetching all schedules.
        // We must also chunk this query.
        
        const schedulesMap = new Map();

        if (useAllStaff) {
            // Fetch all schedules in the date range
            const schedulesSnap = await schedulesQuery.get();
            schedulesSnap.forEach(doc => {
                const data = doc.data();
                const key = `${data.staffId}_${data.date}`;
                schedulesMap.set(key, { scheduleId: doc.id, ...data });
            });
        } else {
            // Fetch schedules only for the selected staff (in chunks)
            const staffIdChunks = [];
            const allStaffIdsToProcess = staffToProcess.map(s => s.id);
            for (let i = 0; i < allStaffIdsToProcess.length; i += 30) {
                staffIdChunks.push(allStaffIdsToProcess.slice(i, i + 30));
            }

            const schedulePromises = staffIdChunks.map(chunk =>
                schedulesQuery.where('staffId', 'in', chunk).get()
            );

            const scheduleSnapshots = await Promise.all(schedulePromises);

            scheduleSnapshots.forEach(snap => {
                snap.docs.forEach(doc => {
                    const data = doc.data();
                    const key = `${data.staffId}_${data.date}`;
                    schedulesMap.set(key, { scheduleId: doc.id, ...data });
                });
            });
        }
        console.log(`exportPlanningData: Found ${schedulesMap.size} existing schedule records for selected staff.`);


        // --- 5. Generate Date Range Array ---
        const dateRange = generateDateRange(startDate, endDate);
        if (dateRange.length === 0) {
            throw new HttpsError("internal", "Could not generate date range.");
        }

        // --- 6. Process Data: Loop through staff and dates ---
        const records = [];
        for (const staff of staffToProcess) {
            for (const date of dateRange) {
                const key = `${staff.id}_${date}`;
                const existingSchedule = schedulesMap.get(key);

                if (existingSchedule) {
                    // Schedule exists, use it
                    records.push({
                        scheduleId: existingSchedule.scheduleId,
                        staffId: existingSchedule.staffId,
                        staffName: existingSchedule.staffName || staff.name,
                        date: existingSchedule.date,
                        type: existingSchedule.type || 'work',
                        startTime: existingSchedule.startTime || '',
                        endTime: existingSchedule.endTime || '',
                        notes: existingSchedule.notes || ''
                    });
                } else {
                    // No schedule exists, create a placeholder "off" row
                    records.push({
                        scheduleId: `${staff.id}_${date}`, // Use the predictable ID
                        staffId: staff.id,
                        staffName: staff.name,
                        date: date,
                        type: 'off',
                        startTime: '',
                        endTime: '',
                        notes: ''
                    });
                }
            }
        }

        // --- 7. Generate CSV Output ---
        const fields = [
            'scheduleId',
            'staffId',
            'staffName',
            'date',
            'type',
            'startTime',
            'endTime',
            'notes'
        ];
        
        const json2csvParser = new Parser({ fields, excelStrings: true });
        const csv = json2csvParser.parse(records);
        
        console.log("exportPlanningData: CSV generation complete.");
        return { csvData: csv };

    } catch (error) { // Error handling
        console.error("exportPlanningData: Unhandled error:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", `Error exporting schedule data: ${error.message}`, error.stack);
    }
});