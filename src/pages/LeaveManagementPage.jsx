import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import Modal from '../components/Modal';
import LeaveRequestForm from '../components/LeaveRequestForm';
import { PlusIcon } from '../components/Icons';

export default function LeaveManagementPage({ db, user, userRole }) {
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [filter, setFilter] = useState('pending');
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

    useEffect(() => {
        if (!db || !user) return;
        
        let q;
        if (userRole === 'manager') {
            q = query(collection(db, "leave_requests"), where("status", "==", filter));
        } else {
            q = query(collection(db, "leave_requests"), where("staffId", "==", user.uid));
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if(userRole === 'staff') {
                requests.sort((a,b) => b.requestedAt?.seconds - a.requestedAt?.seconds);
            }
            setLeaveRequests(requests);
        });
        return () => unsubscribe();
    }, [db, filter, userRole, user?.uid]);

    const handleUpdateRequest = async (id, newStatus) => {
        const requestDocRef = doc(db, "leave_requests", id);
        try {
            await updateDoc(requestDocRef, { status: newStatus });
        } catch (error) {
            alert("Failed to update request.");
        }
    };
    
    const StatusBadge = ({ status }) => {
        const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full";
        if (status === 'approved') return <span className={`${baseClasses} bg-green-600 text-green-100`}>Approved</span>;
        if (status === 'rejected') return <span className={`${baseClasses} bg-red-600 text-red-100`}>Rejected</span>;
        return <span className={`${baseClasses} bg-yellow-600 text-yellow-100`}>Pending</span>;
    };

    if (userRole === 'manager') {
        return (
            <div>
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-3xl font-bold text-white">Leave Management</h2>
                    <div className="flex space-x-2 p-1 bg-gray-700 rounded-lg">
                        <button onClick={() => setFilter('pending')} className={`px-4 py-2 text-sm rounded-md ${filter === 'pending' ? 'bg-amber-600 text-white' : 'text-gray-300'}`}>Pending</button>
                        <button onClick={() => setFilter('approved')} className={`px-4 py-2 text-sm rounded-md ${filter === 'approved' ? 'bg-amber-600 text-white' : 'text-gray-300'}`}>Approved</button>
                        <button onClick={() => setFilter('rejected')} className={`px-4 py-2 text-sm rounded-md ${filter === 'rejected' ? 'bg-amber-600 text-white' : 'text-gray-300'}`}>Rejected</button>
                    </div>
                </div>
                <div className="bg-gray-800 rounded-lg shadow-lg">
                    <div className="divide-y divide-gray-700">
                        {leaveRequests.length > 0 ? leaveRequests.map(req => (
                            <div key={req.id} className="p-4 flex flex-wrap justify-between items-center gap-4">
                                <div className="flex-grow min-w-[200px]">
                                    <p className="font-bold text-white">{req.staffName}</p>
                                    <p className="text-sm text-gray-400">{req.leaveType} | Requested: {req.requestedAt?.toDate().toLocaleDateString('en-GB')}</p>
                                    
                                    {/* --- ADDED THIS BLOCK --- */}
                                    {req.reason && (
                                        <p className="mt-2 text-sm text-amber-300 bg-gray-700 p-2 rounded-md">
                                            <span className="font-semibold">Reason:</span> {req.reason}
                                        </p>
                                    )}
                                    {/* --- END OF ADDED BLOCK --- */}

                                </div>
                                <div className="text-center"><p className="text-sm text-gray-300">Dates:</p><p className="font-medium text-white">{req.startDate} to {req.endDate}</p></div>
                                <div className="text-center"><p className="text-sm text-gray-300">Total Days:</p><p className="font-medium text-white">{req.totalDays}</p></div>
                                <div className="flex items-center space-x-4">
                                <StatusBadge status={req.status} />
                                {req.status === 'pending' && (
                                    <>
                                        <button onClick={() => handleUpdateRequest(req.id, 'rejected')} className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700">Reject</button>
                                        <button onClick={() => handleUpdateRequest(req.id, 'approved')} className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700">Approve</button>
                                    </>
                                )}
                                </div>
                            </div>
                        )) : (<p className="text-center py-10 text-gray-400">No {filter} requests found.</p>)}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <Modal isOpen={isRequestModalOpen} onClose={() => setIsRequestModalOpen(false)} title="Request Time Off">
                <LeaveRequestForm db={db} user={user} onClose={() => setIsRequestModalOpen(false)} />
            </Modal>
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold text-white">My Leave Requests</h2>
                <button onClick={() => setIsRequestModalOpen(true)} className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg"><PlusIcon className="h-5 w-5 mr-2" />Request New Leave</button>
            </div>
            <div className="bg-gray-800 rounded-lg shadow-lg">
                <div className="divide-y divide-gray-700">
                    {leaveRequests.length > 0 ? leaveRequests.map(req => (
                        <div key={req.id} className="p-4 flex justify-between items-center">
                            <div>
                                <p className="font-bold text-white">{req.leaveType}</p>
                                <p className="text-sm text-gray-400">Requested on: {req.requestedAt?.toDate().toLocaleDateString('en-GB')}</p>
                            </div>
                            <div>
                                <p className="font-medium text-white">{req.startDate} to {req.endDate} ({req.totalDays} days)</p>
                            </div>
                            <StatusBadge status={req.status} />
                        </div>
                    )) : (<p className="text-center py-10 text-gray-400">You have not made any leave requests.</p>)}
                </div>
            </div>
        </div>
    );
};