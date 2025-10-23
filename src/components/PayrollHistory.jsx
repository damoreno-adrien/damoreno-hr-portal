import React, { useState } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import usePayrollHistory from '../hooks/usePayrollHistory';
import { TrashIcon } from './Icons';
import * as dateUtils from '../utils/dateUtils'; // Use new standard

const formatCurrency = (num) => num ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

// Use standard date utils for safe sorting
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

// --- NEW: Accept onViewHistoryDetails prop ---
export default function PayrollHistory({ db, staffList, onViewHistoryDetails }) {
    const { history, isLoadingHistory } = usePayrollHistory(db);
    const [expandedRunId, setExpandedRunId] = useState(null);
    const [isDeleting, setIsDeleting] = useState(null);

    const handleToggleExpand = (runId) => {
        setExpandedRunId(prevId => (prevId === runId ? null : runId));
    };

    const handleDeletePayrollRun = async (run) => {
        if (!window.confirm(`Are you sure you want to delete the entire payroll for ${run.monthName} ${run.year}? This action cannot be undone.`)) {
            return;
        }

        setIsDeleting(run.id);
        try {
            const functions = getFunctions();
            const deletePayrollRun = httpsCallable(functions, 'deletePayrollRun');
            const result = await deletePayrollRun({ payPeriod: { year: run.year, month: run.month } });
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
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Finalized Payroll History</h2>
            <div className="space-y-4">
                {isLoadingHistory ? (
                    <p className="text-center text-gray-500">Loading history...</p>
                ) : history.length === 0 ? (
                    <p className="text-center text-gray-500">No finalized payrolls found.</p>
                ) : (
                    history.map(run => (
                        <div key={run.id} className="bg-gray-800 rounded-lg shadow-lg">
                            <div className="p-4 flex justify-between items-center">
                                <div onClick={() => handleToggleExpand(run.id)} className="flex-grow cursor-pointer hover:bg-gray-700/50 -m-4 p-4 rounded-l-lg">
                                    <p className="font-bold text-lg text-white">{run.monthName} {run.year}</p>
                                    <p className="text-sm text-gray-400">{run.payslips.length} employees paid • Total: {formatCurrency(run.totalAmount)} THB</p>
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
                                            <TrashIcon className="h-5 w-5" />
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
                                            {run.payslips.sort((a,b) => a.name.localeCompare(b.name)).map(p => {
                                                const staffMember = staffList.find(s => s.id === p.staffId);
                                                const displayName = staffMember ? `${staffMember.nickname || staffMember.firstName} (${getCurrentJob(staffMember).department || 'N/A'})` : p.name;
                                                return (
                                                    // --- NEW: Added onClick handler and styling to the table row ---
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
                    ))
                )}
            </div>
        </section>
    );
}