import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import * as dateUtils from '../utils/dateUtils'; // Use new standard

export default function useWeeklyPlannerData(db, currentWeekStart) {
    const [weekData, setWeekData] = useState({});
    const [weekDates, setWeekDates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentListener, setCurrentListener] = useState(null);

    const fetchData = useCallback(() => {
        setLoading(true);
        setWeekData({});
        setWeekDates([]);

        // Ensure currentWeekStart is a valid Date object
        const startDate = dateUtils.fromFirestore(currentWeekStart);
        if (!startDate) {
             console.error("Invalid currentWeekStart date provided to useWeeklyPlannerData.");
             setLoading(false);
             return;
        }


        // Calculate Week Dates using dateUtils
        const tempWeekDates = [];
        for (let i = 0; i < 7; i++) {
            const currentDate = dateUtils.addDays(startDate, i);
            if (!currentDate) continue; // Skip if date calculation fails

            tempWeekDates.push({
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

        // Query Firestore
        const q = query(
            collection(db, 'schedules'),
            where('date', '>=', startOfWeekStr),
            where('date', '<=', endOfWeekStr)
        );

        // Cleanup previous listener if it exists
        if (currentListener) {
            currentListener();
        }

        const unsubscribe = onSnapshot(q, (schedulesSnap) => {
            const schedulesByStaff = {};
            schedulesSnap.forEach(doc => {
                const schedule = doc.data();
                // Basic validation
                if (schedule.staffId && schedule.date) {
                    if (!schedulesByStaff[schedule.staffId]) {
                        schedulesByStaff[schedule.staffId] = {};
                    }
                    schedulesByStaff[schedule.staffId][schedule.date] = { id: doc.id, ...schedule };
                } else {
                    console.warn("Schedule document missing staffId or date:", doc.id, schedule);
                }
            });
            setWeekData(schedulesByStaff);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching weekly planner data:", error);
            setLoading(false);
            setWeekData({}); // Clear data on error
            setWeekDates([]); // Clear dates on error
        });

        // Store the cleanup function
        setCurrentListener(() => unsubscribe);

    }, [db, currentWeekStart]); // Dependency array


    useEffect(() => {
        fetchData(); // Fetch data when component mounts or dependencies change

        // Cleanup listener on unmount or when dependencies change
        return () => {
            if (currentListener) {
                currentListener();
            }
        };
    }, [fetchData]); // Use fetchData as the dependency


    // Function to manually trigger a refetch
    const refetchWeekData = useCallback(() => {
        fetchData();
    }, [fetchData]);


    return { weekData, weekDates, loading, refetchWeekData };
}