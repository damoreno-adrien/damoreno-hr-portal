import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { UserIcon } from '../components/Icons';

const getTodayString = () => new Date().toISOString().split('T')[0];

export default function AttendancePage({ db, staffList }) {
    const [todaysShifts, setTodaysShifts] = useState([]);
    const [checkIns, setCheckIns] = useState({});

    useEffect(() => {
        if (!db) return;

        const todayStr = getTodayString();
        
        const shiftsQuery = query(collection(db, "schedules"), where("date", "==", todayStr));
        const unsubscribeShifts = onSnapshot(shiftsQuery, (snapshot) => {
            const shifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTodaysShifts(shifts);
        });

        const checkInQuery = query(collection(db, "attendance"), where("date", "==", todayStr));
        const unsubscribeCheckIns = onSnapshot(checkInQuery, (snapshot) => {
            const checkInMap = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                checkInMap[data.staffId] = data;
            });
            setCheckIns(checkInMap);
        });

        return () => {
            unsubscribeShifts();
            unsubscribeCheckIns();
        };
    }, [db]);

    const onShift = staffList.filter(staff => 
        todaysShifts.some(shift => shift.staffId === staff.id) && checkIns[staff.id] && !checkIns[staff.id].breakStart
    );
    
    const onBreak = staffList.filter(staff => 
        checkIns[staff.id] && checkIns[staff.id].breakStart && !checkIns[staff.id].breakEnd
    );

    const absent = staffList.filter(staff =>
        todaysShifts.some(shift => shift.staffId === staff.id) && !checkIns[staff.id]
    );

    const offToday = staffList.filter(staff => 
        !todaysShifts.some(shift => shift.staffId === staff.id)
    );

    const StaffCard = ({ staff, status, checkInData }) => {
        let statusColor = 'bg-gray-500';
        let statusText = '';

        if(status === 'on-shift') {
            statusColor = 'bg-green-500';
            statusText = `Checked In: ${checkInData?.checkInTime}`;
        } else if (status === 'on-break') {
            statusColor = 'bg-yellow-500';
            statusText = `Break Started: ${checkInData?.breakStart}`;
        } else if (status === 'absent') {
            statusColor = 'bg-red-500';
            statusText = 'Absent';
        } else if (status === 'off-today') {
            statusColor = 'bg-gray-600';
            statusText = 'Off Today';
        }

        return (
            <div className="bg-gray-700 p-4 rounded-lg flex items-center space-x-4">
                <div className={`w-3 h-3 rounded-full ${statusColor} flex-shrink-0`}></div>
                <div className="flex-1 overflow-hidden">
                    <p className="font-bold text-white truncate">{staff.fullName}</p>
                    <p className="text-xs text-gray-400 truncate">{statusText}</p>
                </div>
            </div>
        );
    };

    const StatusColumn = ({ title, staff, status, checkIns }) => (
        <div className="bg-gray-800 rounded-lg p-4 flex-1">
            <h3 className="text-xl font-semibold text-white mb-4">{title} ({staff.length})</h3>
            <div className="space-y-3">
                {staff.length > 0 ? staff.map(s => <StaffCard key={s.id} staff={s} status={status} checkInData={checkIns[s.id]} />)
                : <p className="text-sm text-gray-500">No staff in this category.</p>}
            </div>
        </div>
    );

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold text-white">Live Attendance Dashboard</h2>
                <p className="text-lg text-gray-300">{new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div className="flex flex-col md:flex-row space-y-6 md:space-y-0 md:space-x-6">
                <StatusColumn title="On Shift" staff={onShift} status="on-shift" checkIns={checkIns} />
                <StatusColumn title="On Break" staff={onBreak} status="on-break" checkIns={checkIns} />
                <StatusColumn title="Absent" staff={absent} status="absent" checkIns={checkIns} />
                <StatusColumn title="Off Today" staff={offToday} status="off-today" checkIns={checkIns} />
            </div>
        </div>
    );
};

