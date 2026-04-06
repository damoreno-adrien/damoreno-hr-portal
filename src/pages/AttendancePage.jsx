/* src/pages/AttendancePage.jsx */

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import Modal from '../components/common/Modal';
import EditAttendanceModal from '../components/Attendance/EditAttendanceModal';
import * as dateUtils from '../utils/dateUtils';
import { ChevronUp, ChevronDown } from 'lucide-react';
import ManagerAlerts from '../components/Dashboard/ManagerAlerts';
import HRActionLog from '../components/Dashboard/HRActionLog';

const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

const getStaffDepartment = (staff) => {
    if (!staff) return 'Unassigned';
    if (staff.department) return staff.department; 
    if (staff.jobHistory && staff.jobHistory.length > 0) {
        const sortedJobs = [...staff.jobHistory].sort((a, b) => {
            const dateA = dateUtils.fromFirestore(a.startDate) || new Date(0);
            const dateB = dateUtils.fromFirestore(b.startDate) || new Date(0);
            return dateB - dateA; 
        });
        if (sortedJobs[0].department) return sortedJobs[0].department;
    }
    return 'Unassigned';
};

const UpcomingBirthdaysCard = ({ staffList }) => {
    const upcomingBirthdays = staffList.map(staff => {
        if (!staff.birthdate) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const birthDate = dateUtils.fromFirestore(staff.birthdate);
        if (!birthDate) return null;

        let nextBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
        if (nextBirthday < today) nextBirthday.setFullYear(today.getFullYear() + 1);

        const diffTime = nextBirthday - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 30) return { ...staff, nextBirthday, daysUntil: diffDays };
        return null;
    }).filter(Boolean).sort((a, b) => a.daysUntil - b.daysUntil);

    return (
        <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-xl font-semibold text-white mb-4">Upcoming Birthdays (Next 30 Days)</h3>
            <div className="space-y-3 max-h-60 overflow-y-auto">
                {upcomingBirthdays.length > 0 ? (
                    upcomingBirthdays.map(staff => (
                        <div key={staff.id} className="flex justify-between items-center bg-gray-700 p-2 rounded-md">
                            <span className="text-white font-medium">{getDisplayName(staff)}</span>
                            <span className="text-sm text-amber-400">{dateUtils.formatCustom(staff.nextBirthday, 'dd MMMM')} ({staff.daysUntil === 0 ? 'Today!' : `${staff.daysUntil} days`})</span>
                        </div>
                    ))
                ) : (
                    <p className="text-sm text-gray-500">No upcoming birthdays in the next 30 days.</p>
                )}
            </div>
        </div>
    );
};

export default function AttendancePage({ db, staffList, userRole, staffProfile }) {
    const [todaysShifts, setTodaysShifts] = useState([]);
    const [checkIns, setCheckIns] = useState({});
    const [todaysLeave, setTodaysLeave] = useState([]);
    const [editingRecord, setEditingRecord] = useState(null);
    const [showArchived, setShowArchived] = useState(false);
    const [alertToFix, setAlertToFix] = useState(null);
    const [companyConfig, setCompanyConfig] = useState(null);
    
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [activeAlertTab, setActiveAlertTab] = useState('pending');

    const triggerRefresh = () => setRefreshTrigger(prev => prev + 1);
    
    const isFullManager = ['admin', 'super_admin', 'manager'].includes(userRole);

    const currentUserDept = useMemo(() => {
        if (userRole !== 'dept_manager' || !staffProfile) return null;
        return getStaffDepartment(staffProfile);
    }, [userRole, staffProfile]);

    useEffect(() => {
        if (!db) return;
        const todayStr = dateUtils.formatISODate(new Date());

        const shiftsQuery = query(collection(db, "schedules"), where("date", "==", todayStr));
        const unsubscribeShifts = onSnapshot(shiftsQuery, (snapshot) => { setTodaysShifts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });

        const checkInQuery = query(collection(db, "attendance"), where("date", "==", todayStr));
        const unsubscribeCheckIns = onSnapshot(checkInQuery, (snapshot) => {
            const checkInMap = {};
            snapshot.forEach(doc => { checkInMap[doc.data().staffId] = { id: doc.id, ...doc.data() }; });
            setCheckIns(checkInMap);
        });

        const leaveQuery = query(collection(db, "leave_requests"), where("status", "==", "approved"), where("startDate", "<=", todayStr), where("endDate", ">=", todayStr));
        const unsubscribeLeave = onSnapshot(leaveQuery, (snapshot) => { setTodaysLeave(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });

        const configRef = doc(db, 'settings', 'company_config');
        const unsubscribeConfig = onSnapshot(configRef, (docSnap) => { if (docSnap.exists()) setCompanyConfig(docSnap.data()); });

        return () => { unsubscribeShifts(); unsubscribeCheckIns(); unsubscribeLeave(); unsubscribeConfig(); };
    }, [db]);

    const handleCardClick = (staff) => {
        if (!isFullManager) return; 

        const todayStr = dateUtils.formatISODate(new Date());
        const attendanceRecord = checkIns[staff.id];
        const recordForModal = {
            id: attendanceRecord ? attendanceRecord.id : `${staff.id}_${todayStr}`,
            staffId: staff.id, staffName: getDisplayName(staff), date: todayStr,
            fullRecord: attendanceRecord || null,
        };
        setEditingRecord(recordForModal);
    };

    const handleOpenManualFix = (alert) => {
        const recordForModal = {
            id: alert.attendanceDocId, staffId: alert.staffId, staffName: alert.staffName, date: alert.date,
            fullRecord: alert.fullRecord || { checkInTime: alert.checkInTime?.toDate ? alert.checkInTime.toDate() : alert.checkInTime }, alertId: alert.id
        };
        setAlertToFix(recordForModal);
    };

    // --- FIX 1: Defined the missing close handler ---
    const handleCloseManualFix = () => {
        setAlertToFix(null);
    };

    const staffToDisplay = useMemo(() => {
        let list = showArchived ? staffList : staffList.filter(staff => staff.status !== 'inactive');
        if (userRole === 'dept_manager' && currentUserDept) {
            list = list.filter(staff => getStaffDepartment(staff) === currentUserDept);
        }
        return list;
    }, [staffList, showArchived, userRole, currentUserDept]);

    const staffWithStatus = staffToDisplay.map(staff => {
        const checkIn = checkIns[staff.id];
        const shift = todaysShifts.find(s => s.staffId === staff.id);
        const leave = todaysLeave.find(l => l.staffId === staff.id);

        if (checkIn && !checkIn.checkOutTime && !(checkIn.breakStart && !checkIn.breakEnd)) return { ...staff, category: 'on-shift' };
        if (checkIn && checkIn.breakStart && !checkIn.breakEnd) return { ...staff, category: 'on-break' };
        if (checkIn && checkIn.checkOutTime) return { ...staff, category: 'completed' };
        if (leave) return { ...staff, category: 'not-present', reason: leave.leaveType };
        if (shift && !checkIn) return { ...staff, category: 'not-present', reason: 'Absent' };
        if (!shift) return { ...staff, category: 'not-present', reason: 'Off Today' };
        return { ...staff, category: 'unknown' };
    });

    const onShiftAndBreak = staffWithStatus.filter(s => s.category === 'on-shift' || s.category === 'on-break');
    const completed = staffWithStatus.filter(s => s.category === 'completed');
    const notPresent = staffWithStatus.filter(s => s.category === 'not-present');

    const StaffCard = ({ staff, checkInData, onClick }) => {
        let statusColor, statusText;
        switch (staff.category) {
            case 'on-shift': statusColor = 'bg-green-500'; statusText = `Checked In: ${dateUtils.formatCustom(checkInData?.checkInTime, 'HH:mm')}`; break;
            case 'on-break': statusColor = 'bg-yellow-500'; statusText = `Break Started: ${dateUtils.formatCustom(checkInData?.breakStart, 'HH:mm')}`; break;
            case 'completed': statusColor = 'bg-gray-500'; statusText = `Checked Out: ${dateUtils.formatCustom(checkInData?.checkOutTime, 'HH:mm')}`; break;
            case 'not-present':
                statusText = staff.reason;
                if (staff.reason === 'Absent') statusColor = 'bg-red-500';
                else if (staff.reason === 'Off Today') statusColor = 'bg-gray-600';
                else statusColor = 'bg-blue-500';
                break;
            default: statusColor = 'bg-gray-900'; statusText = 'Unknown';
        }

        const isClickable = staff.reason !== 'Off Today' && isFullManager;
        const CardContent = () => (
            <div className={`bg-gray-700 p-4 rounded-lg flex items-center space-x-4 ${isClickable ? 'hover:bg-gray-600' : 'cursor-default'}`}>
                <div className={`w-3 h-3 rounded-full ${statusColor} flex-shrink-0`}></div>
                <div className="flex-1 overflow-hidden"><p className="font-bold text-white truncate">{getDisplayName(staff)}</p><p className="text-xs text-gray-400 truncate">{statusText}</p></div>
            </div>
        );
        return isClickable ? <button onClick={onClick} className="w-full text-left">{CardContent()}</button> : <CardContent />;
    };

    const StatusColumn = ({ title, staff }) => {
        const [isOpen, setIsOpen] = useState(true);
        return (
            <div className="bg-gray-800 rounded-lg">
                <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-4">
                    <h3 className="text-xl font-semibold text-white">{title} ({staff.length})</h3>
                    {isOpen ? <ChevronUp className="h-6 w-6 text-gray-400" /> : <ChevronDown className="h-6 w-6 text-gray-400" />}
                </button>
                {isOpen && (
                    <div className="px-4 pb-4 space-y-3">
                        {staff.length > 0 ? staff.map(s => <StaffCard key={s.id} staff={s} checkInData={checkIns[s.id]} onClick={() => handleCardClick(s)} />)
                            : <p className="text-sm text-gray-500">No staff in this category.</p>}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div>
            {editingRecord && (
                <Modal isOpen={true} onClose={() => setEditingRecord(null)} title={editingRecord.fullRecord ? "Edit Attendance Record" : "Create Attendance Record"}>
                    <EditAttendanceModal db={db} record={editingRecord} onClose={() => { setEditingRecord(null); triggerRefresh(); }} />
                </Modal>
            )}

            {alertToFix && (
                <Modal isOpen={!!alertToFix} onClose={handleCloseManualFix} title="Manually Fix Shift">
                    <EditAttendanceModal db={db} record={alertToFix} onClose={() => { handleCloseManualFix(); triggerRefresh(); }} />
                </Modal>
            )}

            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center space-x-4">
                    <h2 className="text-2xl md:text-3xl font-bold text-white">Live Attendance Dashboard</h2>
                    <div className="flex items-center">
                        <input id="showArchived" type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-amber-600 focus:ring-amber-500" />
                        <label htmlFor="showArchived" className="ml-2 text-sm text-gray-300">Show Archived</label>
                    </div>
                </div>
                <p className="text-lg text-gray-300 hidden sm:block">{dateUtils.formatCustom(new Date(), 'EEEE, dd MMMM yyyy')}</p>
            </div>

            {isFullManager && (
                <div className="mb-8 bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
                    <div className="flex border-b border-gray-700">
                        <button onClick={() => setActiveAlertTab('pending')} className={`flex-1 py-4 text-sm font-bold transition-colors ${activeAlertTab === 'pending' ? 'bg-gray-700 text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-400 hover:text-white hover:bg-gray-750'}`}>Pending HR Actions</button>
                        <button onClick={() => setActiveAlertTab('history')} className={`flex-1 py-4 text-sm font-bold transition-colors ${activeAlertTab === 'history' ? 'bg-gray-700 text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-400 hover:text-white hover:bg-gray-750'}`}>Action History Log</button>
                    </div>
                    <div className="p-4">
                        {activeAlertTab === 'pending' ? <ManagerAlerts onManualFix={handleOpenManualFix} /> : <HRActionLog db={db} />}
                    </div>
                </div>
            )}

            <div className="mb-6"><UpcomingBirthdaysCard staffList={staffToDisplay} /></div>
            <div className="space-y-6 md:space-y-0 md:grid md:grid-cols-3 md:gap-6">
                <StatusColumn title="On Shift" staff={onShiftAndBreak} />
                <StatusColumn title="Not Present" staff={notPresent} />
                <StatusColumn title="Completed Shift" staff={completed} />
            </div>
        </div>
    );
}