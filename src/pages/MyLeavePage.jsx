/* src/pages/MyLeavePage.jsx */
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { Plus, Lock } from 'lucide-react';
import Modal from '../components/common/Modal';
import LeaveRequestForm from '../components/LeaveManagement/LeaveRequestForm';
import { LeaveRequestItem } from '../components/LeaveManagement/LeaveRequestItem';
import { calculateStaffLeaveBalances } from '../utils/leaveCalculator'; 

export default function MyLeavePage({ db, user, userRole, staffList, companyConfig }) {
    const [myRequests, setMyRequests] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [requestToEdit, setRequestToEdit] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // 1. Fetch ONLY the logged-in user's requests
    useEffect(() => {
        if (!db || !user) return;
        
        const q = query(
            collection(db, "leave_requests"), 
            where("staffId", "==", user.uid)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Sort newest first
            requests.sort((a,b) => (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0));
            
            // Hydrate with display name for the LeaveRequestItem component
            const hydratedRequests = requests.map(req => {
                const me = staffList.find(s => s.id === user.uid);
                return {
                    ...req,
                    displayStaffName: me ? (me.nickname || me.firstName || me.fullName) : 'Me'
                };
            });
            
            setMyRequests(hydratedRequests);
            setIsLoading(false);
        });
        
        return () => unsubscribe();
    }, [db, user, staffList]);

    // 2. Dynamically calculate the RICH leave balances locally
    const richBalances = useMemo(() => {
        const me = staffList.find(s => s.id === user?.uid);
        if (!me || !companyConfig) return null;
        return calculateStaffLeaveBalances(me, myRequests, companyConfig);
    }, [staffList, user, myRequests, companyConfig]);

    const annual = richBalances?.annual || {};
    const sick = richBalances?.sick || {};
    const personal = richBalances?.personal || {};
    const ph = richBalances?.ph || {};

    const handleDeleteRequest = async (id) => {
        if (window.confirm("Are you sure you want to cancel and delete this leave request?")) {
            try {
                await deleteDoc(doc(db, "leave_requests", id));
            } catch (error) {
                alert("Failed to delete request.");
            }
        }
    };

    const openEditModal = (request) => {
        setRequestToEdit(request);
        setIsModalOpen(true);
    };

    const openNewRequestModal = () => {
        setRequestToEdit(null);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setRequestToEdit(null);
    };

    return (
        <div className="pb-10 animate-fadeIn">
            
            <Modal isOpen={isModalOpen} onClose={closeModal} title={requestToEdit ? "Edit Leave Request" : "Request Leave"}>
                <LeaveRequestForm 
                    db={db} 
                    user={user} 
                    onClose={closeModal} 
                    existingRequest={requestToEdit} 
                    userRole="staff" // Forces the form to hide the Admin staff dropdown
                    staffList={staffList.filter(s => s.id === user.uid)} 
                    existingRequests={myRequests} 
                    companyConfig={companyConfig} 
                    isModalOpen={isModalOpen} 
                />
            </Modal>

            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 gap-4">
                <h2 className="text-2xl md:text-3xl font-bold text-white">My Leave & Time Off</h2>
                <button 
                    onClick={openNewRequestModal} 
                    className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-lg transition-colors shadow-lg shadow-blue-500/20"
                >
                    <Plus className="h-5 w-5 mr-2" />
                    Request Leave
                </button>
            </div>

            {/* --- RESTORED: RICH BALANCES GRID --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
                
                {/* Annual Leave */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg flex flex-col justify-between">
                    <h3 className="text-gray-400 font-bold uppercase tracking-wider text-xs mb-2">Annual Leave</h3>
                    <div className="flex items-baseline gap-1 mb-4">
                        <span className="text-4xl font-black text-gray-200">{annual.remaining ?? 0}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-auto border-t border-gray-700 pt-3">
                        {annual.isLocked ? (
                            <span className="bg-amber-900/30 text-amber-500 font-bold px-2 py-1 rounded flex items-center border border-amber-700/50">
                                <Lock className="w-3 h-3 mr-1" /> Locked ({'<'} 1 Yr)
                            </span>
                        ) : (
                            <span className="text-gray-500">{annual.used ?? 0} Used / {annual.total ?? 0} Total</span>
                        )}
                        <span className="text-gray-500">{Number.isNaN(annual.accrued) ? 0 : (annual.accrued ?? 0)} Accrued</span>
                    </div>
                </div>

                {/* Paid Sick Leave */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg flex flex-col justify-between">
                    <h3 className="text-gray-400 font-bold uppercase tracking-wider text-xs mb-2">Paid Sick Leave</h3>
                    <div className="flex items-baseline gap-2 mb-4">
                        <span className="text-4xl font-black text-red-400">{sick.remaining ?? 0}</span>
                        <span className="text-gray-400 text-sm">Remaining</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-auto border-t border-gray-700 pt-3">
                        {sick.used ?? 0} Used / {sick.total ?? 0} Total
                    </div>
                </div>

                {/* Personal Leave */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg flex flex-col justify-between">
                    <h3 className="text-gray-400 font-bold uppercase tracking-wider text-xs mb-2">Personal Leave</h3>
                    <div className="flex items-baseline gap-2 mb-4">
                        <span className="text-4xl font-black text-purple-400">{personal.remaining ?? 0}</span>
                        <span className="text-gray-400 text-sm">Remaining</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-auto border-t border-gray-700 pt-3">
                        {personal.used ?? 0} Used / {personal.total ?? 0} Total
                    </div>
                </div>

                {/* Public Holiday Credits */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg flex flex-col justify-between">
                    <h3 className="text-gray-400 font-bold uppercase tracking-wider text-xs mb-2">Public Holiday Credits</h3>
                    <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-4xl font-black text-blue-400">{ph.remaining ?? 0}</span>
                        <span className="text-gray-400 text-sm">Total Remaining</span>
                    </div>
                    
                    {/* --- NEW: Dashboard Breakdown! --- */}
                    {ph.breakdown && Object.keys(ph.breakdown).length > 0 && (
                        <div className="flex gap-2 flex-wrap mb-3">
                            {Object.entries(ph.breakdown).sort().map(([year, days]) => (
                                <span key={year} className="bg-blue-900/40 text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-700/50">
                                    {year}: {days} {days === 1 ? 'Day' : 'Days'}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-between items-center text-xs mt-auto border-t border-gray-700 pt-3">
                        <span className="text-green-500 font-bold">{ph.cashable ?? 0} Cashable</span>
                        <span className="text-gray-500">{ph.used ?? 0} Used Lifetime</span>
                    </div>
                </div>
            </div>

            {/* --- REQUEST HISTORY --- */}
            <h3 className="text-xl font-bold text-white mb-4">Request History</h3>
            
            {isLoading ? (
                <div className="flex justify-center py-10"><p className="text-gray-500">Loading history...</p></div>
            ) : myRequests.length === 0 ? (
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-10 text-center shadow-inner">
                    <p className="text-gray-400">You haven't made any leave requests yet.</p>
                </div>
            ) : (
                <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 divide-y divide-gray-700/50 overflow-hidden">
                    {myRequests.map(req => (
                        <LeaveRequestItem 
                            key={req.id} 
                            req={req} 
                            userRole="staff" 
                            onDeleteRequest={handleDeleteRequest} 
                            onEditRequest={openEditModal} 
                            allRequests={myRequests} 
                            companyConfig={companyConfig} 
                            staffList={staffList} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
}