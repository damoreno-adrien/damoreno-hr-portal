import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const getTodayString = () => new Date().toISOString().split('T')[0];

export default function AttendancePage({ db, staffList }) {
    const [todaysShifts, setTodaysShifts] = useState([]);
    const [checkIns, setCheckIns] = useState({});
    const [todaysLeave, setTodaysLeave] = useState([]);

    useEffect(() => {
        if (!db) return;
        const todayStr = getTodayString();
        
        const shiftsQuery = query(collection(db, "schedules"), where("date", "==", todayStr));
        const unsubscribeShifts = onSnapshot(shiftsQuery, (snapshot) => {
            setTodaysShifts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const checkInQuery = query(collection(db, "attendance"), where("date", "==", todayStr));
        const unsubscribeCheckIns = onSnapshot(checkInQuery, (snapshot) => {
            const checkInMap = {};
            snapshot.forEach(doc => { checkInMap[doc.data().staffId] = doc.data(); });
            setCheckIns(checkInMap);
        });

        const leaveQuery = query(collection(db, "leave_requests"), where("status", "==", "approved"), where("startDate", "<=", todayStr), where("endDate", ">=", todayStr));
        const unsubscribeLeave = onSnapshot(leaveQuery, (snapshot) => {
            setTodaysLeave(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => { unsubscribeShifts(); unsubscribeCheckIns(); unsubscribeLeave(); };
    }, [db]);

    const staffWithStatus = staffList.map(staff => {
        const checkIn = checkIns[staff.id];
        const shift = todaysShifts.find(s => s.staffId === staff.id);
        const leave = todaysLeave.find(l => l.staffId === staff.id);
        
        if (checkIn && !checkIn.checkOutTime && !(checkIn.breakStart && !checkIn.breakEnd)) return { ...staff, category: 'on-shift' };
        if (checkIn && checkIn.breakStart && !checkIn.breakEnd) return { ...staff, category: 'on-break' };
        if (checkIn && checkIn.checkOutTime) return { ...staff, category: 'completed' };
        
        // "Not Present" logic
        if (leave) return { ...staff, category: 'not-present', reason: leave.leaveType };
        if (shift && !checkIn) return { ...staff, category: 'not-present', reason: 'Absent' };
        if (!shift) return { ...staff, category: 'not-present', reason: 'Off Today' };

        return { ...staff, category: 'unknown' };
    });

    const onShift = staffWithStatus.filter(s => s.category === 'on-shift');
    const onBreak = staffWithStatus.filter(s => s.category === 'on-break');
    const completed = staffWithStatus.filter(s => s.category === 'completed');
    const notPresent = staffWithStatus.filter(s => s.category === 'not-present');

    const formatTime = (timestamp) => {
        if (!timestamp?.toDate) return '';
        return timestamp.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };

    const StaffCard = ({ staff, checkInData }) => {
        let statusColor, statusText;

        switch (staff.category) {
            case 'on-shift':
                statusColor = 'bg-green-500'; statusText = `Checked In: ${formatTime(checkInData?.checkInTime)}`; break;
            case 'on-break':
                statusColor = 'bg-yellow-500'; statusText = `Break Started: ${formatTime(checkInData?.breakStart)}`; break;
            case 'completed':
                statusColor = 'bg-gray-500'; statusText = `Checked Out: ${formatTime(checkInData?.checkOutTime)}`; break;
            case 'not-present':
                statusText = staff.reason;
                if (staff.reason === 'Absent') statusColor = 'bg-red-500';
                else if (staff.reason === 'Off Today') statusColor = 'bg-gray-600';
                else statusColor = 'bg-blue-500'; // For leave types
                break;
            default:
                statusColor = 'bg-gray-900'; statusText = 'Unknown';
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

    const StatusColumn = ({ title, staff }) => (
        <div className="bg-gray-800 rounded-lg p-4 flex-1 min-w-[200px]">
            <h3 className="text-xl font-semibold text-white mb-4">{title} ({staff.length})</h3>
            <div className="space-y-3">
                {staff.length > 0 ? staff.map(s => <StaffCard key={s.id} staff={s} checkInData={checkIns[s.id]} />)
                : <p className="text-sm text-gray-500">No staff in this category.</p>}
            </div>
        </div>
    );

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Live Attendance Dashboard</h2>
                <p className="text-lg text-gray-300">{new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div className="flex flex-col md:flex-row space-y-6 md:space-y-0 md:space-x-6">
                <StatusColumn title="On Shift" staff={onShift} />
                <StatusColumn title="On Break" staff={onBreak} />
                <StatusColumn title="Not Present" staff={notPresent} />
                <StatusColumn title="Completed Shift" staff={completed} />
            </div>
        </div>
    );
};