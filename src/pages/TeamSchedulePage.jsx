/* src/pages/TeamSchedulePage.jsx */

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight } from 'lucide-react'; // Assuming lucide-react
import * as dateUtils from '../utils/dateUtils';
// --- NEW IMPORT ---
import { calculateAttendanceStatus } from '../utils/statusUtils';
import { DateTime } from 'luxon'; // --- NEW IMPORT ---

const THAILAND_TIMEZONE = 'Asia/Bangkok'; // --- NEW ---

// --- HELPER FUNCTIONS ---
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

        // --- 🐞 THIS IS THE FIX ---
        const departmentStaff = staffList.filter(staff => {
            const currentJob = getStaffCurrentJob(staff);
            // Check if staff is active (status is 'active', null, or undefined)
            const isActive = staff.status === undefined || staff.status === null || staff.status === 'active';
            return currentJob?.department === myDepartment && isActive;
        });
        // --- END FIX ---

        const endOfWeek = dateUtils.addDays(startOfWeek, 6);
        const startStr = dateUtils.formatISODate(startOfWeek);
        const endStr = dateUtils.formatISODate(endOfWeek);

        const shiftsQuery = query(collection(db, "schedules"), where("date", ">=", startStr), where("date", "<=", endStr));
        const leaveQuery = query(collection(db, "leave_requests"), where("status", "==", "approved"), where("endDate", ">=", startStr));
        const attendanceQuery = query(collection(db, "attendance"), where("date", ">=", startStr), where("date", "<=", endStr));

        const unsubShifts = onSnapshot(shiftsQuery, (shiftsSnapshot) => {
            const shiftsMap = new Map();
            shiftsSnapshot.forEach(doc => {
                const data = doc.data();
                const key = `${data.staffId}_${data.date}`;
                shiftsMap.set(key, data);
            });

            // --- NESTED SNAPSHOTS ---
            const unsubLeaves = onSnapshot(leaveQuery, (leavesSnapshot) => {
                const leaveMap = new Map();
                const reportEndDt = DateTime.fromISO(endStr, { zone: THAILAND_TIMEZONE });
                leavesSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (!data.staffId || !data.startDate || !data.endDate) return;
                    if (data.startDate > endStr) return; 

                    let current = DateTime.fromISO(data.startDate, { zone: THAILAND_TIMEZONE });
                    const leaveEnd = DateTime.fromISO(data.endDate, { zone: THAILAND_TIMEZONE });
                    if (!current.isValid || !leaveEnd.isValid) return;

                    while (current <= leaveEnd && current <= reportEndDt) {
                        if (current.toISODate() >= startStr) {
                            const dateStr = current.toISODate();
                            leaveMap.set(`${data.staffId}_${dateStr}`, data);
                        }
                        current = current.plus({ days: 1 });
                    }
                });

                // --- NEW: Attendance Snapshot ---
                const unsubAttendance = onSnapshot(attendanceQuery, (attendanceSnapshot) => {
                    const attendanceMap = new Map();
                    attendanceSnapshot.forEach(doc => {
                        const data = doc.data();
                        const key = `${data.staffId}_${data.date}`;
                        attendanceMap.set(key, data);
                    });

                    // --- Build Final Data ---
                    const days = Array.from({ length: 7 }).map((_, i) => {
                        const date = dateUtils.addDays(startOfWeek, i);
                        const dateStr = dateUtils.formatISODate(date);
                        
                        const dailyEntries = departmentStaff.map(staff => {
                            const key = `${staff.id}_${dateStr}`;
                            const shift = shiftsMap.get(key);
                            const attendance = attendanceMap.get(key);
                            const leave = leaveMap.get(key);

                            const { status } = calculateAttendanceStatus(shift, attendance, leave, date);

                            if (status === 'Leave') {
                                return { name: getDisplayName(staff), statusText: 'On Leave', statusClass: 'text-blue-400' };
                            }
                            if (status === 'Absent') {
                                return { name: getDisplayName(staff), statusText: 'Absent', statusClass: 'text-red-400' };
                            }
                            if (shift) {
                                return { name: getDisplayName(staff), statusText: `${shift.startTime} - ${shift.endTime}`, statusClass: 'text-white' };
                            }
                            return null;
                        }).filter(Boolean);

                        return { date, entries: dailyEntries };
                    });

                    setWeekData(days);
                    setIsLoading(false);
                });
                return unsubAttendance; // Return inner unsub
            });
            return unsubLeaves; // Return middle unsub
        });
        return () => unsubShifts(); // Return outer unsub
    }, [db, user, startOfWeek, staffList, myDepartment]);

    // ... (rest of the component is unchanged) ...
    const changeWeek = (offset) => setStartOfWeek(prev => dateUtils.addDays(prev, 7 * offset));
    
    const endOfWeek = dateUtils.addDays(startOfWeek, 6);
    const weekRangeString = `${dateUtils.formatCustom(startOfWeek, 'dd MMM')} - ${dateUtils.formatCustom(endOfWeek, 'dd MMM, yyyy')}`;

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Team Schedule: {myDepartment}</h2>
                <div className="flex items-center space-x-2 sm:space-x-4">
                    <button onClick={() => changeWeek(-1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"><ChevronLeft className="h-6 w-6" /></button>
                    <h3 className="text-lg sm:text-xl font-semibold w-48 sm:w-64 text-center">{weekRangeString}</h3>
                    <button onClick={() => changeWeek(1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"><ChevronRight className="h-6 w-6" /></button>
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
                                            <span className={`font-semibold ${entry.statusClass}`}>{entry.statusText}</span>
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