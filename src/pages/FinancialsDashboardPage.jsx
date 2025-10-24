import React, { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
// *** Correct import path to firebase.js ***
import { app } from "../../firebase.js"
import { FinancialCard } from '../components/FinancialsDashboard/FinancialCard';
import { PayEstimateCard } from '../components/FinancialsDashboard/PayEstimateCard';
import { SideCards } from '../components/FinancialsDashboard/SideCards';
import Modal from '../components/Modal';
import PayslipDetailView from '../components/PayslipDetailView';

// *** CORRECT INITIALIZATION FOR ASIA REGION ***
const functionsAsia = getFunctions(app, "asia-southeast1"); // Use correct region AND variable name
const calculateLivePayEstimate = httpsCallable(functionsAsia, 'calculateLivePayEstimate');
export default function FinancialsDashboardPage({ user, companyConfig }) { // Removed unused 'user' prop if not needed
    const [payEstimate, setPayEstimate] = useState(null);
    const [isLoadingEstimate, setIsLoadingEstimate] = useState(true);
    const [errorEstimate, setErrorEstimate] = useState('');
    const [latestPayslipForModal, setLatestPayslipForModal] = useState(null);

    const fetchPayEstimate = useCallback(() => {
        setIsLoadingEstimate(true);
        setErrorEstimate('');
        // Ensure the correct callable function (defined above) is used
        calculateLivePayEstimate()
            .then(result => setPayEstimate(result.data))
            .catch(err => {
                console.error("Error fetching pay estimate:", err);
                // Provide a slightly more user-friendly error
                setErrorEstimate(`Failed to load pay estimate. Please try again later.`);
            })
            .finally(() => setIsLoadingEstimate(false));
    }, []); // Dependency array is empty

    useEffect(() => {
        fetchPayEstimate();
    }, [fetchPayEstimate]);

    const handleViewLatestPayslip = () => {
        if (payEstimate?.latestPayslip) {
            const payslip = payEstimate.latestPayslip;
            const period = {
                month: payslip.payPeriodMonth,
                year: payslip.payPeriodYear
            };
            setLatestPayslipForModal({ details: payslip, payPeriod: period });
        }
    };

    const closeModal = () => {
        setLatestPayslipForModal(null);
    };

    return (
        <div>
            {latestPayslipForModal && (
                 <Modal isOpen={true} onClose={closeModal} title={`Latest Payslip (${latestPayslipForModal.payPeriod.month}/${latestPayslipForModal.payPeriod.year})`}>
                    <PayslipDetailView
                        details={latestPayslipForModal.details}
                        companyConfig={companyConfig}
                        payPeriod={latestPayslipForModal.payPeriod}
                    />
                </Modal>
            )}

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">My Financials</h2>

            {errorEstimate && (
                <div className="bg-red-900/30 border border-red-700 text-red-300 p-4 rounded-lg mb-8">{errorEstimate}</div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-8">
                    <PayEstimateCard
                        payEstimate={payEstimate}
                        isLoading={isLoadingEstimate}
                    />
                    {/* Placeholder */}
                </div>

                {/* Sidebar Area */}
                <SideCards
                    payEstimate={payEstimate}
                    isLoading={isLoadingEstimate}
                    onViewLatestPayslip={handleViewLatestPayslip}
                />
            </div>
        </div>
    );
};