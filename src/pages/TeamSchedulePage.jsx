import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/Icons';

const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function TeamSchedulePage({ db }) {
    const [staffList, setStaffList] = useState([]);
    const getStartOfWeek = (date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    };

    const [startOfWeek, setStartOfWeek] = useState(getStartOfWeek(new Date()));
    const [schedules, setSchedules] = useState({});
    const [approvedLeave, setApprovedLeave] = useState([]);

    useEffect(() => {
        if (!db) return;
        const staffCollectionRef = collection(db, 'staff_profiles');
        const unsubscribeStaff = onSnapshot(staffCollectionRef, (querySnapshot) => {
            const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setStaffList(list);
        });
        return () => unsubscribeStaff();
    }, [db]);

    useEffect(() => {
        if (!db) return;
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        const startStr = formatDateToYYYYMMDD(startOfWeek);
        const endStr = formatDateToYYYYMMDD(endOfWeek);

        const shiftsQuery = query(collection(db, "schedules"), where("date", ">=", startStr), where("date", "<=", endStr));
        const unsubscribeShifts = onSnapshot(shiftsQuery, (snapshot) => {
            const newSchedules = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                const key = `${data.staffId}_${data.date}`;
                newSchedules[key] = { id: doc.id, ...data };
            });
            setSchedules(newSchedules);
        });

        const leaveQuery = query(collection(db, "leave_requests"), where("status", "==", "approved"), where("endDate", ">=", startStr));
        const unsubscribeLeave = onSnapshot(leaveQuery, (snapshot) => {
            const leaveRequests = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(req => req.startDate <= endStr);
            setApprovedLeave(leaveRequests);
        });

        return () => { unsubscribeShifts(); unsubscribeLeave(); };
    }, [db, startOfWeek]);
    
    const isStaffOnLeave = (staffId, date) => {
        const dateStr = formatDateToYYYYMMDD(date);
        return approvedLeave.some(leave => leave.staffId === staffId && dateStr >= leave.startDate && dateStr <= leave.endDate);
    };

    const changeWeek = (offset) => setStartOfWeek(prev => { const d = new Date(prev); d.setDate(d.getDate() + (7 * offset)); return d; });
    
    const days = Array.from({ length: 7 }).map((_, i) => { const d = new Date(startOfWeek); d.setDate(d.getDate() + i); return d; });

    const formatDateHeader = (date) => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const isToday = date.getTime() === today.getTime();
        return (
            <div className={`text-center py-4 border-b-2 ${isToday ? 'border-amber-500' : 'border-gray-700'} border-r border-gray-700`}>
                <p className={`font-bold ${isToday ? 'text-amber-400' : 'text-white'}`}>{date.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                <p className={`text-2xl font-light ${isToday ? 'text-white' : 'text-gray-300'}`}>{date.getDate()}</p>
            </div>
        );
    };

    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(endOfWeek.getDate() + 6);
    const weekRangeString = `${startOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${endOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Team Schedule</h2>
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
                        
                        {staffList.map(staff => (
                            <div key={staff.id} className="grid grid-cols-subgrid col-span-8 border-t border-gray-700">
                                <div className="px-4 py-3 font-medium text-white border-r border-gray-700 h-16 flex items-center">{staff.fullName}</div>
                                {days.map(day => {
                                    if (isStaffOnLeave(staff.id, day)) {
                                        return (
                                            <div key={day.toISOString()} className="border-r border-gray-700 h-16 flex items-center justify-center p-1 bg-gray-700">
                                                <div className="bg-blue-600 text-white font-bold p-2 rounded-md w-full h-full flex items-center justify-center text-center text-sm">On Leave</div>
                                            </div>
                                        );
                                    }
                                    const shift = schedules[`${staff.id}_${formatDateToYYYYMMDD(day)}`];
                                    return (
                                        <div key={day.toISOString()} className="border-r border-gray-700 h-16 flex items-center justify-center p-1">
                                            {shift && (
                                                <div className="bg-gray-600 text-white font-bold p-2 rounded-md w-full h-full flex flex-col justify-center text-center text-xs">
                                                    <span>{shift.startTime}</span>
                                                    <span>{shift.endTime}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};