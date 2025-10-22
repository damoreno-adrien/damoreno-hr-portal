import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

// --- Import the helper function ---
import { toLocalDateString } from '../utils/dateHelpers'; // Ensure this line exists and path is correct

export default function useWeeklyPlannerData(db, currentWeekStart, staffList) {
    const [weekData, setWeekData] = useState({});
    const [weekDates, setWeekDates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentListener, setCurrentListener] = useState(null); // To manage unsubscribe

    const fetchData = useCallback(() => {
        setLoading(true);
        setWeekData({}); // Clear previous data
        setWeekDates([]); // Clear previous dates

        // --- Calculate Week Dates using toLocalDateString ---
        const tempWeekDates = [];
        const startDate = new Date(currentWeekStart); // Start with a copy
        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(startDate);
            currentDate.setUTCDate(startDate.getUTCDate() + i); // Use UTC functions for consistency after setting start date locally
            
            const dateString = toLocalDateString(currentDate); // Use helper here
            
            tempWeekDates.push({
                dateString: dateString,
                dayName: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
                dateNum: currentDate.getUTCDate(), // Use UTC date number
            });
        }
        setWeekDates(tempWeekDates); // Set dates immediately for UI responsiveness

        // Ensure tempWeekDates is populated before querying
        if (tempWeekDates.length === 0) {
            console.error("Week dates array is empty, cannot query Firestore.");
            setLoading(false);
            return; // Stop if dates aren't generated
        }

        const startOfWeekStr = tempWeekDates[0].dateString;
        const endOfWeekStr = tempWeekDates[6].dateString;

        // --- Query Firestore ---
        const q = query(
            collection(db, 'schedules'),
            where('date', '>=', startOfWeekStr),
            where('date', '<=', endOfWeekStr)
        );

        // Clean up previous listener if it exists
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
                schedulesByStaff[schedule.staffId][schedule.date] = { id: doc.id, ...schedule };
            });
            setWeekData(schedulesByStaff);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching weekly planner data:", error);
            setLoading(false); // Ensure loading stops on error
            setWeekData({}); // Clear data on error
            setWeekDates([]); // Clear dates on error
        });

        setCurrentListener(() => unsubscribe); // Store the new unsubscribe function

    // Include db and currentWeekStart in dependency array
    }, [db, currentWeekStart, currentListener]); // Added currentListener dependency


    // Fetch data when component mounts or dependencies change
    useEffect(() => {
        fetchData();
        
        // Cleanup listener on component unmount or when dependencies change before next fetch
        return () => {
            if (currentListener) {
                currentListener();
            }
        };
    // Re-run effect if db or currentWeekStart changes
    }, [db, currentWeekStart, fetchData, currentListener]); // Added fetchData and currentListener


    // Function to manually trigger a refetch
    const refetchWeekData = useCallback(() => {
        // Cleanup listener before refetching
        if (currentListener) {
            currentListener();
            setCurrentListener(null); // Reset listener state
        }
        fetchData(); // Call fetchData to establish a new listener
    }, [fetchData, currentListener]); // Dependency includes fetchData now


    return { weekData, weekDates, loading, refetchWeekData };
}