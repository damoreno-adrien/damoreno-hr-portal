import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import * as dateUtils from '../utils/dateUtils'; // Use new standard

export const useMonthlyStats = (db, user, companyConfig) => {
    const [monthlyStats, setMonthlyStats] = useState({
        workedDays: 0,
        lates: 0,
        absences: 0,
        totalHours: '0h 0m'
    });
    const [bonusStatus, setBonusStatus] = useState({ text: 'Calculating...', onTrack: true });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db || !user || !companyConfig) return;

        const calculate = async () => {
            setIsLoading(true);
            const now = new Date();
            
            // Use standard functions for date range
            const startOfMonth = dateUtils.startOfMonth(now);
            const endOfMonth = dateUtils.endOfMonth(now);
            const startDate = dateUtils.formatISODate(startOfMonth);
            const endDate = dateUtils.formatISODate(endOfMonth);
            const today = dateUtils.startOfToday(); // For comparison

            const schedulesQuery = query(collection(db, "schedules"), where("staffId", "==", user.uid), where("date", ">=", startDate), where("date", "<=", endDate));
            const attendanceQuery = query(collection(db, "attendance"), where("staffId", "==", user.uid), where("date", ">=", startDate), where("date", "<=", endDate));

            const [schedulesSnapshot, attendanceSnapshot] = await Promise.all([getDocs(schedulesQuery), getDocs(attendanceQuery)]);
            const schedules = schedulesSnapshot.docs.map(doc => doc.data());
            const attendanceRecords = new Map(attendanceSnapshot.docs.map(doc => [doc.data().date, doc.data()]));

            let lateCount = 0;
            let absenceCount = 0;
            let totalMillis = 0;

            schedules.forEach(schedule => {
                const scheduleDate = dateUtils.parseISODateString(schedule.date);
                // Only count stats for days that have passed or are today
                if (!scheduleDate || scheduleDate > today) return; 

                const attendance = attendanceRecords.get(schedule.date);
                if (!attendance) {
                    absenceCount++;
                } else {
                    // Use standard parsing for schedule start time
                    const scheduledStart = dateUtils.fromFirestore(`${schedule.date}T${schedule.startTime}`);
                    const actualCheckIn = dateUtils.fromFirestore(attendance.checkInTime);
                    
                    if (actualCheckIn && scheduledStart && actualCheckIn > scheduledStart) {
                        lateCount++;
                    }

                    const actualCheckOut = dateUtils.fromFirestore(attendance.checkOutTime);
                    const breakStart = dateUtils.fromFirestore(attendance.breakStart);
                    const breakEnd = dateUtils.fromFirestore(attendance.breakEnd);

                    if (actualCheckIn && actualCheckOut) {
                        // Use standard difference calculation
                        let workMillis = dateUtils.differenceInMilliseconds(actualCheckOut, actualCheckIn);
                        if (breakStart && breakEnd) {
                            workMillis -= dateUtils.differenceInMilliseconds(breakEnd, breakStart);
                        }
                        totalMillis += Math.max(0, workMillis); // Ensure no negative time
                    }
                }
            });

            if (companyConfig.attendanceBonus) {
                const { allowedAbsences, allowedLates } = companyConfig.attendanceBonus;
                setBonusStatus({
                    text: (absenceCount > allowedAbsences || lateCount > allowedLates) ? 'Bonus Lost for this Month' : 'On Track for Bonus',
                    onTrack: !(absenceCount > allowedAbsences || lateCount > allowedLates)
                });
            }

            setMonthlyStats({
                workedDays: attendanceRecords.size,
                lates: lateCount,
                absences: absenceCount,
                totalHours: dateUtils.formatDuration(totalMillis) // Use standard duration formatter
            });
            setIsLoading(false);
        };

        calculate();
    }, [db, user, companyConfig]);

    return { monthlyStats, bonusStatus, isLoading };
};