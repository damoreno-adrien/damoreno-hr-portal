const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

exports.calculateBonusHandler = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth || !request.data.staffId || !request.data.payPeriod) { throw new HttpsError("invalid-argument", "Required data is missing."); }
    const { staffId, payPeriod } = request.data;
    const { year, month } = payPeriod; // month is 1-indexed here
    try {
        const configDoc = await db.collection("settings").doc("company_config").get();
        if (!configDoc.exists) throw new HttpsError("not-found", "Company config not found.");
        const bonusRules = configDoc.data().attendanceBonus;
        const staffProfileDoc = await db.collection("staff_profiles").doc(staffId).get();
        if (!staffProfileDoc.exists) throw new HttpsError("not-found", "Staff profile not found.");
        const currentStreak = staffProfileDoc.data().bonusStreak || 0;

        const startDate = new Date(Date.UTC(year, month - 1, 1)).toISOString().split('T')[0];
        const endDate = new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0];

        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDate).where("date", "<=", endDate);
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDate).where("date", "<=", endDate);
        const [schedulesSnapshot, attendanceSnapshot] = await Promise.all([schedulesQuery.get(), attendanceQuery.get()]);
        const schedules = schedulesSnapshot.docs.map(doc => doc.data());
        const attendanceRecords = new Map(attendanceSnapshot.docs.map(doc => [doc.data().date, doc.data()]));
        let lateCount = 0;
        let absenceCount = 0;
        schedules.forEach(schedule => {
            const attendance = attendanceRecords.get(schedule.date);
            if (!attendance) { absenceCount++; }
            else {
                 if (attendance.checkInTime && typeof attendance.checkInTime.toDate === 'function') {
                    const scheduledStart = new Date(`${schedule.date}T${schedule.startTime}`);
                    const actualCheckIn = attendance.checkInTime.toDate();
                    if (actualCheckIn > scheduledStart) { lateCount++; }
                 }
            }
        });
        let newStreak = 0;
        let bonusAmount = 0;
        if (absenceCount <= bonusRules.allowedAbsences && lateCount <= bonusRules.allowedLates) {
            newStreak = currentStreak + 1;
            if (newStreak === 1) bonusAmount = bonusRules.month1;
            else if (newStreak === 2) bonusAmount = bonusRules.month2;
            else bonusAmount = bonusRules.month3;
        }
        return { bonusAmount, newStreak };
    } catch (error) {
        console.error("Error calculating bonus:", error);
        throw new HttpsError("internal", "An error occurred while calculating the bonus.", error.message);
    }
});