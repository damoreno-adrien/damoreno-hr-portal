import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/Icons';
import * as dateUtils from '../utils/dateUtils'; // Use new standard

export default function MySchedulePage({ db, user }) {
    // Use the new standard function
    const [startOfWeek, setStartOfWeek] = useState(dateUtils.startOfWeek(new Date()));
    const [weekData, setWeekData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db || !user) return;
        setIsLoading(true);

        // Use new standard functions for date math and formatting
        const endOfWeek = dateUtils.addDays(startOfWeek, 6);
        const startStr = dateUtils.formatISODate(startOfWeek);
        const endStr = dateUtils.formatISODate(endOfWeek);

        const shiftsQuery = query(collection(db, "schedules"), where("staffId", "==", user.uid), where("date", ">=", startStr), where("date", "<=", endStr));
        const leaveQuery = query(collection(db, "leave_requests"), where("staffId", "==", user.uid), where("status", "==", "approved"), where("endDate", ">=", startStr));

        const unsubShifts = onSnapshot(shiftsQuery, (shiftsSnapshot) => {
            const shiftsMap = new Map();
            shiftsSnapshot.forEach(doc => shiftsMap.set(doc.data().date, doc.data()));

            const unsubLeaves = onSnapshot(leaveQuery, (leavesSnapshot) => {
                const leaves = leavesSnapshot.docs.map(doc => doc.data()).filter(req => req.startDate <= endStr);
                
                // Use a standard loop with date-fns helpers
                const days = Array.from({ length: 7 }).map((_, i) => {
                    const date = dateUtils.addDays(startOfWeek, i);
                    const dateStr = dateUtils.formatISODate(date);

                    const shift = shiftsMap.get(dateStr);
                    const onLeave = leaves.some(leave => dateStr >= leave.startDate && dateStr <= leave.endDate);

                    let status = { type: 'Day Off' };
                    if (shift) {
                        status = { type: 'Shift', startTime: shift.startTime, endTime: shift.endTime };
                    }
                    if (onLeave) {
                        status = { type: 'On Leave' };
                    }

                    return { date, status };
                });

                setWeekData(days);
                setIsLoading(false);
            });
            return unsubLeaves;
        });

        return () => unsubShifts();
    }, [db, user, startOfWeek]);

    const changeWeek = (offset) => {
        setStartOfWeek(prevDate => {
            // Use date-fns for reliable date math
            return dateUtils.addDays(prevDate, 7 * offset);
        });
    };

    const endOfWeek = dateUtils.addDays(startOfWeek, 6);
    // Use standard formatters
    const weekRangeString = `${dateUtils.formatCustom(startOfWeek, 'dd MMM')} - ${dateUtils.formatCustom(endOfWeek, 'dd MMM, yyyy')}`;

    const DayCard = ({ dayInfo }) => {
        // Use new standard function
        const today = dateUtils.startOfToday();
        const isToday = dayInfo.date.getTime() === today.getTime();
        
        let statusElement;
        switch(dayInfo.status.type) {
            case 'Shift':
                statusElement = <div className="bg-amber-600 text-white font-bold py-2 px-4 rounded-lg text-center">{dayInfo.status.startTime} - {dayInfo.status.endTime}</div>;
                break;
            case 'On Leave':
                statusElement = <div className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg text-center">On Leave</div>;
                break;
            default:
                statusElement = <div className="text-gray-500 py-2 px-4 text-center">Day Off</div>;
        }

        return (
            <div className={`bg-gray-800 p-4 rounded-lg flex items-center justify-between ${isToday ? 'border-l-4 border-amber-500' : ''}`}>
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
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
                <h2 className="text-2xl md:text-3xl font-bold text-white">My Schedule</h2>
                <div className="flex items-center space-x-2 sm:space-x-4">
                    <button onClick={() => changeWeek(-1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"><ChevronLeftIcon className="h-6 w-6" /></button>
                    <h3 className="text-lg sm:text-xl font-semibold w-48 sm:w-64 text-center">{weekRangeString}</h3>
                    <button onClick={() => changeWeek(1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"><ChevronRightIcon className="h-6 w-6" /></button>
                </div>
            </div>
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