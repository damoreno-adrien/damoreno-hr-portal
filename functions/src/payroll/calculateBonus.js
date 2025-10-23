const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore, Timestamp } = require('firebase-admin/firestore'); // Import Timestamp
const { utcToZonedTime, format, zonedTimeToUtc } = require('date-fns-tz');
const { startOfMonth, endOfMonth, parseISO, isValid } = require('date-fns');

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
    console.warn("Could not convert value to Date:", value);
    return null;
};

exports.calculateBonusHandler = https.onCall({ region: "asia-southeast1" }, async (request) => { // Consider region
    // 1. Authentication & Input Validation
    if (!request.auth || !request.data.staffId || !request.data.payPeriod) {
        throw new HttpsError("invalid-argument", "Authentication, staff ID, and pay period are required.");
    }
    const { staffId, payPeriod } = request.data;
    const { year, month } = payPeriod; // month is expected to be 1-indexed

    // Basic validation for year and month
    if (typeof year !== 'number' || typeof month !== 'number' || month < 1 || month > 12) {
        throw new HttpsError("invalid-argument", "Invalid pay period provided.");
    }

    try {
        // 2. Fetch Configuration and Staff Data
        const configDoc = await db.collection("settings").doc("company_config").get();
        if (!configDoc.exists) {
            throw new HttpsError("not-found", "Company configuration not found.");
        }
        const bonusRules = configDoc.data().attendanceBonus;
        if (!bonusRules || typeof bonusRules.allowedAbsences !== 'number' || typeof bonusRules.allowedLates !== 'number') {
            throw new HttpsError("failed-precondition", "Attendance bonus rules are not configured correctly.");
        }

        const staffProfileDoc = await db.collection("staff_profiles").doc(staffId).get();
        if (!staffProfileDoc.exists) {
            throw new HttpsError("not-found", "Staff profile not found.");
        }
        const currentStreak = staffProfileDoc.data().bonusStreak || 0;

        // 3. Date Range Calculation (Standardized)
        // Create a date representing the start of the pay period month
        // We use UTC functions here to construct the date without local timezone interference,
        // then format it correctly for querying.
        const payPeriodStartDate = new Date(Date.UTC(year, month - 1, 1)); // Month is 0-indexed for JS Date

        const startDate = startOfMonth(payPeriodStartDate); // Use date-fns startOfMonth
        const endDate = endOfMonth(payPeriodStartDate); // Use date-fns endOfMonth

        const startDateStr = format(startDate, 'yyyy-MM-dd'); // Format for query
        const endDateStr = format(endDate, 'yyyy-MM-dd'); // Format for query

        // 4. Fetch Schedules and Attendance for the Period
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateStr).where("date", "<=", endDateStr);
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateStr).where("date", "<=", endDateStr);

        const [schedulesSnapshot, attendanceSnapshot] = await Promise.all([
            schedulesQuery.get(),
            attendanceQuery.get()
        ]);

        const schedules = schedulesSnapshot.docs.map(doc => doc.data());
        const attendanceRecords = new Map(attendanceSnapshot.docs.map(doc => [doc.data().date, doc.data()]));

        // 5. Calculate Lates and Absences
        let lateCount = 0;
        let absenceCount = 0;

        schedules.forEach(schedule => {
            const attendance = attendanceRecords.get(schedule.date);

            if (!attendance) {
                // Consider checking for approved leave or public holidays if absences shouldn't count then
                // For simplicity, this version counts any missed schedule as an absence for bonus calc.
                absenceCount++;
            } else {
                // Check for lateness using standardized date handling
                const actualCheckIn = safeToDate(attendance.checkInTime);
                if (actualCheckIn && schedule.startTime) {
                    try {
                        // Combine schedule date and time, parse in local timezone
                        const scheduledStartString = `${schedule.date} ${schedule.startTime}`;
                        const scheduledStart = zonedTimeToUtc(scheduledStartString, timeZone);

                        // Compare actual check-in (already UTC Date object) with scheduled start (converted to UTC Date object)
                        if (actualCheckIn > scheduledStart) {
                            lateCount++;
                        }
                    } catch (parseError) {
                        console.error(`Error parsing schedule start time for late check: ${schedule.date} ${schedule.startTime}`, parseError);
                        // Decide how to handle parse errors - count as late? ignore? log?
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
        }

        console.log(`Bonus calculation for ${staffId} (${year}-${month}): Absences=${absenceCount}, Lates=${lateCount}. Result: Amount=${bonusAmount}, NewStreak=${newStreak}`);

        return { bonusAmount, newStreak };

    } catch (error) {
        console.error("Error calculating bonus:", error);
        // Ensure HttpsError is thrown for client-side handling
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while calculating the bonus.", error.message);
    }
});