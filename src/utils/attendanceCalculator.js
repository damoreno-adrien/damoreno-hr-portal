import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { DateTime } from 'luxon';
import { calculateAttendanceStatus } from './statusUtils';

const THAILAND_TIMEZONE = 'Asia/Bangkok';
const DEFAULT_BREAK_MS = 60 * 60 * 1000;
const DEFAULT_CHECKOUT_TIME = '23:00:00';

/**
 * A non-hook utility to calculate all attendance stats for a given user and pay period.
 * This is the SINGLE SOURCE OF TRUTH for both dashboard and payroll.
 *
 * @param {object} db - The Firestore instance.
 * @param {object} staff - The *full* staff profile object (must include 'id' and 'bonusStreak').
 * @param {object} payPeriod - An object with { month, year } (1-based month).
 * @param {object} companyConfig - The full company config object.
 * @returns {object} - An object with all calculated stats and bonus info.
 */
export const calculateMonthlyStats = async (db, staff, payPeriod, companyConfig) => {
    const { month, year } = payPeriod;
    const userId = staff.id;
    const now = DateTime.now().setZone(THAILAND_TIMEZONE);
    const today = now.toISODate();

    const startOfMonth = DateTime.fromObject({ year, month, day: 1 }, { zone: THAILAND_TIMEZONE }).toISODate();
    const endOfMonth = DateTime.fromObject({ year, month }, { zone: THAILAND_TIMEZONE }).endOf('month').toISODate();
    const endOfLoop = DateTime.min(now, DateTime.fromISO(endOfMonth, { zone: THAILAND_TIMEZONE }));

    // --- 1. Fetch all data ---
    const attendanceQuery = query(
        collection(db, 'attendance'),
        where('staffId', '==', userId),
        where('date', '>=', startOfMonth),
        where('date', '<=', endOfMonth)
    );
    const schedulesQuery = query(
        collection(db, 'schedules'),
        where('staffId', '==', userId),
        where('date', '>=', startOfMonth),
        where('date', '<=', endOfMonth)
    );
    const leaveQuery = query(
        collection(db, 'leave_requests'),
        where('staffId', '==', userId),
        where('status', '==', 'approved'),
        where('endDate', '>=', startOfMonth)
    );

    const [attendanceSnap, schedulesSnap, leaveSnap] = await Promise.all([
        getDocs(attendanceQuery),
        getDocs(schedulesQuery),
        getDocs(leaveQuery),
    ]);

    // --- 2. Process into maps ---
    const attendanceMap = new Map();
    attendanceSnap.forEach(doc => attendanceMap.set(doc.data().date, doc.data()));
    const schedulesMap = new Map();
    schedulesSnap.forEach(doc => schedulesMap.set(doc.data().date, doc.data()));
    const leaveMap = new Map();
    leaveSnap.forEach(doc => {
        const data = doc.data();
        if (data.startDate > endOfMonth) return;
        let current = DateTime.fromISO(data.startDate, { zone: THAILAND_TIMEZONE });
        const end = DateTime.fromISO(data.endDate, { zone: THAILAND_TIMEZONE });
        while (current <= end) {
            const dateStr = current.toISODate();
            if (dateStr >= startOfMonth && dateStr <= endOfMonth) {
                leaveMap.set(dateStr, data);
            }
            current = current.plus({ days: 1 });
        }
    });

    // --- 3. Iterate and calculate stats ---
    let totalActualMillis = 0;
    let totalScheduledMillis = 0;
    let totalLateMinutes = 0;
    let totalLatesCount = 0;
    let totalAbsencesCount = 0;
    let totalEarlyDepartureMinutes = 0;
    let workedDays = 0;

    let loopDay = DateTime.fromISO(startOfMonth, { zone: THAILAND_TIMEZONE });
    
    // Use 'endOfLoop' for stats, but 'endOfMonth' for scheduled hours
    const loopUntil = (payPeriod.year === now.year && payPeriod.month === now.month) ? endOfLoop : DateTime.fromISO(endOfMonth, { zone: THAILAND_TIMEZONE });

    while (loopDay <= loopUntil) {
        const dateStr = loopDay.toISODate();
        const dateJS = loopDay.toJSDate();

        const attendance = attendanceMap.get(dateStr);
        const schedule = schedulesMap.get(dateStr);
        const leave = leaveMap.get(dateStr);

        const { status, minutes } = calculateAttendanceStatus(schedule, attendance, leave, dateJS);

        // --- A) Actual Hours ---
        if (attendance && attendance.checkInTime) {
            workedDays++;
            const checkIn = attendance.checkInTime.toDate();
            let checkOut;

            if (attendance.checkOutTime) {
                checkOut = attendance.checkOutTime.toDate();
            } else if (dateStr < today) {
                checkOut = DateTime.fromISO(`${dateStr}T${DEFAULT_CHECKOUT_TIME}`, { zone: THAILAND_TIMEZONE }).toJSDate();
            } else {
                checkOut = null;
            }

            if (checkOut) {
                let durationMs = checkOut.getTime() - checkIn.getTime();
                durationMs -= DEFAULT_BREAK_MS;
                if (durationMs > 0) totalActualMillis += durationMs;

                // --- B) Early Departure ---
                if (schedule && schedule.endTime) {
                    try {
                        const scheduledEnd = DateTime.fromISO(`${dateStr}T${schedule.endTime}`, { zone: THAILAND_TIMEZONE });
                        const actualEnd = DateTime.fromJSDate(checkOut);
                        if (actualEnd < scheduledEnd) {
                            totalEarlyDepartureMinutes += scheduledEnd.diff(actualEnd, 'minutes').minutes;
                        }
                    } catch (e) { /* ignore */ }
                }
            }
        }

        // --- C) Scheduled Hours (Check all month) ---
        if (schedule && schedule.type === 'work' && schedule.startTime && schedule.endTime) {
            try {
                const start = DateTime.fromISO(`${schedule.date}T${schedule.startTime}`, { zone: THAILAND_TIMEZONE });
                const end = DateTime.fromISO(`${schedule.date}T${schedule.endTime}`, { zone: THAILAND_TIMEZONE });
                let scheduledDurationMs = end.diff(start).as('milliseconds');
                scheduledDurationMs -= DEFAULT_BREAK_MS;
                if (scheduledDurationMs > 0) totalScheduledMillis += scheduledDurationMs;
            } catch (e) { /* ignore */ }
        }

        // --- D) Lates and Absences (Only count up to today) ---
        if (loopDay <= endOfLoop) {
            if (status === 'Late') {
                totalLateMinutes += minutes;
                totalLatesCount++;
            }
            if (status === 'Absent' && loopDay.toISODate() < today) {
                totalAbsencesCount++;
            }
        }
        loopDay = loopDay.plus({ days: 1 });
    }

    // --- 4. Check Bonus Qualification ---
    const { allowedAbsences, allowedLates, maxLateMinutesAllowed } = companyConfig.attendanceBonus || { allowedAbsences: 0, allowedLates: 1, maxLateMinutesAllowed: 30 };
    const isAbsenceOver = totalAbsencesCount > allowedAbsences;
    const isLateCountOver = totalLatesCount > allowedLates;
    const isLateTimeOver = totalLateMinutes > maxLateMinutesAllowed;
    const didQualify = !(isAbsenceOver || isLateCountOver || isLateTimeOver);

    // --- 5. Calculate Streak and Bonus Amount ---
    const currentStreak = staff.bonusStreak || 0;
    let bonusAmount = 0;
    let newStreak = 0;

    if (didQualify) {
        newStreak = currentStreak + 1;
        if (newStreak === 1) {
            bonusAmount = companyConfig.attendanceBonus.month1 || 0;
        } else if (newStreak === 2) {
            bonusAmount = companyConfig.attendanceBonus.month2 || 0;
        } else {
            bonusAmount = companyConfig.attendanceBonus.month3 || 0;
        }
    } else {
        newStreak = 0; // Streak is lost
        bonusAmount = 0;
    }

    return {
        // Core Stats
        totalActualMillis,
        totalScheduledMillis,
        workedDays,
        totalAbsencesCount,
        totalLatesCount,
        totalLateMinutes,
        totalEarlyDepartureMinutes,
        // Bonus Info
        didQualifyForBonus: didQualify,
        bonusAmount,
        newStreak,
    };
};