import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Modal from '../components/Modal';
import PayslipDetailView from '../components/PayslipDetailView';
import { FinancialCard } from '../components/FinancialsDashboard/FinancialCard';
import { PayEstimateCard } from '../components/FinancialsDashboard/PayEstimateCard';
import { SideCards } from '../components/FinancialsDashboard/SideCards';

const Spinner = () => (
    <div className="flex justify-center items-center p-8">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);

const formatMonthYear = (payslip) => {
    if (!payslip || !payslip.payPeriodYear || !payslip.payPeriodMonth) return "Invalid Date";
    const date = new Date(payslip.payPeriodYear, payslip.payPeriodMonth - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
};

export default function FinancialsDashboardPage({ companyConfig }) {
    const [estimate, setEstimate] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedPayslip, setSelectedPayslip] = useState(null);

    const [visibility, setVisibility] = useState({
        payEstimate: false,
        latestPayslip: false,
        salaryAdvance: false,
        activeLoans: false,
    });

    const handleToggleVisibility = (card) => {
        setVisibility(prev => ({ ...prev, [card]: !prev[card] }));
    };

    useEffect(() => {
        const fetchPayEstimate = async () => {
            try {
                const functions = getFunctions();
                const calculateLivePayEstimate = httpsCallable(functions, 'calculateLivePayEstimate');
                const result = await calculateLivePayEstimate();
                setEstimate(result.data);
            } catch (err) {
                console.error("Error fetching pay estimate:", err);
                setError(err.message || "An error occurred while calculating your pay.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchPayEstimate();
    }, []);

    const renderContent = () => {
        if (isLoading) { return <Spinner />; }
        if (error) { return <p className="text-center text-red-400 bg-red-500/10 p-4 rounded-lg">{error}</p>; }
        if (!estimate) { return <p className="text-center text-gray-400">Could not retrieve pay estimate data.</p>; }

        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <FinancialCard
                        title="Live Pay Estimate (so far this month)"
                        isVisible={visibility.payEstimate}
                        onToggle={() => handleToggleVisibility('payEstimate')}
                    >
                        <PayEstimateCard estimate={estimate} isVisible={visibility.payEstimate} />
                    </FinancialCard>
                </div>

                <SideCards 
                    estimate={estimate} 
                    visibility={visibility} 
                    onToggleVisibility={handleToggleVisibility}
                    onSelectPayslip={setSelectedPayslip}
                />
            </div>
        );
    };

    return (
        <div>
            {selectedPayslip && (
                <Modal 
                    isOpen={true} 
                    onClose={() => setSelectedPayslip(null)} 
                    title={`Payslip for ${formatMonthYear(selectedPayslip)}`}
                >
                    <PayslipDetailView 
                        details={selectedPayslip} 
                        companyConfig={companyConfig} 
                        payPeriod={{ month: selectedPayslip.payPeriodMonth, year: selectedPayslip.payPeriodYear }} 
                    />
                </Modal>
            )}

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Financials Dashboard</h2>
            {renderContent()}
        </div>
    );
}