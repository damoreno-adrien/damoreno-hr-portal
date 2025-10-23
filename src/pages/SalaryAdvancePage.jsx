import React, { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../App.jsx"
import { collection, query, where, onSnapshot, orderBy, writeBatch, doc } from 'firebase/firestore';
import { PlusIcon } from '../components/Icons';
import RequestAdvanceModal from '../components/RequestAdvanceModal';
import { EligibilityCard } from '../components/SalaryAdvance/EligibilityCard'; // Import new component
import { RequestHistoryTable } from '../components/SalaryAdvance/RequestHistoryTable'; // Import new component

// *** INITIALIZE FUNCTIONS FOR ASIA REGION ***
const functionsAsia = getFunctions(app, "asia-southeast1");
const calculateEligibility = httpsCallable(functionsAsia, 'calculateAdvanceEligibilityHandler');

export default function SalaryAdvancePage({ db, user }) {
    const [eligibility, setEligibility] = useState({ maxAdvance: 0, maxTheoreticalAdvance: 0 });
    const [isLoadingEligibility, setIsLoadingEligibility] = useState(true);
    const [requests, setRequests] = useState([]);
    const [isLoadingRequests, setIsLoadingRequests] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [error, setError] = useState('');

    const fetchEligibility = useCallback(() => {
        setIsLoadingEligibility(true);
        setError(''); // Clear previous errors
        // Use the correctly initialized callable function
        calculateEligibility()
            .then((result) => setEligibility(result.data))
            .catch((err) => {
                console.error(err);
                setError("Could not determine eligibility. " + err.message);
            })
            .finally(() => setIsLoadingEligibility(false));
    }, []); // Removed calculateEligibility from dependency array

    useEffect(() => {
        fetchEligibility();

        const q = query(
            collection(db, 'salary_advances'),
            where('staffId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requestData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRequests(requestData);
            setIsLoadingRequests(false);

            // Mark fetched requests as read
            const unreadDocs = snapshot.docs.filter(doc => doc.data().isReadByStaff === false);
            if (unreadDocs.length > 0) {
                const batch = writeBatch(db);
                unreadDocs.forEach(doc => {
                    batch.update(doc.ref, { isReadByStaff: true });
                });
                batch.commit().catch(err => console.error("Error marking advances as read:", err)); // Add error handling
            }
        }, (err) => {
            console.error(err);
            setError("Could not load request history.");
            setIsLoadingRequests(false);
        });

        return () => unsubscribe();
    }, [db, user, fetchEligibility]);

    return (
        <div>
            {isModalOpen && (
                <RequestAdvanceModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    db={db}
                    user={user}
                    maxAdvance={eligibility.maxAdvance}
                    onSuccess={fetchEligibility} // Refresh eligibility after successful request
                />
            )}
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Salary Advance</h2>
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

            {/* Use the new EligibilityCard component */}
            <EligibilityCard eligibility={eligibility} isLoading={isLoadingEligibility} />

            {/* Use the new RequestHistoryTable component */}
            <RequestHistoryTable requests={requests} isLoading={isLoadingRequests} />
        </div>
    );
}