import React from 'react';
import { Calendar, Moon } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';

// A small helper component for displaying a single day's shift
const ShiftRow = ({ title, schedule }) => {
    let statusText;
    let statusClass;

    if (schedule === null) {
        statusText = "Loading...";
        statusClass = "text-gray-500";
    } else if (schedule) {
        statusText = `${schedule.startTime} - ${schedule.endTime}`;
        statusClass = "text-amber-400 font-semibold";
    } else {
        statusText = "Day Off";
        statusClass = "text-gray-400";
    }

    return (
        <div className="flex items-center justify-between py-3">
            <span className="text-gray-300">{title}</span>
            <span className={statusClass}>{statusText}</span>
        </div>
    );
};

export const UpcomingShiftsCard = ({ todaysSchedule, tomorrowsSchedule }) => (
    <div className="bg-gray-800 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-2 px-4 pt-4">Upcoming Shifts</h3>
        <div className="p-4 pt-0">
            <div className="divide-y divide-gray-700">
                <ShiftRow title="Today" schedule={todaysSchedule} />
                <ShiftRow title="Tomorrow" schedule={tomorrowsSchedule} />
            </div>
        </div>
    </div>
);