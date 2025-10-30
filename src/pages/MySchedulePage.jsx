import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as dateUtils from '../utils/dateUtils'; 
import { calculateAttendanceStatus, getStatusClass } from '../utils/statusUtils';
import ShiftDetailModal from '../components/ShiftDetailModal'; 

export default function MySchedulePage({ db, user }) {
    const [startOfWeek, setStartOfWeek] = useState(dateUtils.startOfWeek(new Date()));
    const [weekData, setWeekData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // --- NEW MODAL STATE ---
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
                // --- UPDATED: Store the full leave object in a map for easier retrieval ---
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
                        const leaveObj = leaveMap.get(dateStr); // --- UPDATED ---

                        const { status, minutes } = calculateAttendanceStatus(shift, attendance, leaveObj, date);

                        let scheduleStatus = { type: 'Day Off' };
                        if (shift) {
                            scheduleStatus = { type: 'Shift', startTime: shift.startTime, endTime: shift.endTime };
                        }
                        if (leaveObj) {
                            scheduleStatus = { type: 'On Leave' };
                        }

                        // --- UPDATED: Return all data the DayCard and Modal need ---
                        return { 
                            date, 
                            scheduleStatus, 
                            attendanceStatus: status, 
                            attendanceMinutes: minutes,
                            // --- NEW: Pass raw data for the modal ---
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
    }, [db, user, startOfWeek]);

    // --- NEW MODAL HANDLERS ---
    const handleDayCardClick = (dayInfo) => {
        // Don't open modal for 'Upcoming' shifts
        if (dayInfo.attendanceStatus === 'Upcoming') return;

        setSelectedDayInfo(dayInfo);
        setIsDetailModalOpen(true);
    };

    const closeDetailModal = () => {
        setIsDetailModalOpen(false);
        setSelectedDayInfo(null);
    };

    // ... (changeWeek and weekRangeString)

    const DayCard = ({ dayInfo }) => {
        const today = dateUtils.startOfToday();
        const isToday = dayInfo.date.getTime() === today.getTime();
        
        const statusClass = getStatusClass(dayInfo.attendanceStatus);
        
        // --- NEW: Add cursor-pointer if not upcoming ---
        const isClickable = dayInfo.attendanceStatus !== 'Upcoming';
        
        let statusElement;
        switch(dayInfo.scheduleStatus.type) {
            case 'Shift':
                if (dayInfo.attendanceStatus === 'Late') {
                    statusElement = (
                        <div className="bg-yellow-400 text-black font-bold py-2 px-4 rounded-lg text-center">
                            Late ({dayInfo.attendanceMinutes}m)
                        </div>
                    );
                } else {
                     statusElement = <div className="bg-amber-600 text-white font-bold py-2 px-4 rounded-lg text-center">{dayInfo.scheduleStatus.startTime} - {dayInfo.scheduleStatus.endTime}</div>;
                }
                break;
            case 'On Leave':
                statusElement = <div className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg text-center">On Leave</div>;
                break;
            default:
                if (dayInfo.attendanceStatus === 'Absent') {
                    statusElement = (
                        <div className="bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-center">
                            Absent
                        </div>
                    );
                } else {
                    statusElement = <div className="text-gray-500 py-2 px-4 text-center">Day Off</div>;
                }
        }

        return (
            // --- UPDATED: Added onClick and cursor-pointer ---
            <div 
                onClick={() => handleDayCardClick(dayInfo)}
                className={`p-4 rounded-lg flex items-center justify-between transition-all ${statusClass || 'bg-gray-800'} ${isToday ? 'border-l-4 border-amber-500' : ''} ${isClickable ? 'cursor-pointer hover:shadow-lg hover:ring-2 hover:ring-amber-500/50' : 'opacity-70'}`}
            >
                <div>
                    <p className={`font-bold ${isToday ? 'text-amber-400' : 'text-white'}`}>{dateUtils.formatCustom(dayInfo.date, 'EEEE')}</p>
                    <p className="text-sm text-gray-400">{dateUtils.formatCustom(dayInfo.date, 'dd MMMM')}</p>
                </div>
                <div className="w-40">
                    {statusElement}
                </div>
            </div>
        );
    };

    return (
        <div>
            {/* ... (header) ... */}
             <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
                <h2 className="text-2xl md:text-3xl font-bold text-white">My Schedule</h2>
                <div className="flex items-center space-x-2 sm:space-x-4">
                    <button onClick={() => changeWeek(-1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"><ChevronLeft className="h-6 w-6" /></button>
                    <h3 className="text-lg sm:text-xl font-semibold w-48 sm:w-64 text-center">{/* weekRangeString */}</h3>
                    <button onClick={() => changeWeek(1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"><ChevronRight className="h-6 w-6" /></button>
                </div>
            </div>

            {/* --- RENDER THE MODAL --- */}
            {isDetailModalOpen && selectedDayInfo && (
                <ShiftDetailModal
                    isOpen={isDetailModalOpen}
                    onClose={closeDetailModal}
                    dayInfo={selectedDayInfo}
                />
            )}

            {isLoading ? (
                <p className="text-center text-gray-400">Loading schedule...</p>
            ) : (
                <div className="space-y-4">
                    {weekData.map(day => <DayCard key={day.date.toISOString()} dayInfo={day} />)}
                </div>
            )}
        </div>
    );
}