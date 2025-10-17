import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';

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
            const year = now.getUTCFullYear();
            const month = now.getUTCMonth();
            const startDate = new Date(Date.UTC(year, month, 1)).toISOString().split('T')[0];
            const endDate = new Date(Date.UTC(year, month + 1, 0)).toISOString().split('T')[0];

            const schedulesQuery = query(collection(db, "schedules"), where("staffId", "==", user.uid), where("date", ">=", startDate), where("date", "<=", endDate));
            const attendanceQuery = query(collection(db, "attendance"), where("staffId", "==", user.uid), where("date", ">=", startDate), where("date", "<=", endDate));

            const [schedulesSnapshot, attendanceSnapshot] = await Promise.all([getDocs(schedulesQuery), getDocs(attendanceQuery)]);
            const schedules = schedulesSnapshot.docs.map(doc => doc.data());
            const attendanceRecords = new Map(attendanceSnapshot.docs.map(doc => [doc.data().date, doc.data()]));

            let lateCount = 0;
            let absenceCount = 0;
            let totalMillis = 0;

            schedules.forEach(schedule => {
                if (new Date(schedule.date) > new Date()) return;

                const attendance = attendanceRecords.get(schedule.date);
                if (!attendance) {
                    absenceCount++;
                } else {
                    const scheduledStart = new Date(`${schedule.date}T${schedule.startTime}`);
                    const actualCheckIn = attendance.checkInTime.toDate();
                    if (actualCheckIn > scheduledStart) {
                        lateCount++;
                    }

                    if (attendance.checkInTime && attendance.checkOutTime) {
                        let workMillis = attendance.checkOutTime.toDate() - attendance.checkInTime.toDate();
                        if (attendance.breakStart && attendance.breakEnd) {
                            workMillis -= (attendance.breakEnd.toDate() - attendance.breakStart.toDate());
                        }
                        totalMillis += workMillis;
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

            const hours = Math.floor(totalMillis / 3600000);
            const minutes = Math.floor((totalMillis % 3600000) / 60000);

            setMonthlyStats({
                workedDays: attendanceRecords.size,
                lates: lateCount,
                absences: absenceCount,
                totalHours: `${hours}h ${minutes}m`
            });
            setIsLoading(false);
        };

        calculate();
    }, [db, user, companyConfig]);

    return { monthlyStats, bonusStatus, isLoading };
};