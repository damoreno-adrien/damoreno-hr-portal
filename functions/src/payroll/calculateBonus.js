const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = getFirestore();

// --- NEW: Import our clean, centralized date helpers! ---
const { DateTime, timeZone, safeToDate } = require('../utils/dateHelpers');

exports.calculateBonusHandler = onCall({ region: "asia-southeast1" }, async (request) => { 
    console.log("calculateBonusHandler: Function execution started.");

    // 1. Authentication & Input Validation
    if (!request.auth || !request.data.staffId || !request.data.payPeriod) {
        throw new OnCallHttpsError("invalid-argument", "Authentication, staff ID, and pay period are required.");
    }
    const { staffId, payPeriod } = request.data;
    const { year, month } = payPeriod; 

    if (typeof year !== 'number' || typeof month !== 'number' || month < 1 || month > 12) {
        throw new OnCallHttpsError("invalid-argument", "Invalid pay period provided.");
    }

    try {
        // 2. Fetch Configuration and Staff Data
        const configRef = db.collection("settings").doc("company_config").get();
        const staffProfileRef = db.collection("staff_profiles").doc(staffId).get();
        const [configSnap, staffProfileSnap] = await Promise.all([configRef, staffProfileRef]);

        if (!configSnap.exists) { throw new OnCallHttpsError("not-found", "Company configuration not found."); }
        const bonusRules = configSnap.data().attendanceBonus;
        if (!bonusRules || typeof bonusRules.allowedAbsences !== 'number' || typeof bonusRules.allowedLates !== 'number') {
            throw new OnCallHttpsError("failed-precondition", "Attendance bonus rules are not configured correctly.");
        }

        if (!staffProfileSnap.exists) { throw new OnCallHttpsError("not-found", "Staff profile not found."); }
        const currentStreak = staffProfileSnap.data().bonusStreak || 0;

        // 3. Date Range Calculation (Using our centralized Luxon helper)
        const startOfMonthUtc = DateTime.utc(year, month, 1);
        const startDateStr = startOfMonthUtc.toISODate();
        const endDateStr = startOfMonthUtc.endOf('month').toISODate();

        // 4. Fetch Schedules and Attendance for the Period
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateStr).where("date", "<=", endDateStr);
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateStr).where("date", "<=", endDateStr);

        const [schedulesSnapshot, attendanceSnapshot] = await Promise.all([
            schedulesQuery.get(),
            attendanceQuery.get()
        ]);

        const schedules = schedulesSnapshot.docs.map(doc => doc.data());
        const attendanceRecords = new Map(attendanceSnapshot.docs.map(doc => [doc.data().date, doc.data()]));

        // 5. Calculate Lates and Absences
        let lateCount = 0;
        let absenceCount = 0;

        schedules.forEach(schedule => {
            const attendance = attendanceRecords.get(schedule.date);

            if (!attendance) {
                absenceCount++;
            } else {
                const actualCheckInJS = safeToDate(attendance.checkInTime);
                if (actualCheckInJS && schedule.startTime) {
                    try {
                        const actualCheckInLuxon = DateTime.fromJSDate(actualCheckInJS).setZone(timeZone);
                        const scheduledStartLuxon = DateTime.fromISO(`${schedule.date}T${schedule.startTime}`, { zone: timeZone });

                        if (actualCheckInLuxon > scheduledStartLuxon) { lateCount++; }
                    } catch (parseError) {
                        console.error(`Error parsing schedule start time: ${schedule.date} ${schedule.startTime}`, parseError);
                    }
                }
            }
        });

        // 6. Determine Bonus Amount and New Streak
        let newStreak = 0;
        let bonusAmount = 0;

        if (absenceCount <= bonusRules.allowedAbsences && lateCount <= bonusRules.allowedLates) {
            newStreak = currentStreak + 1;
            if (newStreak === 1) bonusAmount = bonusRules.month1 || 0;
            else if (newStreak === 2) bonusAmount = bonusRules.month2 || 0;
            else bonusAmount = bonusRules.month3 || 0; 
        } else {
            newStreak = 0;
            bonusAmount = 0;
        }

        return { bonusAmount, newStreak };

    } catch (error) {
        console.error(`Error calculating bonus for ${staffId}, Period: ${year}-${month}:`, error);
        if (error instanceof OnCallHttpsError) throw error; 
        throw new OnCallHttpsError("internal", "An unexpected error occurred while calculating the bonus.", error.message);
    }
});