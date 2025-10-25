import React from 'react';

const formatCurrency = (num) => num != null ? num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const censor = '*,***.**'; // Consider making censor length dynamic based on number length

export const PayEstimateCard = ({ payEstimate, isLoading }) => { // Renamed prop back to payEstimate for clarity

    // Use a loading state consistent with SideCards
    if (isLoading) {
        return (
            <div className="bg-gray-800 p-6 rounded-xl text-center border border-gray-700">
                <p className="text-gray-400">Loading current pay estimate...</p>
            </div>
        );
    }

    // Handle case where estimate finished loading but is null/undefined
    if (!payEstimate) {
        return (
             <div className="bg-gray-800 p-6 rounded-xl text-center border border-gray-700">
                 <p className="text-gray-400">Could not load pay estimate data.</p>
             </div>
         );
    }

    // Default visibility to true if not provided
    const isVisible = true; // Assuming visibility toggle is handled elsewhere or default is visible

    return (
        <>
            <div className="text-center border-b border-gray-700 pb-6 mb-6">
                <p className="text-gray-400 text-sm">Estimated Net Pay To Date</p>
                <p className="text-4xl lg:text-5xl font-bold text-amber-400 mt-2">
                    {/* Use optional chaining for safety */}
                    {isVisible ? `฿${formatCurrency(payEstimate?.estimatedNetPay)}` : `฿${censor}`}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                {/* Earnings Column */}
                <div className="space-y-4">
                    <h4 className="font-semibold text-white text-lg">Earnings</h4>
                    <div className="flex justify-between">
                        <span className="text-gray-300">Base Salary Earned</span>
                        {/* Use optional chaining */}
                        <span className="font-mono text-white">{isVisible ? `฿${formatCurrency(payEstimate?.baseSalaryEarned)}` : `฿${censor}`}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-300">Potential Bonus</span>
                        <div className="flex items-center gap-2">
                            {/* Use optional chaining */}
                            {payEstimate?.potentialBonus?.onTrack ? (
                                <span className="text-xs font-bold text-green-400 bg-green-500/20 px-2 py-1 rounded-full">On Track</span>
                            ) : (
                                <span className="text-xs font-bold text-red-400 bg-red-500/20 px-2 py-1 rounded-full">Lost</span>
                            )}
                            {/* Use optional chaining */}
                            <span className="font-mono text-white">{isVisible ? `฿${formatCurrency(payEstimate?.potentialBonus?.amount)}` : `฿${censor}`}</span>
                        </div>
                    </div>
                </div>

                {/* Deductions Column */}
                <div className="space-y-4">
                    <h4 className="font-semibold text-white text-lg">Deductions</h4>
                    <div className="flex justify-between">
                        <span className="text-gray-300">Absences</span>
                        {/* Use optional chaining */}
                        <span className="font-mono text-red-400">{isVisible ? `-฿${formatCurrency(payEstimate?.deductions?.absences)}` : `-฿${censor}`}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-300">Social Security</span>
                        {/* Use optional chaining */}
                        <span className="font-mono text-red-400">{isVisible ? `-฿${formatCurrency(payEstimate?.deductions?.socialSecurity)}` : `-฿${censor}`}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-gray-300">Salary Advances</span>
                        {/* Use optional chaining - THIS IS LIKELY THE SOURCE OF THE ORIGINAL ERROR */}
                        <span className="font-mono text-red-400">{isVisible ? `-฿${formatCurrency(payEstimate?.deductions?.salaryAdvances)}` : `-฿${censor}`}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-300">Loan Repayment</span>
                        {/* Use optional chaining */}
                        <span className="font-mono text-red-400">{isVisible ? `-฿${formatCurrency(payEstimate?.deductions?.loanRepayment)}` : `-฿${censor}`}</span>
                    </div>
                </div>
            </div>
        </>
    );
};