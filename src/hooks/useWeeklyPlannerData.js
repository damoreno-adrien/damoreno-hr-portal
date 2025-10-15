import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function useWeeklyPlannerData(db, startOfWeek) {
    const [schedules, setSchedules] = useState({});
    const [approvedLeave, setApprovedLeave] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db) return;
        
        setIsLoading(true);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        
        const startStr = formatDateToYYYYMMDD(startOfWeek);
        const endStr = formatDateToYYYYMMDD(endOfWeek);

        const shiftsQuery = query(collection(db, "schedules"), where("date", ">=", startStr), where("date", "<=", endStr));
        const unsubscribeShifts = onSnapshot(shiftsQuery, (snapshot) => {
            const newSchedules = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                const key = `${data.staffId}_${data.date}`;
                newSchedules[key] = { id: doc.id, ...data };
            });
            setSchedules(newSchedules);
        });

        const leaveQuery = query(collection(db, "leave_requests"), where("status", "==", "approved"), where("endDate", ">=", startStr));
        const unsubscribeLeave = onSnapshot(leaveQuery, (snapshot) => {
            const leaveRequests = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(req => req.startDate <= endStr);
            setApprovedLeave(leaveRequests);
        });

        // A simple way to signal loading is complete after initial fetch, though onSnapshot is real-time
        const timer = setTimeout(() => setIsLoading(false), 500);

        return () => {
            unsubscribeShifts();
            unsubscribeLeave();
            clearTimeout(timer);
        };
    }, [db, startOfWeek]);

    return { schedules, approvedLeave, isLoading };
}