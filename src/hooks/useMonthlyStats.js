/* src/hooks/useMonthlyStats.js */

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { DateTime } from 'luxon';
import { calculateMonthlyStats } from '../utils/attendanceCalculator'; 

const THAILAND_TIMEZONE = 'Asia/Bangkok';

const formatMillisToHours = (ms) => {
    if (!ms || isNaN(ms) || ms <= 0) return '0h 0m';
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
};

const formatMinutesToHours = (min) => {
    if (!min || isNaN(min) || min <= 0) return '0h 0m';
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
    const [bonusStatus, setBonusStatus] = useState({ onTrack: true, text: 'Loading...', hidden: false });

    useEffect(() => {
        if (!db || !user || !companyConfig) return;

        const profileRef = doc(db, 'staff_profiles', user.uid);
        const unsubscribe = onSnapshot(profileRef, (profileSnap) => {
            if (!profileSnap.exists()) return;

            const staffProfile = { id: profileSnap.id, ...profileSnap.data() };
            const now = DateTime.now().setZone(THAILAND_TIMEZONE);
            const currentPayPeriod = { month: now.month, year: now.year };

            calculateMonthlyStats(db, staffProfile, currentPayPeriod, companyConfig)
                .then(stats => {
                    setMonthlyStats({
                        totalHoursWorked: formatMillisToHours(stats.totalActualMillis || 0),
                        totalHoursScheduled: formatMillisToHours(stats.totalScheduledMillis || 0),
                        workedDays: stats.workedDays || 0,
                        absences: stats.totalAbsencesCount || 0,
                        totalTimeLate: formatMinutesToHours(stats.totalLateMinutes || 0),
                        totalEarlyDepartures: formatMinutesToHours(stats.totalEarlyDepartureMinutes || 0),
                    });

                    // MASQUAGE DU BONUS SI NON CONFIGURÉ POUR LA BRANCHE
                    if (!stats.isBonusActive || staffProfile.isAttendanceBonusEligible === false) {
                        setBonusStatus({ 
                            onTrack: false, 
                            text: 'Not Eligible',
                            notEligible: true,
                            hidden: !stats.isBonusActive // Si pas de politique pour cette branche, on le cache
                        });
                    } else {
                        setBonusStatus({
                            onTrack: stats.didQualifyForBonus,
                            text: stats.didQualifyForBonus ? 'On Track' : 'Bonus Lost',
                            hidden: false
                        });
                    }
                })
                .catch(err => console.error("Error calculating monthly stats:", err));
        });

        return () => unsubscribe(); 

    }, [db, user, companyConfig]);

    return { monthlyStats, bonusStatus };
};