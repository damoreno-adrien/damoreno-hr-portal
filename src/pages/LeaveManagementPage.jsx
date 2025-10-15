import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import Modal from '../components/Modal';
import LeaveRequestForm from '../components/LeaveRequestForm';
import { PlusIcon, BriefcaseIcon, TrashIcon } from '../components/Icons';

const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

export default function LeaveManagementPage({ db, user, userRole, staffList, companyConfig, leaveBalances }) {
    const [allLeaveRequests, setAllLeaveRequests] = useState([]);
    const [filteredLeaveRequests, setFilteredLeaveRequests] = useState([]);
    const [filter, setFilter] = useState('pending');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [requestToEdit, setRequestToEdit] = useState(null);

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
                    return { ...req, displayStaffName: staffMember ? getDisplayName(staffMember) : req.staffName };
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
                unreadRequests.forEach(req => {
                    const docRef = doc(db, 'leave_requests', req.id);
                    batch.update(docRef, { isReadByStaff: true });
                });
                batch.commit();
            }
        }
    }, [allLeaveRequests, userRole, db]);


    useEffect(() => {
        if (userRole === 'manager') {
            const filtered = allLeaveRequests.filter(req => {
                if (req.status !== filter) return false;
                
                // For pending requests, only show them if the staff member is still active
                if (filter === 'pending') {
                    const staffMember = staffList.find(s => s.id === req.staffId);
                    // If we can't find the staff member, or they are inactive, hide the pending request.
                    if (!staffMember || staffMember.status === 'inactive') {
                        return false;
                    }
                }
                
                // For approved/rejected, show all for historical context
                return true; 
            });
            setFilteredLeaveRequests(filtered);
        } else {
            setFilteredLeaveRequests(allLeaveRequests);
        }
    }, [filter, allLeaveRequests, userRole, staffList]);


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
    
    // Create a filtered list of only active staff for the "New Request" modal
    const activeStaffList = useMemo(() => staffList.filter(s => s.status !== 'inactive'), [staffList]);

    const StatusBadge = ({ status }) => {
        const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full";
        if (status === 'approved') return <span className={`${baseClasses} bg-green-600 text-green-100`}>Approved</span>;
        if (status === 'rejected') return <span className={`${baseClasses} bg-red-600 text-red-100`}>Rejected</span>;
        return <span className={`${baseClasses} bg-yellow-600 text-yellow-100`}>Pending</span>;
    };

    if (userRole === 'manager') {
        return (
            <div>
                <Modal isOpen={isModalOpen} onClose={closeModal} title={requestToEdit ? "Edit Leave Request" : "Create Leave for Staff"}>
                    <LeaveRequestForm db={db} user={user} onClose={closeModal} existingRequest={requestToEdit} userRole={userRole} staffList={activeStaffList} existingRequests={allLeaveRequests} companyConfig={companyConfig} leaveBalances={leaveBalances}/>
                </Modal>
                <div className="flex flex-col md:flex-row justify-between md:items-center space-y-4 md:space-y-0 mb-8">
                    <h2 className="text-2xl md:text-3xl font-bold text-white">Leave Management</h2>
                    <div className="w-full md:w-auto flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
                        <div className="flex space-x-2 p-1 bg-gray-700 rounded-lg">
                            <button onClick={() => setFilter('pending')} className={`px-4 py-2 text-sm rounded-md ${filter === 'pending' ? 'bg-amber-600 text-white' : 'text-gray-300'}`}>Pending</button>
                            <button onClick={() => setFilter('approved')} className={`px-4 py-2 text-sm rounded-md ${filter === 'approved' ? 'bg-amber-600 text-white' : 'text-gray-300'}`}>Approved</button>
                            <button onClick={() => setFilter('rejected')} className={`px-4 py-2 text-sm rounded-md ${filter === 'rejected' ? 'bg-amber-600 text-white' : 'text-gray-300'}`}>Rejected</button>
                        </div>
                        <button onClick={openNewRequestModal} className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><PlusIcon className="h-5 w-5 mr-2" />New Request for Staff</button>
                    </div>
                </div>
                <div className="bg-gray-800 rounded-lg shadow-lg">
                    <div className="divide-y divide-gray-700">
                        {filteredLeaveRequests.length > 0 ? filteredLeaveRequests.map(req => (
                            <div key={req.id} className="p-4">
                                <div className="flex flex-wrap justify-between items-center gap-4">
                                    <div className="flex-grow min-w-[200px]">
                                        <p className="font-bold text-white">{req.displayStaffName}</p>
                                        <p className="text-sm text-gray-400">{req.leaveType} | Requested: {req.requestedAt?.toDate().toLocaleDateString('en-GB')}</p>
                                    </div>
                                    <div className="text-center"><p className="text-sm text-gray-300">Dates:</p><p className="font-medium text-white">{req.startDate} to {req.endDate}</p></div>
                                    <div className="text-center"><p className="text-sm text-gray-300">Total Days:</p><p className="font-medium text-white">{req.totalDays}</p></div>
                                    <div className="flex items-center space-x-2">
                                        <StatusBadge status={req.status} />
                                        <button onClick={() => openEditModal(req)} className="p-2 rounded-lg bg-gray-600 hover:bg-gray-500" title="Edit Request"><BriefcaseIcon className="h-4 w-4"/></button>
                                        <button onClick={() => handleDeleteRequest(req.id)} className="p-2 rounded-lg bg-red-800 hover:bg-red-700" title="Delete Request"><TrashIcon className="h-4 w-4"/></button>
                                        {req.status === 'pending' && (
                                            <>
                                                <button onClick={() => handleUpdateRequest(req.id, 'rejected')} className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700">Reject</button>
                                                <button onClick={() => handleUpdateRequest(req.id, 'approved')} className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700">Approve</button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {req.reason && (<p className="mt-2 text-sm text-amber-300 bg-gray-700 p-2 rounded-md"><span className="font-semibold">Reason:</span> {req.reason}</p>)}
                                {req.leaveType === 'Sick Leave' && req.totalDays >= 3 && (
                                    <div className="mt-3 pt-3 border-t border-gray-700">
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input type="checkbox" checked={!!req.mcReceived} onChange={() => handleMcStatusChange(req.id, req.mcReceived)} className="w-4 h-4 rounded bg-gray-600 border-gray-500 text-amber-500 focus:ring-amber-500"/>
                                            <span className="text-sm text-gray-300">Medical Certificate Received</span>
                                        </label>
                                    </div>
                                )}
                            </div>
                        )) : (<p className="text-center py-10 text-gray-400">No {filter} requests found.</p>)}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <Modal isOpen={isModalOpen} onClose={closeModal} title="Request Time Off">
                <LeaveRequestForm db={db} user={user} onClose={closeModal} existingRequests={allLeaveRequests} userRole={userRole} companyConfig={companyConfig} leaveBalances={leaveBalances} staffList={staffList} />
            </Modal>
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">My Leave Requests</h2>
                <button onClick={openNewRequestModal} className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg"><PlusIcon className="h-5 w-5 mr-2" />Request New Leave</button>
            </div>
            <div className="bg-gray-800 rounded-lg shadow-lg">
                <div className="divide-y divide-gray-700">
                    {filteredLeaveRequests.length > 0 ? filteredLeaveRequests.map(req => (
                        <div key={req.id} className="p-4 flex justify-between items-center">
                            <div><p className="font-bold text-white">{req.leaveType}</p><p className="text-sm text-gray-400">Requested on: {req.requestedAt?.toDate().toLocaleDateString('en-GB')}</p></div>
                            <div><p className="font-medium text-white">{req.startDate} to {req.endDate} ({req.totalDays} days)</p></div>
                            <StatusBadge status={req.status} />
                        </div>
                    )) : (<p className="text-center py-10 text-gray-400">You have not made any leave requests.</p>)}
                </div>
            </div>
        </div>
    );
};