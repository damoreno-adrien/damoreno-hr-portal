/* src/utils/attendanceCalculator.js */

import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { DateTime } from 'luxon';
import { calculateAttendanceStatus } from './statusUtils';

const THAILAND_TIMEZONE = 'Asia/Bangkok';
const DEFAULT_BREAK_MS = 60 * 60 * 1000;
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

    const SICK_LEAVE_QUOTA_DAYS = companyConfig.leaveEntitlements?.sickDays || 30;
    const { 
        allowedLates = 3, 
        maxLateMinutesAllowed = 30, 
        allowedAbsences = 0 
    } = companyConfig.attendanceBonus || {};

    const startOfYear = DateTime.fromObject({ year, month: 1, day: 1 }, { zone: THAILAND_TIMEZONE }).toISODate();
    const endOfPayPeriod = endOfMonth;

    // --- FETCH DATA ---
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
    let totalOtMinutes = 0; // --- NEW TRACKER ---
    let totalLatesCount = 0;
    let totalUnexcusedAbsenceCount = 0;
    let workedDays = 0;

    let loopDay = DateTime.fromISO(startOfMonth, { zone: THAILAND_TIMEZONE });
    const loopUntil = (payPeriod.year === now.year && payPeriod.month === now.month) ? endOfLoop : DateTime.fromISO(endOfMonth, { zone: THAILAND_TIMEZONE });

    while (loopDay <= loopUntil) {
        const dateStr = loopDay.toISODate();
        const dateJS = loopDay.toJSDate();
        const attendance = attendanceMap.get(dateStr);
        const schedule = schedulesMap.get(dateStr); 
        const leave = leaveMap.get(dateStr);
        
        // --- CALCULATION ---
        const { status, lateMinutes, otMinutes } = calculateAttendanceStatus(schedule, attendance, leave, dateJS, companyConfig);

        // Track Minutes
        if (attendance && attendance.checkInTime) {
            workedDays++;
            const checkIn = attendance.checkInTime.toDate();
            const checkOut = attendance.checkOutTime?.toDate() || (dateStr < today ? DateTime.fromISO(`${dateStr}T${DEFAULT_CHECKOUT_TIME}`, { zone: THAILAND_TIMEZONE }).toJSDate() : null);

            if (checkOut) {
                let durationMs = checkOut.getTime() - checkIn.getTime();
                
                const breakPolicy = attendance.includesBreak !== undefined 
                    ? attendance.includesBreak 
                    : (schedule?.includesBreak !== undefined ? schedule.includesBreak : (payType === 'Monthly'));

                if (breakPolicy && durationMs >= (7 * 60 * 60 * 1000)) {
                    durationMs -= DEFAULT_BREAK_MS;
                }
                if (durationMs > 0) totalActualMillis += durationMs;
            }
        }

        // Track Schedule
        if (schedule && schedule.type === 'work' && !leave) {
            try {
                const start = DateTime.fromISO(`${schedule.date}T${schedule.startTime}`, { zone: THAILAND_TIMEZONE });
                const end = DateTime.fromISO(`${schedule.date}T${schedule.endTime}`, { zone: THAILAND_TIMEZONE });
                let schedMs = end.diff(start).as('milliseconds');
                const schedBreak = schedule.includesBreak !== undefined ? schedule.includesBreak : (payType === 'Monthly');
                if (schedBreak && schedMs >= (7 * 60 * 60 * 1000)) {
                    schedMs -= DEFAULT_BREAK_MS;
                }
                if (schedMs > 0) totalScheduledMillis += schedMs;
            } catch (e) { /* skip bad formats */ }
        }

        // Track Stats
        if (loopDay <= endOfLoop) {
            if (status === 'Late') { 
                totalLateMinutes += (lateMinutes || 0); 
                totalLatesCount++; 
            }
            if (otMinutes > 0) {
                 // Double check rejection in case statusUtils didn't catch it
                 if (attendance?.otStatus !== 'rejected') {
                     totalOtMinutes += otMinutes;
                 }
            }
            if (status === 'Absent' && loopDay.toISODate() < today) totalUnexcusedAbsenceCount++;
        }
        loopDay = loopDay.plus({ days: 1 });
    }

    const isBonusDisqualified = (totalLatesCount > allowedLates) || 
                                (totalLateMinutes > maxLateMinutesAllowed) || 
                                (totalUnexcusedAbsenceCount > allowedAbsences);

    let bonusAmount = 0;
    let newStreak = 0;
    const isEligible = staff.isAttendanceBonusEligible !== false;

    if (isEligible && !isBonusDisqualified) {
        newStreak = currentStreak + 1;
        if (newStreak === 1) bonusAmount = companyConfig.attendanceBonus.month1 || 400;
        else if (newStreak === 2) bonusAmount = companyConfig.attendanceBonus.month2 || 800;
        else bonusAmount = companyConfig.attendanceBonus.month3 || 1200;
    } else if (!isEligible) {
        newStreak = currentStreak; 
        bonusAmount = 0;
    }

    // Leave Logic (Simplified)
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
        totalLatesCount,
        totalLateMinutes, 
        totalOtMinutes, // --- EXPORTED ---
        daysToDeduct, 
        didQualifyForBonus: !isBonusDisqualified,
        bonusAmount,
        newStreak,
    };
};