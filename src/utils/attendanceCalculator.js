/* src/utils/attendanceCalculator.js */

import { collection, query, where, getDocs } from 'firebase/firestore';
import { DateTime } from 'luxon';
import { calculateAttendanceStatus } from './statusUtils';

const THAILAND_TIMEZONE = 'Asia/Bangkok';
const DEFAULT_CHECKOUT_TIME = '23:00:00';

export const calculateMonthlyStats = async (db, staff, payPeriod, companyConfig, currentJob) => {
    const { month, year } = payPeriod;
    const userId = staff.id;
    const now = DateTime.now().setZone(THAILAND_TIMEZONE);
    const today = now.toISODate();

    const startOfMonth = DateTime.fromObject({ year, month, day: 1 }, { zone: THAILAND_TIMEZONE }).toISODate();
    const endOfMonth = DateTime.fromObject({ year, month }, { zone: THAILAND_TIMEZONE }).endOf('month').toISODate();
    const endOfLoop = DateTime.min(now, DateTime.fromISO(endOfMonth, { zone: THAILAND_TIMEZONE }));

    const payType = currentJob?.payType || 'Monthly';
    const currentStreak = staff.bonusStreak || 0;

    const branchOverrides = staff.branchId && companyConfig.branchSettings ? companyConfig.branchSettings[staff.branchId] : {};
    const SICK_LEAVE_QUOTA_DAYS = branchOverrides?.leaveEntitlements?.sickDays ?? companyConfig.leaveEntitlements?.sickDays ?? 30;

    const bonusSettings = branchOverrides?.attendanceBonus || companyConfig.attendanceBonus || {};
    const allowedLates = bonusSettings.allowedLates ?? 3;
    const maxLateMinutesAllowed = bonusSettings.maxLateMinutesAllowed ?? 30;
    const allowedAbsences = bonusSettings.allowedAbsences ?? 0;
    
    const isBonusActive = !!(bonusSettings.month1 || bonusSettings.month2 || bonusSettings.month3);

    let isFirstMonth = false;
    if (staff.startDate) {
        try {
            const jsDate = staff.startDate.toDate ? staff.startDate.toDate() : new Date(staff.startDate);
            const dtStart = DateTime.fromJSDate(jsDate, { zone: THAILAND_TIMEZONE });
            if (dtStart.year === year && dtStart.month === month) isFirstMonth = true;
        } catch (e) { console.error("Error parsing staff start date", e); }
    }

    const startOfYear = DateTime.fromObject({ year, month: 1, day: 1 }, { zone: THAILAND_TIMEZONE }).toISODate();
    const endOfPayPeriod = endOfMonth;

    const [attendanceSnap, schedulesSnap, leaveSnap] = await Promise.all([
        getDocs(query(collection(db, 'attendance'), where('staffId', '==', userId), where('date', '>=', startOfMonth), where('date', '<=', endOfMonth))),
        getDocs(query(collection(db, 'schedules'), where('staffId', '==', userId), where('date', '>=', startOfMonth), where('date', '<=', endOfMonth))),
        getDocs(query(collection(db, 'leave_requests'), where('staffId', '==', userId), where('status', '==', 'approved'), where('endDate', '>=', startOfYear)))
    ]);

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
        if (data.leaveType === 'Sick Leave') yearlySickLeaveRequests.push(data);

        let current = DateTime.fromISO(data.startDate, { zone: THAILAND_TIMEZONE });
        const end = DateTime.fromISO(data.endDate, { zone: THAILAND_TIMEZONE });

        while (current <= end) {
            const dateStr = current.toISODate();
            if (dateStr >= startOfMonth && dateStr <= endOfMonth) {
                leaveMap.set(dateStr, data);
                if (data.leaveType === 'Sick Leave') thisMonthSickLeaves.push({ id: doc.id, ...data });
            }
            current = current.plus({ days: 1 });
        }
    });

    let totalActualMillis = 0;
    let totalScheduledMillis = 0;
    let totalLateMinutes = 0;
    let totalApprovedLateMinutes = 0; // <-- NOUVEAU: Trace isolée pour la paie
    let totalOtMinutes = 0;
    let totalLatesCount = 0;
    let totalUnexcusedAbsenceCount = 0;
    let unexcusedAbsenceDates = []; 
    let workedDays = 0;

    let loopDay = DateTime.fromISO(startOfMonth, { zone: THAILAND_TIMEZONE });
    const loopUntil = (payPeriod.year === now.year && payPeriod.month === now.month) ? endOfLoop : DateTime.fromISO(endOfMonth, { zone: THAILAND_TIMEZONE });

    const resolvedConfig = { ...companyConfig, ...branchOverrides };
    const breakMins = resolvedConfig.breakDurationMinutes !== undefined ? parseInt(resolvedConfig.breakDurationMinutes) : 60;
    const standardBreakMs = breakMins * 60000;

    while (loopDay <= loopUntil) {
        const dateStr = loopDay.toISODate();
        const dateJS = loopDay.toJSDate();
        const attendance = attendanceMap.get(dateStr);
        const schedule = schedulesMap.get(dateStr);
        const leave = leaveMap.get(dateStr);

        const { status, checkInTime, checkOutTime, suggestedLateMinutes, suggestedOtMinutes, approvedLateMinutes, approvedOtMinutes } = calculateAttendanceStatus(schedule, attendance, leave, dateJS, resolvedConfig);

        if (checkInTime) {
            workedDays++;
            let actualCheckOut = checkOutTime;
            
            if (!actualCheckOut && dateStr < today) {
                actualCheckOut = DateTime.fromISO(`${dateStr}T${DEFAULT_CHECKOUT_TIME}`, { zone: THAILAND_TIMEZONE }).toJSDate();
            }

            if (actualCheckOut) {
                let durationMs = actualCheckOut.getTime() - checkInTime.getTime();
                
                if (attendance?.includesBreak !== false) {
                    if (attendance?.breakStart) {
                        if (attendance.breakEnd) {
                            const bStart = attendance.breakStart.toDate ? attendance.breakStart.toDate() : attendance.breakStart;
                            const bEnd = attendance.breakEnd.toDate ? attendance.breakEnd.toDate() : attendance.breakEnd;
                            const actualBreakMs = bEnd - bStart;
                            durationMs -= Math.max(actualBreakMs, standardBreakMs);
                        } else {
                            durationMs -= standardBreakMs;
                        }
                    } else if (durationMs > 5 * 3600000) {
                        durationMs -= standardBreakMs;
                    }
                }
                if (durationMs > 0) totalActualMillis += durationMs;
            }
        }

        if (schedule && schedule.type !== 'off' && !leave) {
            try {
                const start = DateTime.fromISO(`${schedule.date}T${schedule.startTime}`, { zone: THAILAND_TIMEZONE });
                const end = DateTime.fromISO(`${schedule.date}T${schedule.endTime}`, { zone: THAILAND_TIMEZONE });
                let schedMs = end.diff(start).as('milliseconds');
                if (schedule.includesBreak !== false && schedMs >= (5 * 3600000)) {
                    schedMs -= standardBreakMs;
                }
                if (schedMs > 0) totalScheduledMillis += schedMs;
            } catch (e) { }
        }

        if (loopDay <= endOfLoop) {
            const actualLateForBonus = attendance?.manuallyEdited ? approvedLateMinutes : suggestedLateMinutes;
            
            if (actualLateForBonus > 0) {
                totalLateMinutes += actualLateForBonus;
                totalLatesCount++;
            }

            // CORRECTION: Seuls les retards validés par le manager sont accumulés pour la paie
            if (approvedLateMinutes > 0) {
                totalApprovedLateMinutes += approvedLateMinutes;
            }
            
            if (approvedOtMinutes > 0) {
                totalOtMinutes += approvedOtMinutes; 
            }

            const isScheduled = schedule && schedule.type !== 'off';
            const hasPointed = attendance && attendance.checkInTime;
            const hasApprovedLeave = !!leave;

            let isAbsent = false;
            if (isScheduled && !hasPointed && !hasApprovedLeave) isAbsent = true;
            else if (status === 'Absent') isAbsent = true;

            const isPastMonth = (year < now.year) || (year === now.year && month < now.month);
            if (isAbsent) {
                if (isPastMonth || loopDay.toISODate() < today) {
                    totalUnexcusedAbsenceCount++;
                    unexcusedAbsenceDates.push(loopDay.toISODate());
                }
            }
        }
        loopDay = loopDay.plus({ days: 1 });
    }

    const isBonusDisqualified = (totalLatesCount > allowedLates) ||
        (totalLateMinutes > maxLateMinutesAllowed) ||
        (totalUnexcusedAbsenceCount > allowedAbsences) ||
        (workedDays === 0);

    let bonusAmount = 0;
    let newStreak = 0;

    const isEligible = staff.isAttendanceBonusEligible !== false;

    if (isBonusActive && isEligible && !isBonusDisqualified) {
        if (currentStreak === 1) bonusAmount = bonusSettings.month1 || 400;
        else if (currentStreak === 2) bonusAmount = bonusSettings.month2 || 800;
        else if (currentStreak >= 3) bonusAmount = bonusSettings.month3 || 1200;
        else bonusAmount = 0; 
        
        if (isFirstMonth) bonusAmount = 0;
        newStreak = currentStreak + 1;
    } else {
        newStreak = 0;
        bonusAmount = 0;
    }

    const totalSickDaysYearSoFar = yearlySickLeaveRequests.reduce((acc, req) => {
        const start = DateTime.fromISO(req.startDate);
        const end = DateTime.fromISO(req.endDate);
        return acc + (end.diff(start, 'days').days + 1);
    }, 0);

    let daysToDeduct = 0;
    if (totalSickDaysYearSoFar > SICK_LEAVE_QUOTA_DAYS) {
        const overflow = totalSickDaysYearSoFar - SICK_LEAVE_QUOTA_DAYS;
        const thisMonthSickDays = thisMonthSickLeaves.reduce((acc, req) => {
            const start = DateTime.fromISO(req.startDate);
            const end = DateTime.fromISO(req.endDate);
            return acc + (end.diff(start, 'days').days + 1);
        }, 0);
        daysToDeduct = Math.min(thisMonthSickDays, overflow);
    }

    return {
        totalActualMillis,
        totalScheduledMillis,
        workedDays,
        totalAbsencesCount: totalUnexcusedAbsenceCount,
        unexcusedAbsenceDates,
        totalLatesCount,
        totalLateMinutes,
        totalApprovedLateMinutes, // <-- NOUVEAU
        totalOtMinutes,
        daysToDeduct,
        isBonusActive, 
        didQualifyForBonus: !isBonusDisqualified,
        bonusAmount,
        newStreak,
    };
};