const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore } = require('firebase-admin/firestore');
const { utcToZonedTime, format } = require('date-fns-tz');
const { getYear, getMonth, getDaysInMonth, startOfMonth, parseISO } = require('date-fns');

// Initialize Firestore Admin SDK
const db = getFirestore();

// Define the target timezone
const timeZone = "Asia/Bangkok"; // Phuket Time

exports.calculateAdvanceEligibilityHandler = https.onCall({ region: "asia-southeast1" }, async (request) => { // Consider region
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const staffId = request.auth.uid;

    try {
        // --- Standardized Date Handling ---
        const nowUtc = new Date();
        const nowZoned = utcToZonedTime(nowUtc, timeZone); // Today's date in Bangkok time

        const year = getYear(nowZoned);
        const monthIndex = getMonth(nowZoned); // 0-indexed month (Jan=0)
        const month = monthIndex + 1; // 1-indexed month (Jan=1) used for querying/logic

        const daysInMonth = getDaysInMonth(nowZoned);
        const startOfMonthDate = startOfMonth(nowZoned);
        const startDateOfMonthStr = format(startOfMonthDate, 'yyyy-MM-dd', { timeZone }); // Format as YYYY-MM-DD
        const todayStr = format(nowZoned, 'yyyy-MM-dd', { timeZone }); // Format today as YYYY-MM-DD
        // --- End Standardized Date Handling ---

        const staffProfileDoc = await db.collection("staff_profiles").doc(staffId).get();
        if (!staffProfileDoc.exists) {
            throw new HttpsError("not-found", "Staff profile could not be found.");
        }
        const staffData = staffProfileDoc.data();

        // --- Standardized Job History Sorting ---
        const jobHistory = staffData.jobHistory || [];
        const latestJob = [...jobHistory].sort((a, b) => {
            // Parse dates robustly, default to epoch start if invalid/missing
            const dateA = a.startDate ? parseISO(a.startDate) : new Date(0);
            const dateB = b.startDate ? parseISO(b.startDate) : new Date(0);
            // Handle invalid dates by treating them as very old
            const timeA = !isNaN(dateA) ? dateA.getTime() : 0;
            const timeB = !isNaN(dateB) ? dateB.getTime() : 0;
            return timeB - timeA; // Sort descending
        })[0];
        // --- End Standardized Job History Sorting ---


        if (!latestJob || latestJob.payType !== 'Monthly' || !latestJob.rate) {
            throw new HttpsError("failed-precondition", "This feature is only for monthly salary staff.");
        }

        const baseSalary = latestJob.rate;
        const dailyRate = baseSalary / daysInMonth;

        const configDoc = await db.collection("settings").doc("company_config").get();
        const companyConfig = configDoc.exists ? configDoc.data() : {};
        const publicHolidays = companyConfig.publicHolidays ? companyConfig.publicHolidays.map(h => h.date) : []; // Assumes yyyy-MM-dd

        // --- Queries use standardized date strings ---
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr);
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr);
        // Leave query needs to compare against today's date string
        const leaveQuery = db.collection("leave_requests").where("staffId", "==", staffId).where("status", "==", "approved").where("endDate", ">=", startDateOfMonthStr); // Fetch potentially relevant
        const advancesQuery = db.collection("salary_advances")
            .where("staffId", "==", staffId)
            .where("payPeriodYear", "==", year)
            .where("payPeriodMonth", "==", month) // Use 1-indexed month
            .where("status", "in", ["approved", "pending"]);

        const [schedulesSnap, attendanceSnap, leaveSnap, advancesSnap] = await Promise.all([
            schedulesQuery.get(),
            attendanceQuery.get(),
            leaveQuery.get(),
            advancesQuery.get()
        ]);

        const schedules = schedulesSnap.docs.map(doc => doc.data());
        const attendanceDates = new Set(attendanceSnap.docs.map(doc => doc.data().date));
        // Filter leave records relevant up to today *after* fetching
        const approvedLeave = leaveSnap.docs.map(doc => doc.data()).filter(l => l.startDate <= todayStr);

        let unpaidAbsences = 0;
        schedules.forEach(schedule => {
            // Check schedule date is not in the future relative to todayStr
            if (schedule.date > todayStr) return;

            const isPublicHoliday = publicHolidays.includes(schedule.date);
            // String comparison is fine for yyyy-MM-dd
            const isOnLeave = approvedLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
            const didAttend = attendanceDates.has(schedule.date);

            if (!didAttend && !isOnLeave && !isPublicHoliday) {
                unpaidAbsences++;
            }
        });

        const absenceDeductions = dailyRate * unpaidAbsences;
        // Ensure salary due doesn't go below zero
        const currentSalaryDue = Math.max(0, baseSalary - absenceDeductions);

        const advancePercentage = companyConfig.advanceEligibilityPercentage || 50;
        // Floor the result to avoid floating point issues
        const maxTheoreticalAdvance = Math.floor(currentSalaryDue * (advancePercentage / 100));

        const advancesAlreadyTaken = advancesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const availableAdvance = Math.max(0, maxTheoreticalAdvance - advancesAlreadyTaken);

        return {
            maxAdvance: availableAdvance,
            // Return intermediate calculation steps might be useful for frontend display
            currentSalaryDue,
            baseSalary,
            absenceDeductions,
            unpaidAbsences,
            maxTheoreticalAdvance,
            advancesAlreadyTaken
        };
    } catch (error) {
        console.error("Error in calculateAdvanceEligibility:", error);
        if (error instanceof HttpsError) throw error; // Re-throw known errors
        throw new HttpsError("internal", "An unexpected error occurred calculating eligibility.", error.message);
    }
});