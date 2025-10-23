import React, { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../App.jsx"
import { FinancialCard } from '../components/FinancialsDashboard/FinancialCard';
import { PayEstimateCard } from '../components/FinancialsDashboard/PayEstimateCard';
import { SideCards } from '../components/FinancialsDashboard/SideCards';
import Modal from '../components/Modal';
import PayslipDetailView from '../components/PayslipDetailView';

// *** INITIALIZE FUNCTIONS FOR ASIA REGION ***
const functionsAsia = getFunctions(app, "asia-southeast1");
const calculateLivePayEstimate = httpsCallable(functionsAsia, 'calculateLivePayEstimateHandler');

export default function FinancialsDashboardPage({ user, companyConfig }) {
    const [payEstimate, setPayEstimate] = useState(null);
    const [isLoadingEstimate, setIsLoadingEstimate] = useState(true);
    const [errorEstimate, setErrorEstimate] = useState('');
    const [latestPayslipForModal, setLatestPayslipForModal] = useState(null);

    const fetchPayEstimate = useCallback(() => {
        setIsLoadingEstimate(true);
        setErrorEstimate('');
        calculateLivePayEstimate()
            .then(result => setPayEstimate(result.data))
            .catch(err => {
                console.error("Error fetching pay estimate:", err);
                setErrorEstimate(`Failed to load pay estimate: ${err.message}`);
            })
            .finally(() => setIsLoadingEstimate(false));
    }, []); // Removed calculateLivePayEstimate from dependency array as it's stable

    useEffect(() => {
        fetchPayEstimate();
    }, [fetchPayEstimate]);

    const handleViewLatestPayslip = () => {
        if (payEstimate?.latestPayslip) {
            // Need to construct the payPeriod object for the modal
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
                <div className="bg-red-500/20 text-red-300 p-4 rounded-lg mb-8">{errorEstimate}</div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-8">
                    <PayEstimateCard
                        payEstimate={payEstimate}
                        isLoading={isLoadingEstimate}
                    />

                    {/* Placeholder for future components if needed */}
                    {/* <FinancialCard title="Upcoming Deductions">
                        <p className="text-gray-400">Placeholder for upcoming loan payments, etc.</p>
                    </FinancialCard> */}
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