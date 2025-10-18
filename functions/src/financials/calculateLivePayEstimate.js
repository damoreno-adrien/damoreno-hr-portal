const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

exports.calculateLivePayEstimateHandler = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const staffId = request.auth.uid;

    try {
        const today = new Date();
        const year = today.getUTCFullYear();
        const month = today.getUTCMonth(); // 0-indexed
        
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const daysPassed = today.getUTCDate();
        const startDateOfMonthStr = new Date(Date.UTC(year, month, 1)).toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];

        const staffProfileRef = db.collection("staff_profiles").doc(staffId).get();
        const configRef = db.collection("settings").doc("company_config").get();
        const advancesQuery = db.collection("salary_advances").where("staffId", "==", staffId).where("payPeriodYear", "==", year).where("payPeriodMonth", "==", month + 1).where("status", "in", ["approved", "pending"]).get();
        const loansQuery = db.collection("loans").where("staffId", "==", staffId).where("status", "==", "active").get();
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr).get();
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr).get();
        const leaveQuery = db.collection("leave_requests").where("staffId", "==", staffId).where("status", "==", "approved").where("startDate", "<=", todayStr).get();
        const latestPayslipQuery = db.collection("payslips").where("staffId", "==", staffId).orderBy("generatedAt", "desc").limit(1).get();


        const [staffProfileSnap, configSnap, advancesSnap, loansSnap, schedulesSnap, attendanceSnap, leaveSnap, latestPayslipSnap] = await Promise.all([
            staffProfileRef, configRef, advancesQuery, loansQuery, schedulesQuery, attendanceQuery, leaveQuery, latestPayslipQuery
        ]);

        if (!staffProfileSnap.exists) throw new HttpsError("not-found", "Staff profile not found.");
        if (!configSnap.exists) throw new HttpsError("not-found", "Company config not found.");
        
        const staffProfile = staffProfileSnap.data();
        const companyConfig = configSnap.data();
        const latestJob = (staffProfile.jobHistory || []).sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
        
        if (!latestJob || latestJob.payType !== 'Monthly' || !latestJob.rate) {
            throw new HttpsError("failed-precondition", "Pay estimation is only available for monthly salary staff.");
        }

        const baseSalary = latestJob.rate || 0;
        const dailyRate = daysInMonth > 0 ? baseSalary / daysInMonth : 0;

        const advancesAlreadyTaken = advancesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const currentAdvance = advancesSnap.docs.length > 0 ? advancesSnap.docs[0].data() : null;
        
        const activeLoans = loansSnap.docs.map(doc => doc.data());
        const loanRepayment = activeLoans.reduce((sum, loan) => sum + loan.recurringPayment, 0);
        const baseSalaryEarned = dailyRate * daysPassed;
        const bonusRules = companyConfig.attendanceBonus || {};
        const schedules = schedulesSnap.docs.map(doc => doc.data());
        const attendanceRecords = new Map(attendanceSnap.docs.map(doc => [doc.data().date, doc.data()]));
        let lateCount = 0;
        let absenceCount = 0;
        schedules.forEach(schedule => {
            const attendance = attendanceRecords.get(schedule.date);
            if (!attendance) { 
                absenceCount++; 
            } else {
                if (attendance.checkInTime && typeof attendance.checkInTime.toDate === 'function') {
                    const scheduledStart = new Date(`${schedule.date}T${schedule.startTime}`);
                    const actualCheckIn = attendance.checkInTime.toDate();
                    if (actualCheckIn > scheduledStart) {
                        lateCount++;
                    }
                }
            }
        });
        
        let potentialBonus = 0;
        const bonusOnTrack = absenceCount <= (bonusRules.allowedAbsences || 0) && lateCount <= (bonusRules.allowedLates || 0);
        if (bonusOnTrack) {
            const currentStreak = staffProfile.bonusStreak || 0;
            const projectedStreak = currentStreak + 1;
            if (projectedStreak === 1) potentialBonus = bonusRules.month1 || 0;
            else if (projectedStreak === 2) potentialBonus = bonusRules.month2 || 0;
            else potentialBonus = bonusRules.month3 || 0;
        }

        const approvedLeave = leaveSnap.docs.map(doc => doc.data());
        let unpaidAbsencesCount = 0;
        schedules.forEach(schedule => {
            const isOnLeave = approvedLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
            if (!attendanceRecords.has(schedule.date) && !isOnLeave) {
                unpaidAbsencesCount++;
            }
        });
        const absenceDeductions = unpaidAbsencesCount * dailyRate;

        const ssoRate = companyConfig.ssoRate || 0;
        const ssoMax = companyConfig.ssoMaxContribution || 0;
        const ssoDeduction = Math.min(baseSalary * (ssoRate / 100), ssoMax);

        const totalEarnings = baseSalaryEarned + potentialBonus;
        const totalDeductions = absenceDeductions + ssoDeduction + advancesAlreadyTaken + loanRepayment;

        const latestPayslip = latestPayslipSnap.docs.length > 0 ? { id: latestPayslipSnap.docs[0].id, ...latestPayslipSnap.docs[0].data() } : null;

        return {
            baseSalaryEarned: baseSalaryEarned,
            potentialBonus: { amount: potentialBonus, onTrack: bonusOnTrack },
            deductions: { absences: absenceDeductions, socialSecurity: ssoDeduction, salaryAdvances: advancesAlreadyTaken, loanRepayment: loanRepayment },
            activeLoans: activeLoans,
            estimatedNetPay: totalEarnings - totalDeductions,
            currentAdvance: currentAdvance,
            latestPayslip: latestPayslip,
        };

    } catch (error) {
        console.error("Error in calculateLivePayEstimate:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while calculating your pay estimate.", error.message);
    }
});