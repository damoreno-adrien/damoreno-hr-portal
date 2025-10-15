import React, { useState, useMemo } from 'react';
import Modal from '../components/Modal';
import ShiftModal from '../components/ShiftModal';
import useWeeklyPlannerData from '../hooks/useWeeklyPlannerData'; // NEW: Import hook
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon } from '../components/Icons';

const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

const getCurrentJob = (staff) => {
    if (!staff?.jobHistory || staff.jobHistory.length === 0) {
        return null;
    }
    return staff.jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
};

export default function PlanningPage({ db, staffList, userRole, departments }) {
    const [departmentFilter, setDepartmentFilter] = useState('All Departments');
    const [showArchived, setShowArchived] = useState(false);

    const getStartOfWeek = (date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    };

    const [startOfWeek, setStartOfWeek] = useState(getStartOfWeek(new Date()));
    const [selectedShift, setSelectedShift] = useState(null);
    const [selectedLeave, setSelectedLeave] = useState(null);
    
    // NEW: All data fetching is now handled by the hook
    const { schedules, approvedLeave, isLoading } = useWeeklyPlannerData(db, startOfWeek);
    
    const getLeaveForStaffOnDate = (staffId, date) => {
        const dateStr = formatDateToYYYYMMDD(date);
        return approvedLeave.find(leave => 
            leave.staffId === staffId && 
            dateStr >= leave.startDate && 
            dateStr <= leave.endDate
        );
    };

    const changeWeek = (offset) => {
        setStartOfWeek(prevDate => {
            const newDate = new Date(prevDate);
            newDate.setDate(newDate.getDate() + (7 * offset));
            return newDate;
        });
    };
    
    const days = Array.from({ length: 7 }).map((_, i) => {
        const date = new Date(startOfWeek);
        date.setDate(date.getDate() + i);
        return date;
    });

    const formatDateHeader = (date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isToday = date.getTime() === today.getTime();
        return (
            <div className={`text-center py-4 border-b-2 ${isToday ? 'border-amber-500' : 'border-gray-700'} border-r border-gray-700`}>
                <p className={`font-bold ${isToday ? 'text-amber-400' : 'text-white'}`}>{date.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                <p className={`text-2xl font-light ${isToday ? 'text-white' : 'text-gray-300'}`}>{date.getDate()}</p>
            </div>
        );
    };

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    const weekRangeString = `${startOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${endOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    const isManager = userRole === 'manager';

    const filteredStaffList = useMemo(() => staffList.filter(staff => {
        if (!showArchived && staff.status === 'inactive') return false;

        if (departmentFilter === 'All Departments') return true;
        const currentJob = getCurrentJob(staff);
        return currentJob?.department === departmentFilter;
    }), [staffList, showArchived, departmentFilter]);

    const groupedStaff = useMemo(() => filteredStaffList.reduce((acc, staff) => {
        const job = getCurrentJob(staff);
        const dept = job?.department || 'Unassigned';
        if (!acc[dept]) acc[dept] = [];
        acc[dept].push(staff);
        return acc;
    }, {}), [filteredStaffList]);
    
    const orderedDepartments = Object.keys(groupedStaff).sort();

    return (
        <div>
            {selectedShift && (
                <Modal isOpen={true} onClose={() => setSelectedShift(null)} title={selectedShift.existingShift ? "Edit Shift" : "Add Shift"}>
                    <ShiftModal 
                        db={db}
                        staffMember={selectedShift.staff}
                        date={selectedShift.date}
                        existingShift={selectedShift.existingShift}
                        onClose={() => setSelectedShift(null)}
                    />
                </Modal>
            )}

            {selectedLeave && (
                <Modal isOpen={true} onClose={() => setSelectedLeave(null)} title="Leave Request Details">
                    <div className="space-y-3 text-white">
                        <p><span className="font-semibold text-gray-400">Employee:</span> {getDisplayName(staffList.find(s => s.id === selectedLeave.staffId))}</p>
                        <p><span className="font-semibold text-gray-400">Leave Type:</span> {selectedLeave.leaveType}</p>
                        <p><span className="font-semibold text-gray-400">Dates:</span> {selectedLeave.startDate} to {selectedLeave.endDate} ({selectedLeave.totalDays} days)</p>
                        {selectedLeave.reason && <p><span className="font-semibold text-gray-400">Reason:</span> {selectedLeave.reason}</p>}
                    </div>
                </Modal>
            )}

            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
                <div className="flex items-center space-x-4">
                    <h2 className="text-2xl md:text-3xl font-bold text-white flex-shrink-0">Weekly Planner</h2>
                    <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-lg text-white p-2 text-sm">
                        <option>All Departments</option>
                        {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                    </select>
                    <div className="flex items-center">
                        <input id="showArchived" type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-amber-600 focus:ring-amber-500"/>
                        <label htmlFor="showArchived" className="ml-2 text-sm text-gray-300">Show Archived</label>
                    </div>
                </div>
                <div className="flex items-center space-x-2 sm:space-x-4">
                    <button onClick={() => changeWeek(-1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"><ChevronLeftIcon className="h-6 w-6" /></button>
                    <h3 className="text-lg sm:text-xl font-semibold w-48 sm:w-64 text-center">{weekRangeString}</h3>
                    <button onClick={() => changeWeek(1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"><ChevronRightIcon className="h-6 w-6" /></button>
                </div>
            </div>

            <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-lg">
                <div className="min-w-[1200px]">
                    <div className="grid grid-cols-[200px_repeat(7,1fr)]">
                        <div className="px-4 py-3 font-medium text-white border-b-2 border-r border-gray-700 flex items-center">STAFF</div>
                        {days.map(day => (<div key={day.toISOString()}>{formatDateHeader(day)}</div>))}
                        
                        {isLoading ? (
                            <div className="col-span-8 text-center py-10 text-gray-500">Loading schedule...</div>
                        ) : (
                            orderedDepartments.map(dept => (
                                <React.Fragment key={dept}>
                                    <div className="col-span-8 bg-gray-900 text-amber-400 font-bold p-2 border-t border-b border-gray-700">{dept}</div>
                                    {groupedStaff[dept].sort((a,b) => getDisplayName(a).localeCompare(getDisplayName(b))).map(staff => (
                                        <div key={staff.id} className="grid grid-cols-subgrid col-span-8 border-t border-gray-700">
                                            <div className="px-4 py-3 font-medium text-white border-r border-gray-700 h-16 flex items-center">{getDisplayName(staff)}</div>
                                            {days.map(day => {
                                                const leaveDetails = getLeaveForStaffOnDate(staff.id, day);
                                                if (leaveDetails) {
                                                    const staffForLeave = staffList.find(s => s.id === leaveDetails.staffId);
                                                    return (
                                                        <div key={day.toISOString()} className="border-r border-gray-700 h-16 flex items-center justify-center p-1">
                                                            <button onClick={() => setSelectedLeave({ ...leaveDetails, staffName: getDisplayName(staffForLeave) })} className="bg-blue-600 text-white font-bold p-2 rounded-md w-full h-full flex items-center justify-center text-center text-sm hover:bg-blue-500">
                                                                On Leave
                                                            </button>
                                                        </div>
                                                    );
                                                }
                                                const dayStr = formatDateToYYYYMMDD(day);
                                                const shiftKey = `${staff.id}_${dayStr}`;
                                                const shift = schedules[shiftKey];
                                                return (
                                                    <div key={day.toISOString()} className="border-r border-gray-700 h-16 flex items-center justify-center p-1">
                                                        <button 
                                                            onClick={() => isManager && setSelectedShift({ staff, date: day, existingShift: shift })} 
                                                            disabled={!isManager}
                                                            className={`w-full h-full rounded-md flex items-center justify-center text-xs transition-colors ${isManager ? 'hover:bg-gray-700' : 'cursor-default'}`}
                                                        >
                                                            {shift ? (
                                                                <div className="bg-amber-600 text-white font-bold p-2 rounded-md w-full h-full flex flex-col justify-center text-center">
                                                                    <span>{shift.startTime}</span>
                                                                    <span>{shift.endTime}</span>
                                                                </div>
                                                            ) : (
                                                                isManager && <PlusIcon className="h-6 w-6 text-gray-500"/>
                                                            )}
                                                        </button>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ))}
                                </React.Fragment>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};