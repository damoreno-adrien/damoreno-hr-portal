const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

// *** Log BEFORE requiring date-fns-tz ***
console.log("Attempting to require date-fns-tz...");
let utcToZonedTime, format, zonedTimeToUtc;
try {
    const dftz = require('date-fns-tz');
    utcToZonedTime = dftz.utcToZonedTime;
    format = dftz.format;
    zonedTimeToUtc = dftz.zonedTimeToUtc;
    console.log("Successfully required date-fns-tz.");
} catch (e) {
    console.error("FAILED to require date-fns-tz:", e);
    // Continue execution so the check below can run and throw the HttpsError
}
// *** End Logging Block ***

// *** Log BEFORE requiring date-fns ***
console.log("Attempting to require date-fns...");
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
    console.log("Successfully required date-fns.");
} catch (e) {
    console.error("FAILED to require date-fns:", e);
    // Continue execution so the check below can run
}
// *** End Logging Block ***


const db = getFirestore();
const timeZone = "Asia/Bangkok";

// Helper to safely convert Firestore Timestamp or string to JS Date
const safeToDate = (value) => {
    // ...(safeToDate function remains the same)...
    console.log('safeToDate - Input value:', value, 'Type:', typeof value);
    if (!value) return null;
    if (typeof value === 'object' && value !== null && typeof value.toDate === 'function' && typeof value.nanoseconds === 'number') {
        console.log('safeToDate - Detected as Timestamp-like object.');
        try { return value.toDate(); }
        catch (e) { console.error("safeToDate - Error calling .toDate() on potential Timestamp:", value, e); return null; }
    }
    console.log('safeToDate - Checking instanceof Date...');
    try {
        if (value instanceof Date && !isNaN(value)) {
            console.log('safeToDate - Detected as valid Date object.');
            return value;
        }
    } catch(e) { console.error("safeToDate - Error during 'instanceof Date' check:", e); }
    console.log('safeToDate - Not a valid Date object.');
    if (typeof value === 'string') {
        console.log('safeToDate - Attempting to parse as ISO string.');
        // Ensure parseISO and isValid are defined before using them
        if (parseISO && isValid) {
            const parsed = parseISO(value);
            if (isValid(parsed)) {
                console.log('safeToDate - Successfully parsed as ISO string.');
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

    // Ensure date-fns-tz functions are loaded before proceeding
    if (!utcToZonedTime || !format || !zonedTimeToUtc) {
         console.error("CRITICAL: date-fns-tz functions not loaded!");
         throw new OnCallHttpsError("internal", "Date/Time library failed to load (tz)."); // More specific error
    }
    // Ensure date-fns functions are loaded
     if (!getYear || !getMonth || !getDate || !getDaysInMonth || !startOfMonth || !parseISO || !isValid) {
         console.error("CRITICAL: date-fns functions not loaded!");
         throw new OnCallHttpsError("internal", "Core Date library failed to load."); // More specific error
     }


    if (!request.auth) { /* ... error handling ... */ }
    const staffId = request.auth.uid;
    console.log(`calculateLivePayEstimateHandler: Processing request for staffId: ${staffId}`);

    try {
        console.log("calculateLivePayEstimateHandler: Inside try block, fetching data...");

        // --- Standardized Date Handling ---
        const nowUtc = new Date();
        const nowZoned = utcToZonedTime(nowUtc, timeZone); // Use imported function
        // ...(rest of the function remains the same)...
        const year = getYear(nowZoned);
        const monthIndex = getMonth(nowZoned);
        const month = monthIndex + 1;
        const daysInMonth = getDaysInMonth(nowZoned);
        const daysPassed = getDate(nowZoned);
        const startOfMonthDate = startOfMonth(nowZoned);
        const startDateOfMonthStr = format(startOfMonthDate, 'yyyy-MM-dd', { timeZone });
        const todayStr = format(nowZoned, 'yyyy-MM-dd', { timeZone });

        // --- Parallel Firestore Fetches ---
        // ...(rest of fetches)...
        console.log(`calculateLivePayEstimateHandler: Fetching data for ${staffId} between ${startDateOfMonthStr} and ${todayStr}`);
        const staffProfileRef = db.collection("staff_profiles").doc(staffId).get();
        const configRef = db.collection("settings").doc("company_config").get();
        const advancesQuery = db.collection("salary_advances").where("staffId", "==", staffId).where("payPeriodYear", "==", year).where("payPeriodMonth", "==", month).where("status", "in", ["approved", "pending"]).get();
        const loansQuery = db.collection("loans").where("staffId", "==", staffId).where("status", "==", "active").get();
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr).get();
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr).get();
        const leaveQuery = db.collection("leave_requests").where("staffId", "==", staffId).where("status", "==", "approved").where("endDate", ">=", startDateOfMonthStr).get();
        const latestPayslipQuery = db.collection("payslips").where("staffId", "==", staffId).orderBy("generatedAt", "desc").limit(1).get();
        const [staffProfileSnap, configSnap, advancesSnap, loansSnap, schedulesSnap, attendanceSnap, leaveSnap, latestPayslipSnap] = await Promise.all([ staffProfileRef, configRef, advancesQuery, loansQuery, schedulesQuery, attendanceQuery, leaveQuery, latestPayslipQuery ]);
        console.log("calculateLivePayEstimateHandler: Firestore fetches completed.");


        if (!staffProfileSnap.exists) { throw new OnCallHttpsError("not-found", "Staff profile not found."); }
        if (!configSnap.exists) { throw new OnCallHttpsError("not-found", "Company config not found."); }

        const staffProfile = staffProfileSnap.data();
        const companyConfig = configSnap.data();
        console.log("calculateLivePayEstimateHandler: Profile and config loaded.");

        // --- Standardized Job History Sorting ---
        const jobHistory = staffProfile.jobHistory || [];
        const latestJob = [...jobHistory].sort((a, b) => { const dateA = a.startDate ? parseISO(a.startDate) : new Date(0); const dateB = b.startDate ? parseISO(b.startDate) : new Date(0); const timeA = !isNaN(dateA) ? dateA.getTime() : 0; const timeB = !isNaN(dateB) ? dateB.getTime() : 0; return timeB - timeA; })[0];


        if (!latestJob || latestJob.payType !== 'Monthly' || !latestJob.rate) { throw new OnCallHttpsError("failed-precondition", "Pay estimation is only available for monthly salary staff."); }
        console.log("calculateLivePayEstimateHandler: Latest job identified:", latestJob);

        // --- Process Fetched Data & Calculations ---
        // ...(rest of calculation logic)...
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

        schedules.forEach(schedule => { /* ... absence/late logic ... */ });
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

        return { /* ... return object ... */
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