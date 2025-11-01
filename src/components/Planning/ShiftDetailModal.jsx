import React from 'react';
import * as dateUtils from '../../utils/dateUtils';
import { Clock, XCircle, CheckCircle, CalendarDays, Plane, Pencil, Edit } from 'lucide-react';

// Helper to format timestamps safely
const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
        return dateUtils.formatCustom(timestamp.toDate(), 'HH:mm:ss');
    } catch (e) {
        return 'Invalid Date';
    }
};

// --- NEW: Add onEditAttendance to props ---
export default function ShiftDetailModal({ isOpen, onClose, dayInfo, onEdit, onEditAttendance }) {
    if (!isOpen || !dayInfo) return null;

    const { 
        date, 
        attendanceStatus, 
        attendanceMinutes, 
        rawSchedule, 
        rawAttendance, 
        rawLeave,
        staffName // We passed this from PlanningPage
    } = dayInfo;

    const displayDate = dateUtils.formatCustom(date, 'EEEE, dd MMMM yyyy');

    // Handler for the Edit Shift button
    const handleEditShift = () => {
        const staffId = rawSchedule?.staffId || rawAttendance?.staffId;
        if (!staffId) return;
        
        onEdit({
            staffId: staffId,
            date: date,
            shift: rawSchedule,
            staffName: staffName
        });
    };

    // --- NEW: Handler for the Edit Attendance button ---
    const handleEditAttendance = () => {
        const staffId = rawSchedule?.staffId || rawAttendance?.staffId;
        if (!staffId) return;

        // Pass all the info needed by EditAttendanceModal
        onEditAttendance({
            staffId: staffId,
            staffName: staffName,
            date: date,
            rawAttendance: rawAttendance,
            rawSchedule: rawSchedule // Pass schedule in case we need to create an attendance record
        });
    };

    // Decide when to show the Edit buttons
    // Only show if the status is Work-related (not Leave or Off)
    const showEditButtons = ['Present', 'Late', 'Absent'].includes(attendanceStatus);

    const renderStatusDetails = () => {
        switch (attendanceStatus) {
            case 'Present':
            case 'Late':
                return (
                    <>
                        <h4 className="text-lg font-semibold text-white mb-3">Shift Details</h4>
                        <div className="space-y-2">
                            <p className="flex items-center"><Clock className="h-5 w-5 mr-2 text-gray-400" />Scheduled: <strong className="ml-2">{rawSchedule?.startTime} - {rawSchedule?.endTime}</strong></p>
                            <p className="flex items-center"><CheckCircle className="h-5 w-5 mr-2 text-green-400" />Checked In: <strong className="ml-2">{formatTime(rawAttendance?.checkInTime)}</strong></p>
                            <p className="flex items-center"><CheckCircle className="h-5 w-5 mr-2 text-red-400" />Checked Out: <strong className="ml-2">{formatTime(rawAttendance?.checkOutTime)}</strong></p>
                        </div>
                        {attendanceStatus === 'Late' && (
                            <p className="mt-4 text-yellow-400 font-bold text-center bg-yellow-900/50 p-3 rounded-lg">
                                Status: Late ({attendanceMinutes}m)
                            </p>
                        )}
                    </>
                );
            case 'Absent':
                return (
                    <>
                        <h4 className="text-lg font-semibold text-white mb-3">Shift Details</h4>
                        <div className="space-y-2">
                             <p className="flex items-center"><Clock className="h-5 w-5 mr-2 text-gray-400" />Scheduled: <strong className="ml-2">{rawSchedule?.startTime} - {rawSchedule?.endTime}</strong></p>
                             <p className="flex items-center"><XCircle className="h-5 w-5 mr-2 text-red-400" />Status: <strong className="ml-2">Absent (No Check-in)</strong></p>
                        </div>
                    </>
                );
            case 'Leave':
                return (
                     <>
                        <h4 className="text-lg font-semibold text-white mb-3">Leave Details</h4>
                        <div className="space-y-2">
                            <p className="flex items-center"><Plane className="h-5 w-5 mr-2 text-blue-400" />Status: <strong className="ml-2">On Leave</strong></p>
                            <p className="flex items-center"><CalendarDays className="h-5 w-5 mr-2 text-gray-400" />Type: <strong className="ml-2">{rawLeave?.leaveType || 'N/A'}</strong></p>
                             <p className="flex items-center"><CalendarDays className="h-5 w-5 mr-2 text-gray-400" />Dates: <strong className="ml-2">{rawLeave?.startDate} to {rawLeave?.endDate}</strong></p>
                        </div>
                    </>
                );
            default: // Off or Upcoming
                return (
                    <p className="text-gray-400 text-center py-4">This was a scheduled day off.</p>
                );
        }
    };

    return (
        <div className={`fixed inset-0 z-50 overflow-y-auto ${isOpen ? 'block' : 'hidden'}`}>
            <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                {/* Background overlay */}
                <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={onClose}>
                    <div className="absolute inset-0 bg-gray-800 opacity-75"></div>
                </div>

                {/* Modal panel */}
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div className="inline-block align-bottom bg-gray-900 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-gray-700">
                    <div className="bg-gray-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div className="sm:flex sm:items-start w-full">
                            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                                <h3 className="text-lg leading-6 font-medium text-amber-400 mb-2">
                                    {staffName} - {displayDate}
                                </h3>
                                <div className="mt-4 border-t border-gray-700 pt-4 text-gray-300">
                                    {renderStatusDetails()}
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* --- UPDATED: Footer with conditional Edit buttons --- */}
                    <div className="bg-gray-800 px-4 py-3 sm:px-6 flex flex-row-reverse justify-between">
                        <button
                            type="button" onClick={onClose}
                            className="px-4 py-2 bg-gray-600 text-base font-medium text-white rounded-md shadow-sm hover:bg-gray-500"
                        >
                            Close
                        </button>
                        
                        {showEditButtons && (
                            <div className="flex space-x-2">
                                <button
                                    type="button" onClick={handleEditAttendance}
                                    className="flex items-center px-4 py-2 bg-gray-600 text-base font-medium text-white rounded-md shadow-sm hover:bg-gray-500"
                                >
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Attendance
                                </button>
                                <button
                                    type="button" onClick={handleEditShift}
                                    className="flex items-center px-4 py-2 bg-blue-600 text-base font-medium text-white rounded-md shadow-sm hover:bg-blue-700"
                                >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit Shift
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}