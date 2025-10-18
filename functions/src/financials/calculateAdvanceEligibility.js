const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

exports.calculateAdvanceEligibilityHandler = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) { throw new HttpsError("unauthenticated", "You must be logged in to perform this action."); }
    const staffId = request.auth.uid;
    try {
        const today = new Date();
        const year = today.getUTCFullYear();
        const month = today.getUTCMonth(); // 0-indexed
        
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const startDateOfMonthStr = new Date(Date.UTC(year, month, 1)).toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];
        
        const staffProfileDoc = await db.collection("staff_profiles").doc(staffId).get();
        if (!staffProfileDoc.exists) throw new HttpsError("not-found", "Staff profile could not be found.");
        
        const jobHistory = staffProfileDoc.data().jobHistory || [];
        const latestJob = jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
        if (!latestJob || latestJob.payType !== 'Monthly' || !latestJob.rate) { throw new HttpsError("failed-precondition", "This feature is only for monthly salary staff."); }
        
        const baseSalary = latestJob.rate;
        const dailyRate = baseSalary / daysInMonth;
        
        const configDoc = await db.collection("settings").doc("company_config").get();
        const companyConfig = configDoc.exists ? configDoc.data() : {};
        const publicHolidays = companyConfig.publicHolidays ? companyConfig.publicHolidays.map(h => h.date) : [];
        
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr);
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr);
        const leaveQuery = db.collection("leave_requests").where("staffId", "==", staffId).where("status", "==", "approved").where("startDate", "<=", todayStr);
        
        const advancesQuery = db.collection("salary_advances")
            .where("staffId", "==", staffId)
            .where("payPeriodYear", "==", year)
            .where("payPeriodMonth", "==", month + 1)
            .where("status", "in", ["approved", "pending"]);

        const [schedulesSnap, attendanceSnap, leaveSnap, advancesSnap] = await Promise.all([
            schedulesQuery.get(), 
            attendanceQuery.get(), 
            leaveQuery.get(),
            advancesQuery.get()
        ]);
        
        const schedules = schedulesSnap.docs.map(doc => doc.data());
        const attendanceDates = new Set(attendanceSnap.docs.map(doc => doc.data().date));
        const approvedLeave = leaveSnap.docs.map(doc => doc.data());

        let unpaidAbsences = 0;
        schedules.forEach(schedule => {
            const isPublicHoliday = publicHolidays.includes(schedule.date);
            const isOnLeave = approvedLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
            const didAttend = attendanceDates.has(schedule.date);
            if (!didAttend && !isOnLeave && !isPublicHoliday) { unpaidAbsences++; }
        });
        
        const absenceDeductions = dailyRate * unpaidAbsences;
        const currentSalaryDue = Math.max(0, baseSalary - absenceDeductions);
        
        const advancePercentage = companyConfig.advanceEligibilityPercentage || 50;
        const maxTheoreticalAdvance = Math.floor(currentSalaryDue * (advancePercentage / 100));

        const advancesAlreadyTaken = advancesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const availableAdvance = Math.max(0, maxTheoreticalAdvance - advancesAlreadyTaken);
        
        return { 
            maxAdvance: availableAdvance,
            currentSalaryDue, 
            baseSalary, 
            absenceDeductions, 
            unpaidAbsences,
            maxTheoreticalAdvance,
            advancesAlreadyTaken
        };
    } catch (error) {
        console.error("Error in calculateAdvanceEligibility:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred.", error.message);
    }
});