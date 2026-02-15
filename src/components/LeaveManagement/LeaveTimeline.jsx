// src/components/LeaveManagement/LeaveTimeline.jsx
import React, { useMemo, useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import * as dateUtils from '../../utils/dateUtils';

export const LeaveTimeline = ({ db, allRequests, staffList, currentMonth = new Date(), onCellClick, onStaffClick, getStaffDepartment }) => {
    const [attData, setAttData] = useState([]);
    const [schedData, setSchedData] = useState([]);
    const [shiftData, setShiftData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!db) return;
        setIsLoading(true);
        
        const startStr = dateUtils.formatISODate(dateUtils.startOfMonth(currentMonth));
        const endStr = dateUtils.formatISODate(dateUtils.endOfMonth(currentMonth));

        const attQ = query(collection(db, 'attendance'), where('date', '>=', startStr), where('date', '<=', endStr));
        const schedQ = query(collection(db, 'schedules'), where('date', '>=', startStr), where('date', '<=', endStr));
        const shiftQ = query(collection(db, 'shifts'), where('date', '>=', startStr), where('date', '<=', endStr));

        let attLoaded = false, schedLoaded = false, shiftLoaded = false;
        const checkLoading = () => { if (attLoaded && schedLoaded && shiftLoaded) setIsLoading(false); };

        const unsubAtt = onSnapshot(attQ, snap => { setAttData(snap.docs.map(d => d.data())); attLoaded = true; checkLoading(); }, err => { console.error("Att Error:", err); attLoaded = true; checkLoading(); });
        const unsubSched = onSnapshot(schedQ, snap => { setSchedData(snap.docs.map(d => d.data())); schedLoaded = true; checkLoading(); }, err => { console.error("Sched Error:", err); schedLoaded = true; checkLoading(); });
        const unsubShift = onSnapshot(shiftQ, snap => { setShiftData(snap.docs.map(d => d.data())); shiftLoaded = true; checkLoading(); }, err => { console.error("Shift Error:", err); shiftLoaded = true; checkLoading(); });

        return () => { unsubAtt(); unsubSched(); unsubShift(); };
    }, [db, currentMonth]);

    const daysInMonth = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const numDays = new Date(year, month + 1, 0).getDate();
        return Array.from({ length: numDays }, (_, i) => new Date(year, month, i + 1));
    }, [currentMonth]);

    const calculateMonthLeave = (requests) => {
        let total = 0;
        const monthStartStr = dateUtils.formatISODate(dateUtils.startOfMonth(currentMonth));
        const monthEndStr = dateUtils.formatISODate(dateUtils.endOfMonth(currentMonth));

        requests.forEach(req => {
            const overlapStart = req.startDate < monthStartStr ? monthStartStr : req.startDate;
            const overlapEnd = req.endDate > monthEndStr ? monthEndStr : req.endDate;
            if (overlapStart <= overlapEnd) total += dateUtils.differenceInCalendarDays(overlapEnd, overlapStart);
        });
        return total;
    };

    // --- NEW: Grouping and Sorting Logic ---
    const groupedStaff = useMemo(() => {
        const groups = {};
        
        staffList.forEach(staff => {
            const dept = getStaffDepartment ? getStaffDepartment(staff) : 'Unassigned';
            if (!groups[dept]) groups[dept] = [];
            
            const requests = allRequests.filter(r => r.staffId === staff.id && r.status === 'approved');
            groups[dept].push({ staff, requests, monthLeaveTotal: calculateMonthLeave(requests) });
        });

        // Sort Departments
        const sortedDepts = Object.keys(groups).sort((a, b) => {
            if (a === 'Unassigned') return 1;
            if (b === 'Unassigned') return -1;
            return a.localeCompare(b);
        });

        // Sort Staff within Departments alphabetically
        sortedDepts.forEach(dept => {
            groups[dept].sort((a, b) => {
                const nameA = (a.staff.nickname || a.staff.firstName || '').toLowerCase();
                const nameB = (b.staff.nickname || b.staff.firstName || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
        });

        return { groups, sortedDepts };
    }, [staffList, allRequests, currentMonth, getStaffDepartment]);

    const getDayStatus = (staffId, requests, day) => {
        const dayStr = dateUtils.formatISODate(day);
        const todayStr = dateUtils.formatISODate(new Date());
        
        const leave = requests.find(req => dayStr >= req.startDate && dayStr <= req.endDate);
        if (leave) return { type: 'leave', data: leave };

        const atts = attData.filter(a => (a.staffId === staffId || a.userId === staffId) && a.date === dayStr);
        if (atts.length > 0) {
            if (atts.some(a => a.status === 'absent')) return { type: 'absent' };
            return { type: 'present' }; 
        }

        const allSchedules = [...schedData, ...shiftData];
        const scheds = allSchedules.filter(s => {
            const sId = s.staffId || s.userId || s.employeeId;
            let sDate = s.date;
            if (!sDate && s.startDate) sDate = s.startDate.includes('T') ? s.startDate.split('T')[0] : s.startDate;
            return sId === staffId && sDate === dayStr;
        });

        if (scheds.length > 0) {
            const sched = scheds[0];
            
            // Stronger Day Off Detection
            if (sched.type === 'day_off' || sched.isDayOff || sched.status === 'day_off' || sched.shiftType === 'day_off' || !sched.startTime) {
                return { type: 'day_off' };
            }

            if (sched.type === 'work' || sched.startTime) {
                if (dayStr < todayStr) return { type: 'absent' };
                return { type: 'scheduled' };
            }
        }

        return { type: 'none' };
    };

    const renderCellContent = (status) => {
        switch (status.type) {
            case 'leave': {
                const leaveType = status.data.leaveType;
                let bgColor = 'bg-gray-500';
                if (leaveType === 'Annual Leave') bgColor = 'bg-amber-500';
                if (leaveType === 'Sick Leave') bgColor = 'bg-red-500';
                if (leaveType === 'Personal Leave') bgColor = 'bg-purple-500'; 
                if (leaveType === 'Public Holiday (In Lieu)') bgColor = 'bg-blue-500';
                return (
                    <div className="absolute inset-y-1.5 inset-x-0.5 flex items-center justify-center">
                        <div className={`w-full h-full rounded shadow-sm opacity-90 hover:opacity-100 transition-opacity ${bgColor}`} title={leaveType}></div>
                    </div>
                );
            }
            case 'present': return <div className="absolute inset-0 flex items-center justify-center"><div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" title="Present"></div></div>;
            case 'absent': return <div className="absolute inset-0 flex items-center justify-center"><span className="flex items-center justify-center w-5 h-5 bg-red-900/50 text-red-400 rounded border border-red-800/50 font-bold text-[11px]" title="Absent">A</span></div>;
            case 'day_off': return <div className="absolute inset-0 flex items-center justify-center"><span className="flex items-center justify-center px-1.5 py-0.5 bg-gray-800/80 text-gray-500 rounded border border-gray-700/50 font-bold text-[9px]" title="Day Off">OFF</span></div>;
            case 'scheduled': return <div className="absolute inset-0 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full border border-gray-600" title="Scheduled to work"></div></div>;
            default: return null;
        }
    };

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-700 relative">
            {isLoading && (
                <div className="absolute inset-0 bg-gray-900/50 z-30 flex items-center justify-center">
                    <span className="text-white font-semibold flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                        Loading data...
                    </span>
                </div>
            )}
            <div className="overflow-x-auto pb-4">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-200 uppercase bg-gray-700 sticky top-0 z-20">
                        <tr>
                            <th className="px-4 py-3 sticky left-0 bg-gray-700 z-30 min-w-[150px] border-r border-gray-600 shadow-[2px_0_5px_rgba(0,0,0,0.1)]">Staff Member</th>
                            {daysInMonth.map(day => {
                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                return (
                                    <th key={day.toISOString()} className={`px-0 py-3 text-center min-w-[36px] border-l border-gray-600 ${isWeekend ? 'bg-gray-750' : ''}`}>
                                        <div className="flex flex-col items-center">
                                            <span className={`opacity-60 text-[10px] ${isWeekend ? 'text-amber-400/70' : ''}`}>{day.toLocaleString('en-US', { weekday: 'narrow' })}</span>
                                            <span className={`mt-0.5 ${isWeekend ? 'text-amber-400' : ''}`}>{day.getDate()}</span>
                                        </div>
                                    </th>
                                );
                            })}
                            <th className="px-4 py-3 sticky right-0 bg-gray-700 z-30 min-w-[100px] border-l border-gray-600 shadow-[-2px_0_5px_rgba(0,0,0,0.1)] text-center">Month Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groupedStaff.sortedDepts.length === 0 ? (
                            <tr><td colSpan={daysInMonth.length + 2} className="p-8 text-center text-gray-500">No staff match the selected filters.</td></tr>
                        ) : (
                            groupedStaff.sortedDepts.map(dept => (
                                <React.Fragment key={dept}>
                                    {/* --- DEPARTMENT HEADER ROW --- */}
                                    <tr className="bg-gray-900/40">
                                        <td colSpan={daysInMonth.length + 2} className="px-5 py-2 text-[11px] font-black uppercase tracking-[0.2em] border-y border-gray-700/50 text-indigo-400 sticky left-0 z-10 bg-gray-900/90 backdrop-blur">
                                            {dept}
                                        </td>
                                    </tr>
                                    
                                    {/* --- STAFF ROWS --- */}
                                    {groupedStaff.groups[dept].map(({ staff, requests, monthLeaveTotal }) => (
                                        <tr key={staff.id} className="border-b border-gray-700 hover:bg-gray-750 transition-colors">
                                            <td 
                                                onClick={() => onStaffClick && onStaffClick(staff)}
                                                className="px-4 py-3 font-medium text-white sticky left-0 bg-gray-800 z-10 border-r border-gray-700 shadow-[2px_0_5px_rgba(0,0,0,0.1)] truncate max-w-[150px] cursor-pointer hover:text-indigo-400 transition-colors group"
                                            >
                                                {staff.nickname || staff.firstName}
                                                <span className="hidden group-hover:inline ml-2 text-[10px] text-indigo-500 font-bold tracking-wider">(VIEW)</span>
                                            </td>
                                            {daysInMonth.map(day => {
                                                const status = getDayStatus(staff.id, requests, day);
                                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                                return (
                                                    <td 
                                                        key={day.toISOString()} 
                                                        onClick={() => { if (status.type !== 'leave' && onCellClick) onCellClick(staff.id, day); }}
                                                        className={`p-0 border-l border-gray-700/50 relative h-12 ${isWeekend ? 'bg-gray-800/30' : ''} ${status.type !== 'leave' ? 'cursor-pointer hover:bg-gray-700/80 transition-colors' : ''}`}
                                                    >
                                                        {renderCellContent(status)}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-4 py-3 sticky right-0 bg-gray-800 z-10 border-l border-gray-700 shadow-[-2px_0_5px_rgba(0,0,0,0.1)] text-center font-bold text-white">
                                                {monthLeaveTotal > 0 ? `${monthLeaveTotal} Days` : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className="p-4 bg-gray-900 border-t border-gray-700 flex flex-wrap gap-x-6 gap-y-3 text-xs justify-center md:justify-start items-center">
                <div className="flex items-center gap-2"><div className="w-4 h-3 bg-amber-500 rounded-sm"></div> Annual Leave</div>
                <div className="flex items-center gap-2"><div className="w-4 h-3 bg-red-500 rounded-sm"></div> Sick Leave</div>
                <div className="flex items-center gap-2"><div className="w-4 h-3 bg-purple-500 rounded-sm"></div> Personal Leave</div>
                <div className="flex items-center gap-2"><div className="w-4 h-3 bg-blue-500 rounded-sm"></div> Public Holiday</div>
                <div className="h-4 border-l border-gray-600 mx-2 hidden md:block"></div>
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]"></div> Present</div>
                <div className="flex items-center gap-2"><span className="flex items-center justify-center w-4 h-4 bg-red-900/50 text-red-400 rounded border border-red-800/50 font-bold text-[9px]">A</span> Absent</div>
                <div className="flex items-center gap-2"><span className="flex items-center justify-center px-1.5 py-0.5 bg-gray-800/80 text-gray-500 rounded border border-gray-700/50 font-bold text-[9px]">OFF</span> Day Off</div>
                <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full border border-gray-500"></div> Scheduled</div>
            </div>
        </div>
    );
};