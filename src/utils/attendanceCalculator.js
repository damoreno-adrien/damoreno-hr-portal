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
 * @param {object} staff - The *full* staff profile object (must include 'id', 'bonusStreak', 'isAttendanceBonusEligible').
 * @param {object} payPeriod - An object with { month, year } (1-based month).
 * @param {object} companyConfig - The full company config object.
 * @param {object} currentJob - The staff's current job object (must include 'payType').
 * @returns {object} - An object with all calculated stats and bonus info.
 */
export const calculateMonthlyStats = async (db, staff, payPeriod, companyConfig, currentJob) => {
    const { month, year } = payPeriod;
    const userId = staff.id;
    const now = DateTime.now().setZone(THAILAND_TIMEZONE);
    const today = now.toISODate();

    const startOfMonth = DateTime.fromObject({ year, month, day: 1 }, { zone: THAILAND_TIMEZONE }).toISODate();
    const endOfMonth = DateTime.fromObject({ year, month }, { zone: THAILAND_TIMEZONE }).endOf('month').toISODate();
    const endOfLoop = DateTime.min(now, DateTime.fromISO(endOfMonth, { zone: THAILAND_TIMEZONE }));

    const payType = currentJob?.payType || 'Monthly'; 

    const SICK_LEAVE_QUOTA_DAYS = companyConfig.leaveEntitlements?.sickDays || 30;
    const { 
        allowedLates = 3, 
        maxLateMinutesAllowed = 30, 
        allowedAbsences = 0 
    } = companyConfig.attendanceBonus || {};

    // --- 1. Fetch all data ---
    const startOfYear = DateTime.fromObject({ year, day: 1 }).toISODate();
    const endOfPayPeriod = endOfMonth;

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
        where('endDate', '>=', startOfYear)
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
    const thisMonthSickLeaves = [];
    const yearlySickLeaveRequests = [];

    leaveSnap.forEach(doc => {
        const data = doc.data();
        if (data.startDate > endOfPayPeriod) return;
        
        if (data.leaveType === 'Sick Leave' && data.startDate <= endOfPayPeriod) {
            yearlySickLeaveRequests.push(data);
        }

        let current = DateTime.fromISO(data.startDate, { zone: THAILAND_TIMEZONE });
        const end = DateTime.fromISO(data.endDate, { zone: THAILAND_TIMEZONE });
        
        while (current <= end) {
            const dateStr = current.toISODate();
            if (dateStr >= startOfMonth && dateStr <= endOfMonth) {
                leaveMap.set(dateStr, data);
                if (data.leaveType === 'Sick Leave' && !thisMonthSickLeaves.find(l => l.id === doc.id)) {
                    thisMonthSickLeaves.push({ id: doc.id, ...data });
                }
            }
            current = current.plus({ days: 1 });
        }
    });

    // --- 3. Iterate and calculate stats ---
    let totalActualMillis = 0;
    let totalScheduledMillis = 0;
    let totalLateMinutes = 0;
    let totalLatesCount = 0;
    let totalUnexcusedAbsenceCount = 0;
    let totalEarlyDepartureMinutes = 0;
    let workedDays = 0;

    let loopDay = DateTime.fromISO(startOfMonth, { zone: THAILAND_TIMEZONE });
    const loopUntil = (payPeriod.year === now.year && payPeriod.month === now.month) ? endOfLoop : DateTime.fromISO(endOfMonth, { zone: THAILAND_TIMEZONE });

    while (loopDay <= loopUntil) {
        const dateStr = loopDay.toISODate();
        const dateJS = loopDay.toJSDate();
        const attendance = attendanceMap.get(dateStr);
        const schedule = schedulesMap.get(dateStr); 
        const leave = leaveMap.get(dateStr);
        const { status, minutes } = calculateAttendanceStatus(schedule, attendance, leave, dateJS);

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
                
                if (payType === 'Monthly') {
                    durationMs -= DEFAULT_BREAK_MS;
                }
                
                if (durationMs > 0) totalActualMillis += durationMs;
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
        if (schedule && schedule.type === 'work' && schedule.startTime && schedule.endTime) {
            try {
                const start = DateTime.fromISO(`${schedule.date}T${schedule.startTime}`, { zone: THAILAND_TIMEZONE });
                const end = DateTime.fromISO(`${schedule.date}T${schedule.endTime}`, { zone: THAILAND_TIMEZONE });
                let scheduledDurationMs = end.diff(start).as('milliseconds');
                
                if (payType === 'Monthly') {
                    scheduledDurationMs -= DEFAULT_BREAK_MS;
                }

                if (scheduledDurationMs > 0) totalScheduledMillis += scheduledDurationMs;
            } catch (e) { /* ignore */ }
        }
        if (loopDay <= endOfLoop) {
            if (status === 'Late') {
                totalLateMinutes += minutes;
                totalLatesCount++;
            }
            if (status === 'Absent' && loopDay.toISODate() < today) {
                totalUnexcusedAbsenceCount++;
            }
        }
        loopDay = loopDay.plus({ days: 1 });
    }

    // --- 4. Full Bonus & Deduction Logic ---
    let isBonusDisqualified = (totalLatesCount > allowedLates) ||
                              (totalLateMinutes > maxLateMinutesAllowed) ||
                              (totalUnexcusedAbsenceCount > allowedAbsences);

    let daysToDeduct = totalUnexcusedAbsenceCount;

    let yearlySickDaysUsedBeforeThisMonth = 0;
    yearlySickLeaveRequests.forEach(leave => {
        if (leave.startDate < startOfMonth) {
             let current = DateTime.fromISO(leave.startDate, { zone: THAILAND_TIMEZONE });
             const end = DateTime.min(DateTime.fromISO(leave.endDate, { zone: THAILAND_TIMEZONE }), DateTime.fromISO(startOfMonth, { zone: THAILAND_TIMEZONE }).minus({days: 1}));
             while (current <= end) {
                yearlySickDaysUsedBeforeThisMonth++;
                current = current.plus({ days: 1 });
             }
        }
    });

    let runningYearlySickDayCount = yearlySickDaysUsedBeforeThisMonth;
    thisMonthSickLeaves.sort((a, b) => a.startDate.localeCompare(b.startDate));

    for (const leave of thisMonthSickLeaves) {
        const isJustified = leave.mcReceived === true;
        const isLongLeave = leave.totalDays >= 3;

        for (let i = 0; i < leave.totalDays; i++) {
            runningYearlySickDayCount++;
            const isOverQuota = runningYearlySickDayCount > SICK_LEAVE_QUOTA_DAYS;

            if (isOverQuota) {
                isBonusDisqualified = true;
                daysToDeduct += 1;
            } else if (!isJustified && isLongLeave) {
                isBonusDisqualified = true;
                daysToDeduct += 1;
            } else if (!isJustified && !isLongLeave) {
                isBonusDisqualified = true;
            }
        }
    }
    
    // --- 5. Calculate Streak and Bonus Amount ---
    const currentStreak = staff.bonusStreak || 0;
    let bonusAmount = 0;
    let newStreak = 0; // Default to 0

    // --- 🐞 THIS IS THE FIX ---
    // Check eligibility. Default to TRUE if field is undefined (for existing staff).
    const isEligible = staff.isAttendanceBonusEligible !== false;

    if (isEligible && !isBonusDisqualified) {
        // They are eligible and passed the checks
        newStreak = currentStreak + 1;
        if (newStreak === 1) {
            bonusAmount = companyConfig.attendanceBonus.month1 || 400;
        } else if (newStreak === 2) {
            bonusAmount = companyConfig.attendanceBonus.month2 || 800;
        } else {
            bonusAmount = companyConfig.attendanceBonus.month3 || 1200;
        }
    } else if (!isEligible) {
        // They are not eligible for a bonus, but they DON'T lose their streak
        newStreak = currentStreak; 
        bonusAmount = 0;
    } else { // This means (isBonusDisqualified)
        // They were eligible but failed the checks, so their streak resets
        newStreak = 0; // Streak is lost
        bonusAmount = 0;
    }

    return {
        // Core Stats
        totalActualMillis,
        totalScheduledMillis,
        workedDays,
        totalAbsencesCount: totalUnexcusedAbsenceCount, // This is ONLY unexcused absences
        totalLatesCount,
        totalLateMinutes,
        totalEarlyDepartureMinutes,
        daysToDeduct, 
        // Bonus Info
        didQualifyForBonus: !isBonusDisqualified,
        bonusAmount,
        newStreak,
    };
};