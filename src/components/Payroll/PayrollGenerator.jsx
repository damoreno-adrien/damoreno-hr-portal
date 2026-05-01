/* src/components/Payroll/PayrollGenerator.jsx */

import React, { useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import usePayrollGenerator from '../../hooks/usePayrollGenerator';
import * as dateUtils from '../../utils/dateUtils';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { AlertCircle } from 'lucide-react';
import FeedbackModal from '../common/FeedbackModal';
import ConfirmModal from '../common/ConfirmModal';
import SharedPayslipTable from './SharedPayslipTable';

const formatCurrency = (num) => num ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const generateYears = (startYear = 2025) => {
    const currentYear = dateUtils.getYear(new Date());
    const years = [];
    for (let year = startYear; year <= currentYear + 1; year++) { years.push(year); }
    return years.sort((a, b) => b - a);
};
const dynamicYears = generateYears();

export default function PayrollGenerator({ db, staffList, companyConfig, payPeriod, setPayPeriod, onViewDetails, activeBranch }) {
    const {
        payrollData, isLoading, isFinalizing, error, isMonthFullyFinalized,
        selectedForPayroll, totalSelectedNetPay,
        pendingAdvancesCount, pendingLoansCount,
        feedbackModal, setFeedbackModal,
        handleGeneratePayroll, handleFinalizePayroll, handleSelectOne, handleSelectAll,
        confirmState, closeConfirm,
    } = usePayrollGenerator(db, staffList, companyConfig, payPeriod, activeBranch);

    // CHANGEMENT : on trie par staffName
    const [sortConfig, setSortConfig] = useState({ key: 'staffName', direction: 'asc' });
    const [methodFilter, setMethodFilter] = useState('all');

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const tableData = useMemo(() => {
        let filtered = [...payrollData];
        if (methodFilter !== 'all') {
            filtered = filtered.filter(item => item.paymentMethod === methodFilter);
        }

        const enrichedData = filtered.map(item => {
            const staff = staffList.find(s => s.id === item.id);
            const dName = staff ? (staff.nickname || staff.firstName || staff.fullName) : item.name;
            
            let bNameStr = null;
            if (activeBranch === 'global' && staff?.branchId) {
                const bName = companyConfig?.branches?.find(b => b.id === staff.branchId)?.name || staff.branchId;
                bNameStr = bName.replace('Da Moreno ', '');
            }

            const job = staff?.jobHistory ? [...staff.jobHistory].sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0))[0] : {};

            return {
                ...item,
                staffName: dName,
                branchName: bNameStr,
                department: job?.department || 'N/A'
            };
        });

        return enrichedData.sort((a, b) => {
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
    }, [payrollData, sortConfig, methodFilter, staffList, activeBranch, companyConfig]);

    const onFinalizeClick = async () => {
        await handleFinalizePayroll();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (const item of payrollData) {
            if (!selectedForPayroll.has(item.id)) continue;
            const staff = staffList.find(s => s.id === item.id);
            if (staff && staff.offboardingSettings?.isPendingFutureOffboard) {
                const endDateObj = dateUtils.parseISODateString(staff.endDate);
                if (endDateObj && endDateObj <= today) {
                    try {
                        const staffRef = doc(db, 'staff_profiles', staff.id);
                        await updateDoc(staffRef, {
                            status: 'inactive',
                            'offboardingSettings.isPendingFutureOffboard': false,
                            'offboardingSettings.finalDeactivationDate': serverTimestamp()
                        });
                    } catch (err) { console.error(err); }
                }
            }
        }
    };

    const handleExportSummaryPDF = () => {
        const docPDF = new jsPDF();
        docPDF.text(`Payroll Summary - ${months[payPeriod.month - 1]} ${payPeriod.year}`, 14, 15);
        autoTable(docPDF, {
            head: [['Staff', 'Department', 'Method', 'Total Earnings', 'Total Deductions', 'Net Pay']],
            body: tableData
                .filter(item => selectedForPayroll.has(item.id))
                .map(item => [
                    item.branchName ? `${item.staffName} (${item.branchName})` : item.staffName,
                    item.department,
                    item.paymentMethod === 'cash' ? 'Cash' : 'Bank Transfer',
                    formatCurrency(item.totalEarnings),
                    formatCurrency(item.totalDeductions),
                    formatCurrency(item.netPay)
                ]),
            startY: 20,
            foot: [['TOTAL', '', '', '', '', formatCurrency(totalSelectedNetPay)]], 
            footStyles: { fontStyle: 'bold', fillColor: [230, 230, 230], textColor: 20 },
        });
        docPDF.save(`payroll_summary_${payPeriod.year}_${payPeriod.month}.pdf`);
    };

    const hasPendingAdvances = pendingAdvancesCount > 0;
    const hasPendingLoans = pendingLoansCount > 0;
    const showAlert = hasPendingAdvances || hasPendingLoans;

    return (
        <section className="mb-12">
            <FeedbackModal isOpen={!!feedbackModal} type={feedbackModal?.type} title={feedbackModal?.title} message={feedbackModal?.message} onClose={() => setFeedbackModal(null)} />
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Run New Payroll</h2>
            
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8 flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Pay Period</label>
                    <select value={payPeriod.month} onChange={e => setPayPeriod(p => ({ ...p, month: Number(e.target.value) }))} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:border-amber-500 focus:ring focus:ring-amber-500 focus:ring-opacity-50">
                        {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-300 mb-1 invisible">Year</label>
                    <select value={payPeriod.year} onChange={e => setPayPeriod(p => ({ ...p, year: Number(e.target.value) }))} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:border-amber-500 focus:ring focus:ring-amber-500 focus:ring-opacity-50">
                        {dynamicYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>

                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Filter Method</label>
                    <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:border-indigo-500 focus:ring focus:ring-indigo-500 focus:ring-opacity-50">
                        <option value="all">All Methods</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="cash">Cash Payment</option>
                    </select>
                </div>

                <button onClick={handleGeneratePayroll} disabled={isLoading || isFinalizing} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 flex-shrink-0 transition-colors">
                    {isLoading ? 'Generating...' : 'Generate'}
                </button>
                <button onClick={handleExportSummaryPDF} disabled={tableData.length === 0 || selectedForPayroll.size === 0 || isLoading || isFinalizing} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 flex-shrink-0 transition-colors">
                    Export Selected
                </button>
            </div>

            {error && !isLoading && payrollData.length === 0 && <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-center mb-6">{error}</div>}
            {isMonthFullyFinalized && <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded-lg text-center mb-6">Payroll for {months[payPeriod.month - 1]} {payPeriod.year} has been fully completed.</div>}

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <SharedPayslipTable 
                    data={tableData}
                    selectedIds={selectedForPayroll}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    onToggleSelectAll={handleSelectAll}
                    onToggleSelectOne={handleSelectOne}
                    onRowClick={(item) => onViewDetails(item)}
                />
            </div>

            {showAlert && !isMonthFullyFinalized && (
                <div className={`mt-8 mb-6 flex items-start gap-4 p-4 border rounded-lg ${hasPendingAdvances ? 'bg-red-900/30 border-red-600 animate-pulse' : 'bg-amber-900/30 border-amber-600'}`}>
                    <AlertCircle className={`h-6 w-6 flex-shrink-0 ${hasPendingAdvances ? 'text-red-400' : 'text-amber-400'}`} />
                    <div>
                        <h4 className={`${hasPendingAdvances ? 'text-red-400' : 'text-amber-400'} font-bold text-sm uppercase`}>Pending Requests Detected</h4>
                        <p className="text-gray-300 text-sm mt-1 leading-relaxed">
                            You have
                            {hasPendingAdvances && <span> <strong className="text-white">{pendingAdvancesCount} pending advance(s)</strong></span>}
                            {hasPendingAdvances && hasPendingLoans && <span> and </span>}
                            {hasPendingLoans && <span> <strong className="text-white">{pendingLoansCount} pending loan(s)</strong></span>}.
                            <br />
                            {hasPendingAdvances ? "Finalization is disabled until advances are processed." : "You can proceed with finalization, but please ensure loans are reviewed if needed."}
                        </p>
                    </div>
                </div>
            )}

            {tableData.length > 0 && !isMonthFullyFinalized && (
                <div className="mt-8 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                        <span className="text-gray-400">Total for Selected ({selectedForPayroll.size}): </span>
                        <span className="text-2xl font-bold text-amber-400">{formatCurrency(totalSelectedNetPay)} THB</span>
                    </div>
                    <button onClick={onFinalizeClick} disabled={isFinalizing || selectedForPayroll.size === 0 || hasPendingAdvances} className={`w-full sm:w-auto px-6 py-3 rounded-lg font-bold transition-colors ${hasPendingAdvances ? 'bg-gray-700 text-gray-400 cursor-not-allowed border border-gray-600' : 'bg-green-600 hover:bg-green-700 text-white shadow-lg'}`}>
                        {isFinalizing ? 'Finalizing...' : `Finalize Payroll for ${selectedForPayroll.size} Employee(s)`}
                    </button>
                </div>
            )}
            <ConfirmModal isOpen={confirmState.isOpen} title={confirmState.title} message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={closeConfirm} isDestructive={false} confirmText="Finalize" />
        </section>
    );
}