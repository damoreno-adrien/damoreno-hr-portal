const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

let DateTime, Interval;
try {
    const luxon = require('luxon');
    DateTime = luxon.DateTime;
    Interval = luxon.Interval;
} catch(e) {
    console.error("FAILED to require luxon:", e);
    // Throwing error during initialization might prevent deployment or detailed logging
}

let getYear, getMonth, getDate, getDaysInMonth, startOfMonth, parseISO, isValid;
try {
    const dfns = require('date-fns');
    getYear = dfns.getYear;
    getMonth = dfns.getMonth;
    getDate = dfns.getDate;
    getDaysInMonth = dfns.getDaysInMonth;
    startOfMonth = dfns.startOfMonth;
    parseISO = dfns.parseISO;
    isValid = dfns.isValid;
} catch (e) {
    console.error("FAILED to require date-fns:", e);
}

const db = getFirestore();
const timeZone = "Asia/Bangkok";

const safeToDate = (value) => {
    if (!value) return null;
    if (typeof value === 'object' && value !== null && typeof value.toDate === 'function' && typeof value.nanoseconds === 'number') {
        try { return value.toDate(); }
        catch (e) { console.error("safeToDate - Error calling .toDate() on potential Timestamp:", value, e); return null; }
    }
    try {
        if (value instanceof Date && !isNaN(value)) {
            return value;
        }
    } catch(e) { console.error("safeToDate - Error during 'instanceof Date' check:", e); }
    if (typeof value === 'string') {
        if (parseISO && isValid) {
            const parsed = parseISO(value);
            if (isValid(parsed)) {
                return parsed;
            }
        } else {
             console.error("safeToDate - date-fns functions not loaded, cannot parse string.");
        }
    }
    console.warn("safeToDate - Could not convert value to Date:", value);
    return null;
};

exports.calculateLivePayEstimateHandler = onCall({ region: "asia-southeast1" }, async (request) => {
    console.log("calculateLivePayEstimateHandler: Function execution started.");
    console.log("calculateLivePayEstimateHandler: Auth context:", JSON.stringify(request.auth || null));

    if (!DateTime || !Interval) {
        console.error("CRITICAL: Luxon library not loaded!");
        throw new OnCallHttpsError("internal", "Date/Time library failed to load (luxon).");
    }
     if (!getYear || !getMonth || !getDate || !getDaysInMonth || !startOfMonth || !parseISO || !isValid) {
         console.error("CRITICAL: date-fns functions not loaded!");
         throw new OnCallHttpsError("internal", "Core Date library failed to load.");
     }

    if (!request.auth) {
         console.error("calculateLivePayEstimateHandler: Unauthenticated access attempt.");
         throw new OnCallHttpsError("unauthenticated", "You must be logged in to perform this action.");
     }
    const staffId = request.auth.uid;
    console.log(`calculateLivePayEstimateHandler: Processing request for staffId: ${staffId}`);

    try {
        console.log("calculateLivePayEstimateHandler: Inside try block, fetching data...");

        const nowZoned = DateTime.now().setZone(timeZone);
        const year = nowZoned.year;
        const month = nowZoned.month;
        const daysInMonth = nowZoned.daysInMonth;
        const daysPassed = nowZoned.day;
        const startOfMonthDt = nowZoned.startOf('month');
        const startDateOfMonthStr = startOfMonthDt.toISODate();
        const todayStr = nowZoned.toISODate();

        console.log(`calculateLivePayEstimateHandler: Fetching data for ${staffId} between ${startDateOfMonthStr} and ${todayStr}`);
        const staffProfileRef = db.collection("staff_profiles").doc(staffId).get();
        const configRef = db.collection("settings").doc("company_config").get();
        const advancesQuery = db.collection("salary_advances").where("staffId", "==", staffId).where("payPeriodYear", "==", year).where("payPeriodMonth", "==", month).where("status", "in", ["approved", "pending"]).get();
        const loansQuery = db.collection("loans").where("staffId", "==", staffId).where("status", "==", "active").get();
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr).get();
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr).get();
        const leaveQuery = db.collection("leave_requests").where("staffId", "==", staffId).where("status", "==", "approved").where("endDate", ">=", startDateOfMonthStr).get();
        const latestPayslipQuery = db.collection("payslips").where("staffId", "==", staffId).orderBy("generatedAt", "desc").limit(1).get();

        const results = await Promise.allSettled([
            staffProfileRef, configRef, advancesQuery, loansQuery, schedulesQuery, attendanceQuery, leaveQuery, latestPayslipQuery
        ]);

        const [staffProfileRes, configRes, advancesRes, loansRes, schedulesRes, attendanceRes, leaveRes, latestPayslipRes] = results;

        console.log("Promise.allSettled Results:", JSON.stringify(results.map(r => r.status)));

        if (staffProfileRes.status === 'rejected') {
            console.error("Failed to fetch staff profile:", staffProfileRes.reason);
            throw new OnCallHttpsError("internal", "Failed to fetch staff profile.", staffProfileRes.reason?.message);
        }
        if (configRes.status === 'rejected') {
            console.error("Failed to fetch company config:", configRes.reason);
            throw new OnCallHttpsError("internal", "Failed to fetch company config.", configRes.reason?.message);
        }
        if (advancesRes.status === 'rejected') { console.error("Failed to fetch advances:", advancesRes.reason); }
        if (loansRes.status === 'rejected') { console.error("Failed to fetch loans:", loansRes.reason); }
        if (schedulesRes.status === 'rejected') { console.error("Failed to fetch schedules:", schedulesRes.reason); throw new OnCallHttpsError("internal", "Failed to fetch schedules.", schedulesRes.reason?.message); }
        if (attendanceRes.status === 'rejected') { console.error("Failed to fetch attendance:", attendanceRes.reason); throw new OnCallHttpsError("internal", "Failed to fetch attendance.", attendanceRes.reason?.message); }
        if (leaveRes.status === 'rejected') { console.error("Failed to fetch leave requests:", leaveRes.reason); }
        if (latestPayslipRes.status === 'rejected') { console.error("Failed to fetch latest payslip:", latestPayslipRes.reason); }

        const staffProfileSnap = staffProfileRes.value;
        const configSnap = configRes.value;
        const advancesSnap = advancesRes.status === 'fulfilled' ? advancesRes.value : { docs: [] };
        const loansSnap = loansRes.status === 'fulfilled' ? loansRes.value : { docs: [] };
        const schedulesSnap = schedulesRes.value;
        const attendanceSnap = attendanceRes.value;
        const leaveSnap = leaveRes.status === 'fulfilled' ? leaveRes.value : { docs: [] };
        const latestPayslipSnap = latestPayslipRes.status === 'fulfilled' ? latestPayslipRes.value : { docs: [] };

        console.log("calculateLivePayEstimateHandler: Firestore fetches processed.");

        if (!staffProfileSnap.exists) { throw new OnCallHttpsError("not-found", "Staff profile not found."); }
        if (!configSnap.exists) { throw new OnCallHttpsError("not-found", "Company config not found."); }

        const staffProfile = staffProfileSnap.data();
        const companyConfig = configSnap.data();
        console.log("calculateLivePayEstimateHandler: Profile and config loaded.");

        const jobHistory = staffProfile.jobHistory || [];
        const latestJob = [...jobHistory].sort((a, b) => {
            const dateA = a.startDate ? parseISO(a.startDate) : new Date(0);
            const dateB = b.startDate ? parseISO(b.startDate) : new Date(0);
            const timeA = !isNaN(dateA) ? dateA.getTime() : 0;
            const timeB = !isNaN(dateB) ? dateB.getTime() : 0;
            return timeB - timeA;
         })[0];

        if (!latestJob || latestJob.payType !== 'Monthly' || !latestJob.rate) { throw new OnCallHttpsError("failed-precondition", "Pay estimation is only available for monthly salary staff."); }
        console.log("calculateLivePayEstimateHandler: Latest job identified:", latestJob);

        const baseSalary = latestJob.rate || 0;
        const dailyRate = daysInMonth > 0 ? baseSalary / daysInMonth : 0;
        const advancesAlreadyTaken = advancesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const currentAdvance = advancesSnap.docs.length > 0 ? advancesSnap.docs.sort((a, b) => (b.data().createdAt?.toMillis() || 0) - (a.data().createdAt?.toMillis() || 0))[0].data() : null;
        const activeLoans = loansSnap.docs.map(doc => doc.data());
        const loanRepayment = activeLoans.reduce((sum, loan) => sum + (loan.monthlyRepayment || loan.recurringPayment || 0), 0);
        const baseSalaryEarned = dailyRate * daysPassed;
        const bonusRules = companyConfig.attendanceBonus || {};
        const schedules = schedulesSnap.docs.map(doc => doc.data());
        const attendanceRecords = new Map(attendanceSnap.docs.map(doc => [doc.data().date, doc.data()]));
        const approvedLeave = leaveSnap.docs.map(doc => doc.data()).filter(l => l.startDate <= todayStr);
        let lateCount = 0;
        let absenceCount = 0;
        let unpaidAbsencesCount = 0;
        const publicHolidays = companyConfig.publicHolidays ? companyConfig.publicHolidays.map(h => h.date) : [];

        schedules.forEach(schedule => {
             if (schedule.date > todayStr) return;
             const attendance = attendanceRecords.get(schedule.date);
             const isOnLeave = approvedLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
             const isPublicHoliday = publicHolidays.includes(schedule.date);
             if (!attendance) {
                  if (!isOnLeave && !isPublicHoliday) { absenceCount++; unpaidAbsencesCount++; }
             } else {
                 const actualCheckInJS = safeToDate(attendance.checkInTime);
                 if (actualCheckInJS && schedule.startTime) {
                     try {
                         const actualCheckInLuxon = DateTime.fromJSDate(actualCheckInJS).setZone(timeZone);
                         const scheduledStartLuxon = DateTime.fromISO(`${schedule.date}T${schedule.startTime}`, { zone: timeZone });
                         if (actualCheckInLuxon > scheduledStartLuxon) {
                             lateCount++;
                         }
                     } catch (parseError) { console.error(`Error parsing schedule start time for late check with Luxon: ${schedule.date} ${schedule.startTime}`, parseError); }
                 }
             }
         });

        let potentialBonus = 0;
        const bonusOnTrack = absenceCount <= (bonusRules.allowedAbsences ?? 0) && lateCount <= (bonusRules.allowedLates ?? 0);
        if (bonusOnTrack) {
            const currentStreak = staffProfile.bonusStreak || 0;
            const projectedStreak = currentStreak + 1;
            if (projectedStreak === 1) potentialBonus = bonusRules.month1 || 0;
            else if (projectedStreak === 2) potentialBonus = bonusRules.month2 || 0;
            else potentialBonus = bonusRules.month3 || 0;
        }

        const absenceDeductions = unpaidAbsencesCount * dailyRate;
        const ssoRatePercent = companyConfig.ssoRate || 0;
        const ssoCapAmount = companyConfig.ssoCap || 0;
        const ssoDeduction = Math.min(baseSalary * (ssoRatePercent / 100), ssoCapAmount);
        const totalEstimatedEarnings = baseSalaryEarned + potentialBonus;
        const totalEstimatedDeductions = absenceDeductions + ssoDeduction + advancesAlreadyTaken + loanRepayment;
        const estimatedNetPay = totalEstimatedEarnings - totalEstimatedDeductions;
        const latestPayslipDoc = latestPayslipSnap.docs.length > 0 ? latestPayslipSnap.docs[0] : null;
        const latestPayslip = latestPayslipDoc ? { id: latestPayslipDoc.id, ...latestPayslipDoc.data() } : null;

        console.log(`calculateLivePayEstimateHandler: Calculation complete for ${staffId}. Est Net: ${estimatedNetPay}`);

        return {
            baseSalaryEarned: baseSalaryEarned,
            potentialBonus: { amount: potentialBonus, onTrack: bonusOnTrack },
            deductions: { absences: absenceDeductions, socialSecurity: ssoDeduction, salaryAdvances: advancesAlreadyTaken, loanRepayment: loanRepayment },
            activeLoans: activeLoans,
            estimatedNetPay: estimatedNetPay,
            currentAdvance: currentAdvance,
            latestPayslip: latestPayslip,
        };

    } catch (error) {
        console.error(`Error in calculateLivePayEstimate for ${staffId}:`, error);
        if (error instanceof OnCallHttpsError) throw error;
        throw new OnCallHttpsError("internal", "An unexpected error occurred while calculating your pay estimate.", error.message);
    }
});