import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/Icons';

const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// --- NEW HELPER FUNCTION ---
const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

export default function TeamSchedulePage({ db, user }) {
    const [staffList, setStaffList] = useState([]);
    const [myDepartment, setMyDepartment] = useState('');
    
    const getStartOfWeek = (date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    };

    const [startOfWeek, setStartOfWeek] = useState(getStartOfWeek(new Date()));
    const [weekData, setWeekData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Effect to get the current user's department
    useEffect(() => {
        if (!db || !user) return;
        const profileRef = doc(db, 'staff_profiles', user.uid);
        getDoc(profileRef).then(docSnap => {
            if (docSnap.exists()) {
                const jobHistory = docSnap.data().jobHistory || [];
                const currentJob = jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
                if (currentJob) {
                    setMyDepartment(currentJob.department);
                }
            }
        });
    }, [db, user]);

    // Effect to get all staff profiles
    useEffect(() => {
        if (!db) return;
        const staffCollectionRef = collection(db, 'staff_profiles');
        const unsubscribeStaff = onSnapshot(staffCollectionRef, (querySnapshot) => {
            const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setStaffList(list);
        });
        return () => unsubscribeStaff();
    }, [db]);
    
    // Main effect to build the weekly schedule data
    useEffect(() => {
        if (!db || !user || !myDepartment || staffList.length === 0) return;
        setIsLoading(true);

        const departmentStaff = staffList.filter(staff => {
            const currentJob = (staff.jobHistory || []).sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
            return currentJob?.department === myDepartment;
        });

        const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(endOfWeek.getDate() + 6);
        const startStr = formatDateToYYYYMMDD(startOfWeek);
        const endStr = formatDateToYYYYMMDD(endOfWeek);

        const shiftsQuery = query(collection(db, "schedules"), where("date", ">=", startStr), where("date", "<=", endStr));
        const leaveQuery = query(collection(db, "leave_requests"), where("status", "==", "approved"), where("endDate", ">=", startStr));

        const unsubShifts = onSnapshot(shiftsQuery, (shiftsSnapshot) => {
            const shiftsMap = new Map();
            shiftsSnapshot.forEach(doc => {
                const data = doc.data();
                const key = `${data.staffId}_${data.date}`;
                shiftsMap.set(key, data);
            });

            const unsubLeaves = onSnapshot(leaveQuery, (leavesSnapshot) => {
                const leaves = leavesSnapshot.docs.map(doc => doc.data()).filter(req => req.startDate <= endStr);
                
                const days = Array.from({ length: 7 }).map((_, i) => {
                    const date = new Date(startOfWeek);
                    date.setDate(date.getDate() + i);
                    const dateStr = formatDateToYYYYMMDD(date);
                    
                    const dailyEntries = departmentStaff.map(staff => {
                        const onLeave = leaves.some(leave => leave.staffId === staff.id && dateStr >= leave.startDate && dateStr <= leave.endDate);
                        if (onLeave) {
                            return { name: getDisplayName(staff), status: 'On Leave' }; // --- UPDATED ---
                        }
                        const shift = shiftsMap.get(`${staff.id}_${dateStr}`);
                        if (shift) {
                            return { name: getDisplayName(staff), status: `${shift.startTime} - ${shift.endTime}` }; // --- UPDATED ---
                        }
                        return null;
                    }).filter(Boolean);

                    return { date, entries: dailyEntries };
                });

                setWeekData(days);
                setIsLoading(false);
            });
            return unsubLeaves;
        });
        return () => unsubShifts();
    }, [db, user, startOfWeek, staffList, myDepartment]);

    const changeWeek = (offset) => setStartOfWeek(prev => { const d = new Date(prev); d.setDate(d.getDate() + (7 * offset)); return d; });
    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(endOfWeek.getDate() + 6);
    const weekRangeString = `${startOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${endOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Team Schedule: {myDepartment}</h2>
                <div className="flex items-center space-x-2 sm:space-x-4">
                    <button onClick={() => changeWeek(-1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"><ChevronLeftIcon className="h-6 w-6" /></button>
                    <h3 className="text-lg sm:text-xl font-semibold w-48 sm:w-64 text-center">{weekRangeString}</h3>
                    <button onClick={() => changeWeek(1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"><ChevronRightIcon className="h-6 w-6" /></button>
                </div>
            </div>
            {isLoading ? (<p className="text-center text-gray-400">Loading schedule...</p>) : (
                <div className="space-y-6">
                    {weekData.map(({ date, entries }) => (
                        <div key={date.toISOString()} className="bg-gray-800 p-4 rounded-lg">
                            <p className="font-bold text-amber-400 border-b border-gray-700 pb-2 mb-2">{date.toLocaleDateString('en-US', { weekday: 'long' })}, {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</p>
                            {entries.length > 0 ? (
                                <ul className="space-y-2">
                                    {entries.map(entry => (
                                        <li key={entry.name} className="flex justify-between items-center text-sm">
                                            <span className="text-gray-300">{entry.name}</span>
                                            <span className={`font-semibold ${entry.status === 'On Leave' ? 'text-blue-400' : 'text-white'}`}>{entry.status}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-gray-500">No one scheduled.</p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}