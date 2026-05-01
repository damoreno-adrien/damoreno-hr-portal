/* src/components/Payroll/PayrollHistory.jsx */

import React, { useState, useMemo, useEffect } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../../firebase.js"
import usePayrollHistory from '../../hooks/usePayrollHistory';
import { Trash2, ChevronDown, ChevronUp, History, Loader2 } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils.js';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

import BulkPayslipGenerator from './BulkPayslipGenerator.jsx';
import ConfirmModal from '../common/ConfirmModal';
import FeedbackModal from '../common/FeedbackModal';

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

export default function PayrollHistory({ db, activeBranch, userRole, staffList, branches = [], onViewHistoryDetails }) {
    const [expandedMonth, setExpandedMonth] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // --- STATES POUR LES MODALES ---
    const [feedbackModal, setFeedbackModal] = useState(null);
    const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });

    // --- COUCHE DE SÉCURITÉ : Récupération des succursales autorisées ---
    const [adminBranchIds, setAdminBranchIds] = useState([]);

    useEffect(() => {
        const uid = getAuth().currentUser?.uid;
        if (userRole === 'admin' && uid && db) {
            getDoc(doc(db, 'users', uid)).then(snap => {
                if (snap.exists()) setAdminBranchIds(snap.data().branchIds || []);
            }).catch(err => console.error("History security error:", err));
        }
    }, [db, userRole]);

    // Appel au hook avec les nouveaux paramètres de filtrage
    const { history, isLoadingHistory } = usePayrollHistory(db, activeBranch, userRole, adminBranchIds);

    const toggleMonth = (monthId) => {
        setExpandedMonth(expandedMonth === monthId ? null : monthId);
    };

    const handleDeleteRun = async (run) => {
        // --- MODIFIÉ : Remplacement de window.confirm() ---
        setConfirmState({
            isOpen: true,
            title: "Delete Payroll Run",
            message: `CRITICAL: You are about to delete ALL payslips for ${run.monthName} ${run.year}. This cannot be undone. Proceed?`,
            isDestructive: true,
            confirmText: "Delete Everything",
            onConfirm: async () => {
                setConfirmState({ isOpen: false });
                setIsDeleting(true);
                try {
                    const result = await deletePayrollRun({ 
                        year: run.year, 
                        month: run.month,
                        branchId: (activeBranch && activeBranch !== 'global') ? activeBranch : null
                    });
                    
                    if (result.data.success) {
                        setFeedbackModal({ type: 'success', title: 'Deleted', message: "Payroll run deleted successfully." });
                    } else {
                        throw new Error(result.data.message || "Deletion failed");
                    }
                } catch (error) {
                    console.error("Error deleting payroll run:", error);
                    setFeedbackModal({ type: 'error', title: 'Error', message: "Failed to delete payroll run: " + error.message });
                } finally {
                    setIsDeleting(false);
                }
            },
            onCancel: () => setConfirmState({ isOpen: false })
        });
    };

    return (
        <section className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden relative">
            {/* INJECTION DES MODALES */}
            <FeedbackModal 
                isOpen={!!feedbackModal} 
                type={feedbackModal?.type} 
                title={feedbackModal?.title} 
                message={feedbackModal?.message} 
                onClose={() => setFeedbackModal(null)} 
            />
            <ConfirmModal 
                isOpen={confirmState.isOpen}
                title={confirmState.title}
                message={confirmState.message}
                onConfirm={confirmState.onConfirm}
                onCancel={confirmState.onCancel}
                isDestructive={confirmState.isDestructive}
                confirmText={confirmState.confirmText || "Confirm"}
            />

            <div className="p-6 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <History className="text-indigo-400 w-6 h-6" />
                    <h2 className="text-xl font-bold text-white">Payroll History</h2>
                </div>
                {history.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Global PDF:</span>
                        <BulkPayslipGenerator history={history} />
                    </div>
                )}
            </div>

            <div className="p-4 space-y-4">
                {isLoadingHistory ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
                ) : history.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 italic">No finalized payroll records found.</div>
                ) : (
                    history.map((run) => {
                        const isExpanded = expandedMonth === run.id;
                        return (
                            <div key={run.id} className="border border-gray-700 rounded-lg overflow-hidden bg-gray-900/30">
                                <div 
                                    className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-700/50 transition-colors"
                                    onClick={() => toggleMonth(run.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                                        <div>
                                            <h3 className="text-lg font-bold text-white">{run.monthName} {run.year}</h3>
                                            <p className="text-xs text-gray-400">{run.payslips.length} payslips issued</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-amber-400">{formatCurrency(run.totalAmount)} THB</p>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Total Net Pay</p>
                                        </div>
                                        {userRole === 'super_admin' && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDeleteRun(run); }}
                                                className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                disabled={isDeleting}
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-gray-700 bg-gray-800/50 animate-fadeIn">
                                        <table className="w-full text-left">
                                            <thead className="bg-gray-900/50 text-[10px] uppercase font-bold text-gray-400">
                                                <tr>
                                                    <th className="px-4 py-2">Staff Member</th>
                                                    <th className="px-4 py-2">Net Pay</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-700/50">
                                                {run.payslips.map(p => {
                                                    const staffMember = staffList.find(s => s.id === p.staffId);
                                                    const job = getCurrentJob(staffMember);
                                                    let displayName = p.staffName || 'Unknown';
                                                    
                                                    if (activeBranch === 'global' && staffMember?.branchId) {
                                                        const bName = branches.find(b => b.id === staffMember.branchId)?.name || staffMember.branchId;
                                                        displayName += ` (${bName.replace('Da Moreno ', '')})`;
                                                    }

                                                    return (
                                                        <tr
                                                            key={p.id}
                                                            onClick={() => onViewHistoryDetails(p, run)}
                                                            className="hover:bg-gray-700 cursor-pointer transition-colors"
                                                        >
                                                            <td className="px-4 py-2 text-sm text-white">
                                                                <div>{displayName}</div>
                                                                <div className="text-[10px] text-gray-500">{job.department}</div>
                                                            </td>
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