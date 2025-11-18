// src/components/FinancialsDashboard/PayEstimateCard.jsx
import React from 'react';

const formatCurrency = (num) => num != null ? num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const censor = '*,***.**';

export const PayEstimateCard = ({ payEstimate, isLoading }) => { 

    if (isLoading) {
        return (
            <div className="bg-gray-800 p-6 rounded-xl text-center border border-gray-700">
                <p className="text-gray-400">Loading current pay estimate...</p>
            </div>
        );
    }

    if (!payEstimate) {
        return (
             <div className="bg-gray-800 p-6 rounded-xl text-center border border-gray-700">
                 <p className="text-gray-400">Could not load pay estimate data.</p>
             </div>
         );
    }

    const isVisible = true;
    // --- FIX: Check if eligible (if amount is 0 and not on track, likely not eligible or lost) ---
    // A better check is if we pass 'isEligible' from backend, but currently if it's 0, hiding it is safer 
    // than showing "Lost 0.00" for someone who never had a chance.
    const showBonusRow = payEstimate.potentialBonus?.amount > 0 || payEstimate.potentialBonus?.onTrack; 
    // -------------------------------------------------------------------------------------------

    return (
        <>
            <div className="text-center border-b border-gray-700 pb-6 mb-6">
                <p className="text-gray-400 text-sm">Estimated Net Pay To Date</p>
                <p className="text-4xl lg:text-5xl font-bold text-amber-400 mt-2">
                    {isVisible ? `฿${formatCurrency(payEstimate?.estimatedNetPay)}` : `฿${censor}`}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-4">
                    <h4 className="font-semibold text-white text-lg">Earnings</h4>
                    <div className="flex justify-between">
                        <span className="text-gray-300">Base Salary Earned</span>
                        <span className="font-mono text-white">{isVisible ? `฿${formatCurrency(payEstimate?.baseSalaryEarned)}` : `฿${censor}`}</span>
                    </div>
                    
                    {/* --- NEW: Approved Overtime --- */}
                    {payEstimate?.overtimePay > 0 && (
                        <div className="flex justify-between">
                            <span className="text-green-400">Approved Overtime</span>
                            <span className="font-mono text-green-400">{isVisible ? `฿${formatCurrency(payEstimate?.overtimePay)}` : `฿${censor}`}</span>
                        </div>
                    )}
                    {/* ----------------------------- */}

                    {/* --- UPDATED: Hide Bonus Row if not applicable --- */}
                    {showBonusRow && (
                        <div className="flex justify-between items-center">
                            <span className="text-gray-300">Potential Bonus</span>
                            <div className="flex items-center gap-2">
                                {payEstimate?.potentialBonus?.onTrack ? (
                                    <span className="text-xs font-bold text-green-400 bg-green-500/20 px-2 py-1 rounded-full">On Track</span>
                                ) : (
                                    <span className="text-xs font-bold text-red-400 bg-red-500/20 px-2 py-1 rounded-full">Lost</span>
                                )}
                                <span className="font-mono text-white">{isVisible ? `฿${formatCurrency(payEstimate?.potentialBonus?.amount)}` : `฿${censor}`}</span>
                            </div>
                        </div>
                    )}
                    {/* ---------------------------------------------- */}
                </div>

                <div className="space-y-4">
                    <h4 className="font-semibold text-white text-lg">Deductions</h4>
                    <div className="flex justify-between">
                        <span className="text-gray-300">Absences</span>
                        <span className="font-mono text-red-400">{isVisible ? `-฿${formatCurrency(payEstimate?.deductions?.absences)}` : `-฿${censor}`}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-300">Social Security</span>
                        <span className="font-mono text-red-400">{isVisible ? `-฿${formatCurrency(payEstimate?.deductions?.socialSecurity)}` : `-฿${censor}`}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-gray-300">Salary Advances</span>
                        <span className="font-mono text-red-400">{isVisible ? `-฿${formatCurrency(payEstimate?.deductions?.salaryAdvances)}` : `-฿${censor}`}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-300">Loan Repayment</span>
                        <span className="font-mono text-red-400">{isVisible ? `-฿${formatCurrency(payEstimate?.deductions?.loanRepayment)}` : `-฿${censor}`}</span>
                    </div>
                </div>
            </div>
        </>
    );
};