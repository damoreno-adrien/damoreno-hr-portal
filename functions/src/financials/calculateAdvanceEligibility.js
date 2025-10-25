const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https"); // Import onCall
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https"); // Import HttpsError for onCall
const { getFirestore } = require('firebase-admin/firestore');

// *** Use Luxon for Timezone Handling ***
console.log("calculateAdvanceEligibility: Attempting to require luxon...");
let DateTime;
try {
    const luxon = require('luxon');
    DateTime = luxon.DateTime;
    console.log("calculateAdvanceEligibility: Successfully required luxon.");
} catch(e) {
    console.error("calculateAdvanceEligibility: FAILED to require luxon:", e);
    throw new Error("Critical dependency luxon failed to load.");
}
// *** End Luxon Block ***

// *** Require date-fns for non-timezone parts ***
console.log("calculateAdvanceEligibility: Attempting to require date-fns...");
let getYear, getMonth, getDate, getDaysInMonth, startOfMonth, parseISO, isValid;
try {
    const dfns = require('date-fns');
    getYear = dfns.getYear;       // Still useful for year number from Luxon object if needed
    getMonth = dfns.getMonth;     // Still useful for month index from Luxon object if needed
    getDate = dfns.getDate;       // Still useful for day number from Luxon object if needed
    getDaysInMonth = dfns.getDaysInMonth; // Still useful if needed with JS Date
    startOfMonth = dfns.startOfMonth;   // Still useful if needed with JS Date
    parseISO = dfns.parseISO;
    isValid = dfns.isValid;
    console.log("calculateAdvanceEligibility: Successfully required date-fns.");
} catch (e) {
    console.error("calculateAdvanceEligibility: FAILED to require date-fns:", e);
    throw new Error("Critical dependency date-fns failed to load.");
}
// *** End date-fns Block ***


// Initialize Firestore Admin SDK
const db = getFirestore();

// Define the target timezone
const timeZone = "Asia/Bangkok"; // IANA timezone string for Luxon

exports.calculateAdvanceEligibilityHandler = onCall({ region: "asia-southeast1" }, async (request) => { // Use onCall
    console.log("calculateAdvanceEligibilityHandler: Function execution started.");

    // Ensure Luxon loaded
    if (!DateTime) {
        console.error("CRITICAL: Luxon library not loaded!");
        throw new OnCallHttpsError("internal", "Date/Time library failed to load (luxon).");
    }
     // Ensure date-fns functions loaded (optional, remove if not using date-fns below)
     if (!getYear || !getMonth || !getDate || !parseISO || !isValid ) { // Removed functions not strictly needed here
         console.error("CRITICAL: date-fns functions not loaded!");
         throw new OnCallHttpsError("internal", "Core Date library failed to load.");
     }

    if (!request.auth) {
        console.error("calculateAdvanceEligibilityHandler: Unauthenticated access.");
        throw new OnCallHttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const staffId = request.auth.uid;
    console.log(`calculateAdvanceEligibilityHandler: Processing for staffId: ${staffId}`);

    try {
        // --- Luxon Date Handling ---
        const nowZoned = DateTime.now().setZone(timeZone); // Today's date/time in Bangkok
        const year = nowZoned.year;
        const month = nowZoned.month; // Luxon months are 1-indexed
        const daysInMonth = nowZoned.daysInMonth;
        const startOfMonthDt = nowZoned.startOf('month');
        const startDateOfMonthStr = startOfMonthDt.toISODate(); // Format as YYYY-MM-DD
        const todayStr = nowZoned.toISODate(); // Format today as YYYY-MM-DD
        // --- End Luxon Date Handling ---

        console.log(`calculateAdvanceEligibilityHandler: Date range ${startDateOfMonthStr} to ${todayStr}`);

        const staffProfileRef = db.collection("staff_profiles").doc(staffId).get();
        const configRef = db.collection("settings").doc("company_config").get();
        // Queries use standardized date strings
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr).get();
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr).get();
        const leaveQuery = db.collection("leave_requests").where("staffId", "==", staffId).where("status", "==", "approved").where("endDate", ">=", startDateOfMonthStr).get(); // Fetch potentially relevant
        const advancesQuery = db.collection("salary_advances")
            .where("staffId", "==", staffId)
            .where("payPeriodYear", "==", year)
            .where("payPeriodMonth", "==", month) // Use 1-indexed month
            .where("status", "in", ["approved", "pending"]).get();

        // Use Promise.allSettled for robustness
        const results = await Promise.allSettled([
            staffProfileRef, configRef, schedulesQuery, attendanceQuery, leaveQuery, advancesQuery
        ]);
        const [staffProfileRes, configRes, schedulesRes, attendanceRes, leaveRes, advancesRes] = results;

        console.log("Promise.allSettled Results:", JSON.stringify(results.map(r => r.status)));

        // Check critical failures
        if (staffProfileRes.status === 'rejected') { throw new OnCallHttpsError("internal", "Failed to fetch staff profile.", staffProfileRes.reason?.message); }
        if (configRes.status === 'rejected') { throw new OnCallHttpsError("internal", "Failed to fetch company config.", configRes.reason?.message); }
        if (schedulesRes.status === 'rejected') { throw new OnCallHttpsError("internal", "Failed to fetch schedules.", schedulesRes.reason?.message); }
        if (attendanceRes.status === 'rejected') { throw new OnCallHttpsError("internal", "Failed to fetch attendance.", attendanceRes.reason?.message); }
        // Log non-critical failures
        if (leaveRes.status === 'rejected') { console.error("Failed to fetch leave requests:", leaveRes.reason); }
        if (advancesRes.status === 'rejected') { console.error("Failed to fetch advances:", advancesRes.reason); }

        const staffProfileSnap = staffProfileRes.value;
        const configSnap = configRes.value;
        const schedulesSnap = schedulesRes.value;
        const attendanceSnap = attendanceRes.value;
        const leaveSnap = leaveRes.status === 'fulfilled' ? leaveRes.value : { docs: [] };
        const advancesSnap = advancesRes.status === 'fulfilled' ? advancesRes.value : { docs: [] };


        if (!staffProfileSnap.exists) throw new OnCallHttpsError("not-found", "Staff profile could not be found.");
        const staffData = staffProfileSnap.data();

        // --- Standardized Job History Sorting (using date-fns parseISO) ---
        const jobHistory = staffData.jobHistory || [];
        const latestJob = [...jobHistory].sort((a, b) => {
            const dateA = a.startDate ? parseISO(a.startDate) : new Date(0);
            const dateB = b.startDate ? parseISO(b.startDate) : new Date(0);
            const timeA = !isNaN(dateA) ? dateA.getTime() : 0;
            const timeB = !isNaN(dateB) ? dateB.getTime() : 0;
            return timeB - timeA;
        })[0];
        // --- End Standardized Job History Sorting ---

        if (!latestJob || latestJob.payType !== 'Monthly' || !latestJob.rate) {
            throw new OnCallHttpsError("failed-precondition", "This feature is only for monthly salary staff.");
        }

        const baseSalary = latestJob.rate;
        const dailyRate = daysInMonth > 0 ? baseSalary / daysInMonth : 0; // daysInMonth from Luxon

        const companyConfig = configSnap.exists ? configSnap.data() : {};
        const publicHolidays = companyConfig.publicHolidays ? companyConfig.publicHolidays.map(h => h.date) : [];

        const schedules = schedulesSnap.docs.map(doc => doc.data());
        const attendanceDates = new Set(attendanceSnap.docs.map(doc => doc.data().date));
        // Filter leave relevant up to today *after* fetching
        const approvedLeave = leaveSnap.docs.map(doc => doc.data()).filter(l => l.startDate <= todayStr);

        let unpaidAbsencesCount = 0;
        schedules.forEach(schedule => {
            // Only count schedules up to today
            if (schedule.date > todayStr) return;

            const isPublicHoliday = publicHolidays.includes(schedule.date);
            const isOnLeave = approvedLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
            const didAttend = attendanceDates.has(schedule.date);
            if (!didAttend && !isOnLeave && !isPublicHoliday) {
                unpaidAbsencesCount++;
            }
        });

        const absenceDeductions = dailyRate * unpaidAbsencesCount;
        const currentSalaryDue = Math.max(0, baseSalary - absenceDeductions);

        const advancePercentage = companyConfig.advanceEligibilityPercentage || 50;
        const maxTheoreticalAdvance = Math.floor(currentSalaryDue * (advancePercentage / 100));

        const advancesAlreadyTaken = advancesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const availableAdvance = Math.max(0, maxTheoreticalAdvance - advancesAlreadyTaken);

        console.log(`calculateAdvanceEligibilityHandler: Success for ${staffId}. Available: ${availableAdvance}`);
        return {
            maxAdvance: availableAdvance,
            currentSalaryDue,
            baseSalary,
            absenceDeductions,
            unpaidAbsences: unpaidAbsencesCount, // Renamed for clarity
            maxTheoreticalAdvance,
            advancesAlreadyTaken
        };
    } catch (error) {
        console.error(`Error in calculateAdvanceEligibility for ${staffId}:`, error);
        if (error instanceof OnCallHttpsError) throw error;
        throw new OnCallHttpsError("internal", "An unexpected error occurred.", error.message);
    }
});