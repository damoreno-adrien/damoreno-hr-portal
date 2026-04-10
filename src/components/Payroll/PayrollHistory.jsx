/* src/components/Payroll/PayrollHistory.jsx */

import React, { useState, useMemo } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../../firebase.js" 
import usePayrollHistory from '../../hooks/usePayrollHistory';
import { Trash2 } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils.js'; 

import BulkPayslipGenerator from './BulkPayslipGenerator';

const functions = getFunctions(app, "asia-southeast1"); 
const deletePayrollRun = httpsCallable(functions, 'deletePayrollRun');

const formatCurrency = (num) => num ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

const getCurrentJob = (staff) => {
    if (!staff?.jobHistory || staff.jobHistory.length === 0) {
        return { department: 'N/A' };
    }
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB;
    })[0];
};

// --- ADDED: userRole and adminBranchIds ---
export default function PayrollHistory({ db, staffList, companyConfig, onViewHistoryDetails, activeBranch, userRole, adminBranchIds = [] }) {
    const { history, isLoadingHistory } = usePayrollHistory(db);
    const [expandedRunId, setExpandedRunId] = useState(null);
    const [isDeleting, setIsDeleting] = useState(null);
    const [isBulkGeneratorOpen, setIsBulkGeneratorOpen] = useState(false);

    // --- THE FILTER LAYER: Enforce "All My Branches" Security ---
    const filteredHistory = useMemo(() => {
        if (!history) return [];

        return history.map(run => {
            const branchPayslips = run.payslips.filter(p => {
                if (activeBranch === 'global') {
                    if (userRole === 'admin') {
                        const staffMember = staffList.find(s => s.id === p.staffId);
                        return staffMember && adminBranchIds.includes(staffMember.branchId);
                    }
                    return true; // Super admin sees all
                }
                const staffMember = staffList.find(s => s.id === p.staffId);
                return staffMember?.branchId === activeBranch;
            });

            const branchTotal = branchPayslips.reduce((sum, p) => sum + (Number(p.netPay) || 0), 0);

            return {
                ...run,
                payslips: branchPayslips,
                displayTotal: branchTotal
            };
        }).filter(run => run.payslips.length > 0); 
    }, [history, activeBranch, staffList, userRole, adminBranchIds]);

    const handleToggleExpand = (runId) => {
        setExpandedRunId(prevId => (prevId === runId ? null : runId));
    };

    const handleDeletePayrollRun = async (run) => {
        const bName = run.branchId ? (companyConfig?.branches?.find(b => b.id === run.branchId)?.name || run.branchId) : 'Global';
        if (!window.confirm(`Are you sure you want to delete the entire payroll for ${run.monthName} ${run.year} (${bName})? This action cannot be undone.`)) {
            return;
        }

        setIsDeleting(run.id);
        try {
            const result = await deletePayrollRun({ 
                payPeriod: { year: run.year, month: run.month },
                branchId: run.branchId 
            });
            alert(result.data.result);
        } catch (error) {
            console.error("Error deleting payroll run:", error);
            alert(`Failed to delete payroll run: ${error.message}`);
        } finally {
            setIsDeleting(null);
        }
    };

    return (
        <section>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 gap-4">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Finalized Payroll History</h2>
                <button 
                    onClick={() => setIsBulkGeneratorOpen(true)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-sm shadow-lg transition-colors flex-shrink-0"
                >
                    + Emergency Bulk Creator
                </button>
            </div>

            <BulkPayslipGenerator 
                isOpen={isBulkGeneratorOpen} 
                onClose={() => setIsBulkGeneratorOpen(false)} 
                staffList={staffList} 
                companyConfig={companyConfig} 
                activeBranch={activeBranch} 
            />

            <div className="space-y-4">
                {isLoadingHistory ? (
                    <p className="text-center text-gray-500">Loading history...</p>
                ) : filteredHistory.length === 0 ? (
                    <p className="text-center text-gray-500">No finalized payrolls found for this location.</p>
                ) : (
                    filteredHistory.map(run => {
                        const runBranchName = run.branchId ? (companyConfig?.branches?.find(b => b.id === run.branchId)?.name || run.branchId) : null;

                        return (
                            <div key={run.id} className="bg-gray-800 rounded-lg shadow-lg">
                                <div className="p-4 flex justify-between items-center">
                                    <div onClick={() => handleToggleExpand(run.id)} className="flex-grow cursor-pointer hover:bg-gray-700/50 -m-4 p-4 rounded-l-lg">
                                        <p className="font-bold text-lg text-white flex items-center gap-2">
                                            {run.monthName} {run.year}
                                            {runBranchName && activeBranch === 'global' && (
                                                <span className="text-xs font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 uppercase tracking-wider">
                                                    {runBranchName.replace('Da Moreno ', '')}
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-sm text-gray-400 mt-1">{run.payslips.length} employees paid • Total: {formatCurrency(run.displayTotal)} THB</p>
                                    </div>
                                    <div className="flex-shrink-0 ml-4">
                                        {isDeleting === run.id ? (
                                            <div className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeletePayrollRun(run); }}
                                                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors"
                                                title="Delete this payroll run"
                                            >
                                                <Trash2 className="h-5 w-5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {expandedRunId === run.id && (
                                    <div className="p-4 border-t border-gray-700">
                                        <table className="min-w-full">
                                            <thead className="bg-gray-700/50">
                                                <tr>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Staff</th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Net Pay</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-700">
                                                {run.payslips.sort((a,b) => (a.staffName || '').localeCompare(b.staffName || '')).map(p => {
                                                    const staffMember = staffList.find(s => s.id === p.staffId);
                                                    let displayName = staffMember ? `${staffMember.nickname || staffMember.firstName} (${getCurrentJob(staffMember).department || 'N/A'})` : p.name;
                                                    
                                                    if (activeBranch === 'global' && staffMember?.branchId) {
                                                        const bName = companyConfig?.branches?.find(b => b.id === staffMember.branchId)?.name || staffMember.branchId;
                                                        displayName += ` (${bName.replace('Da Moreno ', '')})`;
                                                    }

                                                    return (
                                                        <tr
                                                            key={p.id}
                                                            onClick={() => onViewHistoryDetails(p, run)}
                                                            className="hover:bg-gray-700 cursor-pointer"
                                                        >
                                                            <td className="px-4 py-2 text-sm text-white">{displayName}</td>
                                                            <td className="px-4 py-2 text-sm text-amber-400 font-semibold">{formatCurrency(p.netPay)} THB</td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
}