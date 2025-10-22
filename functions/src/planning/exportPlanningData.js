const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');
const { Parser } = require('json2csv');

const db = getFirestore();

// Helper to get current job details
const getCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) {
        return { position: 'N/A', department: 'Unassigned' };
    }
    // Ensure sorting is robust
    return [...staff.jobHistory].sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0))[0];
};

// Helper to get display name
const getDisplayName = (staff) => {
    if (!staff) return 'Unknown Staff';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    return staff.fullName || 'Unknown Staff';
};


exports.exportPlanningDataHandler = functions.https.onCall({
    region: "us-central1",
    timeoutSeconds: 120 // Allow more time for data fetching/processing
}, async (request) => {
    // --- Auth Checks ---
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can export planning data.");
    }

    // --- Input Validation ---
    const { startDate, endDate } = request.data;
    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new HttpsError("invalid-argument", "Valid startDate and endDate (YYYY-MM-DD) are required.");
    }

    try {
        // --- Fetch Data ---
        // 1. Get all schedules within the date range
        const schedulesQuery = db.collection("schedules")
            .where("date", ">=", startDate)
            .where("date", "<=", endDate);
        const schedulesSnap = await schedulesQuery.get();

        if (schedulesSnap.empty) {
            return { csvData: "" }; // No schedules found for the week
        }

        const schedules = schedulesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. Get unique staff IDs from the schedules
        const staffIds = [...new Set(schedules.map(s => s.staffId))];

        // 3. Fetch profiles for these staff members
        const staffProfiles = {};
        // Fetch profiles in chunks if necessary (Firestore `in` query limit is 30)
        const chunkSize = 30;
        for (let i = 0; i < staffIds.length; i += chunkSize) {
            const chunk = staffIds.slice(i, i + chunkSize);
            if (chunk.length > 0) {
                 const staffQuery = db.collection("staff_profiles").where(admin.firestore.FieldPath.documentId(), "in", chunk);
                 const staffSnap = await staffQuery.get();
                 staffSnap.forEach(doc => {
                     staffProfiles[doc.id] = doc.data();
                 });
            }
        }


        // --- Format Data for CSV ---
        const records = schedules.map(schedule => {
            const staff = staffProfiles[schedule.staffId];
            const job = getCurrentJob(staff);

            return {
                Date: schedule.date,
                StaffName: getDisplayName(staff), // Use display name
                Department: job.department,
                Position: job.position,
                StartTime: schedule.startTime || '', // Handle potentially missing times
                EndTime: schedule.endTime || '',
                Notes: schedule.notes || '' // Assuming a 'notes' field might exist
            };
        });

        // Sort records primarily by date, then by staff name
        records.sort((a, b) => {
            if (a.Date !== b.Date) {
                return a.Date.localeCompare(b.Date);
            }
            return a.StaffName.localeCompare(b.StaffName);
        });

        // --- Generate CSV ---
        const fields = ['Date', 'StaffName', 'Department', 'Position', 'StartTime', 'EndTime', 'Notes'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(records);

        return { csvData: csv };

    } catch (error) {
        console.error("Error exporting planning data:", error);
        throw new HttpsError("internal", "An unexpected error occurred while exporting planning data.", error.message);
    }
});