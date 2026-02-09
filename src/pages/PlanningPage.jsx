/* src/pages/PlanningPage.jsx */

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../firebase.js"
import useWeeklyPlannerData from '../hooks/useWeeklyPlannerData';
import { 
    ChevronLeft, ChevronRight, Download, Upload, 
    Clock, Coffee, Flame, Plus, Loader2, ArrowUpDown, 
    User, Briefcase, Calendar, Fingerprint, X, AlertCircle
} from 'lucide-react';
import ShiftModal from '../components/Planning/ShiftModal.jsx'; 
import ImportConfirmationModal from '../components/common/ImportConfirmationModal.jsx';
import ExportOptionsModal from '../components/common/ExportOptionsModal.jsx'; 
import * as dateUtils from '../utils/dateUtils'; 
import Modal from '../components/common/Modal.jsx';
import EditAttendanceModal from '../components/Attendance/EditAttendanceModal.jsx';
import ShiftCreator from '../components/Dashboard/ShiftCreator.jsx';

// --- STYLING CONSTANTS ---
const DEPT_STYLES = {
    'Service': { border: 'border-l-4 border-l-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10' },
    'Kitchen': { border: 'border-l-4 border-l-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10' },
    'Pizza': { border: 'border-l-4 border-l-red-500', text: 'text-red-400', bg: 'bg-red-500/10' },
    'Bar': { border: 'border-l-4 border-l-purple-500', text: 'text-purple-400', bg: 'bg-purple-500/10' },
    'Cleaning': { border: 'border-l-4 border-l-green-500', text: 'text-green-400', bg: 'bg-green-500/10' },
    'Management': { border: 'border-l-4 border-l-indigo-500', text: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    'Unassigned': { border: 'border-l-4 border-l-gray-500', text: 'text-gray-400', bg: 'bg-gray-500/10' }
};

export default function PlanningPage({ db, staffList, companyConfig }) {
    const [weekStart, setWeekStart] = useState(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    });

    const { weekData, weekDates, loading, refetchWeekData } = useWeeklyPlannerData(db, weekStart);

    const [sortOrder, setSortOrder] = useState('asc'); 
    const [showBulkCreator, setShowBulkCreator] = useState(false);
    const [bulkCreatorProps, setBulkCreatorProps] = useState({}); // Stores data for pre-filling ShiftCreator

    const [actionMenu, setActionMenu] = useState(null); 
    const [selectedShift, setSelectedShift] = useState(null);
    const [selectedAttendance, setSelectedAttendance] = useState(null);

    // --- HELPER: Get Department Style ---
    const getDeptStyle = (deptName) => {
        return DEPT_STYLES[deptName] || DEPT_STYLES['Unassigned'];
    };

    // --- HELPER: Get Current Job ---
    const getCurrentJob = (staff) => {
        if (!staff.jobHistory || staff.jobHistory.length === 0) {
            return { department: 'Unassigned', position: 'Staff' };
        }
        return [...staff.jobHistory].sort((a, b) => 
            new Date(b.startDate) - new Date(a.startDate)
        )[0];
    };

    const getShiftStatus = (schedule, attendance, dateString) => {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        if (!schedule || !schedule.startTime) return { status: 'off' };

        const isPast = dateString < todayStr;
        const isToday = dateString === todayStr;

        if (!attendance) {
            try {
                const [sh, sm] = schedule.startTime.split(':').map(Number);
                const startTime = new Date(now);
                startTime.setHours(sh, sm, 0);
                if (isPast || (isToday && now > new Date(startTime.getTime() + 15 * 60000))) {
                    return { status: 'absent' };
                }
            } catch (e) { return { status: 'off' }; }
            return { status: 'scheduled' };
        }

        try {
            const checkIn = attendance.checkInTime?.toDate ? attendance.checkInTime.toDate() : attendance.checkInTime;
            const [sh, sm] = schedule.startTime.split(':').map(Number);
            const scheduledIn = new Date(checkIn);
            scheduledIn.setHours(sh, sm, 0);
            
            const lateness = Math.floor((checkIn - scheduledIn) / 60000);
            if (lateness > 0) return { status: 'late', minutes: lateness };
            
        } catch (e) { return { status: 'on-time' }; }

        return { status: 'on-time' };
    };

    // --- NEW: Handle Clicking Staff Name ---
    const handleStaffNameClick = (staff) => {
        // Pre-fill ShiftCreator with this staff member and the CURRENT viewing week
        setBulkCreatorProps({
            initialStaffId: staff.id,
            initialStartDate: weekDates[0].dateString, // Monday of current view
            initialEndDate: weekDates[6].dateString    // Sunday of current view
        });
        setShowBulkCreator(true);
    };

    // --- DYNAMIC GROUPING ---
    const groupedAndSortedStaff = useMemo(() => {
        if (!staffList) return {};
        const activeStaff = staffList.filter(s => s.status !== 'inactive');
        
        const groups = activeStaff.reduce((acc, staff) => {
            const job = getCurrentJob(staff);
            const dept = job.department || 'Unassigned';
            
            if (!acc[dept]) acc[dept] = [];
            acc[dept].push(staff);
            return acc;
        }, {});

        Object.keys(groups).forEach(dept => {
            groups[dept].sort((a, b) => {
                const nameA = (a.nickname || a.firstName).toLowerCase();
                const nameB = (b.nickname || b.firstName).toLowerCase();
                return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
            });
        });
        return groups;
    }, [staffList, sortOrder]);

    const categories = useMemo(() => {
        const configDepts = companyConfig?.departments || [];
        const activeDepts = Object.keys(groupedAndSortedStaff);
        const allDepts = Array.from(new Set([...configDepts, ...activeDepts]));
        return allDepts.filter(c => groupedAndSortedStaff[c] && groupedAndSortedStaff[c].length > 0);
    }, [companyConfig, groupedAndSortedStaff]);

    if (loading || !weekDates || weekDates.length === 0) return (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-900 min-h-screen">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <p className="text-gray-400 mt-4 font-bold uppercase tracking-widest text-xs">Syncing Da Moreno Planning...</p>
        </div>
    );

    return (
        <div className="space-y-6 animate-fadeIn h-[calc(100vh-100px)] flex flex-col">
            {/* Action Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-lg flex-shrink-0">
                <div className="flex items-center gap-6">
                    <div className="space-y-1">
                        <h2 className="text-2xl font-black text-white tracking-tight">Planning</h2>
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Da Moreno At Town</p>
                    </div>
                    <div className="flex items-center bg-gray-900 rounded-xl p-1.5 border border-gray-700">
                        <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 transition-all"><ChevronLeft className="w-5 h-5" /></button>
                        <span className="px-6 text-sm font-bold text-indigo-100 min-w-[200px] text-center">
                            {dateUtils.formatCustom(weekDates[0].dateObject, 'dd MMM')} — {dateUtils.formatCustom(weekDates[6].dateObject, 'dd MMM')}
                        </span>
                        <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 transition-all"><ChevronRight className="w-5 h-5" /></button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')} className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold border border-gray-700 transition-all">
                        <ArrowUpDown className="w-4 h-4 text-indigo-400" /> {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                    </button>
                    <button onClick={() => { setBulkCreatorProps({}); setShowBulkCreator(true); }} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg">
                        <Plus className="w-4 h-4" /> Bulk Creator
                    </button>
                </div>
            </div>

            {/* Grid Container */}
            <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl relative flex-grow overflow-hidden flex flex-col">
                <div className="overflow-auto flex-grow h-full"> 
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead className="sticky top-0 z-30"><tr className="bg-gray-900 shadow-md">
                                <th className="p-5 border-b border-gray-700 text-[10px] font-black text-gray-500 uppercase w-56 sticky left-0 top-0 z-40 bg-gray-900">
                                    Team Member
                                </th>
                                {weekDates.map(date => (
                                    <th key={date.dateString} className="p-4 border-b border-gray-700 text-center bg-gray-900">
                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">{date.dayName}</p>
                                        <p className="text-xl font-black text-white mt-1">{dateUtils.formatCustom(date.dateObject, 'dd')}</p>
                                    </th>
                                ))}
                            </tr></thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {categories.map(category => {
                                const style = getDeptStyle(category);
                                return (
                                    <React.Fragment key={category}>
                                        <tr className="bg-gray-900/40">
                                            <td colSpan={8} className={`px-5 py-2 text-[11px] font-black uppercase tracking-[0.2em] border-y border-gray-700/50 ${style.text} sticky left-0 z-10 bg-gray-900/90 backdrop-blur`}>
                                                {category}
                                            </td>
                                        </tr>
                                        {groupedAndSortedStaff[category].map(staff => (
                                            <tr key={staff.id} className="hover:bg-indigo-500/5 transition-colors group text-sm">
                                                {/* Staff Name Column - Now Clickable! */}
                                                <td 
                                                    onClick={() => handleStaffNameClick(staff)}
                                                    className={`p-4 sticky left-0 z-20 bg-gray-800 group-hover:bg-[#1f2937] transition-colors shadow-[4px_0_10px_rgba(0,0,0,0.3)] ${style.border} cursor-pointer hover:brightness-110 active:scale-[0.98]`}
                                                    title="Click to plan schedule for this week"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${style.bg} ${style.text}`}>
                                                            {(staff.nickname || staff.firstName).substring(0,2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-black text-white leading-tight">{staff.nickname || staff.firstName}</p>
                                                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">
                                                                {getCurrentJob(staff).position || 'Staff'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>

                                                {weekDates.map(date => {
                                                    const dayData = weekData[staff.id]?.[date.dateString] || {};
                                                    const { schedule, attendance, leave } = dayData;
                                                    const statusInfo = getShiftStatus(schedule, attendance, date.dateString);
                                                    
                                                    return (
                                                        <td key={date.dateString} className="p-2 text-center align-top min-w-[140px]">
                                                            <div 
                                                                onClick={() => setActionMenu({ staff, date: date.dateString, dayData })}
                                                                className={`min-h-[105px] p-3 rounded-xl cursor-pointer transition-all flex flex-col justify-between group/cell relative border
                                                                    ${leave ? 'bg-indigo-500/10 border-indigo-500/30' : schedule ? 'bg-gray-700/30 border-gray-600/50 hover:bg-gray-700/60' : 'bg-transparent border border-dashed border-gray-700/30'}
                                                                    ${statusInfo.status === 'absent' && !leave ? 'ring-1 ring-red-500/50 bg-red-500/5 shadow-[inset_0_0_10px_rgba(239,68,68,0.1)]' : ''}
                                                                `}
                                                            >
                                                                {leave ? (
                                                                    <div className="flex flex-col items-center justify-center h-full space-y-1">
                                                                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">On Leave</span>
                                                                        <span className="text-[8px] font-bold text-gray-500 uppercase">{leave.leaveType}</span>
                                                                    </div>
                                                                ) : schedule ? (
                                                                    <div className="space-y-2">
                                                                        <div className="flex items-center justify-between text-white font-black text-[11px]">
                                                                            <span>{schedule.startTime}</span>
                                                                            {schedule.includesBreak ? <Coffee className="w-3 h-3 text-gray-500" /> : <Flame className="w-3 h-3 text-amber-500" />}
                                                                            <span>{schedule.endTime}</span>
                                                                        </div>
                                                                        {statusInfo.status === 'absent' && <div className="text-[9px] font-black text-red-500 uppercase tracking-tighter animate-pulse text-center">No Show</div>}
                                                                        {statusInfo.status === 'late' && <div className="text-[9px] font-black text-amber-500 uppercase tracking-tighter text-center bg-amber-500/10 rounded py-0.5">Late +{statusInfo.minutes}m</div>}
                                                                    </div>
                                                                ) : <div className="mt-6 opacity-0 group-hover/cell:opacity-100 transition-opacity"><Plus className="w-4 h-4 text-gray-600" /></div>}
                                                                
                                                                {attendance && (
                                                                    <div className="mt-auto pt-2 border-t border-gray-700/50">
                                                                        <div className="flex items-center justify-center gap-1.5 text-[10px] font-mono font-black">
                                                                            <span className="text-green-400">{dateUtils.formatCustom(attendance.checkInTime?.toDate?.() || attendance.checkInTime, 'HH:mm')}</span>
                                                                            <span className="text-gray-600">→</span>
                                                                            {attendance.checkOutTime ? <span className="text-green-400">{dateUtils.formatCustom(attendance.checkOutTime?.toDate?.() || attendance.checkOutTime, 'HH:mm')}</span> : <span className="text-amber-400 animate-pulse uppercase">On</span>}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Action Selection Modal */}
            {actionMenu && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
                        <div className="p-4 bg-gray-900/50 border-b border-gray-700 flex justify-between items-center">
                            <h3 className="text-white font-bold">{actionMenu.staff.nickname || actionMenu.staff.firstName}</h3>
                            <button onClick={() => setActionMenu(null)} className="text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5"/></button>
                        </div>
                        <div className="p-6 grid grid-cols-1 gap-4">
                            <button onClick={() => { setSelectedShift({ staff: actionMenu.staff, date: actionMenu.date, shift: actionMenu.dayData.schedule }); setActionMenu(null); }} className="flex items-center gap-4 p-4 bg-gray-700 hover:bg-indigo-600 rounded-xl transition-all group">
                                <div className="p-2 bg-gray-800 rounded-lg group-hover:bg-indigo-500 text-indigo-400 group-hover:text-white transition-colors"><Calendar className="w-6 h-6" /></div>
                                <div className="text-left"><p className="font-bold text-white">Manage Schedule</p><p className="text-xs text-gray-400">Edit shift times & break policy</p></div>
                            </button>
                            <button onClick={() => { setSelectedAttendance(actionMenu.dayData.attendance || { staffId: actionMenu.staff.id, staffName: actionMenu.staff.nickname || actionMenu.staff.firstName, date: actionMenu.date, checkInTime: new Date(actionMenu.date + "T14:00:00") }); setActionMenu(null); }} className="flex items-center gap-4 p-4 bg-gray-700 hover:bg-green-600 rounded-xl transition-all group">
                                <div className="p-2 bg-gray-800 rounded-lg group-hover:bg-green-500 text-green-400 group-hover:text-white transition-colors"><Fingerprint className="w-6 h-6" /></div>
                                <div className="text-left"><p className="font-bold text-white">Edit Attendance</p><p className="text-xs text-gray-400">Fix clock-in/out or manual entry</p></div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedShift && <ShiftModal isOpen={true} onClose={() => { setSelectedShift(null); refetchWeekData(); }} db={db} data={selectedShift} />}
            {selectedAttendance && <Modal isOpen={true} onClose={() => { setSelectedAttendance(null); refetchWeekData(); }} title="Attendance Correction"><EditAttendanceModal db={db} record={selectedAttendance} onClose={() => { setSelectedAttendance(null); refetchWeekData(); }} /></Modal>}
            
            {showBulkCreator && (
                <Modal 
                    isOpen={true} 
                    onClose={() => { setShowBulkCreator(false); setBulkCreatorProps({}); }} 
                    title="Bulk Generator"
                >
                    <ShiftCreator 
                        db={db} 
                        staffList={staffList} 
                        onSuccess={() => { setShowBulkCreator(false); setBulkCreatorProps({}); refetchWeekData(); }} 
                        {...bulkCreatorProps} 
                    />
                </Modal>
            )}
        </div>
    );
}