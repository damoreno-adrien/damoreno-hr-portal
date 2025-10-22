import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
// --- Ensure this import is correct ---
import { toLocalDateString } from '../utils/dateHelpers';

export default function useWeeklyPlannerData(db, currentWeekStart, staffList) {
    const [weekData, setWeekData] = useState({});
    const [weekDates, setWeekDates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentListener, setCurrentListener] = useState(null); // To manage unsubscribe

    const fetchData = useCallback(() => {
        setLoading(true);
        setWeekData({});
        setWeekDates([]);

        // Calculate Week Dates
        const tempWeekDates = [];
        const startDate = new Date(currentWeekStart);
        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(startDate);
            // Use UTC methods to avoid potential DST issues when adding days
            currentDate.setUTCDate(startDate.getUTCDate() + i); 
            
            const dateString = toLocalDateString(currentDate); // Use imported helper
            
            tempWeekDates.push({
                dateString: dateString,
                dayName: currentDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }), // Use UTC to match getUTCDate
                dateNum: currentDate.getUTCDate(), 
            });
        }
        setWeekDates(tempWeekDates); // Set dates immediately

        if (tempWeekDates.length === 0) {
            console.error("Week dates array is empty, cannot query Firestore.");
            setLoading(false); // Make sure loading stops
            return;
        }

        const startOfWeekStr = tempWeekDates[0].dateString;
        const endOfWeekStr = tempWeekDates[6].dateString;

        // Query Firestore
        const q = query(
            collection(db, 'schedules'),
            where('date', '>=', startOfWeekStr),
            where('date', '<=', endOfWeekStr)
        );

        // Clean up previous listener
        if (currentListener) {
            currentListener();
        }

        const unsubscribe = onSnapshot(q, (schedulesSnap) => {
            const schedulesByStaff = {};
            schedulesSnap.forEach(doc => {
                const schedule = doc.data();
                if (!schedulesByStaff[schedule.staffId]) {
                    schedulesByStaff[schedule.staffId] = {};
                }
                // Ensure data structure is correct even if staffId/date missing in data (unlikely)
                if (schedule.staffId && schedule.date) {
                    schedulesByStaff[schedule.staffId][schedule.date] = { id: doc.id, ...schedule };
                }
            });
            setWeekData(schedulesByStaff);
            setLoading(false); // Set loading false on successful data fetch
        }, (error) => {
            console.error("Error fetching weekly planner data:", error);
            // --- Ensure loading stops on error ---
            setLoading(false); 
            setWeekData({}); 
            setWeekDates([]); 
        });

        setCurrentListener(() => unsubscribe);

    // Ensure dependencies are stable
    }, [db, currentWeekStart]); // Removed currentListener from here


    useEffect(() => {
        fetchData(); // Call fetch data

        // Return the cleanup function directly
        return () => {
            if (currentListener) {
                console.log("Cleaning up weekly planner listener.");
                currentListener();
            }
        };
    // Re-run ONLY if db or currentWeekStart changes
    }, [db, currentWeekStart, fetchData]); // fetchData is stable due to useCallback


    const refetchWeekData = useCallback(() => {
        console.log("Refetch triggered");
         // No need to manually cleanup here, useEffect's cleanup will handle it
        fetchData();
    }, [fetchData]); // Dependency includes fetchData


    return { weekData, weekDates, loading, refetchWeekData };
}