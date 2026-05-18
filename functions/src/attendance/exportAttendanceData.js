/* functions/src/attendance/exportAttendanceData.js */
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');
const { DateTime } = require('luxon');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = getFirestore();
const THAILAND_TIMEZONE = 'Asia/Bangkok';

const escapeCsv = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

const formatTime = (timestamp) => {
    if (!timestamp) return '';
    try {
        return DateTime.fromJSDate(timestamp.toDate())
            .setZone(THAILAND_TIMEZONE)
            .toFormat('HH:mm');
    } catch (e) { return ''; }
};

exports.exportAttendanceDataHandler = onCall({ region: "asia-southeast1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }

    const callerUid = request.auth.uid;
    const callerDoc = await db.collection("users").doc(callerUid).get();
    const callerData = callerDoc.exists ? callerDoc.data() : {};
    const callerRole = callerData.role || null;
    const adminBranchIds = callerData.branchIds || [];

    if (!['manager', 'admin', 'super_admin'].includes(callerRole)) {
        throw new HttpsError("permission-denied", "Only managers, admins, and super admins can export attendance data.");
    }

    const { startDate, endDate, staffIds } = request.data;
    if (!startDate || !endDate) {
        throw new HttpsError("invalid-argument", "Start date and end date are required.");
    }

    try {
        // 1. Fetch Staff avec filtre de sécurité par succursale
        let staffList = [];
        if (staffIds && staffIds.length > 0) {
            const refs = staffIds.map(id => db.collection('staff_profiles').doc(id));
            const snaps = await db.getAll(...refs);
            staffList = snaps.map(s => ({ id: s.id, ...s.data() }));
        } else {
            const snap = await db.collection('staff_profiles').where('status', '!=', 'inactive').get();
            staffList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        // BARRIÈRE SÉCURITÉ DE BRANCHE : Filtrage selon les droits du manager connecté
        if (callerRole !== 'super_admin') {
            staffList = staffList.filter(staff => adminBranchIds.includes(staff.branchId));
        }

        if (staffList.length === 0) {
            return { csvData: "", filename: `attendance_${startDate}_${endDate}.csv` };
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

                rows.push([
                    escapeCsv(att ? att.id : ''), 
                    escapeCsv(staff.id),          
                    escapeCsv(dateStr),           
                    escapeCsv(displayName),       
                    escapeCsv(att ? formatTime(att.checkInTime) : ''),   
                    escapeCsv(att ? formatTime(att.checkOutTime) : ''),  
                    escapeCsv(att ? formatTime(att.breakStart) : ''),    
                    escapeCsv(att ? formatTime(att.breakEnd) : ''),      
                    escapeCsv(status)             
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