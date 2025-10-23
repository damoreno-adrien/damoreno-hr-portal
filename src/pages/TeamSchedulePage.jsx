import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/Icons';
import * as dateUtils from '../utils/dateUtils'; // Use new standard

// --- NEW HELPER FUNCTION ---
const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

const getStaffCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) {
        return null;
    }
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB;
    })[0];
};

export default function TeamSchedulePage({ db, user }) {
    const [staffList, setStaffList] = useState([]);
    const [myDepartment, setMyDepartment] = useState('');
    
    // Use new standard function
    const [startOfWeek, setStartOfWeek] = useState(dateUtils.startOfWeek(new Date()));
    const [weekData, setWeekData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Effect to get the current user's department
    useEffect(() => {
        if (!db || !user) return;
        const profileRef = doc(db, 'staff_profiles', user.uid);
        getDoc(profileRef).then(docSnap => {
            if (docSnap.exists()) {
                const currentJob = getStaffCurrentJob(docSnap.data());
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
            const currentJob = getStaffCurrentJob(staff);
            return currentJob?.department === myDepartment;
        });

        const endOfWeek = dateUtils.addDays(startOfWeek, 6);
        const startStr = dateUtils.formatISODate(startOfWeek);
        const endStr = dateUtils.formatISODate(endOfWeek);

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
                    const date = dateUtils.addDays(startOfWeek, i);
                    const dateStr = dateUtils.formatISODate(date);
                    
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

    const changeWeek = (offset) => setStartOfWeek(prev => dateUtils.addDays(prev, 7 * offset));
    
    const endOfWeek = dateUtils.addDays(startOfWeek, 6);
    const weekRangeString = `${dateUtils.formatCustom(startOfWeek, 'dd MMM')} - ${dateUtils.formatCustom(endOfWeek, 'dd MMM, yyyy')}`;

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
                            <p className="font-bold text-amber-400 border-b border-gray-700 pb-2 mb-2">{dateUtils.formatCustom(date, 'EEEE')}, {dateUtils.formatCustom(date, 'dd MMMM')}</p>
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