/* src/pages/FinancialsPage.jsx */
import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Pencil, Trash2, CheckCircle, XCircle, Users, DollarSign, Landmark, LayoutList, Zap, AlertCircle, Download } from 'lucide-react';

import LoanModal from '../components/Financials/LoanModal';
import AdvanceModal from '../components/SalaryAdvance/AdvanceModal';
import AdjustmentModal from '../components/Payroll/AdjustmentModal';
import QuickTransactionModal from '../components/FinancialsDashboard/QuickTransactionModal';
import StaffLedgerSlideOver from '../components/FinancialsDashboard/StaffLedgerSlideOver';
import useFinancials from '../hooks/useFinancials';
import * as dateUtils from '../utils/dateUtils';
import FinancialSummaryCard from '../components/Financials/FinancialSummaryCard';
import ApproveLoanDateModal from '../components/Financials/ApproveLoanDateModal';
import TransactionRow from '../components/Financials/TransactionRow';
import { exportFinancialsPDF } from '../utils/pdfExport';
import ManualPaymentModal from '../components/Financials/ManualPaymentModal';
import ConfirmModal from '../components/common/ConfirmModal';
import PromptModal from '../components/common/PromptModal'; // <-- NOUVEL IMPORT

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const years = [new Date().getFullYear() + 1, new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2];

export default function FinancialsPage({ staffList, db, activeBranch, userRole }) {
    const [payPeriod, setPayPeriod] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
    const [staffFilterId, setStaffFilterId] = useState('');
    const [slideOverStaffId, setSlideOverStaffId] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [isQuickTxOpen, setIsQuickTxOpen] = useState(false);
    const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
    const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
    const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
    const [editingEntity, setEditingEntity] = useState(null);
    const [isManualPaymentOpen, setIsManualPaymentOpen] = useState(false);
    const [loanForPayment, setLoanForPayment] = useState(null);
    const [loanToApprove, setLoanToApprove] = useState(null);
    const [adminBranchIds, setAdminBranchIds] = useState([]);
    const [companyConfig, setCompanyConfig] = useState(null);

    // --- NOUVEAU STATE POUR LE PROMPT ---
    const [promptState, setPromptState] = useState({
        isOpen: false, title: '', message: '', placeholder: '', onConfirm: null, onCancel: null
    });

    useEffect(() => {
        const uid = getAuth().currentUser?.uid;
        if (userRole === 'admin' && uid && db) getDoc(doc(db, 'users', uid)).then(snap => { if (snap.exists()) setAdminBranchIds(snap.data().branchIds || []); });
    }, [db, userRole]);

    useEffect(() => {
        if (!db) return;
        const unsub = onSnapshot(doc(db, 'settings', 'company_config'), (docSnap) => {
            if (docSnap.exists()) setCompanyConfig(docSnap.data());
        });
        return () => unsub();
    }, [db]);

    const { pendingTransactions, monthlyTransactions, globalLoans, globalAdvances, isLoading, deleteRecord, updateRecord, confirmState, closeConfirm } = useFinancials(
        db, staffList, activeBranch, adminBranchIds, userRole, payPeriod, staffFilterId
    );

    const displayedMonthlyTransactions = useMemo(() => {
        let filtered = monthlyTransactions;
        if (activeTab === 'advances') filtered = monthlyTransactions.filter(tx => tx.category === 'advance');
        if (activeTab === 'loans') filtered = monthlyTransactions.filter(tx => tx.category === 'loan');
        if (activeTab === 'adjustments') filtered = monthlyTransactions.filter(tx => tx.category === 'adjustment');

        return [...filtered].sort((a, b) => {
            let aVal = a[sortConfig.key], bVal = b[sortConfig.key];
            if (sortConfig.key === 'amount') { aVal = Number(aVal) || 0; bVal = Number(bVal) || 0; }
            else if (sortConfig.key === 'date') { aVal = new Date(a.date).getTime() || 0; bVal = new Date(b.date).getTime() || 0; }
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [monthlyTransactions, activeTab, sortConfig]);

    const handleSort = (key) => setSortConfig({ key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });

    const triggerEdit = (e, entity, type) => {
        e.stopPropagation(); setEditingEntity(entity);
        if (type === 'advance') setIsAdvanceModalOpen(true);
        if (type === 'loan') setIsLoanModalOpen(true);
        if (type === 'adjustment') setIsAdjustmentModalOpen(true);
    };

    const triggerDelete = (e, collectionName, id) => { e.stopPropagation(); deleteRecord(collectionName, id); };

    // Export PDF via utilitaire
    const handleExportPDF = () => {
        exportFinancialsPDF({ activeTab, displayedMonthlyTransactions, payPeriod, months, activeBranch, companyConfig });
    };

    const handleApproveAdvance = (e, id) => { e.stopPropagation(); updateRecord('salary_advances', id, { status: 'approved', isReadByStaff: false }); };
    
    // --- MODIFIÉ : Utilisation de PromptModal ---
    const handleRejectAdvance = (e, id) => { 
        e.stopPropagation(); 
        setPromptState({
            isOpen: true,
            title: 'Reject Salary Advance',
            message: 'Please provide a reason for rejecting this advance request.',
            placeholder: 'Reason for rejection...',
            onConfirm: (reason) => {
                if (reason) updateRecord('salary_advances', id, { status: 'rejected', rejectionReason: reason, isReadByStaff: false });
                setPromptState({ isOpen: false });
            },
            onCancel: () => setPromptState({ isOpen: false })
        });
    };

    const handleApproveLoan = (e, id) => { e.stopPropagation(); setLoanToApprove(id); };
    const confirmLoanApproval = (id, startDate) => { updateRecord('loans', id, { status: 'active', startDate }); setLoanToApprove(null); };
    
    // --- MODIFIÉ : Utilisation de PromptModal ---
    const handleRejectLoan = (e, id) => { 
        e.stopPropagation(); 
        setPromptState({
            isOpen: true,
            title: 'Reject Loan Request',
            message: 'Please provide a reason for rejecting this loan request.',
            placeholder: 'Reason for rejection...',
            onConfirm: (reason) => {
                if (reason) updateRecord('loans', id, { status: 'rejected', rejectionReason: reason });
                setPromptState({ isOpen: false });
            },
            onCancel: () => setPromptState({ isOpen: false })
        });
    };

    const handleTriggerManualPayment = (e, loan) => {
        e.stopPropagation();
        setLoanForPayment(loan);
        setIsManualPaymentOpen(true);
    };

    const staffForDropdown = useMemo(() => staffList.filter(s => s.status !== 'inactive').sort((a, b) => (a.nickname || a.firstName).localeCompare(b.nickname || b.firstName)), [staffList]);

    return (
        <div className="pb-20">
            {/* INJECTION DU PROMPT MODAL */}
            <PromptModal
                isOpen={promptState.isOpen}
                title={promptState.title}
                message={promptState.message}
                placeholder={promptState.placeholder}
                onConfirm={promptState.onConfirm}
                onCancel={promptState.onCancel}
                confirmText="Reject Request"
            />

            <ApproveLoanDateModal isOpen={!!loanToApprove} onClose={() => setLoanToApprove(null)} onApprove={confirmLoanApproval} loanId={loanToApprove} />
            <ManualPaymentModal isOpen={isManualPaymentOpen} onClose={() => setIsManualPaymentOpen(false)} loan={loanForPayment} db={db} />
            <LoanModal isOpen={isLoanModalOpen} onClose={() => setIsLoanModalOpen(false)} db={db} staffId={editingEntity?.staffId} existingLoan={editingEntity} staffList={staffList} userRole={userRole} />
            <AdvanceModal isOpen={isAdvanceModalOpen} onClose={() => setIsAdvanceModalOpen(false)} db={db} staffId={editingEntity?.staffId} existingAdvance={editingEntity} />
            <AdjustmentModal isOpen={isAdjustmentModalOpen} onClose={() => setIsAdjustmentModalOpen(false)} db={db} staffId={editingEntity?.staffId} existingAdjustment={editingEntity} payPeriod={payPeriod} />
            <QuickTransactionModal isOpen={isQuickTxOpen} onClose={() => setIsQuickTxOpen(false)} db={db} staffList={staffList} />
            <StaffLedgerSlideOver isOpen={!!slideOverStaffId} onClose={() => setSlideOverStaffId('')} staffId={slideOverStaffId} staffList={staffList} globalLoans={globalLoans} globalAdvances={globalAdvances} allTransactions={[...pendingTransactions, ...monthlyTransactions]} />
            <ConfirmModal
                isOpen={confirmState.isOpen}
                title={confirmState.title}
                message={confirmState.message}
                onConfirm={confirmState.onConfirm}
                onCancel={closeConfirm}
                isDestructive={true}
                confirmText="Delete"
            />

            <div className="flex flex-col md:flex-row justify-between md:items-end mb-8 gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <h2 className="text-2xl md:text-3xl font-bold text-white flex-shrink-0">Financials Management</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setIsQuickTxOpen(true)} className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm shadow-lg transition-colors">
                            <Zap className="w-4 h-4 mr-2" /> Quick Transaction
                        </button>
                        <button onClick={handleExportPDF} disabled={displayedMonthlyTransactions.length === 0} className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg font-bold text-sm shadow-lg transition-colors">
                            <Download className="w-4 h-4 mr-2" /> Export PDF
                        </button>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row w-full md:w-auto gap-2">
                    <select value={staffFilterId} onChange={e => setStaffFilterId(e.target.value)} className="p-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:border-indigo-500">
                        <option value="">-- All Staff --</option>
                        {staffForDropdown.map(s => <option key={s.id} value={s.id}>{s.nickname || s.firstName} {s.lastName}</option>)}
                    </select>
                    <select name="month" value={payPeriod.month} onChange={e => setPayPeriod(p => ({ ...p, month: Number(e.target.value) }))} className="p-2 bg-gray-700 rounded-md text-white">{months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                    <select name="year" value={payPeriod.year} onChange={e => setPayPeriod(p => ({ ...p, year: Number(e.target.value) }))} className="p-2 bg-gray-700 rounded-md text-white">{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
                </div>
            </div>

            {pendingTransactions.length > 0 && (
                <section className="mb-10 animate-in fade-in duration-300">
                    <h3 className="text-lg font-bold text-amber-400 mb-4 flex items-center">
                        <AlertCircle className="w-5 h-5 mr-2" /> Action Required (Pending Requests)
                    </h3>
                    <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto border border-amber-500/30">
                        <table className="min-w-full">
                            <thead className="bg-gray-750 border-b border-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Staff Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Amount</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {pendingTransactions.map(item => (
                                    <TransactionRow
                                        key={`pend_${item.id}`} item={item} isPending={true} activeBranch={activeBranch} companyConfig={companyConfig}
                                        onApproveAdvance={handleApproveAdvance} onApproveLoan={handleApproveLoan}
                                        onRejectAdvance={handleRejectAdvance} onRejectLoan={handleRejectLoan} onStaffClick={setSlideOverStaffId}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <section className="mb-10 animate-in fade-in duration-300">
                <h3 className="text-xl font-semibold text-white mb-4">Records for {months[payPeriod.month - 1]} {payPeriod.year}</h3>

                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4"><div className="h-24 bg-gray-800 rounded-lg animate-pulse" /><div className="h-24 bg-gray-800 rounded-lg animate-pulse" /><div className="h-24 bg-gray-800 rounded-lg animate-pulse" /><div className="h-24 bg-gray-800 rounded-lg animate-pulse" /></div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        <FinancialSummaryCard title="All Monthly Activities" value={`${monthlyTransactions.length} items`} isCurrency={false} icon={LayoutList} color="purple" isActive={activeTab === 'all'} onClick={() => setActiveTab('all')} />
                        <FinancialSummaryCard title="Monthly Advances" value={monthlyTransactions.filter(tx => tx.category === 'advance').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)} icon={DollarSign} color="amber" isActive={activeTab === 'advances'} onClick={() => setActiveTab('advances')} />
                        <FinancialSummaryCard title="Active Loans (Displayed)" value={monthlyTransactions.filter(tx => tx.category === 'loan').reduce((sum, tx) => sum + (Number(tx.raw.remainingBalance) || 0), 0)} icon={Landmark} color="red" isActive={activeTab === 'loans'} onClick={() => setActiveTab('loans')} />
                        {(() => {
                            const adjustments = monthlyTransactions.filter(tx => tx.category === 'adjustment');
                            const totalEarnings = adjustments.filter(tx => tx.raw?.type === 'Earning').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
                            const totalDeductions = adjustments.filter(tx => tx.raw?.type === 'Deduction').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
                            return (
                                <FinancialSummaryCard title="Monthly Adjustments (Net)" value={totalEarnings - totalDeductions} subText={<span className="flex space-x-2"><span className="text-green-400">+{totalEarnings}</span> <span className="text-red-400">-{totalDeductions}</span></span>} icon={Users} color="blue" isActive={activeTab === 'adjustments'} onClick={() => setActiveTab('adjustments')} />
                            );
                        })()}
                    </div>
                )}

                <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto border border-gray-700">
                    <table className="min-w-full">
                        <thead className="bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase cursor-pointer hover:bg-gray-600" onClick={() => handleSort('staffName')}>Staff Name {sortConfig.key === 'staffName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase cursor-pointer hover:bg-gray-600" onClick={() => handleSort('date')}>Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase cursor-pointer hover:bg-gray-600" onClick={() => handleSort('amount')}>Amount {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {isLoading ? (<tr><td colSpan="6" className="text-center py-10 text-gray-500">Loading...</td></tr>) : displayedMonthlyTransactions.length === 0 ? (<tr><td colSpan="6" className="text-center py-10 text-gray-500">No records found for this selection.</td></tr>) : (
                                displayedMonthlyTransactions.map(item =>
                                    <TransactionRow
                                        key={`mth_${item.id}`} item={item} isPending={false} activeBranch={activeBranch} companyConfig={companyConfig}
                                        onEdit={triggerEdit} onDelete={triggerDelete} onStaffClick={setSlideOverStaffId} onManualPayment={handleTriggerManualPayment}
                                    />
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}