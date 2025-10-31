import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore'; // Changed imports
import { DateTime } from 'luxon';
// --- NEW IMPORT ---
import { calculateMonthlyStats } from '../utils/attendanceCalculator'; 

const THAILAND_TIMEZONE = 'Asia/Bangkok';

// ... (formatMillisToHours and formatMinutesToHours helpers remain the same) ...
const formatMillisToHours = (ms) => {
    if (ms <= 0) return '0h 0m';
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
};
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
        totalEarlyDepartures: '0h 0m',
    });
    const [bonusStatus, setBonusStatus] = useState({ onTrack: true, text: 'On Track' });

    useEffect(() => {
        if (!db || !user || !companyConfig) return;

        // Listen to the user's profile to get their *current* bonus streak
        const profileRef = doc(db, 'staff_profiles', user.uid);
        const unsubscribe = onSnapshot(profileRef, (profileSnap) => {
            if (!profileSnap.exists()) return;

            const staffProfile = { id: profileSnap.id, ...profileSnap.data() };
            const now = DateTime.now().setZone(THAILAND_TIMEZONE);
            const currentPayPeriod = { month: now.month, year: now.year };

            // --- 1. Call the new shared calculator ---
            calculateMonthlyStats(db, staffProfile, currentPayPeriod, companyConfig)
                .then(stats => {
                    // --- 2. Set Final Stats for the dashboard ---
                    setMonthlyStats({
                        totalHoursWorked: formatMillisToHours(stats.totalActualMillis),
                        totalHoursScheduled: formatMillisToHours(stats.totalScheduledMillis),
                        workedDays: stats.workedDays,
                        absences: stats.totalAbsencesCount,
                        totalTimeLate: formatMinutesToHours(stats.totalLateMinutes),
                        totalEarlyDepartures: formatMinutesToHours(stats.totalEarlyDepartureMinutes),
                    });

                    // --- 3. Calculate Bonus Status ---
                    setBonusStatus({
                        onTrack: stats.didQualifyForBonus,
                        text: stats.didQualifyForBonus ? 'On Track' : 'Bonus Lost for this month'
                    });
                })
                .catch(console.error);
        });

        return () => unsubscribe(); // Unsubscribe from profile listener

    }, [db, user, companyConfig]);

    return { monthlyStats, bonusStatus };
};