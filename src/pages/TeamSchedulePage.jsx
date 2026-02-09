/* src/pages/TeamSchedulePage.jsx */

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Flame, Coffee } from 'lucide-react'; 
import * as dateUtils from '../utils/dateUtils';
import { calculateAttendanceStatus } from '../utils/statusUtils';
import { DateTime } from 'luxon'; 

const THAILAND_TIMEZONE = 'Asia/Bangkok';

// --- HELPER FUNCTIONS ---
const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

const getStaffCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) return null;
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB;
    })[0];
};

// Helper: Department Colors
const getDeptColor = (dept) => {
    const map = {
        'Service': 'text-blue-400',
        'Kitchen': 'text-orange-400',
        'Bar': 'text-purple-400',
        'Pizza': 'text-red-400'
    };
    return map[dept] || 'text-gray-400';
};

export default function TeamSchedulePage({ db, user }) {
    const [staffList, setStaffList] = useState([]);
    const [myDepartment, setMyDepartment] = useState('');
    
    const [startOfWeek, setStartOfWeek] = useState(dateUtils.startOfWeek(new Date()));
    const [weekData, setWeekData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // 1. Get User Department (Stable)
    useEffect(() => {
        if (!db || !user?.uid) return;
        const profileRef = doc(db, 'staff_profiles', user.uid);
        getDoc(profileRef).then(docSnap => {
            if (docSnap.exists()) {
                const currentJob = getStaffCurrentJob(docSnap.data());
                if (currentJob) setMyDepartment(currentJob.department);
            }
        });
    }, [db, user.uid]); // FIX: Use user.uid instead of user object

    // 2. Get All Staff (Stable)
    useEffect(() => {
        if (!db) return;
        const staffCollectionRef = collection(db, 'staff_profiles');
        const unsubscribeStaff = onSnapshot(staffCollectionRef, (querySnapshot) => {
            const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setStaffList(list);
        });
        return () => unsubscribeStaff();
    }, [db]);
    
    // 3. Main Schedule Logic (Loop Fix)
    useEffect(() => {
        // Wait for all dependencies to be ready
        if (!db || !user?.uid || !myDepartment || staffList.length === 0) return;
        
        setIsLoading(true);

        const departmentStaff = staffList.filter(staff => {
            const currentJob = getStaffCurrentJob(staff);
            const isActive = staff.status === undefined || staff.status === null || staff.status === 'active';
            return currentJob?.department === myDepartment && isActive;
        });

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
                shiftsMap.set(`${data.staffId}_${data.date}`, data);
            });

            const unsubLeaves = onSnapshot(leaveQuery, (leavesSnapshot) => {
                const leaveMap = new Map();
                const reportEndDt = DateTime.fromISO(endStr, { zone: THAILAND_TIMEZONE });
                
                leavesSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (!data.staffId || !data.startDate || !data.endDate) return;
                    if (data.startDate > endStr) return; 

                    let current = DateTime.fromISO(data.startDate, { zone: THAILAND_TIMEZONE });
                    const leaveEnd = DateTime.fromISO(data.endDate, { zone: THAILAND_TIMEZONE });
                    
                    while (current <= leaveEnd && current <= reportEndDt) {
                        if (current.toISODate() >= startStr) {
                            leaveMap.set(`${data.staffId}_${current.toISODate()}`, data);
                        }
                        current = current.plus({ days: 1 });
                    }
                });

                const unsubAttendance = onSnapshot(attendanceQuery, (attendanceSnapshot) => {
                    const attendanceMap = new Map();
                    attendanceSnapshot.forEach(doc => {
                        const data = doc.data();
                        attendanceMap.set(`${data.staffId}_${data.date}`, data);
                    });

                    const days = Array.from({ length: 7 }).map((_, i) => {
                        const date = dateUtils.addDays(startOfWeek, i);
                        const dateStr = dateUtils.formatISODate(date);
                        
                        const dailyEntries = departmentStaff.map(staff => {
                            const key = `${staff.id}_${dateStr}`;
                            const shift = shiftsMap.get(key);
                            const attendance = attendanceMap.get(key);
                            const leave = leaveMap.get(key);

                            const { status } = calculateAttendanceStatus(shift, attendance, leave, date);
                            
                            // Determine what to show
                            if (leave) return { staffId: staff.id, name: getDisplayName(staff), dept: myDepartment, leave: leave, status };
                            if (shift) return { staffId: staff.id, name: getDisplayName(staff), dept: myDepartment, sched: shift, status };
                            
                            return null;
                        }).filter(Boolean);

                        // Sort by Time
                        dailyEntries.sort((a, b) => {
                            const timeA = a.sched ? a.sched.startTime : '23:59';
                            const timeB = b.sched ? b.sched.startTime : '23:59';
                            return timeA.localeCompare(timeB);
                        });

                        return { date, entries: dailyEntries };
                    });

                    setWeekData(days);
                    setIsLoading(false);
                });
                return unsubAttendance;
            });
            return unsubLeaves;
        });
        return () => unsubShifts();
    }, [db, user.uid, startOfWeek, staffList, myDepartment]); // FIX: user.uid is stable

    const changeWeek = (offset) => setStartOfWeek(prev => dateUtils.addDays(prev, 7 * offset));
    const endOfWeek = dateUtils.addDays(startOfWeek, 6);
    const weekRangeString = `${dateUtils.formatCustom(startOfWeek, 'dd MMM')} - ${dateUtils.formatCustom(endOfWeek, 'dd MMM, yyyy')}`;

    return (
        <div className="pb-20">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 space-y-4 sm:space-y-0">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Team Schedule: {myDepartment}</h2>
                <div className="flex items-center space-x-4">
                    <button onClick={() => changeWeek(-1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"><ChevronLeft className="h-6 w-6" /></button>
                    <h3 className="text-lg font-semibold w-48 text-center bg-gray-800 py-1 rounded-lg border border-gray-700">{weekRangeString}</h3>
                    <button onClick={() => changeWeek(1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"><ChevronRight className="h-6 w-6" /></button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12"><p className="text-gray-400 animate-pulse">Syncing team shifts...</p></div>
            ) : (
                <div className="space-y-6">
                    {weekData.map(({ date, entries }) => {
                        const isToday = dateUtils.formatISODate(new Date()) === dateUtils.formatISODate(date);
                        return (
                            <div key={date.toISOString()} className={`rounded-xl border p-4 ${isToday ? 'bg-gray-800/80 border-indigo-500/50' : 'bg-gray-800/40 border-gray-700/50'}`}>
                                <h3 className={`font-bold mb-4 flex items-center gap-2 ${isToday ? 'text-indigo-400' : 'text-gray-400'}`}>
                                    {dateUtils.formatCustom(date, 'EEEE, dd MMMM')}
                                    {isToday && <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded-full">TODAY</span>}
                                </h3>
                                
                                {entries.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {entries.map(entry => {
                                            const includesBreak = entry.sched?.includesBreak !== false;
                                            return (
                                                <div key={entry.staffId} className="bg-gray-900/50 p-3 rounded-lg flex items-center justify-between border border-gray-700/50 hover:border-gray-600 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-gray-800 ${getDeptColor(entry.dept)}`}>
                                                            {entry.name.substring(0,2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-sm text-gray-200">{entry.name}</p>
                                                            <p className={`text-[10px] uppercase font-bold ${getDeptColor(entry.dept)}`}>{entry.dept}</p>
                                                        </div>
                                                    </div>
                                                    
                                                    {entry.leave ? (
                                                        <span className="text-xs font-bold text-blue-400 bg-blue-900/20 px-2 py-1 rounded">On Leave</span>
                                                    ) : (
                                                        <div className="text-right">
                                                            <p className="text-sm font-bold text-white tabular-nums">{entry.sched.startTime}-{entry.sched.endTime}</p>
                                                            <div className="flex justify-end mt-0.5">
                                                                {includesBreak ? (
                                                                    <Coffee className="w-3 h-3 text-gray-600" title="Break" />
                                                                ) : (
                                                                    <Flame className="w-3 h-3 text-amber-500" title="Continuous" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-600 italic">No shifts scheduled.</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}