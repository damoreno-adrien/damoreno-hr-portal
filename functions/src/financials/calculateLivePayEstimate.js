const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { utcToZonedTime, format, zonedTimeToUtc } = require('date-fns-tz');
const { getYear, getMonth, getDate, getDaysInMonth, startOfMonth, parseISO, isValid } = require('date-fns');

// Initialize Firestore Admin SDK
const db = getFirestore();

// Define the target timezone
const timeZone = "Asia/Bangkok"; // Phuket Time

// Helper to safely convert Firestore Timestamp or string to JS Date
const safeToDate = (value) => {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (typeof value === 'string') {
        const parsed = parseISO(value); // Try ISO string first
        if (isValid(parsed)) return parsed;
    }
    // Add other potential formats or return null if conversion fails
    console.warn("Could not convert value to Date:", value);
    return null;
};

exports.calculateLivePayEstimateHandler = https.onCall({ region: "asia-southeast1" }, async (request) => {
    // --- START LOGGING ---
    console.log("calculateLivePayEstimateHandler: Function execution started.");
    console.log("calculateLivePayEstimateHandler: Auth context:", JSON.stringify(request.auth || null));
    // --- END LOGGING ---

    // Force redeploy comment - Oct 24 (can be removed later)
    if (!request.auth) {
        console.error("calculateLivePayEstimateHandler: Unauthenticated access attempt."); // Log specific error
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const staffId = request.auth.uid;
    console.log(`calculateLivePayEstimateHandler: Processing request for staffId: ${staffId}`); // Log staff ID

    try {
        // --- START LOGGING ---
        console.log("calculateLivePayEstimateHandler: Inside try block, fetching data...");
        // --- END LOGGING ---

        // --- Standardized Date Handling ---
        const nowUtc = new Date();
        const nowZoned = utcToZonedTime(nowUtc, timeZone); // Today's date in Bangkok time

        const year = getYear(nowZoned);
        const monthIndex = getMonth(nowZoned); // 0-indexed month (Jan=0)
        const month = monthIndex + 1; // 1-indexed month (Jan=1) used for querying/logic

        const daysInMonth = getDaysInMonth(nowZoned);
        const daysPassed = getDate(nowZoned); // Day of the month (1-31)
        const startOfMonthDate = startOfMonth(nowZoned);
        const startDateOfMonthStr = format(startOfMonthDate, 'yyyy-MM-dd', { timeZone }); // Format as YYYY-MM-DD
        const todayStr = format(nowZoned, 'yyyy-MM-dd', { timeZone }); // Format today as YYYY-MM-DD
        // --- End Standardized Date Handling ---

        // --- Parallel Firestore Fetches ---
        console.log(`calculateLivePayEstimateHandler: Fetching data for ${staffId} between ${startDateOfMonthStr} and ${todayStr}`); // Log date range
        const staffProfileRef = db.collection("staff_profiles").doc(staffId).get();
        const configRef = db.collection("settings").doc("company_config").get();
        // Queries use standardized date strings
        const advancesQuery = db.collection("salary_advances").where("staffId", "==", staffId).where("payPeriodYear", "==", year).where("payPeriodMonth", "==", month).where("status", "in", ["approved", "pending"]).get();
        const loansQuery = db.collection("loans").where("staffId", "==", staffId).where("status", "==", "active").get(); // Assuming status means active loan
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr).get();
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr).get();
        const leaveQuery = db.collection("leave_requests").where("staffId", "==", staffId).where("status", "==", "approved").where("endDate", ">=", startDateOfMonthStr).get(); // Fetch potentially relevant
        const latestPayslipQuery = db.collection("payslips").where("staffId", "==", staffId).orderBy("generatedAt", "desc").limit(1).get();

        const [staffProfileSnap, configSnap, advancesSnap, loansSnap, schedulesSnap, attendanceSnap, leaveSnap, latestPayslipSnap] = await Promise.all([
            staffProfileRef, configRef, advancesQuery, loansQuery, schedulesQuery, attendanceQuery, leaveQuery, latestPayslipQuery
        ]);
        console.log("calculateLivePayEstimateHandler: Firestore fetches completed."); // Log fetch success
        // --- End Firestore Fetches ---

        if (!staffProfileSnap.exists) {
            console.error(`calculateLivePayEstimateHandler: Staff profile not found for ${staffId}`);
            throw new HttpsError("not-found", "Staff profile not found.");
        }
        if (!configSnap.exists) {
            console.error(`calculateLivePayEstimateHandler: Company config not found`);
            throw new HttpsError("not-found", "Company config not found.");
        }

        const staffProfile = staffProfileSnap.data();
        const companyConfig = configSnap.data();
        console.log("calculateLivePayEstimateHandler: Profile and config loaded."); // Log data load

        // --- Standardized Job History Sorting ---
        const jobHistory = staffProfile.jobHistory || [];
        const latestJob = [...jobHistory].sort((a, b) => {
            const dateA = a.startDate ? parseISO(a.startDate) : new Date(0);
            const dateB = b.startDate ? parseISO(b.startDate) : new Date(0);
            const timeA = !isNaN(dateA) ? dateA.getTime() : 0;
            const timeB = !isNaN(dateB) ? dateB.getTime() : 0;
            return timeB - timeA; // Sort descending
        })[0];
        // --- End Standardized Job History Sorting ---

        if (!latestJob || latestJob.payType !== 'Monthly' || !latestJob.rate) {
            console.error(`calculateLivePayEstimateHandler: Staff ${staffId} is not eligible (not monthly or no rate). Job:`, latestJob);
            throw new HttpsError("failed-precondition", "Pay estimation is only available for monthly salary staff.");
        }
        console.log("calculateLivePayEstimateHandler: Latest job identified:", latestJob); // Log job info

        const baseSalary = latestJob.rate || 0;
        const dailyRate = daysInMonth > 0 ? baseSalary / daysInMonth : 0;

        // --- Process Fetched Data ---
        // ...(rest of the calculation logic remains the same)...
        const advancesAlreadyTaken = advancesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const currentAdvance = advancesSnap.docs.length > 0 ? advancesSnap.docs.sort((a, b) => b.data().createdAt.toMillis() - a.data().createdAt.toMillis())[0].data() : null;
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
                        const scheduledStartString = `${schedule.date} ${schedule.startTime}`;
                        const scheduledStart = zonedTimeToUtc(scheduledStartString, timeZone);
                        if (actualCheckIn > scheduledStart) { lateCount++; }
                    } catch (parseError) { console.error(`Error parsing schedule start time for late check: ${schedule.date} ${schedule.startTime}`, parseError); }
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

        console.log(`calculateLivePayEstimateHandler: Calculation complete for ${staffId}. Est Net: ${estimatedNetPay}`); // Log final estimate

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
        // --- START LOGGING ---
        console.error(`Error in calculateLivePayEstimate for ${staffId}:`, error); // Log the caught error
        // --- END LOGGING ---
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while calculating your pay estimate.", error.message);
    }
});