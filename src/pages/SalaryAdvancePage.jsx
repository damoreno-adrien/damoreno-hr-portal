/* src/pages/SalaryAdvancePage.jsx */

import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, getDocs } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import RequestAdvanceModal from '../components/SalaryAdvance/RequestAdvanceModal';
import { EligibilityCard } from '../components/SalaryAdvance/EligibilityCard';
import { RequestHistoryTable } from '../components/SalaryAdvance/RequestHistoryTable';
import * as dateUtils from '../utils/dateUtils';

// Helper to find correct salary from profile
const getStaffCurrentJob = (staff) => {
    if (!staff) return null;
    if (staff.baseSalary) return staff;
    if (!staff.jobHistory || staff.jobHistory.length === 0) return null;
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB;
    })[0];
};

// --- FIX: Add companyConfig prop ---
export default function SalaryAdvancePage({ db, user, companyConfig }) {
    const [eligibility, setEligibility] = useState({ 
        maxAdvance: 0, 
        maxTheoreticalAdvance: 0,
        salaryEarned: 0,
        currentAdvances: 0,
        policyCap: 0 // New field for display
    });
    const [isLoadingEligibility, setIsLoadingEligibility] = useState(true);
    
    const [requests, setRequests] = useState([]);
    const [isLoadingRequests, setIsLoadingRequests] = useState(true);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [error, setError] = useState('');

    // 1. Live Fetch: Requests History
    useEffect(() => {
        if (!db || !user) return;
        setIsLoadingRequests(true);

        const q = query(
            collection(db, 'salary_advances'), 
            where('staffId', '==', user.uid),
            orderBy('requestDate', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRequests(list);
            setIsLoadingRequests(false);
        }, (err) => {
            console.error("Error fetching requests:", err);
            setIsLoadingRequests(false);
        });

        return () => unsubscribe();
    }, [db, user]);

    // 2. Calculation: Eligibility
    const calculateLocalEligibility = useCallback(async () => {
        if (!db || !user) return;
        setIsLoadingEligibility(true);
        setError('');

        try {
            // A. Fetch Profile (Base Salary)
            const profileRef = doc(db, 'staff_profiles', user.uid);
            const profileSnap = await getDoc(profileRef);
            if (!profileSnap.exists()) throw new Error("Staff profile not found.");
            
            const rawProfile = profileSnap.data();
            const jobInfo = getStaffCurrentJob(rawProfile) || rawProfile;
            const baseSalary = parseFloat(jobInfo.baseSalary) || 0;

            // B. Fetch Active Loans (Monthly Deduction)
            const loansQ = query(collection(db, 'loans'), where('staffId', '==', user.uid), where('status', '==', 'active'));
            const loansSnap = await getDocs(loansQ);
            const monthlyLoanDeduction = loansSnap.docs.reduce((sum, d) => sum + (parseFloat(d.data().monthlyDeduction) || 0), 0);

            // C. Fetch Current Month Advances
            const now = new Date();
            const startOfMonthStr = dateUtils.formatISODate(dateUtils.startOfMonth(now));
            const endOfMonthStr = dateUtils.formatISODate(dateUtils.endOfMonth(now));

            const advancesQ = query(
                collection(db, 'salary_advances'),
                where('staffId', '==', user.uid),
                where('requestDate', '>=', startOfMonthStr),
                where('requestDate', '<=', endOfMonthStr)
            );
            const advancesSnap = await getDocs(advancesQ);
            
            const usedAdvanceAmount = advancesSnap.docs.reduce((sum, d) => {
                const data = d.data();
                if (['pending', 'approved', 'paid'].includes(data.status)) {
                    return sum + (parseFloat(data.amount) || 0);
                }
                return sum;
            }, 0);

            // --- D. The Updated Math ---
            const daysInMonth = dateUtils.getDaysInMonth(now);
            const currentDay = now.getDate();
            
            // 1. Earned So Far (The "Reality" Limit)
            const earnedSalary = (baseSalary / daysInMonth) * currentDay;

            // 2. Policy Cap (The "Settings" Limit)
            // Default to 50% if not set in config
            const advanceCapPercent = companyConfig?.maxAdvancePercent || 50; 
            const policyCapAmount = baseSalary * (advanceCapPercent / 100);

            // 3. Gross Eligible = MIN(Earned, Policy Cap)
            // You can't take more than you earned, AND you can't take more than 50% of total salary
            const grossEligible = Math.min(earnedSalary, policyCapAmount);

            // 4. Subtract Deductions
            const available = grossEligible - usedAdvanceAmount - monthlyLoanDeduction;

            setEligibility({
                maxAdvance: Math.max(0, Math.floor(available)), 
                maxTheoreticalAdvance: Math.floor(grossEligible), 
                salaryEarned: earnedSalary,
                currentAdvances: usedAdvanceAmount,
                policyCap: policyCapAmount // For UI reference if needed
            });

        } catch (err) {
            console.error("Eligibility Error:", err);
            setError("Could not calculate eligibility. Please contact management.");
        } finally {
            setIsLoadingEligibility(false);
        }
    }, [db, user, companyConfig]); // Added companyConfig dependency

    useEffect(() => {
        calculateLocalEligibility();
    }, [calculateLocalEligibility]);

    return (
        <div>
            {isModalOpen && (
                <RequestAdvanceModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    db={db}
                    user={user}
                    maxAdvance={eligibility.maxAdvance}
                    onSuccess={() => {
                        setIsModalOpen(false);
                        calculateLocalEligibility(); 
                    }} 
                />
            )}
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Salary Advance</h2>
                <button
                    onClick={() => setIsModalOpen(true)}
                    disabled={isLoadingEligibility || eligibility.maxAdvance <= 0}
                    className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors"
                >
                    <Plus className="h-5 w-5 mr-2" />
                    Request New Advance
                </button>
            </div>

            {error && <div className="bg-red-900/30 border border-red-700 text-red-300 p-4 rounded-lg mb-8">{error}</div>}

            <EligibilityCard eligibility={eligibility} isLoading={isLoadingEligibility} />

            <RequestHistoryTable requests={requests} isLoading={isLoadingRequests} />
        </div>
    );
}