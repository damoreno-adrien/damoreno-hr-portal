import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore'; // --- UPDATED ---
import * as dateUtils from '../utils/dateUtils';
import { DateTime } from 'luxon'; // --- NEW ---

const THAILAND_TIMEZONE = 'Asia/Bangkok'; // --- NEW ---

export default function useWeeklyPlannerData(db, currentWeekStart) {
    const [weekData, setWeekData] = useState({});
    const [weekDates, setWeekDates] = useState([]);
    const [loading, setLoading] = useState(true);
    // --- REMOVED currentListener state ---

    const fetchData = useCallback(async () => { // --- UPDATED ---
        setLoading(true);
        setWeekData({});
        setWeekDates([]);

        const startDate = dateUtils.fromFirestore(currentWeekStart);
        if (!startDate) {
             console.error("Invalid currentWeekStart date provided to useWeeklyPlannerData.");
             setLoading(false);
             return;
        }

        const tempWeekDates = [];
        for (let i = 0; i < 7; i++) {
            const currentDate = dateUtils.addDays(startDate, i);
            if (!currentDate) continue; 

            tempWeekDates.push({
                dateObject: currentDate, // --- NEW: Pass the full JS Date object ---
                dateString: dateUtils.formatISODate(currentDate), // "yyyy-MM-dd"
                dayName: dateUtils.formatCustom(currentDate, 'EEE'), // "Mon", "Tue", etc.
                dateNum: dateUtils.formatCustom(currentDate, 'd'), // Day of the month (1-31)
            });
        }
        setWeekDates(tempWeekDates);

        if (tempWeekDates.length === 0) {
            console.error("Week dates array is empty after calculation, cannot query Firestore.");
            setLoading(false);
            return;
        }

        const startOfWeekStr = tempWeekDates[0].dateString;
        const endOfWeekStr = tempWeekDates[6].dateString;

        try { // --- NEW: try...catch block for getDocs ---
            // --- NEW: Define all 3 queries ---
            const schedulesQuery = query(
                collection(db, 'schedules'),
                where('date', '>=', startOfWeekStr),
                where('date', '<=', endOfWeekStr)
            );
            const attendanceQuery = query(
                collection(db, 'attendance'),
                where('date', '>=', startOfWeekStr),
                where('date', '<=', endOfWeekStr)
            );
            const leaveQuery = query(
                collection(db, 'leave_requests'),
                where('status', '==', 'approved'),
                where('endDate', '>=', startOfWeekStr)
                // We will client-filter startDate <= endOfWeekStr
            );

            // --- NEW: Fetch all data concurrently ---
            const [schedulesSnap, attendanceSnap, leaveSnap] = await Promise.all([
                getDocs(schedulesQuery),
                getDocs(attendanceQuery),
                getDocs(leaveQuery)
            ]);

            // --- NEW: Process data into maps ---
            const schedulesMap = new Map();
            schedulesSnap.forEach(doc => {
                const data = doc.data();
                if (data.staffId && data.date) {
                    schedulesMap.set(`${data.staffId}_${data.date}`, { id: doc.id, ...data });
                }
            });

            const attendanceMap = new Map();
            attendanceSnap.forEach(doc => {
                const data = doc.data();
                if (data.staffId && data.date) {
                    attendanceMap.set(`${data.staffId}_${data.date}`, { id: doc.id, ...data });
                }
            });

            const leaveMap = new Map();
            const reportEndDt = DateTime.fromISO(endOfWeekStr, { zone: THAILAND_TIMEZONE });
            leaveSnap.forEach(doc => {
                const data = doc.data();
                if (!data.staffId || !data.startDate || !data.endDate) return;
                if (data.startDate > endOfWeekStr) return; // Skip leaves that start after the week ends

                let current = DateTime.fromISO(data.startDate, { zone: THAILAND_TIMEZONE });
                const leaveEnd = DateTime.fromISO(data.endDate, { zone: THAILAND_TIMEZONE });
                if (!current.isValid || !leaveEnd.isValid) return;

                while (current <= leaveEnd && current <= reportEndDt) {
                    if (current.toISODate() >= startOfWeekStr) {
                        const dateStr = current.toISODate();
                        leaveMap.set(`${data.staffId}_${dateStr}`, { id: doc.id, ...data });
                    }
                    current = current.plus({ days: 1 });
                }
            });

            // --- NEW: Combine all data into the final weekData structure ---
            const combinedData = {};
            const allStaffIds = new Set([
                ...Array.from(schedulesMap.keys()).map(k => k.split('_')[0]),
                ...Array.from(attendanceMap.keys()).map(k => k.split('_')[0]),
                ...Array.from(leaveMap.keys()).map(k => k.split('_')[0]),
            ]);

            for (const staffId of allStaffIds) {
                if (!combinedData[staffId]) combinedData[staffId] = {};
                for (const dateObj of tempWeekDates) {
                    const key = `${staffId}_${dateObj.dateString}`;
                    combinedData[staffId][dateObj.dateString] = {
                        schedule: schedulesMap.get(key) || null,
                        attendance: attendanceMap.get(key) || null,
                        leave: leaveMap.get(key) || null,
                    };
                }
            }

            setWeekData(combinedData);
            
        } catch (error) {
            console.error("Error fetching weekly planner data:", error);
            setWeekData({}); // Clear data on error
            setWeekDates([]); // Clear dates on error
        } finally {
            setLoading(false); // --- NEW: Set loading false in finally ---
        }

    }, [db, currentWeekStart]); // Dependency array


    useEffect(() => {
        fetchData(); // Fetch data when component mounts or dependencies change

        // --- REMOVED Snapshot listener cleanup ---

    }, [fetchData]); // Use fetchData as the dependency


    // Function to manually trigger a refetch
    const refetchWeekData = useCallback(() => {
        fetchData();
    }, [fetchData]);


    return { weekData, weekDates, loading, refetchWeekData };
}