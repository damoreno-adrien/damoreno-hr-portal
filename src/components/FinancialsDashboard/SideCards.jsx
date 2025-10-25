import React, { useState } from 'react'; // *** Corrected: useState added ***
import { FinancialCard } from './FinancialCard';
import * as dateUtils from '../../utils/dateUtils'; // Import date utils

const formatCurrency = (num) => num != null ? num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const censor = '*,***.**';

// Use date-fns for formatting month/year
const formatMonthYear = (payslip) => {
    if (!payslip || !payslip.payPeriodYear || !payslip.payPeriodMonth) return "Invalid Date";
    // Create a date assuming year and month (month is 1-based)
    const date = dateUtils.parseISODateString(`${payslip.payPeriodYear}-${String(payslip.payPeriodMonth).padStart(2, '0')}-01`);
    if (!date) return "Invalid Date";
    return dateUtils.formatCustom(date, 'MMMM yyyy'); // Format as "October 2025"
};

const StatusBadge = ({ status }) => {
    // ... (StatusBadge component remains the same) ...
    const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full capitalize";
    const statusMap = {
        pending: "bg-yellow-500/20 text-yellow-300",
        approved: "bg-green-500/20 text-green-300",
        rejected: "bg-red-500/20 text-red-300",
    };
    return <span className={`${baseClasses} ${statusMap[status] || 'bg-gray-500/20 text-gray-300'}`}>{status}</span>;
};


// Manage visibility state internally or receive as props if controlled externally
export const SideCards = ({ payEstimate, isLoading, onViewLatestPayslip }) => { // Renamed onSelectPayslip to onViewLatestPayslip to match prop name used in parent

    // Internal state for visibility toggles
    const [visibility, setVisibility] = useState({
        latestPayslip: false,
        salaryAdvance: false,
        activeLoans: false,
    });

    const handleToggleVisibility = (card) => {
        setVisibility(prev => ({ ...prev, [card]: !prev[card] }));
    };

    // Handle loading state
    if (isLoading) {
        return (
            <div className="space-y-8">
                <FinancialCard title="Latest Payslip"><p className="text-gray-400 text-center py-4">Loading...</p></FinancialCard>
                <FinancialCard title="Current Salary Advance"><p className="text-gray-400 text-center py-4">Loading...</p></FinancialCard>
                <FinancialCard title="Active Loans"><p className="text-gray-400 text-center py-4">Loading...</p></FinancialCard>
            </div>
        );
    }

    // Handle state after loading finishes but data might be missing/null
    if (!payEstimate) {
         return (
             <div className="space-y-8">
                <FinancialCard title="Latest Payslip"><p className="text-gray-400 text-center py-4">Data unavailable.</p></FinancialCard>
                <FinancialCard title="Current Salary Advance"><p className="text-gray-400 text-center py-4">Data unavailable.</p></FinancialCard>
                <FinancialCard title="Active Loans"><p className="text-gray-400 text-center py-4">Data unavailable.</p></FinancialCard>
            </div>
         );
    }

    return (
        <div className="space-y-8">
            {/* Latest Payslip Card */}
            {/* Check if latestPayslip exists before rendering */}
            {payEstimate?.latestPayslip ? (
                <FinancialCard
                    title="Latest Payslip"
                    isVisible={visibility.latestPayslip}
                    onToggle={() => handleToggleVisibility('latestPayslip')}
                    // Ensure onViewLatestPayslip is only called if it's a function
                    onClick={typeof onViewLatestPayslip === 'function' ? onViewLatestPayslip : undefined}
                >
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-gray-400 text-sm">{formatMonthYear(payEstimate.latestPayslip)}</p>
                            {/* Use optional chaining */}
                            <p className="text-xl font-bold text-amber-400">{visibility.latestPayslip ? `฿${formatCurrency(payEstimate.latestPayslip?.netPay)}` : `฿${censor}`}</p>
                        </div>
                        {/* Only show View Details if handler exists */}
                        {typeof onViewLatestPayslip === 'function' && (
                             <div className="text-blue-400 text-xs font-semibold cursor-pointer">VIEW DETAILS</div>
                        )}
                    </div>
                </FinancialCard>
            ) : (
                 <FinancialCard title="Latest Payslip">
                      <p className="text-gray-400 text-center py-4">No payslip history found.</p>
                 </FinancialCard>
            )}


            {/* Current Salary Advance Card */}
            <FinancialCard
                title="Current Salary Advance"
                isVisible={visibility.salaryAdvance}
                onToggle={() => handleToggleVisibility('salaryAdvance')}
            >
                {/* Check if currentAdvance exists */}
                {payEstimate?.currentAdvance ? (
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-gray-400 text-sm">Amount</p>
                            {/* Use optional chaining */}
                            <p className="text-xl font-bold text-amber-400">{visibility.salaryAdvance ? `฿${formatCurrency(payEstimate.currentAdvance?.amount)}` : `฿${censor}`}</p>
                        </div>
                        {/* Use optional chaining */}
                        <StatusBadge status={payEstimate.currentAdvance?.status} />
                    </div>
                ) : (
                    <p className="text-gray-400 text-center py-4">No active advance this month.</p>
                )}
            </FinancialCard>

            {/* Active Loans Card */}
            <FinancialCard
                title="Active Loans"
                isVisible={visibility.activeLoans}
                onToggle={() => handleToggleVisibility('activeLoans')}
            >
                {/* Check if activeLoans exists and has items */}
                {payEstimate?.activeLoans && payEstimate.activeLoans.length > 0 ? (
                    <div className="space-y-4">
                        {payEstimate.activeLoans.map((loan, index) => (
                            <div key={loan.id || index} className="bg-gray-700/50 p-3 rounded-md">
                                {/* Use optional chaining */}
                                <p className="font-bold text-white">{visibility.activeLoans ? `Loan of ฿${formatCurrency(loan?.totalAmount)}` : `Loan of ฿${censor}`}</p>
                                <p className="text-sm text-gray-400">Next payment: <span className="text-amber-400">{visibility.activeLoans ? `฿${formatCurrency(loan?.monthlyRepayment || loan?.recurringPayment)}` : `฿${censor}`}</span></p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-400 text-center py-4">You have no active loans.</p>
                )}
            </FinancialCard>
        </div>
    );
};