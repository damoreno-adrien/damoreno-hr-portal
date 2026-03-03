// src/pages/LeaveManagementPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import Modal from '../components/common/Modal';
import LeaveRequestForm from '../components/LeaveManagement/LeaveRequestForm';
import { Search, Plus, List, Calendar as CalendarIcon, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { LeaveRequestItem } from '../components/LeaveManagement/LeaveRequestItem'; 
import { LeaveTimeline } from '../components/LeaveManagement/LeaveTimeline'; 
import * as dateUtils from '../utils/dateUtils';
import { getDisplayName } from '../utils/staffUtils';
import { calculateStaffLeaveBalances } from '../utils/leaveCalculator';

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

const StaffSummaryModal = ({ staff, allRequests, companyConfig }) => {
    const balances = useMemo(() => calculateStaffLeaveBalances(staff, allRequests, companyConfig), [staff, allRequests, companyConfig]);
    if (!balances) return <p className="text-gray-400 p-4">Loading data...</p>;

    const StatCard = ({ title, data, color, isPH }) => (
        <div className={`p-5 rounded-xl border bg-gray-800 shadow-md ${color.border}`}>
            <h4 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-3">{title}</h4>
            <div className="flex justify-between items-end">
                <div>
                    <p className="text-3xl font-black text-white">{data.remaining}</p>
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-1">Remaining</p>
                </div>
                <div className="text-right">
                    {data.isLocked ? (
                        <div className="flex flex-col items-end">
                            <span className="text-amber-500 text-[11px] font-bold bg-amber-500/10 px-2 py-1 rounded">🔒 Locked (&lt; 1 Yr)</span>
                            <span className="text-gray-400 text-[10px] mt-1 font-medium">{data.accrued} Days Accrued</span>
                        </div>
                    ) : isPH ? (
                        <div className="flex flex-col items-end">
                            <span className="text-green-400 font-bold text-sm">{data.cashable} Cashable</span>
                            <p className="text-xs text-gray-500 mt-0.5">{data.used} Used Lifetime</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm font-bold text-gray-300">{data.used} Used</p>
                            <p className="text-xs text-gray-500 mt-0.5">/ {data.total} Total</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatCard title="Annual Leave" data={balances.annual} color={{ border: 'border-amber-500/40' }} />
                <StatCard title="Paid Sick Leave" data={balances.sick} color={{ border: 'border-red-500/40' }} />
                <StatCard title="Personal Leave" data={balances.personal} color={{ border: 'border-purple-500/40' }} />
                <StatCard title="Public Holiday Credits" data={balances.ph} color={{ border: 'border-blue-500/40' }} isPH={true} />
            </div>
        </div>
    );
};

const StatusBadge = ({ status }) => {
    const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full";
    if (status === 'approved') return <span className={`${baseClasses} bg-green-600 text-green-100`}>Approved</span>;
    if (status === 'rejected') return <span className={`${baseClasses} bg-red-600 text-red-100`}>Rejected</span>;
    return <span className={`${baseClasses} bg-yellow-600 text-yellow-100`}>Pending</span>;
};

const StaffBalanceCard = ({ staff, allRequests, companyConfig }) => {
    const balances = useMemo(() => calculateStaffLeaveBalances(staff, allRequests, companyConfig), [staff, allRequests, companyConfig]);

    if (!balances) return <p className="text-gray-400 mb-8">Loading balances...</p>;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className={`p-5 rounded-lg border bg-gray-800 shadow-sm flex flex-col justify-between ${balances.annual.isLocked ? 'border-amber-500/20' : 'border-gray-700'}`}>
                <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">Annual Leave</p>
                {balances.annual.isLocked ? (
                    <div>
                        <p className="text-3xl font-bold text-gray-500 mt-1">0</p>
                        <div className="mt-3 flex items-center justify-between">
                            <span className="text-amber-500 text-[11px] font-bold bg-amber-500/10 px-2 py-1 rounded">🔒 Locked (&lt; 1 Yr)</span>
                            <span className="text-gray-400 text-xs font-medium">{balances.annual.accrued} Accrued</span>
                        </div>
                    </div>
                ) : (
                    <div>
                        <p className="text-3xl font-bold text-amber-500 mt-1">{balances.annual.remaining} <span className="text-sm text-gray-400 font-normal">Remaining</span></p>
                        <p className="text-xs text-gray-500 mt-2">{balances.annual.used} Used / {balances.annual.total} Total</p>
                    </div>
                )}
            </div>

            <div className="bg-gray-800 p-5 rounded-lg border border-gray-700 shadow-sm flex flex-col justify-between">
                <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">Paid Sick Leave</p>
                <div>
                    <p className="text-3xl font-bold text-red-400 mt-1">{balances.sick.remaining} <span className="text-sm text-gray-400 font-normal">Remaining</span></p>
                    <p className="text-xs text-gray-500 mt-2">{balances.sick.used} Used / {balances.sick.total} Total</p>
                </div>
            </div>

            <div className="bg-gray-800 p-5 rounded-lg border border-gray-700 shadow-sm flex flex-col justify-between">
                <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">Personal Leave</p>
                <div>
                    <p className="text-3xl font-bold text-purple-400 mt-1">{balances.personal.remaining} <span className="text-sm text-gray-400 font-normal">Remaining</span></p>
                    <p className="text-xs text-gray-500 mt-2">{balances.personal.used} Used / {balances.personal.total} Total</p>
                </div>
            </div>

            <div className="bg-gray-800 p-5 rounded-lg border border-gray-700 shadow-sm flex flex-col justify-between">
                <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">Public Holiday Credits</p>
                <div>
                    <p className="text-3xl font-bold text-blue-400 mt-1">{balances.ph.remaining} <span className="text-sm text-gray-400 font-normal">Total Remaining</span></p>
                    <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-green-400 font-semibold">{balances.ph.cashable} Cashable</span>
                        <span className="text-gray-500">{balances.ph.used} Used</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const DateRangeFilter = ({ currentFilter, setFilter }) => {
    const filters = [
        { key: 'thisMonth', label: 'This Month' },
        { key: 'thisYear', label: 'This Year' },
        { key: 'allTime', label: 'All Time' },
    ];
    return (
        <div className="flex space-x-2 p-1 bg-gray-700 rounded-lg">
            {filters.map(f => (
                <button 
                    key={f.key}
                    onClick={() => setFilter(f.key)} 
                    className={`px-3 py-1 text-xs rounded-md ${currentFilter === f.key ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:bg-gray-600 hover:text-white'}`}
                >
                    {f.label}
                </button>
            ))}
        </div>
    );
};

export default function LeaveManagementPage({ db, user, userRole, staffList, companyConfig, leaveBalances }) {
    const [allLeaveRequests, setAllLeaveRequests] = useState([]);
    const [filteredLeaveRequests, setFilteredLeaveRequests] = useState([]);
    
    const [viewMode, setViewMode] = useState('list'); 
    const [departmentFilter, setDepartmentFilter] = useState('All');
    const [timelineDate, setTimelineDate] = useState(new Date());

    const [filter, setFilter] = useState('pending');
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('thisMonth');
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [requestToEdit, setRequestToEdit] = useState(null);
    const [timelinePrefill, setTimelinePrefill] = useState(null);
    const [summaryStaff, setSummaryStaff] = useState(null);

    const handlePrevMonth = () => { setTimelineDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; }); };
    const handleNextMonth = () => { setTimelineDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; }); };

    useEffect(() => {
        if (!db || !user) return;
        let q = userRole === 'manager' ? query(collection(db, "leave_requests")) : query(collection(db, "leave_requests"), where("staffId", "==", user.uid));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            requests.sort((a,b) => (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0));
            
            if (userRole === 'manager') {
                const hydratedRequests = requests.map(req => {
                    const staffMember = staffList.find(s => s.id === req.staffId);
                    return { 
                        ...req, 
                        displayStaffName: staffMember ? getDisplayName(staffMember) : (req.staffName || 'Unknown Staff'),
                        staffDepartment: getStaffDepartment(staffMember)
                    };
                });
                setAllLeaveRequests(hydratedRequests);
            } else {
                setAllLeaveRequests(requests);
            }
        });
        return () => unsubscribe();
    }, [db, userRole, user?.uid, staffList]);

    useEffect(() => {
        if (userRole === 'staff' && allLeaveRequests.length > 0) {
            const batch = writeBatch(db);
            const unreadRequests = allLeaveRequests.filter(req => req.isReadByStaff === false);
            if (unreadRequests.length > 0) {
                unreadRequests.forEach(req => batch.update(doc(db, 'leave_requests', req.id), { isReadByStaff: true }));
                batch.commit().catch(console.error);
            }
        }
    }, [allLeaveRequests, userRole, db]);

    useEffect(() => {
        if (userRole === 'manager') {
            const now = new Date();
            const monthStart = dateUtils.startOfMonth(now);
            const monthEnd = dateUtils.endOfMonth(now);
            const yearStart = dateUtils.startOfYear(now);
            const yearEnd = dateUtils.endOfYear(now);
            
            const filtered = allLeaveRequests.filter(req => {
                if (departmentFilter !== 'All') {
                    const staffMember = staffList.find(s => s.id === req.staffId);
                    const dept = getStaffDepartment(staffMember);
                    if (dept !== departmentFilter) return false;
                }
                if (searchTerm && !req.displayStaffName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
                if (viewMode === 'list' && req.status !== filter) return false;

                if (viewMode === 'list') {
                    const reqStartDate = dateUtils.parseISODateString(req.startDate);
                    if (reqStartDate) { 
                        if (dateFilter === 'thisMonth' && (reqStartDate < monthStart || reqStartDate > monthEnd)) return false;
                        if (dateFilter === 'thisYear' && (reqStartDate < yearStart || reqStartDate > yearEnd)) return false;
                    }
                }

                if (viewMode === 'list' && filter === 'pending') {
                    const staffMember = staffList.find(s => s.id === req.staffId);
                    if (!staffMember || staffMember.status === 'inactive') return false;
                }
                return true; 
            });
            setFilteredLeaveRequests(filtered);
        } else {
            setFilteredLeaveRequests(allLeaveRequests);
        }
    }, [filter, allLeaveRequests, userRole, staffList, searchTerm, dateFilter, departmentFilter, viewMode]);

    const departments = useMemo(() => {
        const depts = new Set(staffList.map(s => getStaffDepartment(s)));
        return ['All', ...Array.from(depts)];
    }, [staffList]);

    const activeStaffList = useMemo(() => staffList.filter(s => s.status !== 'inactive'), [staffList]);

    const filteredTimelineStaff = useMemo(() => {
        let list = activeStaffList;
        if (departmentFilter !== 'All') list = list.filter(s => getStaffDepartment(s) === departmentFilter);
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            list = list.filter(s => getDisplayName(s).toLowerCase().includes(lower));
        }
        return list;
    }, [activeStaffList, departmentFilter, searchTerm]);

    const handleUpdateRequest = async (id, newStatus) => { try { await updateDoc(doc(db, "leave_requests", id), { status: newStatus, isReadByStaff: false }); } catch (error) { alert("Failed to update request."); } };
    const handleDeleteRequest = async (id) => { if (window.confirm("Delete this request?")) { try { await deleteDoc(doc(db, "leave_requests", id)); } catch (error) { alert("Failed to delete request."); } } };
    const handleMcStatusChange = async (id, currentStatus) => { try { await updateDoc(doc(db, "leave_requests", id), { mcReceived: !currentStatus }); } catch (error) { alert("Failed to update MC status."); } };
    
    const openEditModal = (request) => { setRequestToEdit(request); setTimelinePrefill(null); setIsModalOpen(true); };
    const openNewRequestModal = () => { setRequestToEdit(null); setTimelinePrefill(null); setIsModalOpen(true); };
    
    const handleTimelineCellClick = (staffId, date) => {
        const dateStr = dateUtils.formatISODate(date);
        setTimelinePrefill({ staffId, startDate: dateStr, endDate: dateStr });
        setRequestToEdit(null);
        setIsModalOpen(true);
    };

    const closeModal = () => { setIsModalOpen(false); setRequestToEdit(null); setTimelinePrefill(null); };
    
    if (userRole === 'manager') {
        return (
            <div>
                {summaryStaff && (
                    <Modal isOpen={true} onClose={() => setSummaryStaff(null)} title={`${getDisplayName(summaryStaff)} - Leave Overview`}>
                        <StaffSummaryModal staff={summaryStaff} allRequests={allLeaveRequests} companyConfig={companyConfig} />
                    </Modal>
                )}

                <Modal isOpen={isModalOpen} onClose={closeModal} title={requestToEdit ? "Edit Leave Request" : "Create Leave for Staff"}>
                    <LeaveRequestForm 
                        db={db} user={user} onClose={closeModal} 
                        existingRequest={requestToEdit} 
                        initialData={timelinePrefill} 
                        userRole={userRole} 
                        staffList={activeStaffList} 
                        existingRequests={allLeaveRequests} 
                        companyConfig={companyConfig} leaveBalances={leaveBalances}
                        isModalOpen={isModalOpen} 
                    />
                </Modal>
                
                <div className="flex flex-col md:flex-row justify-between md:items-center space-y-4 md:space-y-0 mb-6">
                    <h2 className="text-2xl md:text-3xl font-bold text-white">Leave Management</h2>
                    <div className="flex gap-3 items-center">
                        {viewMode === 'timeline' && (
                             <div className="flex items-center bg-gray-700 rounded-lg p-1 mr-2">
                                 <button onClick={handlePrevMonth} className="p-1 hover:text-white text-gray-400"><ChevronLeft className="h-5 w-5"/></button>
                                 <span className="px-2 text-sm font-bold text-white min-w-[100px] text-center">{dateUtils.formatCustom(timelineDate, 'MMMM yyyy')}</span>
                                 <button onClick={handleNextMonth} className="p-1 hover:text-white text-gray-400"><ChevronRight className="h-5 w-5"/></button>
                             </div>
                         )}

                        <div className="bg-gray-700 p-1 rounded-lg flex">
                            <button onClick={() => setViewMode('list')} className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'}`} title="List View"><List className="h-5 w-5" /></button>
                            <button onClick={() => setViewMode('timeline')} className={`p-2 rounded-md transition-colors ${viewMode === 'timeline' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'}`} title="Timeline View"><CalendarIcon className="h-5 w-5" /></button>
                        </div>
                        <button onClick={openNewRequestModal} className="flex-shrink-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><Plus className="h-5 w-5 mr-2" />New Request</button>
                    </div>
                </div>
                
                <div className="mb-6 p-4 bg-gray-900 rounded-lg flex flex-col md:flex-row gap-4 items-center flex-wrap">
                    <div className="relative min-w-[150px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Filter className="h-4 w-4 text-gray-400" /></div>
                        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white appearance-none cursor-pointer focus:ring-blue-500">
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>

                    <div className="relative flex-grow w-full md:w-auto">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-5 w-5 text-gray-400" /></div>
                        <input type="text" placeholder="Search by staff name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-700 text-white border-gray-600 focus:ring-blue-500 focus:border-blue-500" />
                    </div>

                    {viewMode === 'list' && (
                        <div className="flex flex-wrap gap-2 items-center">
                            <div className="flex space-x-2 p-1 bg-gray-700 rounded-lg overflow-x-auto">
                                <button onClick={() => setFilter('pending')} className={`px-3 py-2 text-sm rounded-md whitespace-nowrap ${filter === 'pending' ? 'bg-amber-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Pending</button>
                                <button onClick={() => setFilter('approved')} className={`px-3 py-2 text-sm rounded-md whitespace-nowrap ${filter === 'approved' ? 'bg-amber-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Approved</button>
                                <button onClick={() => setFilter('rejected')} className={`px-3 py-2 text-sm rounded-md whitespace-nowrap ${filter === 'rejected' ? 'bg-amber-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Rejected</button>
                            </div>

                            {(filter === 'approved' || filter === 'rejected') && (<DateRangeFilter currentFilter={dateFilter} setFilter={setDateFilter} />)}
                        </div>
                    )}
                </div>

                {viewMode === 'timeline' ? (
                    <LeaveTimeline 
                        db={db} 
                        allRequests={filteredLeaveRequests} 
                        staffList={filteredTimelineStaff} 
                        currentMonth={timelineDate} 
                        onCellClick={handleTimelineCellClick}
                        onStaffClick={(staff) => setSummaryStaff(staff)}
                        getStaffDepartment={getStaffDepartment}
                    />
                ) : (
                    <div className="bg-gray-800 rounded-lg shadow-lg">
                        <div className="divide-y divide-gray-700">
                            {filteredLeaveRequests.length > 0 ? filteredLeaveRequests.map(req => (
                                <LeaveRequestItem 
                                    key={req.id} req={req} onUpdateRequest={handleUpdateRequest}
                                    onDeleteRequest={handleDeleteRequest} onEditRequest={openEditModal}
                                    onMcStatusChange={handleMcStatusChange} allRequests={allLeaveRequests}
                                    companyConfig={companyConfig} staffList={staffList}
                                />
                            )) : (<p className="text-center py-10 text-gray-400">No {filter} requests found for the selected filters.</p>)}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div>
            <Modal isOpen={isModalOpen} onClose={closeModal} title="Request Time Off">
                <LeaveRequestForm db={db} user={user} onClose={closeModal} existingRequests={allLeaveRequests} userRole={userRole} companyConfig={companyConfig} leaveBalances={leaveBalances} staffList={activeStaffList} isModalOpen={isModalOpen} />
            </Modal>
            
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">My Leave</h2>
            {(() => {
                const currentStaffProfile = activeStaffList.find(s => s.id === user.uid);
                return <StaffBalanceCard staff={currentStaffProfile} allRequests={allLeaveRequests} companyConfig={companyConfig} />
            })()}
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Request History</h3>
                <button onClick={openNewRequestModal} className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg"><Plus className="h-5 w-5 mr-2" />New Request</button>
            </div>
            <div className="bg-gray-800 rounded-lg shadow-lg">
                <div className="divide-y divide-gray-700">
                    {filteredLeaveRequests.length > 0 ? filteredLeaveRequests.map(req => (
                        <div key={req.id} className="p-4 flex flex-wrap justify-between items-center gap-4">
                            <div>
                                <p className="font-bold text-white">{req.leaveType}</p>
                                <p className="text-sm text-gray-400">Requested on: {dateUtils.formatDisplayDate(req.requestedAt)}</p>
                            </div>
                            
                            {/* FIX: Improved UI for Cash Outs in Staff View */}
                            {req.leaveType === 'Cash Out Holiday Credits' ? (
                                <div className="text-center bg-green-900/30 px-4 py-2 rounded-lg border border-green-700">
                                    <p className="font-bold text-green-400">{req.totalDays} Credits</p>
                                    <p className="text-[10px] text-green-500/70 uppercase font-bold tracking-wider">Payout Request</p>
                                </div>
                            ) : (
                                <div>
                                    <p className="font-medium text-white">{dateUtils.formatDisplayDate(req.startDate)} to {dateUtils.formatDisplayDate(req.endDate)} ({req.totalDays} days)</p>
                                </div>
                            )}
                            
                            <StatusBadge status={req.status} />
                        </div>
                    )) : (<p className="text-center py-10 text-gray-400">You have not made any leave requests.</p>)}
                </div>
            </div>
        </div>
    );
};