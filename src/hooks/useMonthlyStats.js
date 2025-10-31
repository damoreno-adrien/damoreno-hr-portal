import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import * as dateUtils from '../utils/dateUtils';
import { calculateAttendanceStatus } from '../utils/statusUtils';
import { DateTime } from 'luxon';

const THAILAND_TIMEZONE = 'Asia/Bangkok';
const DEFAULT_BREAK_MS = 60 * 60 * 1000; // 1 hour in milliseconds
const DEFAULT_CHECKOUT_TIME = '23:00:00'; // 11:00 PM

// Helper function to format milliseconds into "170h 45m"
const formatMillisToHours = (ms) => {
    if (ms <= 0) return '0h 0m';
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
};

// Helper function to format minutes into "2h 30m"
const formatMinutesToHours = (min) => {
    if (min <= 0) return '0h 0m';
    const hours = Math.floor(min / 60);
    const minutes = min % 60;
    return `${hours}h ${minutes}m`;
};

export const useMonthlyStats = (db, user, companyConfig) => {
    const [monthlyStats, setMonthlyStats] = useState({
        totalHoursWorked: '0h 0m',
        totalHoursScheduled: '0h 0m',
        workedDays: 0,
        absences: 0,
        totalTimeLate: '0h 0m',
    });
    
    const [bonusStatus, setBonusStatus] = useState({ onTrack: true, text: 'On Track' });

    useEffect(() => {
        if (!db || !user || !companyConfig) return;

        const fetchStats = async () => {
            const now = DateTime.now().setZone(THAILAND_TIMEZONE);
            const startOfMonth = now.startOf('month').toISODate();
            const endOfMonth = now.endOf('month').toISODate();
            const today = now.toISODate();

            // --- 1. Fetch all data for the month concurrently ---
            const attendanceQuery = query(
                collection(db, 'attendance'),
                where('staffId', '==', user.uid),
                where('date', '>=', startOfMonth),
                where('date', '<=', endOfMonth)
            );
            const schedulesQuery = query(
                collection(db, 'schedules'),
                where('staffId', '==', user.uid),
                where('date', '>=', startOfMonth),
                where('date', '<=', endOfMonth)
            );
            const leaveQuery = query(
                collection(db, 'leave_requests'),
                where('staffId', '==', user.uid),
                where('status', '==', 'approved'),
                where('endDate', '>=', startOfMonth)
            );

            const [attendanceSnap, schedulesSnap, leaveSnap] = await Promise.all([
                getDocs(attendanceQuery),
                getDocs(schedulesQuery),
                getDocs(leaveQuery),
            ]);

            // --- 2. Process data into fast-lookup maps ---
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
            let workedDays = 0;

            let loopDay = now.startOf('month');
            // Loop from the start of the month up to (and including) today
            while (loopDay <= now) { 
                const dateStr = loopDay.toISODate();
                const dateJS = loopDay.toJSDate(); 

                const attendance = attendanceMap.get(dateStr);
                const schedule = schedulesMap.get(dateStr);
                const leave = leaveMap.get(dateStr);

                const { status, minutes } = calculateAttendanceStatus(schedule, attendance, leave, dateJS);

                // --- A) Calculate Total ACTUAL Hours (Worked) ---
                if (attendance && attendance.checkInTime) {
                    workedDays++;
                    const checkIn = attendance.checkInTime.toDate();
                    let checkOut;

                    if (attendance.checkOutTime) {
                        checkOut = attendance.checkOutTime.toDate();
                    } else if (dateStr < today) {
                        // Past day with missing checkout: use 11 PM default
                        checkOut = DateTime.fromISO(`${dateStr}T${DEFAULT_CHECKOUT_TIME}`, { zone: THAILAND_TIMEZONE }).toJSDate();
                    } else {
                        // Today with missing checkout: don't count hours yet
                        checkOut = null; 
                    }

                    if (checkOut) {
                        let durationMs = checkOut.getTime() - checkIn.getTime();
                        durationMs -= DEFAULT_BREAK_MS; // Subtract 1 default hour
                        if (durationMs > 0) {
                            totalActualMillis += durationMs;
                        }
                    }
                }

                // --- B) Calculate Total SCHEDULED Hours ---
                if (schedule && schedule.type === 'work' && schedule.startTime && schedule.endTime) {
                    try {
                        const start = DateTime.fromISO(`${schedule.date}T${schedule.startTime}`, { zone: THAILAND_TIMEZONE });
                        const end = DateTime.fromISO(`${schedule.date}T${schedule.endTime}`, { zone: THAILAND_TIMEZONE });
                        
                        let scheduledDurationMs = end.diff(start).as('milliseconds');
                        scheduledDurationMs -= DEFAULT_BREAK_MS; // Subtract 1 default hour

                        if (scheduledDurationMs > 0) {
                            totalScheduledMillis += scheduledDurationMs;
                        }
                    } catch(e) {
                        console.error("Error parsing schedule time", e);
                    }
                }
                
                // --- C) Sum Lates and Absences for Bonus ---
                if (status === 'Late') {
                    totalLateMinutes += minutes;
                    totalLatesCount++;
                }
                if (status === 'Absent' && loopDay.toISODate() < today) { // Only count past absences
                    totalAbsencesCount++;
                }
                
                loopDay = loopDay.plus({ days: 1 });
            }

            // --- 4. Set Final Stats ---
            setMonthlyStats({
                totalHoursWorked: formatMillisToHours(totalActualMillis),
                totalHoursScheduled: formatMillisToHours(totalScheduledMillis),
                workedDays: workedDays,
                absences: totalAbsencesCount,
                totalTimeLate: formatMinutesToHours(totalLateMinutes),
            });

            // --- 5. Calculate Bonus Status ---
            const { allowedAbsences, allowedLates } = companyConfig.attendanceBonus || { allowedAbsences: 0, allowedLates: 1 };
            const isBonusLost = totalAbsencesCount > allowedAbsences || totalLatesCount > allowedLates;
            
            setBonusStatus({
                onTrack: !isBonusLost,
                text: isBonusLost ? 'Bonus Lost for this month' : 'On Track'
            });
        };

        fetchStats().catch(console.error);
    }, [db, user, companyConfig]); // Add companyConfig as dependency

    return { monthlyStats, bonusStatus };
};