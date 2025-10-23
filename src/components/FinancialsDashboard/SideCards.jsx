import React from 'react';
import { FinancialCard } from './FinancialCard';

const formatCurrency = (num) => num != null ? num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const censor = '*,***.**';

const formatMonthYear = (payslip) => {
    if (!payslip || !payslip.payPeriodYear || !payslip.payPeriodMonth) return "Invalid Date";
    const date = new Date(payslip.payPeriodYear, payslip.payPeriodMonth - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
};

const StatusBadge = ({ status }) => {
    const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full capitalize";
    const statusMap = {
        pending: "bg-yellow-500/20 text-yellow-300",
        approved: "bg-green-500/20 text-green-300",
        rejected: "bg-red-500/20 text-red-300",
    };
    return <span className={`${baseClasses} ${statusMap[status] || 'bg-gray-500/20 text-gray-300'}`}>{status}</span>;
};


export const SideCards = ({ payEstimate, visibility, onToggleVisibility, onSelectPayslip, isLoading }) => {
    
    // 💥 CRITICAL FIX: Early return if data is still loading or not available
    if (isLoading || !payEstimate) {
        return (
            <div className="lg:col-span-1 space-y-8">
                <div className="bg-gray-800 p-6 rounded-xl text-center text-gray-400">
                    Loading Financial Summaries...
                </div>
            </div>
        );
    }
    
    // Rename prop for cleaner use in the component body
    const estimate = payEstimate;

    return (
        <div className="space-y-8">
            {/* Latest Payslip Card */}
            {estimate.latestPayslip && (
                <FinancialCard
                    title="Latest Payslip"
                    isVisible={visibility.latestPayslip}
                    onToggle={() => onToggleVisibility('latestPayslip')}
                    onClick={() => onSelectPayslip(estimate.latestPayslip)}
                >
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-gray-400 text-sm">{formatMonthYear(estimate.latestPayslip)}</p>
                            <p className="text-xl font-bold text-amber-400">{visibility.latestPayslip ? `฿${formatCurrency(estimate.latestPayslip.netPay)}` : `฿${censor}`}</p>
                        </div>
                        <div className="text-blue-400 text-xs font-semibold">VIEW DETAILS</div>
                    </div>
                </FinancialCard>
            )}

            {/* Current Salary Advance Card */}
            <FinancialCard
                title="Current Salary Advance"
                isVisible={visibility.salaryAdvance}
                onToggle={() => onToggleVisibility('salaryAdvance')}
            >
                {estimate.currentAdvance ? (
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-gray-400 text-sm">Amount</p>
                            <p className="text-xl font-bold text-amber-400">{visibility.salaryAdvance ? `฿${formatCurrency(estimate.currentAdvance.amount)}` : `฿${censor}`}</p>
                        </div>
                        <StatusBadge status={estimate.currentAdvance.status} />
                    </div>
                ) : (
                    <p className="text-gray-400 text-center py-4">No active advance this month.</p>
                )}
            </FinancialCard>
            
            {/* Active Loans Card */}
            <FinancialCard
                title="Active Loans"
                isVisible={visibility.activeLoans}
                onToggle={() => onToggleVisibility('activeLoans')}
            >
                {estimate.activeLoans && estimate.activeLoans.length > 0 ? (
                    <div className="space-y-4">
                        {estimate.activeLoans.map((loan, index) => (
                            <div key={index} className="bg-gray-700/50 p-3 rounded-md">
                                <p className="font-bold text-white">{visibility.activeLoans ? `Loan of ฿${formatCurrency(loan.totalAmount)}` : `Loan of ฿${censor}`}</p>
                                <p className="text-sm text-gray-400">Next payment: <span className="text-amber-400">{visibility.activeLoans ? `฿${formatCurrency(loan.recurringPayment)}` : `฿${censor}`}</span></p>
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