/* src/utils/attendanceCalculator.js */

import { collection, query, where, getDocs } from 'firebase/firestore';
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

    // --- LECTURE STRICTE DES PARAMÈTRES PAR SUCCURSALE ---
    const branchOverrides = staff.branchId && companyConfig.branchSettings ? companyConfig.branchSettings[staff.branchId] : {};

    const SICK_LEAVE_QUOTA_DAYS = branchOverrides?.leaveEntitlements?.sickDays ?? companyConfig.leaveEntitlements?.sickDays ?? 30;

    const bonusSettings = branchOverrides?.attendanceBonus || companyConfig.attendanceBonus || {};
    const allowedLates = bonusSettings.allowedLates ?? 3;
    const maxLateMinutesAllowed = bonusSettings.maxLateMinutesAllowed ?? 30;
    const allowedAbsences = bonusSettings.allowedAbsences ?? 0;

    // --- DÉTECTION DU 1ER MOIS D'EMBAUCHE ---
    let isFirstMonth = false;
    if (staff.startDate) {
        try {
            const jsDate = staff.startDate.toDate ? staff.startDate.toDate() : new Date(staff.startDate);
            const dtStart = DateTime.fromJSDate(jsDate, { zone: THAILAND_TIMEZONE });
            if (dtStart.year === year && dtStart.month === month) {
                isFirstMonth = true;
            }
        } catch (e) {
            console.error("Error parsing staff start date", e);
        }
    }

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
    let totalOtMinutes = 0;
    let totalLatesCount = 0;
    let totalUnexcusedAbsenceCount = 0;
    let unexcusedAbsenceDates = []; // <-- NOUVEAU
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

        if (schedule && schedule.type !== 'off' && !leave) {
            try {
                const start = DateTime.fromISO(`${schedule.date}T${schedule.startTime}`, { zone: THAILAND_TIMEZONE });
                const end = DateTime.fromISO(`${schedule.date}T${schedule.endTime}`, { zone: THAILAND_TIMEZONE });
                let schedMs = end.diff(start).as('milliseconds');
                const schedBreak = schedule.includesBreak !== undefined ? schedule.includesBreak : (payType === 'Monthly');
                if (schedBreak && schedMs >= (7 * 60 * 60 * 1000)) {
                    schedMs -= DEFAULT_BREAK_MS;
                }
                if (schedMs > 0) totalScheduledMillis += schedMs;
            } catch (e) { }
        }
        // Juste avant le bloc : if (loopDay <= endOfLoop)
        if (schedule) {
            console.log(`Jour: ${dateStr} | SchedType: ${schedule.type} | HasPointed: ${!!attendance?.checkInTime}`);
        }
        if (loopDay <= endOfLoop) {
            const currentStatus = (status || '').toLowerCase();

            if (currentStatus === 'late') {
                totalLateMinutes += (lateMinutes || 0);
                totalLatesCount++;
            }
            if (otMinutes > 0) {
                if (attendance?.otStatus !== 'rejected') {
                    totalOtMinutes += otMinutes;
                }
            }

            // --- LA DÉTECTION INFAILLIBLE DE L'ABSENCE (NO SHOW) ---
            const isScheduled = schedule && schedule.type !== 'off';
            const hasPointed = attendance && attendance.checkInTime;
            const hasApprovedLeave = !!leave;

            let isAbsent = false;

            // S'il devait travailler, n'a pas pointé et n'a pas de congé -> NO SHOW
            if (isScheduled && !hasPointed && !hasApprovedLeave) {
                isAbsent = true;
            }
            // Fallback: si le calculateur de statut remonte explicitement une absence
            else if (currentStatus === 'absent' || currentStatus === 'no show') {
                isAbsent = true;
            }

            // On ne comptabilise l'absence que si la journée est terminée
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

    // --- APPLICATION EXACTE DE TA RÈGLE DE BONUS ---
    const isBonusDisqualified = (totalLatesCount > allowedLates) ||
        (totalLateMinutes > maxLateMinutesAllowed) ||
        (totalUnexcusedAbsenceCount > allowedAbsences) ||
        (workedDays === 0);

    let bonusAmount = 0;
    let newStreak = 0;

    const isEligible = staff.isAttendanceBonusEligible !== false;

    if (isEligible && !isBonusDisqualified) {
        // 1. Paiement basé sur le Strike ACQUIS (currentStreak)
        if (currentStreak === 1) bonusAmount = bonusSettings.month1 || 400;
        else if (currentStreak === 2) bonusAmount = bonusSettings.month2 || 800;
        else if (currentStreak >= 3) bonusAmount = bonusSettings.month3 || 1200;
        else bonusAmount = 0; // Strike 0 = 0 THB

        // 2. Sécurité : le 1er mois d'embauche donne toujours 0 THB
        if (isFirstMonth) {
            bonusAmount = 0;
        }

        // 3. Incrémentation du strike pour le mois prochain (Ex: 0 devient 1)
        newStreak = currentStreak + 1;
    } else {
        // Disqualifié (absences, retards excessifs, manuel), tout retombe à 0
        newStreak = 0;
        bonusAmount = 0;
    }

    // Leave Logic
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
        totalOtMinutes,
        daysToDeduct,
        didQualifyForBonus: !isBonusDisqualified,
        bonusAmount,
        newStreak,
    };
};