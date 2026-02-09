/* src/components/Planning/ShiftDetailModal.jsx */

import React from 'react';
import * as dateUtils from '../../utils/dateUtils';
import { Clock, XCircle, CheckCircle, CalendarDays, Plane, Pencil, Edit, Coffee, AlertCircle, Flame } from 'lucide-react';

// Helper to format timestamps safely
const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
        return dateUtils.formatCustom(timestamp.toDate(), 'HH:mm:ss');
    } catch (e) {
        return 'Invalid Date';
    }
};

export default function ShiftDetailModal({ isOpen, onClose, dayInfo, onEdit, onEditAttendance }) {
    if (!isOpen || !dayInfo) return null;

    const { 
        date, 
        attendanceStatus, 
        attendanceMinutes, 
        otMinutes,         
        rawSchedule, 
        rawAttendance, 
        rawLeave,
        staffName 
    } = dayInfo;

    const displayDate = dateUtils.formatCustom(date, 'EEEE, dd MMMM yyyy');

    const isManager = typeof onEdit === 'function' || typeof onEditAttendance === 'function';
    // Allow editing for most statuses except pure "Off" days or Leaves
    const showEditButtons = isManager && attendanceStatus !== 'Leave' && attendanceStatus !== 'Off';

    const handleEditShift = () => {
        if (onEdit) onEdit({ staffId: rawSchedule?.staffId || rawAttendance?.staffId, date, shift: rawSchedule, staffName });
    };

    const handleEditAttendance = () => {
        if (onEditAttendance) onEditAttendance({ staffId: rawSchedule?.staffId || rawAttendance?.staffId, staffName, date, rawAttendance, rawSchedule });
    };

    const renderStatusDetails = () => {
        // 1. WORKED / WORKING STATUSES
        if (['Present', 'Late', 'Completed', 'On Break', 'Overtime'].includes(attendanceStatus)) {
            return (
                <>
                    <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        Shift Details
                        {attendanceStatus === 'Completed' && <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded border border-green-700">Completed</span>}
                        {attendanceStatus === 'On Break' && <span className="text-xs bg-orange-900 text-orange-300 px-2 py-0.5 rounded border border-orange-700">On Break</span>}
                    </h4>
                    
                    <div className="space-y-3 bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        {rawSchedule ? (
                            <div className="flex flex-col gap-1">
                                <p className="flex items-center text-gray-300">
                                    <Clock className="h-5 w-5 mr-3 text-indigo-400" />
                                    <span>Scheduled: <strong className="text-white">{rawSchedule.startTime} - {rawSchedule.endTime}</strong></span>
                                </p>
                                {/* BREAK INDICATOR */}
                                <p className="ml-8 text-xs flex items-center gap-1.5">
                                    {rawSchedule.includesBreak !== false ? (
                                        <><Coffee className="w-3 h-3 text-gray-500" /><span className="text-gray-500">Break Included (1h)</span></>
                                    ) : (
                                        <><Flame className="w-3 h-3 text-amber-500" /><span className="text-amber-500">Continuous Shift (No Break)</span></>
                                    )}
                                </p>
                            </div>
                        ) : (
                            <p className="flex items-center text-gray-400 italic"><Clock className="h-5 w-5 mr-3" />Unscheduled Shift</p>
                        )}
                        
                        <div className="border-t border-gray-700 my-2 pt-2 space-y-2">
                            <p className="flex items-center text-gray-300">
                                <CheckCircle className="h-5 w-5 mr-3 text-green-500" />
                                <span>Check In: <strong className="text-white">{formatTime(rawAttendance?.checkInTime)}</strong></span>
                            </p>
                            
                            {rawAttendance?.checkOutTime ? (
                                <p className="flex items-center text-gray-300">
                                    <CheckCircle className="h-5 w-5 mr-3 text-gray-400" />
                                    <span>Check Out: <strong className="text-white">{formatTime(rawAttendance?.checkOutTime)}</strong></span>
                                </p>
                            ) : (
                                <p className="flex items-center text-gray-500 italic ml-8">--:-- (Active)</p>
                            )}
                        </div>
                    </div>

                    {/* ALERTS SECTION */}
                    <div className="mt-4 space-y-2">
                        {attendanceStatus === 'Late' && (
                            <div className="flex items-center gap-2 bg-yellow-900/30 border border-yellow-700/50 p-3 rounded-lg text-yellow-200 text-sm">
                                <AlertCircle className="w-4 h-4" />
                                <span>Late Arrival: <strong>{attendanceMinutes} mins</strong></span>
                            </div>
                        )}
                        
                        {(otMinutes > 0 || attendanceStatus === 'Overtime') && (
                            <div className="flex items-center gap-2 bg-indigo-900/30 border border-indigo-700/50 p-3 rounded-lg text-indigo-200 text-sm">
                                <Clock className="w-4 h-4" />
                                <span>Overtime: <strong>{otMinutes || rawAttendance?.otMinutes} mins</strong></span>
                            </div>
                        )}
                    </div>
                </>
            );
        }

        switch (attendanceStatus) {
            case 'Absent':
                return (
                    <>
                        <h4 className="text-lg font-semibold text-white mb-3">Shift Details</h4>
                        <div className="bg-red-900/20 p-4 rounded-lg border border-red-800/50 space-y-2">
                             <p className="flex items-center text-gray-300"><Clock className="h-5 w-5 mr-2 text-gray-500" />Scheduled: <strong className="text-white">{rawSchedule?.startTime} - {rawSchedule?.endTime}</strong></p>
                             <p className="flex items-center text-red-400 font-bold mt-2"><XCircle className="h-5 w-5 mr-2" />Absent (No Check-in)</p>
                        </div>
                    </>
                );
            case 'Leave':
                return (
                     <>
                        <h4 className="text-lg font-semibold text-white mb-3">Leave Details</h4>
                        <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-800/50 space-y-2">
                            <p className="flex items-center text-blue-200"><Plane className="h-5 w-5 mr-2" />Status: <strong>On Leave</strong></p>
                            <p className="flex items-center text-gray-300"><CalendarDays className="h-5 w-5 mr-2 text-gray-500" />Type: <strong className="text-white">{rawLeave?.leaveType || 'N/A'}</strong></p>
                             <p className="flex items-center text-gray-300"><CalendarDays className="h-5 w-5 mr-2 text-gray-500" />Dates: <strong className="text-white">{rawLeave?.startDate} to {rawLeave?.endDate}</strong></p>
                        </div>
                    </>
                );
            
            // --- FIX FOR "SCHEDULED DAY OFF" BUG ---
            case 'Scheduled': 
            case 'Empty': 
                // If there is a schedule, it is NOT a day off, it's just upcoming/pending
                if (rawSchedule) {
                    return (
                        <>
                            <h4 className="text-lg font-semibold text-white mb-3">Upcoming Shift</h4>
                            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                                <p className="flex items-center text-gray-300 mb-2">
                                    <Clock className="h-5 w-5 mr-3 text-indigo-400" />
                                    <span>Time: <strong className="text-white">{rawSchedule.startTime} - {rawSchedule.endTime}</strong></span>
                                </p>
                                <p className="text-sm text-gray-500 italic ml-8">Not started yet.</p>
                                
                                <p className="ml-8 mt-2 text-xs flex items-center gap-1.5">
                                    {rawSchedule.includesBreak !== false ? (
                                        <><Coffee className="w-3 h-3 text-gray-500" /><span className="text-gray-500">Break Included (1h)</span></>
                                    ) : (
                                        <><Flame className="w-3 h-3 text-amber-500" /><span className="text-amber-500">Continuous Shift (No Break)</span></>
                                    )}
                                </p>
                            </div>
                        </>
                    );
                }
                // Fallthrough to default if no schedule
            default: 
                return (
                    <div className="py-8 text-center">
                        <Coffee className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium">This is a scheduled day off.</p>
                    </div>
                );
        }
    };

    return (
        <div className={`fixed inset-0 z-50 overflow-y-auto ${isOpen ? 'block' : 'hidden'}`}>
            <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 transition-opacity" onClick={onClose}>
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
                </div>

                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div className="inline-block align-bottom bg-gray-900 rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full border border-gray-700">
                    <div className="bg-gray-900 px-4 pt-5 pb-4 sm:p-6">
                        <div className="text-center sm:text-left">
                            <h3 className="text-xl leading-6 font-bold text-white mb-1">{staffName}</h3>
                            <p className="text-sm text-gray-400 mb-4 uppercase tracking-wider font-semibold">{displayDate}</p>
                            <div className="border-t border-gray-800 pt-4">
                                {renderStatusDetails()}
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-gray-800/50 px-4 py-3 sm:px-6 flex flex-row-reverse justify-between gap-2 border-t border-gray-800">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors">Close</button>
                        
                        {showEditButtons && (
                            <div className="flex gap-2">
                                <button type="button" onClick={handleEditAttendance} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg" title="Edit Attendance"><Edit className="w-5 h-5" /></button>
                                <button type="button" onClick={handleEditShift} className="p-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/30 rounded-lg" title="Edit Shift"><Pencil className="w-5 h-5" /></button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}