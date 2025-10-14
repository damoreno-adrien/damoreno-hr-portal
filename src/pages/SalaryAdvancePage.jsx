import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, query, where, onSnapshot, orderBy, writeBatch, doc } from 'firebase/firestore';
import { PlusIcon } from '../components/Icons';
import RequestAdvanceModal from '../components/RequestAdvanceModal';

// Helper to format numbers as currency
const formatCurrency = (num) => num != null ? num.toLocaleString('en-US') : '0';

const StatusBadge = ({ status }) => {
    const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full";
    const statusMap = {
        pending: "bg-yellow-500/20 text-yellow-300",
        approved: "bg-green-500/20 text-green-300",
        rejected: "bg-red-500/20 text-red-300",
        paid: "bg-blue-500/20 text-blue-300",
    };
    return <span className={`${baseClasses} ${statusMap[status] || 'bg-gray-500/20 text-gray-300'}`}>{status}</span>;
};

export default function SalaryAdvancePage({ db, user }) {
    const [eligibility, setEligibility] = useState({ maxAdvance: 0, maxTheoreticalAdvance: 0 });
    const [isLoadingEligibility, setIsLoadingEligibility] = useState(true);
    const [requests, setRequests] = useState([]);
    const [isLoadingRequests, setIsLoadingRequests] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        // Call the cloud function to get eligibility
        const functions = getFunctions();
        const calculateEligibility = httpsCallable(functions, 'calculateAdvanceEligibility');
        
        calculateEligibility()
            .then((result) => setEligibility(result.data))
            .catch((err) => {
                console.error(err);
                setError("Could not determine eligibility. " + err.message);
            })
            .finally(() => setIsLoadingEligibility(false));

        // Listen for changes to salary advance requests
        const q = query(
            collection(db, 'salary_advances'), 
            where('staffId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requestData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRequests(requestData);
            setIsLoadingRequests(false);

            // --- NEW: LOGIC TO CLEAR NOTIFICATIONS ---
            const unreadDocs = snapshot.docs.filter(doc => doc.data().isReadByStaff === false);
            if (unreadDocs.length > 0) {
                const batch = writeBatch(db);
                unreadDocs.forEach(doc => {
                    batch.update(doc.ref, { isReadByStaff: true });
                });
                batch.commit();
            }
        }, (err) => {
            console.error(err);
            setError("Could not load request history.");
            setIsLoadingRequests(false);
        });

        return () => unsubscribe();
    }, [db, user]);

    return (
        <div>
            {isModalOpen && (
                <RequestAdvanceModal 
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    db={db}
                    user={user}
                    maxAdvance={eligibility.maxAdvance}
                />
            )}
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Salary Advance TEST</h2>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    disabled={isLoadingEligibility || eligibility.maxAdvance <= 0}
                    className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                    <PlusIcon className="h-5 w-5 mr-2" />
                    Request New Advance
                </button>
            </div>

            {error && <div className="bg-red-500/20 text-red-300 p-4 rounded-lg mb-8">{error}</div>}

            <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
                <h3 className="text-lg font-semibold text-white mb-2">Your Eligibility</h3>
                {isLoadingEligibility ? (
                    <p className="text-gray-400">Calculating your maximum advance...</p>
                ) : (
                    <div>
                        <p className="text-gray-300">You are eligible for a salary advance of up to:</p>
                        {/* --- UPDATED DISPLAY LOGIC --- */}
                        <p className="text-4xl font-bold text-amber-400 mt-1">{formatCurrency(eligibility.maxAdvance)} THB</p>
                        {eligibility.maxTheoreticalAdvance > eligibility.maxAdvance && (
                             <p className="text-sm text-gray-400 mt-1">
                                on a total of {formatCurrency(eligibility.maxTheoreticalAdvance)} THB this month
                            </p>
                        )}
                         {/* --- END OF UPDATE --- */}
                    </div>
                )}
            </div>

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <h3 className="text-lg font-semibold text-white p-4">Request History</h3>
                <table className="min-w-full">
                    <thead className="bg-gray-700/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {isLoadingRequests ? (
                            <tr><td colSpan="3" className="text-center py-10 text-gray-500">Loading history...</td></tr>
                        ) : requests.length === 0 ? (
                            <tr><td colSpan="3" className="text-center py-10 text-gray-500">You have no advance requests.</td></tr>
                        ) : (
                            requests.map(req => (
                                <tr key={req.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{req.date}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-amber-400">{formatCurrency(req.amount)} THB</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm capitalize"><StatusBadge status={req.status} /></td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}