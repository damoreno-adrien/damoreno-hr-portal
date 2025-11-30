const { HttpsError, onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');
const { DateTime } = require('luxon');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = getFirestore();
const THAILAND_TIMEZONE = 'Asia/Bangkok';

// Escape CSV fields to handle commas/newlines
const escapeCsv = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

// Format time as "HH:mm" (e.g., "14:30")
const formatTime = (timestamp) => {
    if (!timestamp) return '';
    try {
        return DateTime.fromJSDate(timestamp.toDate())
            .setZone(THAILAND_TIMEZONE)
            .toFormat('HH:mm');
    } catch (e) { return ''; }
};

exports.exportAttendanceDataHandler = onCall({ region: "us-central1" }, async (request) => {
    const { startDate, endDate, staffIds } = request.data;

    if (!startDate || !endDate) {
        throw new HttpsError("invalid-argument", "Start date and end date are required.");
    }

    console.log(`Exporting matrix from ${startDate} to ${endDate}`);

    try {
        // 1. Fetch Staff
        let staffList = [];
        if (staffIds && staffIds.length > 0) {
            const refs = staffIds.map(id => db.collection('staff_profiles').doc(id));
            const snaps = await db.getAll(...refs);
            staffList = snaps.map(s => ({ id: s.id, ...s.data() }));
        } else {
            // Default: Active staff only
            const snap = await db.collection('staff_profiles').where('status', '!=', 'inactive').get();
            staffList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        // 2. Fetch All Data for the Range
        const [attSnap, schedSnap, leaveSnap] = await Promise.all([
            db.collection("attendance").where("date", ">=", startDate).where("date", "<=", endDate).get(),
            db.collection("schedules").where("date", ">=", startDate).where("date", "<=", endDate).get(),
            db.collection("leave_requests").where("status", "==", "approved").where("endDate", ">=", startDate).get()
        ]);

        // 3. Build Lookup Maps
        const attendanceMap = new Map();
        attSnap.forEach(doc => {
            // Key: staffId_YYYY-MM-DD
            attendanceMap.set(`${doc.data().staffId}_${doc.data().date}`, { id: doc.id, ...doc.data() });
        });

        const scheduleMap = new Map();
        schedSnap.forEach(doc => {
            scheduleMap.set(`${doc.data().staffId}_${doc.data().date}`, doc.data());
        });

        const leaveMap = new Map();
        leaveSnap.forEach(doc => {
            const data = doc.data();
            let current = DateTime.fromISO(data.startDate);
            const end = DateTime.fromISO(data.endDate);
            while (current <= end) {
                const dateStr = current.toISODate();
                if (dateStr >= startDate && dateStr <= endDate) {
                    leaveMap.set(`${data.staffId}_${dateStr}`, data);
                }
                current = current.plus({ days: 1 });
            }
        });

        // 4. Build Matrix (Rows)
        const rows = [];
        const startDt = DateTime.fromISO(startDate);
        const endDt = DateTime.fromISO(endDate);
        
        // Sort staff by name for nicer output
        staffList.sort((a, b) => (a.nickname || a.firstName).localeCompare(b.nickname || b.firstName));

        for (const staff of staffList) {
            let currentDt = startDt;
            while (currentDt <= endDt) {
                const dateStr = currentDt.toISODate();
                const key = `${staff.id}_${dateStr}`;
                
                const att = attendanceMap.get(key);
                const sched = scheduleMap.get(key);
                const leave = leaveMap.get(key);
                const displayName = staff.nickname || staff.firstName || "Unknown";

                // Determine Status Label (for reference only)
                let status = 'Off';
                if (att) {
                    status = 'Present';
                    if (att.checkInTime && att.checkOutTime) status = 'Completed';
                } else if (leave) {
                    status = `Leave (${leave.leaveType})`;
                } else if (sched && sched.type === 'work') {
                    if (currentDt < DateTime.now().startOf('day')) {
                        status = 'Absent';
                    } else {
                        status = 'Scheduled';
                    }
                }

                // We export a row for EVERY day, so you can fill in blanks if needed
                rows.push([
                    escapeCsv(att ? att.id : ''), // [A] Attendance Doc ID (Crucial!)
                    escapeCsv(staff.id),          // [B] Staff ID
                    escapeCsv(dateStr),           // [C] Date
                    escapeCsv(displayName),       // [D] Name
                    escapeCsv(att ? formatTime(att.checkInTime) : ''),   // [E] Check-In
                    escapeCsv(att ? formatTime(att.checkOutTime) : ''),  // [F] Check-Out
                    escapeCsv(att ? formatTime(att.breakStart) : ''),    // [G] Break Start
                    escapeCsv(att ? formatTime(att.breakEnd) : ''),      // [H] Break End
                    escapeCsv(status)             // [I] Status Label
                ].join(","));

                currentDt = currentDt.plus({ days: 1 });
            }
        }

        const header = [
            "Attendance Doc ID", "Staff ID", "Date", "Staff Name", 
            "Check-In", "Check-Out", "Break Start", "Break End", "Status"
        ];
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