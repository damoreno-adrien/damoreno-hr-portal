import React, { useState } from 'react';
import { Eye, EyeOff, Calendar } from 'lucide-react'; // Import EyeOff
import * as dateUtils from '../../utils/dateUtils';

const formatCurrency = (num) => num != null ? num.toLocaleString('en-US') : '0';
const censor = '*,***';

const StatusBadge = ({ status }) => {
    const styles = {
        pending: "bg-yellow-500/20 text-yellow-300",
        approved: "bg-green-500/20 text-green-300",
        rejected: "bg-red-500/20 text-red-300",
        paid: "bg-blue-500/20 text-blue-300",
    };
    return (
        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${styles[status] || 'bg-gray-700 text-gray-400'}`}>
            {status}
        </span>
    );
};

export const SideCards = ({ payEstimate, isLoading, onViewLatestPayslip }) => {
    // --- NEW: Independent Visibility State (Default False) ---
    const [showAdvances, setShowAdvances] = useState(false);
    const [showLoans, setShowLoans] = useState(false);
    // --------------------------------------------------------

    const latestPayslip = payEstimate?.latestPayslip;
    const advances = payEstimate?.monthAdvances || [];
    const legacyAdvance = payEstimate?.currentAdvance; 
    const finalAdvancesList = advances.length > 0 ? advances : (legacyAdvance ? [legacyAdvance] : []);
    const activeLoans = payEstimate?.activeLoans || [];

    return (
        <div className="space-y-6">
            {/* Latest Payslip Card */}
            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700">
                <h3 className="text-white font-semibold mb-3 text-sm">Latest Payslip</h3>
                {latestPayslip ? (
                    <div onClick={onViewLatestPayslip} className="bg-gray-700/50 p-3 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors group">
                        <div className="flex justify-between items-center mb-1">
                            <p className="text-gray-300 text-xs font-medium uppercase tracking-wide">
                                {dateUtils.formatCustom(new Date(latestPayslip.payPeriodYear, latestPayslip.payPeriodMonth - 1), 'MMMM yyyy')}
                            </p>
                            <Eye className="h-4 w-4 text-gray-500 group-hover:text-white transition-colors" />
                        </div>
                        {/* Payslip amount is typically hidden unless clicked, or you can add a specific toggle here too */}
                        <p className="text-xl font-bold text-green-400">฿{formatCurrency(latestPayslip.netPay)}</p>
                    </div>
                ) : (
                    <p className="text-gray-500 text-xs text-center py-4">No payslip history found.</p>
                )}
            </div>

            {/* Salary Advance Card */}
            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-white font-semibold text-sm">Current Salary Advances</h3>
                    
                    {/* --- NEW: Toggle Button --- */}
                    <button onClick={() => setShowAdvances(!showAdvances)} className="text-gray-400 hover:text-white">
                        {showAdvances ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    {/* -------------------------- */}
                </div>
                
                {finalAdvancesList.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {finalAdvancesList.map((adv, index) => (
                            <div key={index} className="bg-gray-700/50 p-3 rounded-lg flex justify-between items-center">
                                <div>
                                    {/* --- NEW: Apply Censor --- */}
                                    <p className="text-sm font-bold text-white">
                                        ฿{showAdvances ? formatCurrency(adv.amount) : censor}
                                    </p>
                                    {/* ------------------------- */}
                                    <p className="text-xs text-gray-400 mt-0.5">{adv.date}</p>
                                </div>
                                <StatusBadge status={adv.status} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500 text-xs text-center py-4">No active advances this month.</p>
                )}
            </div>

            {/* Active Loans Card */}
            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-white font-semibold text-sm">Active Loans</h3>
                    
                    {/* --- NEW: Toggle Button --- */}
                    <button onClick={() => setShowLoans(!showLoans)} className="text-gray-400 hover:text-white">
                        {showLoans ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    {/* -------------------------- */}
                </div>

                {activeLoans.length > 0 ? (
                    <div className="space-y-2">
                        {activeLoans.map((loan, index) => (
                            <div key={index} className="bg-gray-700/50 p-3 rounded-lg">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-gray-300 font-medium">{loan.loanName}</span>
                                    {/* --- NEW: Apply Censor --- */}
                                    <span className="text-xs font-bold text-white">
                                        ฿{showLoans ? formatCurrency(loan.remainingBalance) : censor}
                                    </span>
                                    {/* ------------------------- */}
                                </div>
                                <div className="w-full bg-gray-600 rounded-full h-1.5 mt-2">
                                    <div 
                                        className="bg-blue-500 h-1.5 rounded-full" 
                                        style={{ width: `${Math.min(100, ((loan.totalAmount - loan.remainingBalance) / loan.totalAmount) * 100)}%` }}
                                    ></div>
                                </div>
                                {/* --- NEW: Apply Censor to Repayment --- */}
                                <p className="text-[10px] text-gray-400 mt-1 text-right">
                                    Repayment: ฿{showLoans ? formatCurrency(loan.monthlyRepayment) : censor}/mo
                                </p>
                                {/* -------------------------------------- */}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500 text-xs text-center py-4">You have no active loans.</p>
                )}
            </div>
        </div>
    );
};