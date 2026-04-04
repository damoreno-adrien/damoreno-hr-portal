/* src/pages/TeamLeaveManagementPage.jsx */

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'; 
import { Search, Plus, List, Calendar as CalendarIcon, Filter, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Users } from 'lucide-react';

import Modal from '../components/common/Modal';
import LeaveRequestForm from '../components/LeaveManagement/LeaveRequestForm';
import StaffSummaryModal from '../components/LeaveManagement/StaffSummaryModal'; 
import { LeaveRequestItem } from '../components/LeaveManagement/LeaveRequestItem'; 
import { LeaveTimeline } from '../components/LeaveManagement/LeaveTimeline'; 

import * as dateUtils from '../utils/dateUtils';
import { getDisplayName } from '../utils/staffUtils';

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

const DateRangeFilter = ({ currentFilter, setFilter }) => {
    const filters = [{ key: 'thisMonth', label: 'This Month' }, { key: 'thisYear', label: 'This Year' }, { key: 'allTime', label: 'All Time' }];
    return (
        <div className="flex space-x-2 p-1 bg-gray-800 rounded-lg border border-gray-700">
            {filters.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${currentFilter === f.key ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                    {f.label}
                </button>
            ))}
        </div>
    );
};

// --- UPGRADED: Added expandSignal Listener ---
const StaffGroup = ({ group, userRole, onUpdateRequest, onDeleteRequest, onEditRequest, onMcStatusChange, allRequests, companyConfig, staffList, expandSignal }) => {
    const [isOpen, setIsOpen] = useState(false); 
    
    // Listen for the master Expand/Collapse signal from the parent
    useEffect(() => {
        if (expandSignal) {
            setIsOpen(expandSignal.action === 'expand');
        }
    }, [expandSignal]);

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-700 mb-4 transition-all">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-4 bg-gray-900/60 hover:bg-gray-700 transition-colors border-b border-gray-700">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-white">{group.staffName}</h3>
                    {group.department && <span className="text-xs bg-gray-700 px-2 py-0.5 rounded text-gray-300">{group.department}</span>}
                    <span className="bg-indigo-900/50 text-indigo-300 text-xs font-bold px-2 py-1 rounded-full">{group.requests.length} Request{group.requests.length > 1 ? 's' : ''}</span>
                </div>
                {isOpen ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
            </button>
            {isOpen && (
                <div className="divide-y divide-gray-700/50">
                    {group.requests.map(req => (
                        <LeaveRequestItem 
                            key={req.id} req={req} userRole={userRole} 
                            onUpdateRequest={onUpdateRequest} onDeleteRequest={onDeleteRequest} 
                            onEditRequest={onEditRequest} onMcStatusChange={onMcStatusChange} 
                            allRequests={allRequests} companyConfig={companyConfig} staffList={staffList} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default function TeamLeaveManagementPage({ db, user, userRole, staffList, companyConfig }) {
    const [allLeaveRequests, setAllLeaveRequests] = useState([]);
    
    const [viewMode, setViewMode] = useState('list'); 
    const [departmentFilter, setDepartmentFilter] = useState('All');
    const [timelineDate, setTimelineDate] = useState(new Date());
    
    const [filter, setFilter] = useState('recent'); 
    const [groupByStaff, setGroupByStaff] = useState(true); 
    
    // --- NEW: Expand/Collapse All State ---
    const [isAllExpanded, setIsAllExpanded] = useState(false);
    const [expandSignal, setExpandSignal] = useState(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('thisMonth');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [requestToEdit, setRequestToEdit] = useState(null);
    const [timelinePrefill, setTimelinePrefill] = useState(null);
    const [summaryStaff, setSummaryStaff] = useState(null);

    const currentUserDept = useMemo(() => {
        if (userRole !== 'dept_manager') return null;
        const me = staffList.find(s => s.id === user.uid);
        return getStaffDepartment(me);
    }, [userRole, staffList, user.uid]);

    const effectiveDeptFilter = userRole === 'dept_manager' && currentUserDept ? currentUserDept : departmentFilter;

    useEffect(() => {
        if (!db) return;
        const q = query(collection(db, "leave_requests"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Mathematically guarantees the newest requests are at the top of the array
            requests.sort((a,b) => (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0));
            
            const hydratedRequests = requests.map(req => {
                const staffMember = staffList.find(s => s.id === req.staffId);
                return { 
                    ...req, 
                    displayStaffName: staffMember ? getDisplayName(staffMember) : (req.staffName || 'Unknown Staff'),
                    staffDepartment: getStaffDepartment(staffMember)
                };
            });
            setAllLeaveRequests(hydratedRequests);
        }, (error) => {
            console.error("FIREBASE RULES BLOCKED THE QUERY:", error);
            alert("Database Error: Firebase Security Rules blocked you from downloading team leave requests.");
        });
        
        return () => unsubscribe();
    }, [db, staffList]);

    const displayRequests = useMemo(() => {
        let filtered = allLeaveRequests.filter(req => {
            const staffMember = staffList.find(s => s.id === req.staffId);
            const reqDept = getStaffDepartment(staffMember);

            if (effectiveDeptFilter !== 'All' && reqDept !== effectiveDeptFilter) return false;
            if (searchTerm && !req.displayStaffName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            
            if (filter === 'pending' && req.status !== 'pending') return false;
            if (filter === 'approved' && req.status !== 'approved') return false;
            if (filter === 'rejected' && req.status !== 'rejected') return false;

            if (viewMode === 'list' && (filter === 'approved' || filter === 'rejected' || filter === 'all')) {
                const reqStartDate = dateUtils.parseISODateString(req.startDate);
                if (reqStartDate) {
                    const now = new Date();
                    const monthStart = dateUtils.startOfMonth(now);
                    const monthEnd = dateUtils.endOfMonth(now);
                    const yearStart = dateUtils.startOfYear(now);
                    const yearEnd = dateUtils.endOfYear(now);
                    
                    if (dateFilter === 'thisMonth' && (reqStartDate < monthStart || reqStartDate > monthEnd)) return false;
                    if (dateFilter === 'thisYear' && (reqStartDate < yearStart || reqStartDate > yearEnd)) return false;
                }
            }

            if (filter === 'pending') {
                if (!staffMember || staffMember.status === 'inactive') return false;
            }
            return true; 
        });

        // Slices the absolute newest 20 requests
        if (filter === 'recent' && !searchTerm) {
            filtered = filtered.slice(0, 20);
        }

        return filtered;
    }, [allLeaveRequests, filter, searchTerm, dateFilter, effectiveDeptFilter, viewMode, staffList]);

    const groupedRequests = useMemo(() => {
        const groups = {};
        displayRequests.forEach(req => {
            if (!groups[req.staffId]) {
                groups[req.staffId] = { staffId: req.staffId, staffName: req.displayStaffName, department: req.staffDepartment, requests: [] };
            }
            groups[req.staffId].requests.push(req);
        });
        return Object.values(groups).sort((a,b) => a.staffName.localeCompare(b.staffName));
    }, [displayRequests]);

    const departments = useMemo(() => ['All', ...Array.from(new Set(staffList.map(s => getStaffDepartment(s))))], [staffList]);
    
    const activeStaffList = useMemo(() => {
        let list = staffList.filter(s => s.status !== 'inactive');
        if (userRole === 'dept_manager' && currentUserDept) list = list.filter(s => getStaffDepartment(s) === currentUserDept);
        return list;
    }, [staffList, userRole, currentUserDept]);
    
    const filteredTimelineStaff = useMemo(() => {
        let list = activeStaffList;
        if (effectiveDeptFilter !== 'All' && userRole !== 'dept_manager') list = list.filter(s => getStaffDepartment(s) === effectiveDeptFilter);
        if (searchTerm) list = list.filter(s => getDisplayName(s).toLowerCase().includes(searchTerm.toLowerCase()));
        return list;
    }, [activeStaffList, effectiveDeptFilter, searchTerm, userRole]);

    // --- NEW: Toggle Function for Expand/Collapse All ---
    const handleToggleExpandAll = () => {
        const newStatus = !isAllExpanded;
        setIsAllExpanded(newStatus);
        setExpandSignal({ action: newStatus ? 'expand' : 'collapse', id: Date.now() });
    };

    const handleUpdateRequest = async (id, newStatus) => { 
        try { 
            let actionByName = 'Unknown';
            const actionByStaff = staffList.find(s => s.id === user.uid);
            if (actionByStaff) actionByName = getDisplayName(actionByStaff);

            await updateDoc(doc(db, "leave_requests", id), { 
                status: newStatus, 
                isReadByStaff: false,
                statusSetBy: user.uid,
                statusSetByName: actionByName,
                statusDate: serverTimestamp()
            }); 
        } catch (error) { alert("Failed to update status."); } 
    };

    const handleDeleteRequest = async (id) => { if (window.confirm("Delete request?")) { try { await deleteDoc(doc(db, "leave_requests", id)); } catch (error) { alert("Failed to delete."); } } };
    const handleMcStatusChange = async (id, currentStatus) => { try { await updateDoc(doc(db, "leave_requests", id), { mcReceived: !currentStatus }); } catch (error) { alert("Failed to update MC."); } };
    
    const openEditModal = (request) => { setRequestToEdit(request); setTimelinePrefill(null); setIsModalOpen(true); };
    const openNewRequestModal = () => { setRequestToEdit(null); setTimelinePrefill(null); setIsModalOpen(true); };
    const closeModal = () => { setIsModalOpen(false); setRequestToEdit(null); setTimelinePrefill(null); };
    
    const handleTimelineCellClick = (staffId, date) => {
        const dateStr = dateUtils.formatISODate(date);
        setTimelinePrefill({ staffId, startDate: dateStr, endDate: dateStr });
        setRequestToEdit(null);
        setIsModalOpen(true);
    };

    return (
        <div className="pb-10">
            {summaryStaff && (
                <Modal isOpen={true} onClose={() => setSummaryStaff(null)} title={`${getDisplayName(summaryStaff)} - Leave Overview`}>
                    <StaffSummaryModal staff={summaryStaff} allRequests={allLeaveRequests} companyConfig={companyConfig} />
                </Modal>
            )}

            <Modal isOpen={isModalOpen} onClose={closeModal} title={requestToEdit ? "Edit Leave Request" : "Create Leave for Staff"}>
                <LeaveRequestForm db={db} user={user} onClose={closeModal} existingRequest={requestToEdit} initialData={timelinePrefill} userRole={userRole} staffList={activeStaffList} existingRequests={allLeaveRequests} companyConfig={companyConfig} isModalOpen={isModalOpen} />
            </Modal>
            
            <div className="flex flex-col md:flex-row justify-between md:items-center space-y-4 md:space-y-0 mb-6">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Team Leave Management</h2>
                <div className="flex gap-3 items-center">
                    {viewMode === 'timeline' && (
                         <div className="flex items-center bg-gray-700 rounded-lg p-1 mr-2">
                             <button onClick={() => setTimelineDate(prev => new Date(prev.setMonth(prev.getMonth() - 1)))} className="p-1 hover:text-white text-gray-400"><ChevronLeft className="h-5 w-5"/></button>
                             <span className="px-2 text-sm font-bold text-white min-w-[100px] text-center">{dateUtils.formatCustom(timelineDate, 'MMMM yyyy')}</span>
                             <button onClick={() => setTimelineDate(prev => new Date(prev.setMonth(prev.getMonth() + 1)))} className="p-1 hover:text-white text-gray-400"><ChevronRight className="h-5 w-5"/></button>
                         </div>
                     )}
                    <div className="bg-gray-700 p-1 rounded-lg flex">
                        <button onClick={() => setViewMode('list')} className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}><List className="h-5 w-5" /></button>
                        <button onClick={() => setViewMode('timeline')} className={`p-2 rounded-md transition-colors ${viewMode === 'timeline' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}><CalendarIcon className="h-5 w-5" /></button>
                    </div>
                    <button onClick={openNewRequestModal} className="flex-shrink-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><Plus className="h-5 w-5 mr-2" />New Request</button>
                </div>
            </div>
            
            <div className="mb-6 p-4 bg-gray-900 rounded-lg flex flex-col md:flex-row gap-4 items-center flex-wrap">
                {userRole !== 'dept_manager' && (
                    <div className="relative min-w-[150px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Filter className="h-4 w-4 text-gray-400" /></div>
                        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white appearance-none cursor-pointer focus:ring-blue-500">
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                )}

                <div className="relative flex-grow w-full md:w-auto">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-5 w-5 text-gray-400" /></div>
                    <input type="text" placeholder="Search by staff name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-700 text-white border-gray-600 focus:ring-blue-500 focus:border-blue-500" />
                </div>

                {viewMode === 'list' && (
                    <div className="flex flex-wrap gap-4 items-center w-full lg:w-auto mt-2 lg:mt-0">
                        <div className="flex space-x-2 p-1 bg-gray-800 border border-gray-700 rounded-lg overflow-x-auto w-full lg:w-auto">
                            <button onClick={() => setFilter('recent')} className={`px-3 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-colors ${filter === 'recent' ? 'bg-amber-600 text-white shadow' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>Recent (20)</button>
                            <button onClick={() => setFilter('pending')} className={`px-3 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-colors ${filter === 'pending' ? 'bg-amber-600 text-white shadow' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>Pending</button>
                            <button onClick={() => setFilter('approved')} className={`px-3 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-colors ${filter === 'approved' ? 'bg-amber-600 text-white shadow' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>Approved</button>
                            <button onClick={() => setFilter('rejected')} className={`px-3 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-colors ${filter === 'rejected' ? 'bg-amber-600 text-white shadow' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>Rejected</button>
                            <button onClick={() => setFilter('all')} className={`px-3 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-colors ${filter === 'all' ? 'bg-amber-600 text-white shadow' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>All</button>
                        </div>
                        
                        <div className="flex items-center gap-4 ml-auto">
                            {(filter === 'approved' || filter === 'rejected' || filter === 'all') && (
                                <DateRangeFilter currentFilter={dateFilter} setFilter={setDateFilter} />
                            )}
                            
                            {/* --- NEW: Expand/Collapse All Button --- */}
                            {groupByStaff && groupedRequests.length > 0 && (
                                <button 
                                    onClick={handleToggleExpandAll} 
                                    className="flex items-center text-xs font-bold text-gray-400 bg-gray-800 border border-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-700 hover:text-white transition-colors"
                                >
                                    {isAllExpanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                                    {isAllExpanded ? 'Collapse All' : 'Expand All'}
                                </button>
                            )}

                            <label className="flex items-center text-sm font-bold text-gray-300 cursor-pointer bg-gray-800 border border-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors">
                                <Users className="w-4 h-4 mr-2 text-indigo-400" />
                                <input type="checkbox" checked={groupByStaff} onChange={(e) => setGroupByStaff(e.target.checked)} className="mr-2 rounded bg-gray-900 border-gray-600 text-indigo-500 focus:ring-indigo-500 hidden" />
                                {groupByStaff ? 'Ungroup List' : 'Group by Staff'}
                            </label>
                        </div>
                    </div>
                )}
            </div>

            {viewMode === 'timeline' ? (
                <LeaveTimeline db={db} allRequests={displayRequests} staffList={filteredTimelineStaff} currentMonth={timelineDate} onCellClick={handleTimelineCellClick} onStaffClick={(staff) => setSummaryStaff(staff)} getStaffDepartment={getStaffDepartment} />
            ) : (
                <div className="space-y-4">
                    {!groupByStaff ? (
                        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 divide-y divide-gray-700/50">
                            {displayRequests.length > 0 ? displayRequests.map(req => (
                                <LeaveRequestItem 
                                    key={req.id} req={req} userRole={userRole} 
                                    onUpdateRequest={handleUpdateRequest} onDeleteRequest={handleDeleteRequest} 
                                    onEditRequest={openEditModal} onMcStatusChange={handleMcStatusChange} 
                                    allRequests={allLeaveRequests} companyConfig={companyConfig} staffList={staffList} 
                                />
                            )) : (
                                <p className="text-center py-10 text-gray-400">No {filter} requests found.</p>
                            )}
                        </div>
                    ) : (
                        groupedRequests.length > 0 ? groupedRequests.map(group => (
                            <StaffGroup 
                                key={group.staffId} group={group} userRole={userRole} 
                                onUpdateRequest={handleUpdateRequest} onDeleteRequest={handleDeleteRequest} 
                                onEditRequest={openEditModal} onMcStatusChange={handleMcStatusChange} 
                                allRequests={allLeaveRequests} companyConfig={companyConfig} staffList={staffList} 
                                expandSignal={expandSignal} // Passes the expand/collapse signal
                            />
                        )) : (
                            <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700">
                                <p className="text-center py-10 text-gray-400">No {filter} requests found.</p>
                            </div>
                        )
                    )}
                </div>
            )}
        </div>
    );
}