const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');
const { Parser } = require('json2csv');
const { parseISO } = require('date-fns'); // Import date-fns helper

const db = getFirestore();

// Helper to get current job details using robust date parsing
const getCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) {
        return { position: 'N/A', department: 'Unassigned' };
    }
    // Ensure sorting is robust using date-fns
    return [...staff.jobHistory].sort((a, b) => {
        // Parse dates robustly, default to epoch start if invalid/missing
        const dateA = a.startDate ? parseISO(a.startDate) : new Date(0);
        const dateB = b.startDate ? parseISO(b.startDate) : new Date(0);
        // Handle invalid dates by treating them as very old
        const timeA = !isNaN(dateA) ? dateA.getTime() : 0;
        const timeB = !isNaN(dateB) ? dateB.getTime() : 0;
        return timeB - timeA; // Sort descending (most recent first)
    })[0];
};

// Helper to get display name
const getDisplayName = (staff) => {
    if (!staff) return 'Unknown Staff';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    return staff.fullName || 'Unknown Staff';
};


exports.exportPlanningDataHandler = functions.https.onCall({
    region: "asia-southeast1", // Updated region
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
    // Basic format check, more robust validation can be added if needed
    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new HttpsError("invalid-argument", "Valid startDate and endDate (YYYY-MM-DD) are required.");
    }
    // Optional: Check if endDate is before startDate
    if (endDate < startDate) {
        throw new HttpsError("invalid-argument", "End date cannot be before start date.");
    }


    try {
        console.log(`Exporting planning data from ${startDate} to ${endDate}`);
        // --- Fetch Data ---
        // 1. Get all schedules within the date range
        const schedulesQuery = db.collection("schedules")
            .where("date", ">=", startDate)
            .where("date", "<=", endDate);
        const schedulesSnap = await schedulesQuery.get();

        if (schedulesSnap.empty) {
            console.log("No schedules found for the specified period.");
            return { csvData: "" }; // Return empty CSV data
        }
        console.log(`Found ${schedulesSnap.size} schedules.`);

        const schedules = schedulesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. Get unique staff IDs from the schedules
        const staffIds = [...new Set(schedules.map(s => s.staffId))];
        console.log(`Fetching profiles for ${staffIds.length} unique staff IDs.`);

        // 3. Fetch profiles for these staff members
        const staffProfiles = {};
        // Fetch profiles in chunks (Firestore `in` query limit is 30 as of v9+)
        const chunkSize = 30;
        for (let i = 0; i < staffIds.length; i += chunkSize) {
            const chunk = staffIds.slice(i, i + chunkSize);
            if (chunk.length > 0) {
                 console.log(`Fetching staff profile chunk ${Math.floor(i / chunkSize) + 1}...`);
                 const staffQuery = db.collection("staff_profiles").where(admin.firestore.FieldPath.documentId(), "in", chunk);
                 const staffSnap = await staffQuery.get();
                 staffSnap.forEach(doc => {
                     staffProfiles[doc.id] = doc.data();
                 });
            }
        }
        console.log(`Fetched ${Object.keys(staffProfiles).length} staff profiles.`);


        // --- Format Data for CSV ---
        const records = schedules.map(schedule => {
            const staff = staffProfiles[schedule.staffId]; // Might be undefined if profile missing
            const job = getCurrentJob(staff); // Handles undefined staff

            return {
                Date: schedule.date, // Already in YYYY-MM-DD
                StaffName: getDisplayName(staff), // Handles undefined staff
                Department: job.department, // Handles undefined job
                Position: job.position, // Handles undefined job
                StartTime: schedule.startTime || '', // Use empty string if missing
                EndTime: schedule.endTime || '', // Use empty string if missing
                Notes: schedule.notes || '' // Use empty string if missing
            };
        });

        // Sort records primarily by date, then by staff name (localeCompare is fine for YYYY-MM-DD)
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
        console.log("CSV generation successful.");

        return { csvData: csv };

    } catch (error) {
        console.error("Error exporting planning data:", error);
        // Ensure HttpsError is thrown for client-side handling
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while exporting planning data.", error.message);
    }
});