/* src/hooks/useMonthlyStats.js */

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import * as dateUtils from '../utils/dateUtils';
import { calculateAttendanceStatus } from '../utils/statusUtils';
import { DateTime } from 'luxon';

const THAILAND_TIMEZONE = 'Asia/Bangkok';
const DEFAULT_BREAK_MS = 60 * 60 * 1000; // 1 hour in milliseconds

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
        totalHours: '0h 0m', // This will now be SCHEDULED hours
        workedDays: 0,
        absences: 0,
        totalTimeLate: '0h 0m',
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
            // (Queries are the same as before)
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
            // (Maps are the same as before)
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
            let totalActualMillis = 0; // For bonus stats (internal)
            let totalScheduledMillis = 0; // For display
            let totalLateMinutes = 0;
            let workedDays = 0;
            let absences = 0;

            let loopDay = now.startOf('month');
            while (loopDay <= now) { 
                const dateStr = loopDay.toISODate();
                const dateJS = loopDay.toJSDate(); 

                const attendance = attendanceMap.get(dateStr);
                const schedule = schedulesMap.get(dateStr);
                const leave = leaveMap.get(dateStr);

                const { status, minutes } = calculateAttendanceStatus(schedule, attendance, leave, dateJS);

                // --- A) Calculate Total ACTUAL Hours (with 1h break) ---
                // This is still needed for bonus calculations, but not for display
                if (attendance && attendance.checkInTime && attendance.checkOutTime) {
                    const checkIn = attendance.checkInTime.toDate();
                    const checkOut = attendance.checkOutTime.toDate();
                    let durationMs = checkOut.getTime() - checkIn.getTime();
                    
                    // --- NEW RULE: Subtract 1 default hour, ignore break times ---
                    durationMs -= DEFAULT_BREAK_MS; 
                    
                    if (durationMs > 0) {
                        totalActualMillis += durationMs;
                    }
                    workedDays++; // Count day as worked if they checked in/out
                }

                // --- B) Calculate Total SCHEDULED Hours (with 1h break) ---
                // This will be displayed on the card
                if (schedule && schedule.type === 'work' && schedule.startTime && schedule.endTime) {
                    try {
                        const start = DateTime.fromISO(`${schedule.date}T${schedule.startTime}`, { zone: THAILAND_TIMEZONE });
                        const end = DateTime.fromISO(`${schedule.date}T${schedule.endTime}`, { zone: THAILAND_TIMEZONE });
                        
                        let scheduledDurationMs = end.diff(start).as('milliseconds');
                        
                        // --- NEW RULE: Subtract 1 default hour ---
                        scheduledDurationMs -= DEFAULT_BREAK_MS;

                        if (scheduledDurationMs > 0) {
                            totalScheduledMillis += scheduledDurationMs;
                        }
                    } catch(e) {
                        console.error("Error parsing schedule time", e);
                    }
                }
                
                // --- C) Sum Total Late Minutes ---
                if (status === 'Late') {
                    totalLateMinutes += minutes;
                }

                // --- D) Count Absences ---
                if (status === 'Absent' && loopDay.toISODate() < today) {
                    absences++;
                }
                
                loopDay = loopDay.plus({ days: 1 });
            }

            setMonthlyStats({
                // --- UPDATED: This now shows SCHEDULED hours ---
                totalHours: formatMillisToHours(totalScheduledMillis),
                workedDays: workedDays,
                absences: absences,
                totalTimeLate: formatMinutesToHours(totalLateMinutes),
            });
        };

        fetchStats().catch(console.error);
    }, [db, user]);

    // This logic should be updated to use totalActualMillis
    const bonusStatus = { onTrack: true, text: 'On Track' }; 

    return { monthlyStats, bonusStatus };
};