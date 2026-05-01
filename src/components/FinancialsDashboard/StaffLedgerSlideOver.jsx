/* src/components/FinancialsDashboard/StaffLedgerSlideOver.jsx */
import React, { useMemo } from 'react';
import { X, Landmark, Receipt, History, AlertCircle } from 'lucide-react';

const formatCurrency = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const StatusBadge = ({ status }) => {
    const statusMap = {
        pending: "bg-yellow-500/20 text-yellow-300",
        approved: "bg-green-500/20 text-green-300",
        rejected: "bg-red-500/20 text-red-300",
        active: "bg-emerald-500/20 text-emerald-300",
        paid_off: "bg-gray-500/20 text-gray-400",
        applied: "bg-indigo-500/20 text-indigo-300",
    };
    return <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full whitespace-nowrap ${statusMap[status] || 'bg-gray-500/20 text-gray-300'}`}>{status}</span>;
};

export default function StaffLedgerSlideOver({ isOpen, onClose, staffId, staffList, globalLoans, globalAdvances, allTransactions }) {
    if (!isOpen || !staffId) return null;

    const staff = staffList.find(s => s.id === staffId);
    if (!staff) return null;

    // Filtrage des données spécifiques à cet employé
    const staffLoans = globalLoans.filter(l => l.staffId === staffId && (l.status === 'active' || l.status === 'pending'));
    const staffAdvances = globalAdvances.filter(a => a.staffId === staffId && (a.status === 'pending' || a.status === 'approved'));
    const staffHistory = allTransactions.filter(tx => tx.staffId === staffId || tx.raw?.staffId === staffId);

    const totalDebt = staffLoans.reduce((sum, l) => sum + Number(l.remainingBalance || 0), 0);
    const totalAdvances = staffAdvances.reduce((sum, a) => sum + Number(a.amount || 0), 0);

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop sombre */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

            {/* Slide-over Panel */}
            <div className="relative w-full max-w-md bg-[#1e2330] h-full shadow-2xl border-l border-gray-700 flex flex-col animate-in slide-in-from-right duration-300">
                
                {/* HEADER */}
                <div className="p-6 border-b border-gray-700 flex justify-between items-start bg-gray-800/50">
                    <div>
                        <h2 className="text-2xl font-bold text-white">{staff.nickname || staff.firstName} {staff.lastName}</h2>
                        <p className="text-gray-400 text-sm mt-1">{staff.jobHistory?.[0]?.position || 'Staff'} • {staff.branchId}</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-gray-800 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* SCROLLABLE BODY */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    
                    {/* DEBT SUMMARY */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                            <div className="flex items-center text-red-400 mb-2"><Landmark className="w-4 h-4 mr-2"/> <span className="text-xs font-bold uppercase">Loan Debt</span></div>
                            <div className="text-2xl font-bold text-white">฿{formatCurrency(totalDebt)}</div>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                            <div className="flex items-center text-amber-400 mb-2"><Receipt className="w-4 h-4 mr-2"/> <span className="text-xs font-bold uppercase">Month Advances</span></div>
                            <div className="text-2xl font-bold text-white">฿{formatCurrency(totalAdvances)}</div>
                        </div>
                    </div>

                    {/* ACTIVE LOANS */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center">
                            <Landmark className="w-4 h-4 mr-2"/> Active & Pending Loans
                        </h3>
                        {staffLoans.length === 0 ? (
                            <p className="text-sm text-gray-500 italic bg-gray-800/50 p-4 rounded-lg text-center">No active loans.</p>
                        ) : (
                            <div className="space-y-3">
                                {staffLoans.map(loan => (
                                    <div key={loan.id} className="bg-gray-800 border border-gray-700 p-4 rounded-lg">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <div className="text-sm font-bold text-white">{loan.loanName}</div>
                                                <div className="text-xs text-gray-400">Repayment: ฿{formatCurrency(loan.monthlyRepayment)}/mo</div>
                                            </div>
                                            <StatusBadge status={loan.status} />
                                        </div>
                                        {loan.status === 'active' && (
                                            <div className="mt-3">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-gray-400">Progress</span>
                                                    <span className="text-emerald-400 font-bold">฿{formatCurrency(loan.totalAmount - loan.remainingBalance)} / ฿{formatCurrency(loan.totalAmount)}</span>
                                                </div>
                                                <div className="w-full bg-gray-700 rounded-full h-1.5">
                                                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, ((loan.totalAmount - loan.remainingBalance) / loan.totalAmount) * 100)}%` }}></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* TRANSACTION HISTORY */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center">
                            <History className="w-4 h-4 mr-2"/> Recent Transactions
                        </h3>
                        {staffHistory.length === 0 ? (
                            <p className="text-sm text-gray-500 italic bg-gray-800/50 p-4 rounded-lg text-center">No recent history.</p>
                        ) : (
                            <div className="space-y-2 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-700 before:to-transparent">
                                {staffHistory.map(tx => (
                                    <div key={`${tx.category}_${tx.id}`} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                        <div className="flex items-center justify-center w-2 h-2 rounded-full border-2 border-indigo-500 bg-gray-900 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 absolute left-4 md:left-1/2 -translate-x-1/2"></div>
                                        <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] ml-10 md:ml-0 bg-gray-800 p-3 rounded border border-gray-700">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-white text-sm">฿{formatCurrency(tx.amount)}</span>
                                                <StatusBadge status={tx.status} />
                                            </div>
                                            <div className="text-xs text-gray-400">{tx.type}</div>
                                            <div className="text-[10px] text-gray-500 mt-1">{tx.date}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}