import React from 'react';

export const DailySummary = ({ todaysAttendance }) => {
    if (!todaysAttendance || !todaysAttendance.checkInTime) {
        return null;
    }

    const formatTime = (timestamp) => {
        return timestamp ? timestamp.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '...';
    };

    return (
        <div className="mt-8 border-t border-gray-700 pt-4 px-2 sm:px-0">
            <h4 className="text-md font-semibold text-center text-gray-300 mb-4">Today's Summary</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-xs text-green-400">Check-In</p>
                    <p className="text-lg font-bold">{formatTime(todaysAttendance.checkInTime)}</p>
                </div>
                <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-xs text-yellow-400">Break Start</p>
                    <p className="text-lg font-bold">{todaysAttendance.breakStart ? formatTime(todaysAttendance.breakStart) : '--:--'}</p>
                </div>
                <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-xs text-blue-400">Break End</p>
                    <p className="text-lg font-bold">{todaysAttendance.breakEnd ? formatTime(todaysAttendance.breakEnd) : '--:--'}</p>
                </div>
                <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-xs text-red-400">Check-Out</p>
                    <p className="text-lg font-bold">{todaysAttendance.checkOutTime ? formatTime(todaysAttendance.checkOutTime) : '--:--'}</p>
                </div>
            </div>
        </div>
    );
};