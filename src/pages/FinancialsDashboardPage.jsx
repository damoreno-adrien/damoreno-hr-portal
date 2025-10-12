import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Helper component for loading state
const Spinner = () => (
    <div className="flex justify-center items-center p-8">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);

// A reusable card component, similar to the one in DashboardPage.jsx
const DashboardCard = ({ title, children, className = '' }) => (
    <div className={`bg-gray-800 rounded-lg shadow-lg ${className}`}>
        {title && <h3 className="text-lg font-semibold text-white mb-4 px-4 pt-4">{title}</h3>}
        <div className="p-4">{children}</div>
    </div>
);

// Helper to format numbers as currency
const formatCurrency = (num) => num != null ? num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

export default function FinancialsDashboardPage() {
    const [estimate, setEstimate] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

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
    }, []); // Empty array ensures this runs only once on mount

    const renderContent = () => {
        if (isLoading) {
            return <Spinner />;
        }

        if (error) {
            return <p className="text-center text-red-400 bg-red-500/10 p-4 rounded-lg">{error}</p>;
        }

        if (!estimate) {
            return <p className="text-center text-gray-400">Could not retrieve pay estimate data.</p>;
        }

        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Pay Estimate Card */}
                <div className="lg:col-span-2">
                    <DashboardCard title="Live Pay Estimate (so far this month)">
                        <div className="text-center border-b border-gray-700 pb-6 mb-6">
                            <p className="text-gray-400 text-sm">Estimated Net Pay To Date</p>
                            <p className="text-4xl lg:text-5xl font-bold text-amber-400 mt-2">
                                ฿{formatCurrency(estimate.estimatedNetPay)}
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                            {/* Earnings Column */}
                            <div className="space-y-4">
                                <h4 className="font-semibold text-white text-lg">Earnings</h4>
                                <div className="flex justify-between">
                                    <span className="text-gray-300">Base Salary Earned</span>
                                    <span className="font-mono text-white">฿{formatCurrency(estimate.baseSalaryEarned)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-300">Potential Bonus</span>
                                    <div className="flex items-center gap-2">
                                        {estimate.potentialBonus.onTrack ? (
                                            <span className="text-xs font-bold text-green-400 bg-green-500/20 px-2 py-1 rounded-full">On Track</span>
                                        ) : (
                                            <span className="text-xs font-bold text-red-400 bg-red-500/20 px-2 py-1 rounded-full">Lost</span>
                                        )}
                                        <span className="font-mono text-white">฿{formatCurrency(estimate.potentialBonus.amount)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Deductions Column */}
                            <div className="space-y-4">
                                <h4 className="font-semibold text-white text-lg">Deductions</h4>
                                <div className="flex justify-between">
                                    <span className="text-gray-300">Absences</span>
                                    <span className="font-mono text-red-400">-฿{formatCurrency(estimate.deductions.absences)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-300">Social Security</span>
                                    <span className="font-mono text-red-400">-฿{formatCurrency(estimate.deductions.socialSecurity)}</span>
                                </div>
                                 <div className="flex justify-between">
                                    <span className="text-gray-300">Salary Advances</span>
                                    <span className="font-mono text-red-400">-฿{formatCurrency(estimate.deductions.salaryAdvances)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-300">Loan Repayment</span>
                                    <span className="font-mono text-red-400">-฿{formatCurrency(estimate.deductions.loanRepayment)}</span>
                                </div>
                            </div>
                        </div>
                    </DashboardCard>
                </div>

                {/* Active Loans Card */}
                <div className="space-y-8">
                    <DashboardCard title="Active Loans">
                        {estimate.activeLoans && estimate.activeLoans.length > 0 ? (
                            <div className="space-y-4">
                                {estimate.activeLoans.map((loan, index) => (
                                    <div key={index} className="bg-gray-700/50 p-3 rounded-md">
                                        <p className="font-bold text-white">Loan of ฿{formatCurrency(loan.totalAmount)}</p>
                                        <p className="text-sm text-gray-400">Next payment: <span className="text-amber-400">฿{formatCurrency(loan.recurringPayment)}</span></p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-400 text-center py-4">You have no active loans.</p>
                        )}
                    </DashboardCard>
                </div>
            </div>
        );
    };

    return (
        <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Financials Dashboard</h2>
            {renderContent()}
        </div>
    );
}