// functions/src/attendance/exportAttendanceData.js
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = getFirestore();

// Helper to escape CSV fields
const escapeCsv = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

// Helper to format date
const formatDate = (timestamp) => {
    if (!timestamp) return '';
    try {
        return timestamp.toDate().toLocaleString('en-GB', { 
            day: '2-digit', month: '2-digit', year: 'numeric', 
            hour: '2-digit', minute: '2-digit', hour12: false 
        }).replace(',', '');
    } catch (e) { return ''; }
};

exports.exportAttendanceData = onCall({ region: "us-central1" }, async (request) => {
    const { startDate, endDate, staffIds } = request.data;

    if (!startDate || !endDate) {
        throw new HttpsError("invalid-argument", "Start date and end date are required.");
    }

    console.log(`Exporting attendance from ${startDate} to ${endDate} for ${staffIds ? staffIds.length + ' staff' : 'ALL staff'}`);

    try {
        // 1. Fetch ALL attendance for the date range
        const snapshot = await db.collection("attendance")
            .where("date", ">=", startDate)
            .where("date", "<=", endDate)
            .orderBy("date", "asc")
            .get();

        if (snapshot.empty) {
            return { csvData: null, filename: `attendance_${startDate}_${endDate}.csv` };
        }

        // 2. Filter in Memory
        let docs = snapshot.docs;
        if (staffIds && Array.isArray(staffIds) && staffIds.length > 0) {
            const allowedIds = new Set(staffIds);
            docs = docs.filter(doc => allowedIds.has(doc.data().staffId));
        }

        if (docs.length === 0) {
             return { csvData: null, filename: `attendance_${startDate}_${endDate}.csv` };
        }

        // 3. Generate CSV
        const header = [
            "Staff ID", // <-- NEW: Added ID column for robust re-importing
            "Date", 
            "Staff Name", 
            "Check-In", 
            "Check-Out", 
            "Break Start", 
            "Break End", 
            "Status", 
            "OT Minutes", 
            "Late Minutes", 
            "Location Check-In", 
            "Location Check-Out"
        ];

        const rows = docs.map(doc => {
            const data = doc.data();
            
            let status = 'Present';
            if (data.checkInTime && data.checkOutTime) status = 'Completed';

            return [
                escapeCsv(data.staffId), // <-- NEW: Data for ID column
                escapeCsv(data.date),
                escapeCsv(data.staffName),
                escapeCsv(formatDate(data.checkInTime)),
                escapeCsv(formatDate(data.checkOutTime)),
                escapeCsv(formatDate(data.breakStart)),
                escapeCsv(formatDate(data.breakEnd)),
                escapeCsv(status),
                escapeCsv(data.otApprovedMinutes || 0),
                '', 
                escapeCsv(data.checkInLocation ? 'Verified' : '-'),
                escapeCsv(data.checkOutLocation ? 'Verified' : '-')
            ].join(",");
        });

        const csvContent = [header.join(","), ...rows].join("\n");

        return {
            csvData: csvContent,
            filename: `attendance_${startDate}_${endDate}.csv`
        };

    } catch (error) {
        console.error("Export error:", error);
        throw new HttpsError("internal", "Failed to generate export.", error.message);
    }
});