// src/pages/LeaveManagementPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import Modal from '../components/Modal';
import LeaveRequestForm from '../components/LeaveRequestForm';
import { PlusIcon } from '../components/Icons';
import { Search } from 'lucide-react';
import { LeaveRequestItem } from '../components/LeaveManagement/LeaveRequestItem'; 
import * as dateUtils from '../utils/dateUtils';

const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

const StatusBadge = ({ status }) => {
    const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full";
    if (status === 'approved') return <span className={`${baseClasses} bg-green-600 text-green-100`}>Approved</span>;
    if (status === 'rejected') return <span className={`${baseClasses} bg-red-600 text-red-100`}>Rejected</span>;
    return <span className={`${baseClasses} bg-yellow-600 text-yellow-100`}>Pending</span>;
};

// COMPONENT for Date Range Filters
const DateRangeFilter = ({ currentFilter, setFilter }) => {
    const filters = [
        { key: 'thisMonth', label: 'This Month' },
        { key: 'thisYear', label: 'This Year' },
        { key: 'allTime', label: 'All Time' },
    ];
    
    return (
        <div className="flex space-x-2 p-1 bg-gray-900 rounded-lg">
            {filters.map(f => (
                <button 
                    key={f.key}
                    onClick={() => setFilter(f.key)} 
                    className={`px-3 py-1 text-xs rounded-md ${currentFilter === f.key ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                >
                    {f.label}
                </button>
            ))}
        </div>
    );
};
// END COMPONENT

export default function LeaveManagementPage({ db, user, userRole, staffList, companyConfig, leaveBalances }) {
    const [allLeaveRequests, setAllLeaveRequests] = useState([]);
    const [filteredLeaveRequests, setFilteredLeaveRequests] = useState([]);
    const [filter, setFilter] = useState('pending');
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('thisMonth');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [requestToEdit, setRequestToEdit] = useState(null);

    // Effect to fetch all requests
    useEffect(() => {
        if (!db || !user) return;
        
        let q;
        if (userRole === 'manager') {
            q = query(collection(db, "leave_requests"));
        } else {
            q = query(collection(db, "leave_requests"), where("staffId", "==", user.uid));
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            requests.sort((a,b) => (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0));
            
            if (userRole === 'manager') {
                const hydratedRequests = requests.map(req => {
                    const staffMember = staffList.find(s => s.id === req.staffId);
                    return { ...req, displayStaffName: staffMember ? getDisplayName(staffMember) : (req.staffName || 'Unknown Staff') };
                });
                setAllLeaveRequests(hydratedRequests);
            } else {
                setAllLeaveRequests(requests);
            }
        });
        return () => unsubscribe();
    }, [db, userRole, user?.uid, staffList]);

    // Effect to mark staff requests as read
    useEffect(() => {
        if (userRole === 'staff' && allLeaveRequests.length > 0) {
            const batch = writeBatch(db);
            const unreadRequests = allLeaveRequests.filter(req => req.isReadByStaff === false);

            if (unreadRequests.length > 0) {
                unreadRequests.forEach(req => {
                    const docRef = doc(db, 'leave_requests', req.id);
                    batch.update(docRef, { isReadByStaff: true });
                });
                batch.commit().catch(err => console.error("Error marking leave requests as read:", err));
            }
        }
    }, [allLeaveRequests, userRole, db]);

    // MODIFIED Effect to apply ALL filters
    useEffect(() => {
        if (userRole === 'manager') {
            const now = new Date();
            
            const monthStart = dateUtils.startOfMonth(now);
            const monthEnd = dateUtils.endOfMonth(now);
            const yearStart = dateUtils.startOfYear(now);
            const yearEnd = dateUtils.endOfYear(now);
            
            const filtered = allLeaveRequests.filter(req => {
                // 1. Filter by Status (Pending, Approved, Rejected)
                if (req.status !== filter) return false;
                
                // 2. Filter by Search Term (case-insensitive)
                if (searchTerm && !req.displayStaffName.toLowerCase().includes(searchTerm.toLowerCase())) {
                    return false;
                }

                // 3. Filter by Date Range (only for 'approved' and 'rejected' tabs)
                if (filter === 'approved' || filter === 'rejected') {
                    const reqStartDate = dateUtils.parseISODateString(req.startDate);
                    if (!reqStartDate) return false; // Failsafe

                    if (dateFilter === 'thisMonth') {
                        if (reqStartDate < monthStart || reqStartDate > monthEnd) return false;
                    } else if (dateFilter === 'thisYear') {
                        if (reqStartDate < yearStart || reqStartDate > yearEnd) return false;
                    }
                    // 'allTime' does nothing
                }

                // 4. Special rule for 'pending' tab (hide inactive staff)
                if (filter === 'pending') {
                    const staffMember = staffList.find(s => s.id === req.staffId);
                    if (!staffMember || staffMember.status === 'inactive') {
                        return false;
                    }
                }
                
                return true; 
            });
            setFilteredLeaveRequests(filtered);
        } else {
            // Staff view doesn't have these filters
            setFilteredLeaveRequests(allLeaveRequests);
        }
    }, [filter, allLeaveRequests, userRole, staffList, searchTerm, dateFilter]);
    // --- END MODIFIED Effect ---

    const handleUpdateRequest = async (id, newStatus) => { 
        const requestDocRef = doc(db, "leave_requests", id);
        try { 
            await updateDoc(requestDocRef, { status: newStatus, isReadByStaff: false }); 
        } 
        catch (error) { alert("Failed to update request."); }
    };
    const handleDeleteRequest = async (id) => { 
        if (window.confirm("Are you sure you want to permanently delete this leave request?")) {
            const requestDocRef = doc(db, "leave_requests", id);
            try { await deleteDoc(requestDocRef); }
            catch (error) { alert("Failed to delete request."); }
        }
    };
    const handleMcStatusChange = async (id, currentStatus) => { 
        const requestDocRef = doc(db, "leave_requests", id);
        try {
            await updateDoc(requestDocRef, { mcReceived: !currentStatus });
        } catch (error) {
            alert("Failed to update MC status.");
        }
    };
    
    const openEditModal = (request) => { setRequestToEdit(request); setIsModalOpen(true); };
    const openNewRequestModal = () => { setRequestToEdit(null); setIsModalOpen(true); };
    const closeModal = () => { setIsModalOpen(false); setRequestToEdit(null); };
    
    const activeStaffList = useMemo(() => staffList.filter(s => s.status !== 'inactive'), [staffList]);


    if (userRole === 'manager') {
        return (
            <div>
                <Modal isOpen={isModalOpen} onClose={closeModal} title={requestToEdit ? "Edit Leave Request" : "Create Leave for Staff"}>
                    {/* --- *** THIS IS THE FIX *** --- */}
                    <LeaveRequestForm 
                        db={db} 
                        user={user} 
                        onClose={closeModal} 
                        existingRequest={requestToEdit} 
                        userRole={userRole} 
                        staffList={activeStaffList} 
                        existingRequests={allLeaveRequests} 
                        companyConfig={companyConfig} 
                        leaveBalances={leaveBalances}
                        isModalOpen={isModalOpen} 
                    />
                    {/* --- *** END FIX *** --- */}
                </Modal>
                
                {/* --- HEADER --- */}
                <div className="flex flex-col md:flex-row justify-between md:items-center space-y-4 md:space-y-0 mb-6">
                    <h2 className="text-2xl md:text-3xl font-bold text-white">Leave Management</h2>
                    <button onClick={openNewRequestModal} className="flex-shrink-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><PlusIcon className="h-5 w-5 mr-2" />New Request for Staff</button>
                </div>
                
                {/* --- FILTER BAR --- */}
                <div className="mb-6 p-4 bg-gray-900 rounded-lg flex flex-col md:flex-row gap-4 justify-between items-center">
                    {/* Status Filter */}
                    <div className="flex space-x-2 p-1 bg-gray-700 rounded-lg">
                        <button onClick={() => setFilter('pending')} className={`px-4 py-2 text-sm rounded-md ${filter === 'pending' ? 'bg-amber-600 text-white' : 'text-gray-300'}`}>Pending</button>
                        <button onClick={() => setFilter('approved')} className={`px-4 py-2 text-sm rounded-md ${filter === 'approved' ? 'bg-amber-600 text-white' : 'text-gray-300'}`}>Approved</button>
                        <button onClick={() => setFilter('rejected')} className={`px-4 py-2 text-sm rounded-md ${filter === 'rejected' ? 'bg-amber-600 text-white' : 'text-gray-300'}`}>Rejected</button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative flex-grow w-full md:w-auto">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search by staff name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-700 text-white border-gray-600 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    
                    {/* Date Range Filter (Conditional) */}
                    {(filter === 'approved' || filter === 'rejected') && (
                        <DateRangeFilter currentFilter={dateFilter} setFilter={setDateFilter} />
                    )}
                </div>
                {/* --- END FILTER BAR --- */}

                {/* --- RESULTS LIST --- */}
                <div className="bg-gray-800 rounded-lg shadow-lg">
                    <div className="divide-y divide-gray-700">
                        {filteredLeaveRequests.length > 0 ? filteredLeaveRequests.map(req => (
                            <LeaveRequestItem 
                                key={req.id}
                                req={req}
                                onUpdateRequest={handleUpdateRequest}
                                onDeleteRequest={handleDeleteRequest}
                                onEditRequest={openEditModal}
                                onMcStatusChange={handleMcStatusChange}
                            />
                        )) : (
                            <p className="text-center py-10 text-gray-400">
                                No {filter} requests found
                                {searchTerm && ` for "${searchTerm}"`}
                                {(filter === 'approved' || filter === 'rejected') && dateFilter !== 'allTime' && ` in ${dateFilter === 'thisMonth' ? 'this month' : 'this year'}`}
                                .
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // --- STAFF VIEW (Unchanged) ---
    return (
        <div>
            <Modal isOpen={isModalOpen} onClose={closeModal} title="Request Time Off">
                {/* --- *** THIS IS THE FIX (for Staff) *** --- */}
                <LeaveRequestForm 
                    db={db} 
                    user={user} 
                    onClose={closeModal} 
                    existingRequests={allLeaveRequests} 
                    userRole={userRole} 
                    companyConfig={companyConfig} 
                    leaveBalances={leaveBalances} 
                    staffList={activeStaffList} 
                    isModalOpen={isModalOpen} 
                />
                {/* --- *** END FIX *** --- */}
            </Modal>
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">My Leave Requests</h2>
                <button onClick={openNewRequestModal} className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg"><PlusIcon className="h-5 w-5 mr-2" />Request New Leave</button>
            </div>
            <div className="bg-gray-800 rounded-lg shadow-lg">
                <div className="divide-y divide-gray-700">
                    {filteredLeaveRequests.length > 0 ? filteredLeaveRequests.map(req => (
                        <div key={req.id} className="p-4 flex flex-wrap justify-between items-center gap-4">
                            <div>
                                <p className="font-bold text-white">{req.leaveType}</p>
                                <p className="text-sm text-gray-400">Requested on: {dateUtils.formatDisplayDate(req.requestedAt)}</p>
                            </div>
                            <div>
                                <p className="font-medium text-white">{dateUtils.formatDisplayDate(req.startDate)} to {dateUtils.formatDisplayDate(req.endDate)} ({req.totalDays} days)</p>
                            </div>
                            <StatusBadge status={req.status} />
                        </div>
                    )) : (<p className="text-center py-10 text-gray-400">You have not made any leave requests.</p>)}
                </div>
            </div>
        </div>
    );
};