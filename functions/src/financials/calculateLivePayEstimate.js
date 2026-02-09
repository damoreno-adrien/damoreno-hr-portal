/* functions/src/financials/calculateLivePayEstimate.js */

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

let DateTime;
try {
    const luxon = require('luxon');
    DateTime = luxon.DateTime;
} catch(e) { console.error("Luxon failed"); }

const db = getFirestore();
const timeZone = "Asia/Bangkok";

const getCurrentJob = (staffProfile) => {
    const jobHistory = staffProfile.jobHistory || [];
    if (jobHistory.length === 0) return null;
    return [...jobHistory].sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
};

exports.calculateLivePayEstimateHandler = onCall({ region: "asia-southeast1" }, async (request) => {
    if (!DateTime) throw new OnCallHttpsError("internal", "Luxon dependency not loaded.");
    if (!request.auth) throw new OnCallHttpsError("unauthenticated", "User must be logged in.");

    const staffId = request.auth.uid;
    const nowZoned = DateTime.now().setZone(timeZone);
    const startOfMonth = nowZoned.startOf('month');
    const endOfMonth = nowZoned.endOf('month');
    
    const startStr = startOfMonth.toISODate();
    const endStr = endOfMonth.toISODate();

    try {
        const [staffProfileRes, configRes, attendanceRes, leaveRes, schedulesRes, advancesRes, loansRes] = await Promise.all([
            db.collection("staff_profiles").doc(staffId).get(),
            db.collection("settings").doc("company_config").get(),
            db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startStr).where("date", "<=", endStr).get(),
            db.collection("leave_requests").where("staffId", "==", staffId).where("status", "==", "approved").where("endDate", ">=", startStr).get(),
            db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startStr).where("date", "<=", endStr).get(),
            db.collection("salary_advances").where("staffId", "==", staffId).where("status", "==", "approved").where("date", ">=", startStr).get(),
            db.collection("loans").where("staffId", "==", staffId).where("status", "==", "active").get()
        ]);

        if (!staffProfileRes.exists) throw new OnCallHttpsError("not-found", "Staff profile not found.");

        const staff = staffProfileRes.data();
        const config = configRes.data() || {};
        const job = getCurrentJob(staff);
        if (!job) throw new OnCallHttpsError("failed-precondition", "No job history found.");

        // --- 1. ROBUST RATE CALCULATION (Fixed 0 THB Issue) ---
        const payType = (job.payType || '').trim().toLowerCase();
        const isMonthly = (payType === 'salary' || payType === 'monthly');
        const baseSalary = Number(job.baseSalary) || 0;
        
        let hourlyRate = 0;
        if (isMonthly) {
            const standardHours = Number(job.standardDayHours) || 9; 
            // Monthly Rate = Salary / 30 days / Standard Hours (e.g. 9)
            hourlyRate = (baseSalary / 30) / standardHours;
        } else {
            hourlyRate = Number(job.hourlyRate) || 0;
        }

        // --- 2. BUILD DATA MAPS ---
        const attendanceMap = {}; 
        attendanceRes.docs.forEach(doc => { const d = doc.data(); attendanceMap[d.date] = d; });

        const approvedLeaveDates = new Set();
        leaveRes.docs.forEach(doc => {
            const data = doc.data();
            let curr = DateTime.fromISO(data.startDate);
            const end = DateTime.fromISO(data.endDate);
            while (curr <= end) { approvedLeaveDates.add(curr.toISODate()); curr = curr.plus({ days: 1 }); }
        });

        // --- 3. CALCULATE EARNINGS & ABSENCES ---
        let earnings = 0;
        let absenceDeduction = 0;
        let absenceHours = 0;
        let workedMinutes = 0;

        if (isMonthly) {
            // Monthly Staff: Start with accrued salary, then deduct absences
            const daysPassed = Math.max(0, nowZoned.day); 
            earnings = (baseSalary / 30) * daysPassed;

            // CHECK SCHEDULES FOR ABSENCES
            schedulesRes.docs.forEach(doc => {
                const shift = doc.data();
                if (shift.date >= nowZoned.toISODate()) return; // Don't deduct future days

                const isAbsent = shift.startTime && !attendanceMap[shift.date] && !approvedLeaveDates.has(shift.date);
                const isRecordedAbsent = attendanceMap[shift.date] && (attendanceMap[shift.date].status === 'absent' || attendanceMap[shift.date].status === 'no-show');

                if (isAbsent || isRecordedAbsent) {
                    const start = DateTime.fromISO(`${shift.date}T${shift.startTime}`);
                    const end = DateTime.fromISO(`${shift.date}T${shift.endTime}`);
                    let shiftHours = end.diff(start, 'hours').hours;
                    if (shiftHours < 0) shiftHours += 24; 

                    // Break Logic: If they missed the shift, they missed the work hours (Total - Break)
                    const breakHours = (shift.includesBreak !== false && shiftHours >= 6) ? 1 : 0;
                    const netMissedHours = Math.max(0, shiftHours - breakHours);

                    absenceHours += netMissedHours;
                    absenceDeduction += (netMissedHours * hourlyRate);
                }
            });

        } else {
            // Hourly Staff: Only paid for tracked time
            Object.values(attendanceMap).forEach(d => {
                if (d.checkInTime && d.checkOutTime) {
                    const duration = (d.checkOutTime.toDate() - d.checkInTime.toDate()) / 60000;
                    const includesBreak = d.includesBreak !== false;
                    let breakMins = (includesBreak && duration >= 420) ? 60 : 0;
                    workedMinutes += Math.max(0, duration - breakMins);
                }
            });
            earnings = (workedMinutes / 60) * hourlyRate;
        }

        // --- 4. OVERTIME & EXTRAS ---
        // Note: This relies on 'approvedOTMinutes' being updated in the staff_profile by your Overtime Approval system.
        const overtimePay = ((staff.approvedOTMinutes || 0) / 60) * hourlyRate * 1.5;

        // Bonus Check
        const totalLates = Object.values(attendanceMap).filter(d => d.status === 'Late').length;
        const bonusConfig = config.attendanceBonus || {};
        const bonusOnTrack = totalLates <= (bonusConfig.allowedLates || 3) && absenceHours === 0;
        
        let potentialBonus = 0;
        if (bonusOnTrack && staff.isAttendanceBonusEligible !== false) {
            const nextStreak = (staff.bonusStreak || 0) + 1;
            if (nextStreak === 1) potentialBonus = bonusConfig.month1 || 400;
            else if (nextStreak === 2) potentialBonus = bonusConfig.month2 || 800;
            else potentialBonus = bonusConfig.month3 || 1200;
        }

        // --- 5. FINAL DEDUCTIONS ---
        const advancesTotal = advancesRes.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
        const loansTotal = loansRes.docs.reduce((sum, d) => sum + (d.data().monthlyInstallment || 0), 0);
        const ssoRate = (config.financialRules?.ssoRate || 5) / 100;
        const estimatedGross = earnings + overtimePay + potentialBonus;
        const ssoDeduction = Math.min(Math.max(1650, estimatedGross) * ssoRate, 750);

        const estimatedNet = estimatedGross - (absenceDeduction + advancesTotal + loansTotal + ssoDeduction);

        return {
            contractDetails: {
                payType: job.payType,
                baseSalary: baseSalary,
                hourlyRate: hourlyRate,
            },
            baseSalaryEarned: Math.round(earnings),
            overtimePay: Math.round(overtimePay), 
            potentialBonus: { amount: potentialBonus, onTrack: bonusOnTrack },
            deductions: { 
                absences: Math.round(absenceDeduction), // Should now be non-zero
                absenceHours: absenceHours,
                socialSecurity: Math.round(ssoDeduction), 
                salaryAdvances: advancesTotal, 
                loanRepayment: loansTotal 
            },
            estimatedNetPay: Math.max(0, Math.round(estimatedNet)),
            activeLoans: loansRes.docs.map(d => d.data())
        };

    } catch (error) {
        console.error("Error calculating live pay:", error);
        throw new OnCallHttpsError("internal", error.message);
    }
});