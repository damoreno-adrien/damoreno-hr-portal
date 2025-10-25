const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

// *** REMOVE date-fns-tz require block completely ***
/*
console.log("Attempting to require date-fns-tz...");
let utcToZonedTime, formatTZ, zonedTimeToUtc;
try { ... } catch (e) { ... }
*/

// *** Log BEFORE requiring date-fns ***
console.log("Attempting to require date-fns...");
let getYear, getMonth, getDate, getDaysInMonth, startOfMonth, parseISO, isValid, formatDFNS; // Keep formatDFNS
try {
    const dfns = require('date-fns');
    getYear = dfns.getYear;
    getMonth = dfns.getMonth;
    getDate = dfns.getDate;
    getDaysInMonth = dfns.getDaysInMonth;
    startOfMonth = dfns.startOfMonth;
    parseISO = dfns.parseISO;
    isValid = dfns.isValid;
    formatDFNS = dfns.format; // Keep format from date-fns
    console.log("Successfully required date-fns.");
} catch (e) {
    console.error("FAILED to require date-fns:", e);
    // Let the check below handle it
}
// *** End Logging Block ***


const db = getFirestore();
// const timeZone = "Asia/Bangkok"; // No longer used in this version

// ...(safeToDate function remains the same)...
const safeToDate = (value) => { /* ... same as previous ... */ };

exports.calculateLivePayEstimateHandler = onCall({ region: "asia-southeast1" }, async (request) => {
    console.log("calculateLivePayEstimateHandler: Function execution started.");
    console.log("calculateLivePayEstimateHandler: Auth context:", JSON.stringify(request.auth || null));

    // *** REMOVE the date-fns-tz check ***
    /*
    if (!utcToZonedTime || !formatTZ || !zonedTimeToUtc) { ... }
    */

    // Ensure date-fns functions are loaded
     if (!getYear || !getMonth || !getDate || !getDaysInMonth || !startOfMonth || !parseISO || !isValid || !formatDFNS) {
         console.error("CRITICAL: date-fns functions not loaded!");
         throw new OnCallHttpsError("internal", "Core Date library failed to load.");
     }

    if (!request.auth) { /* ... error handling ... */ }
    const staffId = request.auth.uid;
    console.log(`calculateLivePayEstimateHandler: Processing request for staffId: ${staffId}`);

    try {
        console.log("calculateLivePayEstimateHandler: Inside try block, fetching data...");

        // --- Use Basic Date Handling (NO Timezone) ---
        const nowUtc = new Date();
        const nowZoned = nowUtc; // Use UTC directly

        const year = getYear(nowZoned); // Use date-fns
        const monthIndex = getMonth(nowZoned); // Use date-fns
        const month = monthIndex + 1;
        const daysInMonth = getDaysInMonth(nowZoned); // Use date-fns
        const daysPassed = getDate(nowZoned); // Use date-fns
        const startOfMonthDate = startOfMonth(nowZoned); // Use date-fns
        // Use basic format from date-fns (no timezone option)
        const startDateOfMonthStr = formatDFNS(startOfMonthDate, 'yyyy-MM-dd');
        const todayStr = formatDFNS(nowZoned, 'yyyy-MM-dd');
        // --- End Basic Date Handling ---

        // --- Parallel Firestore Fetches ---
        // ...(Fetches remain the same)...
        console.log(`calculateLivePayEstimateHandler: Fetching data for ${staffId} between ${startDateOfMonthStr} and ${todayStr}`);
        // ...(Promise.all remains the same)...
        const [staffProfileSnap, configSnap, advancesSnap, loansSnap, schedulesSnap, attendanceSnap, leaveSnap, latestPayslipSnap] = await Promise.all([ /* ...promises... */ ]);
        console.log("calculateLivePayEstimateHandler: Firestore fetches completed.");

        if (!staffProfileSnap.exists) { throw new OnCallHttpsError("not-found", "Staff profile not found."); }
        if (!configSnap.exists) { throw new OnCallHttpsError("not-found", "Company config not found."); }

        const staffProfile = staffProfileSnap.data();
        const companyConfig = configSnap.data();
        console.log("calculateLivePayEstimateHandler: Profile and config loaded.");

        // --- Standardized Job History Sorting ---
        // ...(Job history sorting remains the same)...
        const jobHistory = staffProfile.jobHistory || [];
        const latestJob = [...jobHistory].sort((a, b) => { const dateA = a.startDate ? parseISO(a.startDate) : new Date(0); const dateB = b.startDate ? parseISO(b.startDate) : new Date(0); const timeA = !isNaN(dateA) ? dateA.getTime() : 0; const timeB = !isNaN(dateB) ? dateB.getTime() : 0; return timeB - timeA; })[0];


        if (!latestJob || latestJob.payType !== 'Monthly' || !latestJob.rate) { throw new OnCallHttpsError("failed-precondition", "Pay estimation is only available for monthly salary staff."); }
        console.log("calculateLivePayEstimateHandler: Latest job identified:", latestJob);

        // --- Process Fetched Data & Calculations ---
        // ...(Calculations remain mostly the same, but timezone accuracy is reduced)...
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
                 const actualCheckIn = safeToDate(attendance.checkInTime);
                 if (actualCheckIn && schedule.startTime) {
                     try {
                         // *** TEMPORARY Lateness Check (No Timezone) ***
                         const scheduledStart = new Date(schedule.date + 'T' + schedule.startTime); // Basic parse

                         if (actualCheckIn > scheduledStart) { lateCount++; }
                     } catch (parseError) { console.error(`Error parsing schedule start time for late check: ${schedule.date} ${schedule.startTime}`, parseError); }
                 }
             }
         });
        // ...(rest of calculations)...
        let potentialBonus = 0;
        const bonusOnTrack = absenceCount <= (bonusRules.allowedAbsences ?? 0) && lateCount <= (bonusRules.allowedLates ?? 0);
        if (bonusOnTrack) { /* ... bonus calc ... */ }
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

        return { /* ... return object (calculations might be slightly off due to no timezone) ... */
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