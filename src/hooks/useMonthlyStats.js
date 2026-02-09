/* src/hooks/useMonthlyStats.js */

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { DateTime } from 'luxon';
import { calculateMonthlyStats } from '../utils/attendanceCalculator'; 

const THAILAND_TIMEZONE = 'Asia/Bangkok';

// --- HELPER: Safe Formatting ---
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
    const [bonusStatus, setBonusStatus] = useState({ onTrack: true, text: 'On Track' });

    useEffect(() => {
        if (!db || !user || !companyConfig) return;

        // Listen to the user's profile to get their *current* bonus streak & eligibility
        const profileRef = doc(db, 'staff_profiles', user.uid);
        const unsubscribe = onSnapshot(profileRef, (profileSnap) => {
            if (!profileSnap.exists()) return;

            const staffProfile = { id: profileSnap.id, ...profileSnap.data() };
            const now = DateTime.now().setZone(THAILAND_TIMEZONE);
            const currentPayPeriod = { month: now.month, year: now.year };

            // --- 1. Call the calculator ---
            calculateMonthlyStats(db, staffProfile, currentPayPeriod, companyConfig)
                .then(stats => {
                    // --- 2. Set Final Stats (Safe Defaults Applied) ---
                    setMonthlyStats({
                        totalHoursWorked: formatMillisToHours(stats.totalActualMillis || 0),
                        totalHoursScheduled: formatMillisToHours(stats.totalScheduledMillis || 0),
                        workedDays: stats.workedDays || 0,
                        absences: stats.totalAbsencesCount || 0,
                        // Fix for NaN: Default to 0 if undefined
                        totalTimeLate: formatMinutesToHours(stats.totalLateMinutes || 0),
                        totalEarlyDepartures: formatMinutesToHours(stats.totalEarlyDepartureMinutes || 0),
                    });

                    // --- 3. Calculate Bonus Status ---
                    // Check eligibility flag explicitly
                    if (staffProfile.isAttendanceBonusEligible === false) {
                        setBonusStatus({ 
                            onTrack: false, 
                            text: 'Not Eligible',
                            notEligible: true // New flag for UI styling
                        });
                    } else {
                        setBonusStatus({
                            onTrack: stats.didQualifyForBonus,
                            text: stats.didQualifyForBonus ? 'On Track' : 'Bonus Lost'
                        });
                    }
                })
                .catch(err => {
                    console.error("Error calculating monthly stats:", err);
                    // On error, keep defaults to prevent crash
                });
        });

        return () => unsubscribe(); // Unsubscribe from profile listener

    }, [db, user, companyConfig]);

    return { monthlyStats, bonusStatus };
};