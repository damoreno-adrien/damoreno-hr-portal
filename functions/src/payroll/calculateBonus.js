const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https"); // Import onCall
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https"); // Import HttpsError for onCall
const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin'); // <-- 1. IMPORT ADMIN

// 2. ADD INITIALIZATION BLOCK
// This safely initializes the app only if it's not already running
if (admin.apps.length === 0) {
    admin.initializeApp();
}

// *** Use Luxon for Timezone Handling ***
console.log("calculateBonus: Attempting to require luxon...");
let DateTime;
try {
    const luxon = require('luxon');
    DateTime = luxon.DateTime;
    console.log("calculateBonus: Successfully required luxon.");
} catch(e) {
    console.error("calculateBonus: FAILED to require luxon:", e);
    throw new Error("Critical dependency luxon failed to load.");
}
// *** End Luxon Block ***

// *** Require date-fns for non-timezone parts (parseISO for job history dates) ***
console.log("calculateBonus: Attempting to require date-fns...");
let parseISO, isValid;
try {
    const dfns = require('date-fns');
    parseISO = dfns.parseISO;
    isValid = dfns.isValid;
    console.log("calculateBonus: Successfully required date-fns.");
} catch (e) {
    console.error("calculateBonus: FAILED to require date-fns:", e);
    throw new Error("Critical dependency date-fns failed to load.");
}
// *** End date-fns Block ***

// Initialize Firestore Admin SDK
const db = getFirestore();

// Define the target timezone
const timeZone = "Asia/Bangkok"; // IANA timezone string for Luxon

// Helper to safely convert Firestore Timestamp or string to JS Date
const safeToDate = (value) => {
    // ...(safeToDate function remains the same as previous versions)...
    if (!value) return null;
    if (typeof value === 'object' && value !== null && typeof value.toDate === 'function' && typeof value.nanoseconds === 'number') {
        try { return value.toDate(); }
        catch (e) { console.error("safeToDate (bonus) - Error calling .toDate():", value, e); return null; }
    }
    try {
        if (value instanceof Date && !isNaN(value)) { return value; }
    } catch(e) { console.error("safeToDate (bonus) - Error during 'instanceof Date':", e); }
    if (typeof value === 'string') {
        if (parseISO && isValid) {
            const parsed = parseISO(value);
            if (isValid(parsed)) { return parsed; }
        } else { console.error("safeToDate (bonus) - date-fns not loaded."); }
    }
    console.warn("safeToDate (bonus) - Could not convert:", value);
    return null;
};


exports.calculateBonusHandler = onCall({ region: "asia-southeast1" }, async (request) => { // Use onCall, region
    console.log("calculateBonusHandler: Function execution started.");

    // Ensure Luxon loaded
    if (!DateTime) {
        console.error("CRITICAL: Luxon library not loaded!");
        throw new OnCallHttpsError("internal", "Date/Time library failed to load (luxon).");
    }
     // Ensure date-fns functions loaded (optional)
     if (!parseISO || !isValid) {
         console.error("CRITICAL: date-fns functions not loaded!");
         throw new OnCallHttpsError("internal", "Core Date library failed to load.");
     }

    // 1. Authentication & Input Validation
    if (!request.auth || !request.data.staffId || !request.data.payPeriod) {
        throw new OnCallHttpsError("invalid-argument", "Authentication, staff ID, and pay period are required.");
    }
    const { staffId, payPeriod } = request.data;
    const { year, month } = payPeriod; // month is 1-indexed

    if (typeof year !== 'number' || typeof month !== 'number' || month < 1 || month > 12) {
        throw new OnCallHttpsError("invalid-argument", "Invalid pay period provided.");
    }
    console.log(`calculateBonusHandler: Processing for ${staffId}, Period: ${year}-${month}`);

    try {
        // 2. Fetch Configuration and Staff Data
        const configRef = db.collection("settings").doc("company_config").get();
        const staffProfileRef = db.collection("staff_profiles").doc(staffId).get();
        const [configSnap, staffProfileSnap] = await Promise.all([configRef, staffProfileRef]);

        if (!configSnap.exists) { throw new OnCallHttpsError("not-found", "Company configuration not found."); }
        const bonusRules = configSnap.data().attendanceBonus;
        if (!bonusRules || typeof bonusRules.allowedAbsences !== 'number' || typeof bonusRules.allowedLates !== 'number') {
            throw new OnCallHttpsError("failed-precondition", "Attendance bonus rules are not configured correctly.");
        }

        if (!staffProfileSnap.exists) { throw new OnCallHttpsError("not-found", "Staff profile not found."); }
        const currentStreak = staffProfileSnap.data().bonusStreak || 0;
        console.log(`calculateBonusHandler: Current streak for ${staffId}: ${currentStreak}`);

        // 3. Date Range Calculation (Luxon)
        // Create Luxon DateTime for the start of the target month IN UTC to avoid local shifts
        const startOfMonthUtc = DateTime.utc(year, month, 1);
        // Get start and end dates as YYYY-MM-DD strings
        const startDateStr = startOfMonthUtc.toISODate();
        const endDateStr = startOfMonthUtc.endOf('month').toISODate();
        console.log(`calculateBonusHandler: Querying between ${startDateStr} and ${endDateStr}`);

        // 4. Fetch Schedules and Attendance for the Period
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateStr).where("date", "<=", endDateStr);
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateStr).where("date", "<=", endDateStr);
        // Optional: Fetch leave/holidays if they affect bonus eligibility
        // const leaveQuery = ...;
        // const publicHolidays = configSnap.data().publicHolidays?.map(h => h.date) || [];

        const [schedulesSnapshot, attendanceSnapshot] = await Promise.all([
            schedulesQuery.get(),
            attendanceQuery.get()
            // leaveQuery?.get() // Add if needed
        ]);

        const schedules = schedulesSnapshot.docs.map(doc => doc.data());
        const attendanceRecords = new Map(attendanceSnapshot.docs.map(doc => [doc.data().date, doc.data()]));
        // const approvedLeave = leaveSnap?.docs?.map(doc => doc.data()) || []; // Process if needed

        console.log(`calculateBonusHandler: Fetched ${schedules.length} schedules, ${attendanceRecords.size} attendance records.`);

        // 5. Calculate Lates and Absences
        let lateCount = 0;
        let absenceCount = 0;

        schedules.forEach(schedule => {
            const attendance = attendanceRecords.get(schedule.date);
            // Optional: Add checks for leave/holidays here if they negate absences/lates
            // const isOnLeave = approvedLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
            // const isPublicHoliday = publicHolidays.includes(schedule.date);
            // if (isOnLeave || isPublicHoliday) return; // Skip check if excused

            if (!attendance) {
                absenceCount++;
            } else {
                // Check for lateness using Luxon
                const actualCheckInJS = safeToDate(attendance.checkInTime);
                if (actualCheckInJS && schedule.startTime) {
                    try {
                        const actualCheckInLuxon = DateTime.fromJSDate(actualCheckInJS).setZone(timeZone);
                        const scheduledStartLuxon = DateTime.fromISO(`${schedule.date}T${schedule.startTime}`, { zone: timeZone });

                        if (actualCheckInLuxon > scheduledStartLuxon) {
                            lateCount++;
                        }
                    } catch (parseError) {
                        console.error(`Error parsing schedule start time for late check (bonus): ${schedule.date} ${schedule.startTime}`, parseError);
                    }
                }
            }
        });

        // 6. Determine Bonus Amount and New Streak
        let newStreak = 0;
        let bonusAmount = 0;

        if (absenceCount <= bonusRules.allowedAbsences && lateCount <= bonusRules.allowedLates) {
            newStreak = currentStreak + 1;
            if (newStreak === 1) bonusAmount = bonusRules.month1 || 0;
            else if (newStreak === 2) bonusAmount = bonusRules.month2 || 0;
            else bonusAmount = bonusRules.month3 || 0; // Applies to 3rd month and beyond
        } else {
            // Streak resets if conditions aren't met
            newStreak = 0;
            bonusAmount = 0;
            console.log(`calculateBonusHandler: Bonus conditions not met for ${staffId}. Absences: ${absenceCount}/${bonusRules.allowedAbsences}, Lates: ${lateCount}/${bonusRules.allowedLates}`);
        }

        console.log(`calculateBonusHandler: Bonus calculation SUCCESS for ${staffId} (${year}-${month}): Amount=${bonusAmount}, NewStreak=${newStreak}`);
        return { bonusAmount, newStreak };

    } catch (error) {
        console.error(`Error calculating bonus for ${staffId}, Period: ${year}-${month}:`, error);
        if (error instanceof OnCallHttpsError) throw error; // Re-throw specific errors
        throw new OnCallHttpsError("internal", "An unexpected error occurred while calculating the bonus.", error.message);
    }
});