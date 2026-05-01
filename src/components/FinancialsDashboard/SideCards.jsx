/* src/components/FinancialsDashboard/SideCards.jsx */
import React, { useState } from 'react';
import { Eye, EyeOff, Plus } from 'lucide-react'; // Ajout de Plus
import * as dateUtils from '../../utils/dateUtils';

const formatCurrency = (num) => num != null ? num.toLocaleString('en-US') : '0';
const censor = '*,***';

const StatusBadge = ({ status }) => {
    const styles = {
        pending: "bg-yellow-500/20 text-yellow-300",
        approved: "bg-green-500/20 text-green-300",
        rejected: "bg-red-500/20 text-red-300",
        paid: "bg-blue-500/20 text-blue-300",
        active: "bg-emerald-500/20 text-emerald-300",
    };
    return (
        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${styles[status] || 'bg-gray-700 text-gray-400'}`}>
            {status || 'active'} {/* Fallback d'affichage pour les anciens prêts */}
        </span>
    );
};

export const SideCards = ({ payEstimate, isLoading, onViewLatestPayslip, loans, onOpenLoanModal }) => {
    const [showAdvances, setShowAdvances] = useState(false);
    const [showLoans, setShowLoans] = useState(false);

    const latestPayslip = payEstimate?.latestPayslip;
    const advances = payEstimate?.monthAdvances || [];
    const legacyAdvance = payEstimate?.currentAdvance; 
    const finalAdvancesList = advances.length > 0 ? advances : (legacyAdvance ? [legacyAdvance] : []);
    
    // On ne montre que les prêts pertinents : en attente, approuvés, ou actifs (retrocompatibilité)
    const displayLoans = loans?.filter(l => l.status === 'pending' || l.status === 'approved' || l.status === 'active' || (l.status === undefined && l.isActive === true)) || [];

    return (
        <div className="space-y-6">
            {/* LATEST PAYSLIP (inchangé) */}
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
                        <p className="text-xl font-bold text-green-400">฿{formatCurrency(latestPayslip.netPay)}</p>
                    </div>
                ) : (
                    <p className="text-gray-500 text-xs text-center py-4">No payslip history found.</p>
                )}
            </div>

            {/* SALARY ADVANCES (inchangé) */}
            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-white font-semibold text-sm">Current Salary Advances</h3>
                    <button onClick={() => setShowAdvances(!showAdvances)} className="text-gray-400 hover:text-white">
                        {showAdvances ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
                {finalAdvancesList.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {finalAdvancesList.map((adv, index) => (
                            <div key={index} className="bg-gray-700/50 p-3 rounded-lg flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-bold text-white">฿{showAdvances ? formatCurrency(adv.amount) : censor}</p>
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

            {/* ACTIVE & PENDING LOANS */}
            <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-white font-semibold text-sm flex items-center">
                        My Loans
                        <button onClick={onOpenLoanModal} className="ml-3 text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded text-[10px] uppercase font-bold flex items-center transition-colors">
                            <Plus className="w-3 h-3 mr-1"/> Request
                        </button>
                    </h3>
                    <button onClick={() => setShowLoans(!showLoans)} className="text-gray-400 hover:text-white">
                        {showLoans ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>

                {displayLoans.length > 0 ? (
                    <div className="space-y-2">
                        {displayLoans.map((loan, index) => {
                            const isPending = loan.status === 'pending';
                            return (
                                <div key={index} className="bg-gray-700/50 p-3 rounded-lg border border-gray-600/50">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs text-gray-300 font-medium truncate max-w-[120px]">{loan.loanName}</span>
                                        <span className="text-xs font-bold text-white">฿{showLoans ? formatCurrency(loan.remainingBalance || loan.totalAmount) : censor}</span>
                                    </div>
                                    
                                    {isPending ? (
                                        <div className="mt-2 text-right">
                                            <StatusBadge status="pending" />
                                        </div>
                                    ) : (
                                        <>
                                            <div className="w-full bg-gray-600 rounded-full h-1.5 mt-2">
                                                <div 
                                                    className="bg-blue-500 h-1.5 rounded-full" 
                                                    style={{ width: `${Math.min(100, ((loan.totalAmount - loan.remainingBalance) / loan.totalAmount) * 100)}%` }}
                                                ></div>
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1 text-right">
                                                Repayment: ฿{showLoans ? formatCurrency(loan.monthlyRepayment) : censor}/mo
                                            </p>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-gray-500 text-xs text-center py-4">You have no active or pending loans.</p>
                )}
            </div>
        </div>
    );
};