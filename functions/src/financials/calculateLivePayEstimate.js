const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

let DateTime, Interval;
try {
    const luxon = require('luxon');
    DateTime = luxon.DateTime;
    Interval = luxon.Interval;
} catch(e) { console.error("FAILED to require luxon:", e); }

let parseISO, isValid;
try {
    const dfns = require('date-fns');
    parseISO = dfns.parseISO;
    isValid = dfns.isValid;
} catch (e) { console.error("FAILED to require date-fns:", e); }

const db = getFirestore();
const timeZone = "Asia/Bangkok";

const getCurrentJob = (staffProfile) => {
    const jobHistory = staffProfile.jobHistory || [];
    if (jobHistory.length === 0) return null;
    const latestJob = [...jobHistory].sort((a, b) => {
        const dateA = a.startDate ? (parseISO ? parseISO(a.startDate) : new Date(a.startDate)) : new Date(0);
        const dateB = b.startDate ? (parseISO ? parseISO(b.startDate) : new Date(b.startDate)) : new Date(0);
        return dateB - dateA;
    })[0];
    let type = latestJob.payType;
    if (type === 'Monthly') type = 'Salary';
    return {
        ...latestJob,
        payType: type || 'Salary',
        baseSalary: latestJob.baseSalary ?? (type === 'Salary' ? latestJob.rate : 0),
        hourlyRate: latestJob.hourlyRate ?? (type === 'Hourly' ? latestJob.rate : 0),
        standardDayHours: latestJob.standardDayHours || 8
    };
};

const safeToDate = (value) => {
    if (!value) return null;
    if (typeof value === 'object' && value.toDate) return value.toDate();
    if (typeof value === 'string' && parseISO && isValid) {
        const parsed = parseISO(value);
        return isValid(parsed) ? parsed : null;
    }
    return null;
};

exports.calculateLivePayEstimateHandler = onCall({ region: "asia-southeast1" }, async (request) => {
    if (!DateTime) throw new OnCallHttpsError("internal", "Luxon library not loaded.");
    if (!request.auth) throw new OnCallHttpsError("unauthenticated", "You must be logged in.");
    
    const staffId = request.auth.uid;

    try {
        const nowZoned = DateTime.now().setZone(timeZone);
        const year = nowZoned.year;
        const month = nowZoned.month;
        const startOfMonthDt = nowZoned.startOf('month');
        const startDateOfMonthStr = startOfMonthDt.toISODate();
        
        // Calculate "Yesterday" to avoid checking incomplete today
        const yesterdayZoned = nowZoned.minus({ days: 1 });
        const yesterdayStr = yesterdayZoned.toISODate();
        
        // Days passed for pro-rata (up to yesterday)
        const daysPassed = Math.max(0, nowZoned.day - 1);

        const [
            staffProfileRes, configRes, advancesRes, loansRes, attendanceRes, schedulesRes, leaveRes, latestPayslipRes
        ] = await Promise.all([
            db.collection("staff_profiles").doc(staffId).get(),
            db.collection("settings").doc("company_config").get(),
            db.collection("salary_advances").where("staffId", "==", staffId).where("payPeriodYear", "==", year).where("payPeriodMonth", "==", month).get(),
            db.collection("loans").where("staffId", "==", staffId).where("status", "==", "active").get(),
            db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", yesterdayStr).get(),
            db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", yesterdayStr).get(),
            db.collection("leave_requests").where("staffId", "==", staffId).where("status", "==", "approved").where("endDate", ">=", startDateOfMonthStr).get(),
            db.collection("payslips").where("staffId", "==", staffId).orderBy("generatedAt", "desc").limit(1).get()
        ]);

        if (!staffProfileRes.exists) throw new OnCallHttpsError("not-found", "Staff profile not found.");
        if (!configRes.exists) throw new OnCallHttpsError("not-found", "Company config not found.");

        const staffProfile = staffProfileRes.data();
        const config = configRes.data();
        const job = getCurrentJob(staffProfile);

        if (!job) throw new OnCallHttpsError("failed-precondition", "No job history found.");

        // Base Pay
        let earnedPay = 0;
        let deductionRate = 0;
        let hourlyRateForOT = 0;

        if (job.payType === 'Salary') {
            const monthlySalary = job.baseSalary || 0;
            // Rule of 30
            earnedPay = (monthlySalary / 30) * daysPassed;
            deductionRate = monthlySalary / 30; 
            hourlyRateForOT = (monthlySalary / 30) / (job.standardDayHours || 8);
        } else {
            const hourlyRate = job.hourlyRate || 0;
            let totalMinutesWorked = 0;
            attendanceRes.docs.forEach(doc => {
                const d = doc.data();
                if (d.checkInTime && d.checkOutTime) {
                    const start = d.checkInTime.toDate();
                    const end = d.checkOutTime.toDate();
                    const duration = (end - start) / (1000 * 60);
                    let breakMins = 0;
                    if (d.breakStart && d.breakEnd) {
                        breakMins = (d.breakEnd.toDate() - d.breakStart.toDate()) / (1000 * 60);
                    }
                    totalMinutesWorked += Math.max(0, duration - breakMins);
                }
            });
            earnedPay = (totalMinutesWorked / 60) * hourlyRate;
        }

        // OT Pay
        let overtimePay = 0;
        if (job.payType === 'Salary') {
            const otMultiplier = config.overtimeRate || 1.0;
            let totalOtMinutes = 0;
            attendanceRes.docs.forEach(doc => {
                const d = doc.data();
                if (d.otStatus === 'approved') {
                    totalOtMinutes += (d.otApprovedMinutes || 0);
                }
            });
            overtimePay = (totalOtMinutes / 60) * hourlyRateForOT * otMultiplier;
        }

        // Absences
        let absenceCount = 0;
        let lateCount = 0;
        const schedules = schedulesRes.docs.map(d => d.data());
        const attendanceMap = new Map(attendanceRes.docs.map(d => [d.data().date, d.data()]));
        const approvedLeaves = leaveRes.docs.map(d => d.data());
        const publicHolidays = config.publicHolidays?.map(h => h.date) || [];

        schedules.forEach(schedule => {
            const att = attendanceMap.get(schedule.date);
            const isOnLeave = approvedLeaves.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
            const isHoliday = publicHolidays.includes(schedule.date);

            // --- FIX: Check if it was actually a WORK shift ---
            // Previously, this counted 'Day Off' schedules as absences if there was no attendance.
            if (!att && !isOnLeave && !isHoliday && schedule.type === 'work') {
                absenceCount++;
            } else if (att && att.checkInTime && schedule.startTime) {
                 // (Strict late check)
                 const actualCheckInJS = safeToDate(att.checkInTime);
                 if (actualCheckInJS) {
                     try {
                         const checkIn = DateTime.fromJSDate(actualCheckInJS).setZone(timeZone);
                         const scheduled = DateTime.fromISO(`${schedule.date}T${schedule.startTime}`, { zone: timeZone });
                         if (checkIn > scheduled) { 
                             lateCount++;
                         }
                     } catch (e) { console.error(e); }
                 }
            }
        });

        // Bonus
        let potentialBonus = 0;
        const bonusRules = config.attendanceBonus || {};
        const bonusOnTrack = absenceCount <= (bonusRules.allowedAbsences || 0) && lateCount <= (bonusRules.allowedLates || 0);
        
        if (bonusOnTrack && staffProfile.isAttendanceBonusEligible !== false) {
            const streak = (staffProfile.bonusStreak || 0) + 1;
            if (streak === 1) potentialBonus = bonusRules.month1 || 0;
            else if (streak === 2) potentialBonus = bonusRules.month2 || 0;
            else potentialBonus = bonusRules.month3 || 0;
        }

        // Deductions
        const absenceDeductionAmount = absenceCount * deductionRate;
        const allAdvances = advancesRes.docs.map(d => d.data()).sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        const approvedAdvancesTotal = allAdvances
            .filter(a => a.status === 'approved')
            .reduce((sum, a) => sum + a.amount, 0);
        const loans = loansRes.docs.reduce((sum, d) => sum + (d.data().monthlyRepayment || 0), 0);
        
        const ssoRate = (config.ssoRate || 5) / 100;
        const ssoCap = config.ssoCap || 750;
        const estimatedTotalEarnings = earnedPay + overtimePay + potentialBonus;
        const ssoDeduction = Math.min(Math.max(1650, estimatedTotalEarnings) * ssoRate, ssoCap);
        const ssoAllowance = ssoDeduction;

        const totalDeductions = absenceDeductionAmount + approvedAdvancesTotal + loans + ssoDeduction;
        const estimatedNet = (earnedPay + overtimePay + potentialBonus + ssoAllowance) - totalDeductions;

        return {
            contractDetails: {
                payType: job.payType,
                baseSalary: job.baseSalary,
                hourlyRate: job.hourlyRate,
                standardHours: job.standardDayHours
            },
            baseSalaryEarned: earnedPay,
            overtimePay: overtimePay, 
            potentialBonus: { amount: potentialBonus, onTrack: bonusOnTrack },
            ssoAllowance: ssoAllowance,
            deductions: { 
                absences: absenceDeductionAmount, 
                socialSecurity: ssoDeduction, 
                salaryAdvances: approvedAdvancesTotal, 
                loanRepayment: loans 
            },
            estimatedNetPay: Math.max(0, estimatedNet),
            monthAdvances: allAdvances,
            activeLoans: loansRes.docs.map(d => d.data()), 
            latestPayslip: latestPayslipRes.docs[0]?.data() || null
        };

    } catch (error) {
        console.error("Error in calculateLivePayEstimate:", error);
        throw new OnCallHttpsError("internal", error.message);
    }
});