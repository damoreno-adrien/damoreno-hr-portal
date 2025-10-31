/* src/hooks/useMonthlyStats.js */

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import * as dateUtils from '../utils/dateUtils';
import { calculateAttendanceStatus } from '../utils/statusUtils'; // We'll use our helper!
import { DateTime } from 'luxon';

const THAILAND_TIMEZONE = 'Asia/Bangkok';

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

export const useMonthlyStats = (db, user) => {
    const [monthlyStats, setMonthlyStats] = useState({
        totalHours: '0h 0m',
        workedDays: 0,
        absences: 0,
        totalTimeLate: '0h 0m', // Changed from 'lates'
    });
    // We'll skip 'bonusStatus' for now to focus on stats

    useEffect(() => {
        if (!db || !user) return;

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
            let totalMillis = 0;
            let totalLateMinutes = 0;
            let workedDays = 0;
            let absences = 0;

            let loopDay = now.startOf('month');
            while (loopDay <= now) { // Loop from start of month until today
                const dateStr = loopDay.toISODate();
                const dateJS = loopDay.toJSDate(); // For calculateAttendanceStatus

                const attendance = attendanceMap.get(dateStr);
                const schedule = schedulesMap.get(dateStr);
                const leave = leaveMap.get(dateStr);

                // Pass the JS Date object
                const { status, minutes } = calculateAttendanceStatus(schedule, attendance, leave, dateJS);

                // A) Calculate Total Hours
                if (attendance && attendance.checkInTime && attendance.checkOutTime) {
                    const checkIn = attendance.checkInTime.toDate();
                    const checkOut = attendance.checkOutTime.toDate();
                    let durationMs = checkOut.getTime() - checkIn.getTime();

                    // Subtract break time
                    if (attendance.breakStart && attendance.breakEnd) {
                        const breakStart = attendance.breakStart.toDate();
                        const breakEnd = attendance.breakEnd.toDate();
                        const breakMs = breakEnd.getTime() - breakStart.getTime();
                        durationMs -= breakMs;
                    }
                    totalMillis += durationMs;
                }

                // B) Count Worked Days
                if (attendance && attendance.checkInTime) {
                    workedDays++;
                }
                
                // C) Sum Total Late Minutes
                if (status === 'Late') {
                    totalLateMinutes += minutes;
                }

                // D) Count Absences
                if (status === 'Absent' && loopDay.toISODate() < today) { // Only count past absences
                    absences++;
                }
                
                loopDay = loopDay.plus({ days: 1 });
            }

            setMonthlyStats({
                totalHours: formatMillisToHours(totalMillis),
                workedDays: workedDays,
                absences: absences,
                totalTimeLate: formatMinutesToHours(totalLateMinutes),
            });
        };

        fetchStats().catch(console.error);
    }, [db, user]);

    // We removed bonusStatus logic, but you can add it back here
    return { monthlyStats, bonusStatus: { onTrack: true, text: 'On Track' } };
};