/* src/components/Financials/TransactionRow.jsx */
import React from 'react';
import { Pencil, Trash2, CheckCircle, XCircle, Banknote } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import * as dateUtils from '../../utils/dateUtils';

export default function TransactionRow({ 
    item, 
    isPending, 
    activeBranch, 
    companyConfig, 
    onApproveAdvance, 
    onApproveLoan, 
    onRejectAdvance, 
    onRejectLoan, 
    onEdit, 
    onDelete,
    onStaffClick,
    onManualPayment
}) {
    let branchBadge = null;
    if (activeBranch === 'global' && item.staff?.branchId) {
        const bName = companyConfig?.branches?.find(b => b.id === item.staff.branchId)?.name || item.staff.branchId;
        branchBadge = (
            <span className="ml-2 text-[9px] uppercase tracking-wider font-bold bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                {bName.replace('Da Moreno ', '')}
            </span>
        );
    }

    const displayDate = item.date ? dateUtils.formatCustom(new Date(item.date), 'dd/MM/yyyy') : '';

    return (
        <tr className="hover:bg-gray-750 cursor-pointer transition-colors" onClick={() => onStaffClick(item.staff?.id)}>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white flex items-center">
                {item.staffName} {branchBadge}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.type}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{displayDate}</td>
            
            <td className="px-6 py-4 whitespace-nowrap text-sm">
                {item.category === 'loan' && item.raw ? (() => {
                    const total = Number(item.amount) || Number(item.raw.amount) || Number(item.raw.loanAmount) || 0;
                    const remaining = Number(item.raw.remainingBalance) || 0;
                    const paid = Math.max(0, total - remaining);
                    const progress = total > 0 ? Math.round((paid / total) * 100) : 0;
                    
                    return (
                        <div className="flex flex-col min-w-[120px]">
                            <div className="flex justify-between items-end mb-1">
                                <span className="font-bold text-amber-400">{remaining.toLocaleString()} <span className="text-[10px] text-gray-500 font-normal">THB left</span></span>
                                <span className="text-[10px] font-bold text-green-500">{progress}%</span>
                            </div>
                            <div className="w-full bg-gray-700/50 h-1.5 rounded-full overflow-hidden border border-gray-600">
                                <div className="bg-green-500 h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                            </div>
                            <div className="text-[9px] text-gray-400 mt-1 text-right font-mono uppercase tracking-wider">
                                Paid: {paid.toLocaleString()} / {total.toLocaleString()}
                            </div>
                        </div>
                    );
                })() : (
                    <span className="font-semibold text-amber-400">{(item.amount||0).toLocaleString()}</span>
                )}
            </td>

            <td className="px-6 py-4 whitespace-nowrap text-sm">
                <StatusBadge status={item.status} />
            </td>

            <td className="px-6 py-4 whitespace-nowrap text-sm text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                {isPending ? (
                    <>
                        <button onClick={(e) => item.category === 'advance' ? onApproveAdvance(e, item.id) : onApproveLoan(e, item.id)} className="p-2 bg-green-600 rounded-full hover:bg-green-500 transition-colors shadow-lg" title="Approve">
                            <CheckCircle className="h-4 w-4 text-white" />
                        </button>
                        <button onClick={(e) => item.category === 'advance' ? onRejectAdvance(e, item.id) : onRejectLoan(e, item.id)} className="p-2 bg-red-600 rounded-full hover:bg-red-500 transition-colors shadow-lg" title="Reject">
                            <XCircle className="h-4 w-4 text-white" />
                        </button>
                    </>
                ) : (
                    <>
                        {item.category === 'loan' && item.status === 'active' && (
                            <button onClick={(e) => onManualPayment(e, item.raw)} className="p-1.5 text-green-400 hover:bg-green-900/30 rounded transition-colors" title="Manual Repayment">
                                <Banknote className="h-4 w-4" />
                            </button>
                        )}
                        <button onClick={(e) => onEdit(e, item.raw, item.category)} className="p-1.5 text-blue-400 hover:bg-blue-900/30 rounded transition-colors">
                            <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={(e) => onDelete(e, item.category === 'advance' ? 'salary_advances' : item.category === 'loan' ? 'loans' : 'monthly_adjustments', item.id)} className="p-1.5 text-red-400 hover:bg-red-900/30 rounded transition-colors">
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </>
                )}
            </td>
        </tr>
    );
}