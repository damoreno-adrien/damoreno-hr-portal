/* src/components/Payroll/PayrollHistory.jsx */

import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../../firebase.js"
import usePayrollHistory from '../../hooks/usePayrollHistory';
import { Trash2, ChevronDown, ChevronUp, History, Loader2, Download } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

import ConfirmModal from '../common/ConfirmModal';
import FeedbackModal from '../common/FeedbackModal';
import SharedPayslipTable from './SharedPayslipTable';

import { generatePayslipsPDF } from '../../utils/pdfExport'; // <-- IMPORT DU GÉNÉRATEUR

const functions = getFunctions(app, "asia-southeast1");
const deletePayrollRun = httpsCallable(functions, 'deletePayrollRun');

const formatCurrency = (num) => num ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

export default function PayrollHistory({ db, activeBranch, userRole, staffList, branches = [], companyConfig, onViewHistoryDetails }) {
    const [expandedMonth, setExpandedMonth] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const [sortConfig, setSortConfig] = useState({ key: 'staffName', direction: 'asc' });
    const [selectedPayslips, setSelectedPayslips] = useState(new Set());

    const [feedbackModal, setFeedbackModal] = useState(null);
    const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });
    const [adminBranchIds, setAdminBranchIds] = useState([]);

    useEffect(() => {
        const uid = getAuth().currentUser?.uid;
        if (userRole === 'admin' && uid && db) {
            getDoc(doc(db, 'users', uid)).then(snap => {
                if (snap.exists()) setAdminBranchIds(snap.data().branchIds || []);
            }).catch(err => console.error("History security error:", err));
        }
    }, [db, userRole]);

    const { history, isLoadingHistory } = usePayrollHistory(db, activeBranch, userRole, adminBranchIds);

    const toggleMonth = (monthId) => {
        if (expandedMonth !== monthId) setSelectedPayslips(new Set());
        setExpandedMonth(expandedMonth === monthId ? null : monthId);
    };

    const handleSort = (key) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const toggleSelectAll = (runId, enrichedPayslips) => {
        if (selectedPayslips.size === enrichedPayslips.length) {
            setSelectedPayslips(new Set());
        } else {
            setSelectedPayslips(new Set(enrichedPayslips.map(p => p.id)));
        }
    };

    const toggleSelectOne = (id) => {
        setSelectedPayslips(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleDeleteRun = async (run) => {
        setConfirmState({
            isOpen: true,
            title: "Delete Payroll Run",
            message: `CRITICAL: You are about to delete ALL payslips for ${run.monthName} ${run.year}. Proceed?`,
            isDestructive: true,
            confirmText: "Delete Everything",
            onConfirm: async () => {
                setConfirmState({ isOpen: false });
                setIsDeleting(true);
                try {
                    const result = await deletePayrollRun({
                        payPeriod: { year: run.year, month: run.month },
                        branchId: (activeBranch && activeBranch !== 'global') ? activeBranch : null
                    });

                    if (result.data.success) {
                        setFeedbackModal({ type: 'success', title: 'Deleted', message: "Payroll run deleted successfully." });
                    } else throw new Error(result.data.message || "Deletion failed");
                } catch (error) {
                    setFeedbackModal({ type: 'error', title: 'Error', message: "Failed to delete: " + error.message });
                } finally { setIsDeleting(false); }
            },
            onCancel: () => setConfirmState({ isOpen: false })
        });
    };

    // --- LE NOUVEL EXPORT PAR LOTS ---
    const handleExportSelectedPDFs = async (run) => {
        const selected = run.payslips.filter(p => selectedPayslips.has(p.id));
        if (selected.length === 0) return;

        setIsExporting(true);
        try {
            await generatePayslipsPDF(
                selected, // Tableau des fiches
                companyConfig,
                { month: run.month, year: run.year },
                staffList,
                activeBranch,
                `Batch_Payslips_${run.monthName}_${run.year}.pdf`
            );
        } catch (error) {
            console.error("Batch PDF Error:", error);
            setFeedbackModal({ type: 'error', title: 'Export Failed', message: error.message });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <section className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden relative">
            <FeedbackModal isOpen={!!feedbackModal} type={feedbackModal?.type} title={feedbackModal?.title} message={feedbackModal?.message} onClose={() => setFeedbackModal(null)} />
            <ConfirmModal isOpen={confirmState.isOpen} title={confirmState.title} message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} isDestructive={confirmState.isDestructive} confirmText={confirmState.confirmText || "Confirm"} />

            <div className="p-6 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <History className="text-indigo-400 w-6 h-6" />
                    <h2 className="text-xl font-bold text-white">Payroll History</h2>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {isLoadingHistory ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
                ) : history.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 italic">No finalized records found.</div>
                ) : (
                    history.map((run) => {
                        const isExpanded = expandedMonth === run.id;

                        const enrichedPayslips = run.payslips.map(p => {
                            const staff = staffList.find(s => s.id === p.staffId);
                            const dName = p.staffName || (staff ? (staff.nickname || staff.firstName || staff.fullName) : 'Unknown');

                            let bNameStr = null;
                            if (activeBranch === 'global' && staff?.branchId) {
                                const bName = companyConfig?.branches?.find(b => b.id === staff.branchId)?.name || staff.branchId;
                                bNameStr = bName ? bName.replace('Da Moreno ', '') : null;
                            }

                            const job = staff?.jobHistory ? [...staff.jobHistory].sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0))[0] : {};

                            return {
                                ...p,
                                staffName: dName,
                                branchName: bNameStr,
                                department: job?.department || 'N/A'
                            };
                        });

                        const sortedPayslips = enrichedPayslips.sort((a, b) => {
                            if (sortConfig.key === 'paymentMethod') {
                                if (a.paymentMethod < b.paymentMethod) return sortConfig.direction === 'asc' ? -1 : 1;
                                if (a.paymentMethod > b.paymentMethod) return sortConfig.direction === 'asc' ? 1 : -1;
                                return a.staffName.localeCompare(b.staffName);
                            }

                            let aVal = a[sortConfig.key];
                            let bVal = b[sortConfig.key];

                            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                            return 0;
                        });

                        return (
                            <div key={run.id} className="border border-gray-700 rounded-lg overflow-hidden bg-gray-900/30">
                                <div className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-700/50 transition-colors" onClick={() => toggleMonth(run.id)}>
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
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteRun(run); }} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all" disabled={isDeleting}><Trash2 className="w-5 h-5" /></button>
                                        )}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-gray-700 bg-gray-800/50 animate-fadeIn overflow-x-auto">
                                        {selectedPayslips.size > 0 && (
                                            <div className="p-3 bg-indigo-900/20 border-b border-indigo-500/30 flex justify-between items-center">
                                                <span className="text-sm text-indigo-300 font-bold">{selectedPayslips.size} payslip(s) selected</span>
                                                <button onClick={() => handleExportSelectedPDFs(run)} disabled={isExporting} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold flex items-center shadow-lg transition-colors disabled:opacity-50">
                                                    {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                                                    {isExporting ? 'Generating...' : 'Extract Selected PDFs'}
                                                </button>
                                            </div>
                                        )}

                                        <SharedPayslipTable
                                            data={sortedPayslips}
                                            selectedIds={selectedPayslips}
                                            sortConfig={sortConfig}
                                            onSort={handleSort}
                                            onToggleSelectAll={() => toggleSelectAll(run.id, sortedPayslips)}
                                            onToggleSelectOne={toggleSelectOne}
                                            onRowClick={(item) => onViewHistoryDetails(item, run)}
                                        />
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