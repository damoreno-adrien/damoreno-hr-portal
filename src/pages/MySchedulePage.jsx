/* src/pages/MySchedulePage.jsx */

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Flame, Coffee } from 'lucide-react';
import * as dateUtils from '../utils/dateUtils'; 
import { calculateAttendanceStatus, getStatusClass } from '../utils/statusUtils';
import ShiftDetailModal from '../components/Planning/ShiftDetailModal'; 

export default function MySchedulePage({ db, user, companyConfig }) {
    const [startOfWeek, setStartOfWeek] = useState(dateUtils.startOfWeek(new Date()));
    const [weekData, setWeekData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedDayInfo, setSelectedDayInfo] = useState(null);

    useEffect(() => {
        if (!db || !user) return;
        setIsLoading(true);

        const endOfWeek = dateUtils.addDays(startOfWeek, 6);
        const startStr = dateUtils.formatISODate(startOfWeek);
        const endStr = dateUtils.formatISODate(endOfWeek);

        const shiftsQuery = query(collection(db, "schedules"), where("staffId", "==", user.uid), where("date", ">=", startStr), where("date", "<=", endStr));
        const leaveQuery = query(collection(db, "leave_requests"), where("staffId", "==", user.uid), where("status", "==", "approved"), where("endDate", ">=", startStr));
        const attendanceQuery = query(collection(db, "attendance"), where("staffId", "==", user.uid), where("date", ">=", startStr), where("date", "<=", endStr));

        const unsubShifts = onSnapshot(shiftsQuery, (shiftsSnapshot) => {
            const shiftsMap = new Map();
            shiftsSnapshot.forEach(doc => shiftsMap.set(doc.data().date, { id: doc.id, ...doc.data() }));

            const unsubLeaves = onSnapshot(leaveQuery, (leavesSnapshot) => {
                const leaveMap = new Map();
                const leaves = leavesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(req => req.startDate <= endStr);
                
                leaves.forEach(leave => {
                    let current = dateUtils.parseISODateString(leave.startDate);
                    const end = dateUtils.parseISODateString(leave.endDate);
                    while(current <= end) {
                        const dateStr = dateUtils.formatISODate(current);
                        if (dateStr >= startStr && dateStr <= endStr) {
                            leaveMap.set(dateStr, leave);
                        }
                        current = dateUtils.addDays(current, 1);
                    }
                });

                const unsubAttendance = onSnapshot(attendanceQuery, (attendanceSnapshot) => {
                    const attendanceMap = new Map();
                    attendanceSnapshot.forEach(doc => attendanceMap.set(doc.data().date, { id: doc.id, ...doc.data() }));

                    const days = Array.from({ length: 7 }).map((_, i) => {
                        const date = dateUtils.addDays(startOfWeek, i);
                        const dateStr = dateUtils.formatISODate(date);

                        const shift = shiftsMap.get(dateStr);
                        const attendance = attendanceMap.get(dateStr); 
                        const leaveObj = leaveMap.get(dateStr); 

                        const { status, lateMinutes, otMinutes } = calculateAttendanceStatus(shift, attendance, leaveObj, date, companyConfig);

                        return { 
                            date, 
                            dateStr,
                            staffName: user.displayName || 'Me', 
                            attendanceStatus: status, 
                            attendanceMinutes: lateMinutes, 
                            otMinutes: otMinutes,           
                            rawSchedule: shift || null,
                            rawAttendance: attendance || null,
                            rawLeave: leaveObj || null
                        };
                    });

                    setWeekData(days);
                    setIsLoading(false);
                });
                return unsubAttendance; 
            });
            return unsubLeaves;
        });

        return () => unsubShifts();
    }, [db, user, startOfWeek, companyConfig]);

    const changeWeek = (direction) => {
        setStartOfWeek(prev => dateUtils.addDays(prev, direction * 7));
    };

    const handleDayClick = (day) => {
        if (day.rawSchedule || day.rawLeave || day.rawAttendance) {
            setSelectedDayInfo(day);
            setIsDetailModalOpen(true);
        }
    };

    const closeDetailModal = () => {
        setIsDetailModalOpen(false);
        setSelectedDayInfo(null);
    };

    const weekRangeString = `${dateUtils.formatCustom(startOfWeek, 'dd MMM')} - ${dateUtils.formatCustom(dateUtils.addDays(startOfWeek, 6), 'dd MMM')}`;

    return (
        <div className="pb-20">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
                <h2 className="text-2xl md:text-3xl font-bold text-white">My Schedule</h2>
                <div className="flex items-center space-x-2 sm:space-x-4">
                    <button onClick={() => changeWeek(-1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"><ChevronLeft className="h-6 w-6" /></button>
                    <h3 className="text-lg sm:text-xl font-semibold w-48 sm:w-64 text-center bg-gray-800 py-1 rounded-lg border border-gray-700">{weekRangeString}</h3>
                    <button onClick={() => changeWeek(1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"><ChevronRight className="h-6 w-6" /></button>
                </div>
            </div>

            {isDetailModalOpen && selectedDayInfo && (
                <ShiftDetailModal
                    isOpen={isDetailModalOpen}
                    onClose={closeDetailModal}
                    dayInfo={selectedDayInfo}
                />
            )}

            {isLoading ? (
                <div className="flex justify-center py-12"><p className="text-gray-400 animate-pulse">Loading schedule...</p></div>
            ) : (
                <div className="space-y-3">
                    {weekData.map((day) => {
                        const isToday = dateUtils.formatISODate(new Date()) === day.dateStr;
                        const hasSchedule = !!day.rawSchedule;
                        const hasLeave = !!day.rawLeave;
                        const includesBreak = day.rawSchedule?.includesBreak !== false; 
                        
                        // --- BADGE STYLING ---
                        const getBadgeStyles = (status) => {
                            switch(status) {
                                case 'Present': 
                                case 'Completed': return 'bg-green-900/30 text-green-400 border-green-800';
                                case 'Late': return 'bg-yellow-900/30 text-yellow-400 border-yellow-800';
                                case 'Absent': return 'bg-red-900/30 text-red-400 border-red-800';
                                case 'Overtime': return 'bg-indigo-900/30 text-indigo-400 border-indigo-800';
                                case 'On Break': return 'bg-orange-900/30 text-orange-400 border-orange-800';
                                default: return 'bg-gray-800 text-gray-400 border-gray-700';
                            }
                        };

                        return (
                            <div 
                                key={day.dateStr}
                                onClick={() => handleDayClick(day)}
                                className={`
                                    relative p-4 rounded-xl border flex items-center justify-between transition-all
                                    ${isToday ? 'bg-indigo-900/20 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.15)]' : 'bg-gray-800 border-gray-700 hover:bg-gray-750'}
                                    ${(hasSchedule || hasLeave || day.rawAttendance) ? 'cursor-pointer' : ''}
                                `}
                            >
                                {isToday && <span className="absolute top-2 right-2 text-[9px] font-black uppercase text-indigo-400 bg-indigo-900/50 px-1.5 py-0.5 rounded">Today</span>}
                                
                                <div className="flex items-center gap-4">
                                    <div className={`
                                        flex flex-col items-center justify-center w-12 h-12 rounded-lg font-bold
                                        ${hasSchedule ? 'bg-gray-700 text-white' : 'bg-gray-800/50 text-gray-500'}
                                    `}>
                                        <span className="text-[10px] uppercase tracking-wider">{dateUtils.formatCustom(day.date, 'EEE')}</span>
                                        <span className="text-xl">{dateUtils.formatCustom(day.date, 'dd')}</span>
                                    </div>
                                    
                                    <div>
                                        {hasLeave ? (
                                            <div className="flex flex-col">
                                                <span className="text-blue-400 font-bold">{day.rawLeave.leaveType}</span>
                                                <span className="text-xs text-gray-500">Approved Leave</span>
                                            </div>
                                        ) : hasSchedule ? (
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xl font-bold text-white tracking-tight">{day.rawSchedule.startTime} - {day.rawSchedule.endTime}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    {includesBreak ? (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-900 px-2 py-0.5 rounded border border-gray-700">
                                                            <Coffee className="w-3 h-3" /> Break Included
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-900/20 px-2 py-0.5 rounded border border-amber-500/30">
                                                            <Flame className="w-3 h-3" /> Continuous Shift
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-gray-500 font-medium">Off Duty</span>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Status Pill: Shows for Attendance OR Absence */}
                                <div className="hidden sm:block">
                                    {(day.rawAttendance || day.attendanceStatus === 'Absent') && (
                                        <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider border ${getBadgeStyles(day.attendanceStatus)}`}>
                                            {day.attendanceStatus}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}