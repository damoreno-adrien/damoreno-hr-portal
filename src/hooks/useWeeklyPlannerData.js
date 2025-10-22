import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { toLocalDateString } from '../utils/dateHelpers';

export default function useWeeklyPlannerData(db, currentWeekStart, staffList) {
    const [weekData, setWeekData] = useState({});
    const [weekDates, setWeekDates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentListener, setCurrentListener] = useState(null);

    const fetchData = useCallback(() => {
        console.log("fetchData called, setting loading to true"); // <<< ADD LOG
        setLoading(true);
        setWeekData({});
        setWeekDates([]);

        // Calculate Week Dates
        const tempWeekDates = [];
        const startDate = new Date(currentWeekStart);
        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(startDate);
            currentDate.setUTCDate(startDate.getUTCDate() + i);
            const dateString = toLocalDateString(currentDate);
            tempWeekDates.push({
                dateString: dateString,
                dayName: currentDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
                dateNum: currentDate.getUTCDate(),
            });
        }
        console.log("Calculated week dates:", tempWeekDates); // <<< ADD LOG
        setWeekDates(tempWeekDates);

        if (tempWeekDates.length === 0) {
            console.error("Week dates array is empty, cannot query Firestore.");
            setLoading(false);
            return;
        }

        const startOfWeekStr = tempWeekDates[0].dateString;
        const endOfWeekStr = tempWeekDates[6].dateString;
        console.log(`Querying schedules from ${startOfWeekStr} to ${endOfWeekStr}`); // <<< ADD LOG

        // Query Firestore
        const q = query(
            collection(db, 'schedules'),
            where('date', '>=', startOfWeekStr),
            where('date', '<=', endOfWeekStr)
        );

        if (currentListener) {
            console.log("Cleaning up previous listener before attaching new one."); // <<< ADD LOG
            currentListener();
        }

        console.log("Attaching onSnapshot listener..."); // <<< ADD LOG
        const unsubscribe = onSnapshot(q, (schedulesSnap) => {
            console.log("onSnapshot SUCCESS callback triggered."); // <<< ADD LOG
            const schedulesByStaff = {};
            schedulesSnap.forEach(doc => {
                const schedule = doc.data();
                if (!schedulesByStaff[schedule.staffId]) {
                    schedulesByStaff[schedule.staffId] = {};
                }
                if (schedule.staffId && schedule.date) {
                    schedulesByStaff[schedule.staffId][schedule.date] = { id: doc.id, ...schedule };
                }
            });
            console.log("Processed schedule data:", schedulesByStaff); // <<< ADD LOG
            setWeekData(schedulesByStaff);
            setLoading(false); // Set loading false on success
        }, (error) => {
            console.error("onSnapshot ERROR callback triggered:", error); // <<< ADD LOG
            setLoading(false); // Ensure loading stops on error
            setWeekData({});
            setWeekDates([]);
        });

        setCurrentListener(() => unsubscribe);

    }, [db, currentWeekStart]); // Dependencies correct now


    useEffect(() => {
        console.log("useEffect triggered, calling fetchData."); // <<< ADD LOG
        fetchData();

        return () => {
            if (currentListener) {
                console.log("useEffect cleanup: Cleaning up weekly planner listener."); // <<< ADD LOG
                currentListener();
            }
        };
    }, [db, currentWeekStart, fetchData]);


    const refetchWeekData = useCallback(() => {
        console.log("Refetch triggered");
        fetchData();
    }, [fetchData]);


    return { weekData, weekDates, loading, refetchWeekData };
}