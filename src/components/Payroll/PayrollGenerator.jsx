/* src/components/Payroll/PayrollGenerator.jsx */

import React, { useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import usePayrollGenerator from '../../hooks/usePayrollGenerator';
import * as dateUtils from '../../utils/dateUtils';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { AlertCircle, CheckCircle, Landmark, Banknote } from 'lucide-react';
import FeedbackModal from '../common/FeedbackModal';
import ConfirmModal from '../common/ConfirmModal';

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

    // --- LOGIQUE DE TRI ET FILTRAGE ---
    const [sortConfig, setSortConfig] = useState({ key: 'displayName', direction: 'asc' });
    const [methodFilter, setMethodFilter] = useState('all');

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const filteredAndSortedData = useMemo(() => {
        let filtered = [...payrollData];
        if (methodFilter !== 'all') {
            filtered = filtered.filter(item => item.paymentMethod === methodFilter);
        }
        return filtered.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [payrollData, sortConfig, methodFilter]);

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

    // --- MODIFICATION ICI : AJOUT DE LA COLONNE METHOD DANS LE PDF ---
    const handleExportSummaryPDF = () => {
        const doc = new jsPDF();
        doc.text(`Payroll Summary - ${months[payPeriod.month - 1]} ${payPeriod.year}`, 14, 15);
        autoTable(doc, {
            head: [['Staff', 'Method', 'Total Earnings', 'Total Deductions', 'Net Pay']],
            body: filteredAndSortedData
                .filter(item => selectedForPayroll.has(item.id))
                .map(item => {
                    let name = item.displayName;
                    const staff = staffList.find(s => s.id === item.id);
                    if (activeBranch === 'global' && staff?.branchId) {
                        const bName = companyConfig?.branches?.find(b => b.id === staff.branchId)?.name || staff.branchId;
                        name += ` (${bName.replace('Da Moreno ', '')})`;
                    }

                    const method = item.paymentMethod === 'cash' ? 'Cash' : 'Bank Transfer';

                    return [
                        name,
                        method,
                        formatCurrency(item.totalEarnings),
                        formatCurrency(item.totalDeductions),
                        formatCurrency(item.netPay)
                    ]
                }),
            startY: 20,
            foot: [['TOTAL', '', '', '', formatCurrency(totalSelectedNetPay)]], // Colonne vide ajoutée pour l'alignement
            footStyles: { fontStyle: 'bold', fillColor: [230, 230, 230], textColor: 20 },
        });
        doc.save(`payroll_summary_${payPeriod.year}_${payPeriod.month}.pdf`);
    };

    const renderPayrollContent = () => {
        if (isLoading) return <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500">Calculating...</td></tr>;
        if (isMonthFullyFinalized) return <tr><td colSpan="6" className="px-6 py-10 text-center text-green-400">Payroll for {months[payPeriod.month - 1]} {payPeriod.year} has been fully completed.</td></tr>;
        if (error && payrollData.length === 0) return <tr><td colSpan="6" className="px-6 py-10 text-center text-red-400">{error}</td></tr>;

        if (filteredAndSortedData.length > 0) {
            return filteredAndSortedData.map(item => {
                const staff = staffList.find(s => s.id === item.id);
                let branchBadge = null;
                if (activeBranch === 'global' && staff?.branchId) {
                    const bName = companyConfig?.branches?.find(b => b.id === staff.branchId)?.name || staff.branchId;
                    branchBadge = <span className="ml-2 text-[9px] uppercase tracking-wider font-bold bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">{bName.replace('Da Moreno ', '')}</span>;
                }

                return (
                    <tr key={item.id} className="hover:bg-gray-700">
                        <td className="p-4">
                            <input type="checkbox" className="rounded border-gray-600 bg-gray-900 text-amber-600 focus:ring-amber-500" checked={selectedForPayroll.has(item.id)} onChange={() => handleSelectOne(item.id)} />
                        </td>
                        <td onClick={() => onViewDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white cursor-pointer">
                            {item.displayName} {branchBadge}
                        </td>
                        <td onClick={() => onViewDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 cursor-pointer">{formatCurrency(item.totalEarnings)}</td>
                        <td onClick={() => onViewDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 cursor-pointer">{formatCurrency(item.totalDeductions)}</td>
                        <td onClick={() => onViewDetails(item)} className={`px-6 py-4 whitespace-nowrap text-sm font-bold cursor-pointer ${item.netPay < 0 ? 'text-red-500' : 'text-amber-400'}`}>
                            {formatCurrency(item.netPay)}
                            {item.netPay < 0 && <span className="ml-2 text-xs text-red-400 font-normal">(Negative Pay!)</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                            {item.paymentMethod === 'cash' ? (
                                <span className="flex items-center w-max text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded border border-emerald-500/20">
                                    <Banknote className="w-3 h-3 mr-1" /> CASH
                                </span>
                            ) : (
                                <span className="flex items-center w-max text-[10px] font-bold bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">
                                    <Landmark className="w-3 h-3 mr-1" /> BANK
                                </span>
                            )}
                        </td>
                    </tr>
                );
            });
        }
        return <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500">No records found. Adjust your filters or generate payroll.</td></tr>;
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
                <button onClick={handleExportSummaryPDF} disabled={filteredAndSortedData.length === 0 || selectedForPayroll.size === 0 || isLoading || isFinalizing} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 flex-shrink-0 transition-colors">
                    Export Selected
                </button>
            </div>

            {error && !isLoading && payrollData.length === 0 && <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-center mb-6">{error}</div>}

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="p-4 w-4">
                                <input type="checkbox" className="rounded border-gray-600 bg-gray-900 text-amber-600 focus:ring-amber-500" checked={filteredAndSortedData.length > 0 && selectedForPayroll.size === filteredAndSortedData.length} onChange={handleSelectAll} disabled={filteredAndSortedData.length === 0 || isMonthFullyFinalized} />
                            </th>
                            <th onClick={() => handleSort('displayName')} className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600">
                                Staff {sortConfig.key === 'displayName' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                            </th>
                            <th onClick={() => handleSort('totalEarnings')} className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600">
                                Total Earnings {sortConfig.key === 'totalEarnings' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                            </th>
                            <th onClick={() => handleSort('totalDeductions')} className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600">
                                Total Deductions {sortConfig.key === 'totalDeductions' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                            </th>
                            <th onClick={() => handleSort('netPay')} className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600">
                                Net Pay {sortConfig.key === 'netPay' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                            </th>
                            <th onClick={() => handleSort('paymentMethod')} className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600">
                                Method {sortConfig.key === 'paymentMethod' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {renderPayrollContent()}
                    </tbody>
                </table>
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
                            <br />
                            Process them in the <a href="/financials" className="text-indigo-400 hover:text-indigo-300 hover:underline font-medium ml-1 transition-colors">Financials Management</a> section.
                        </p>
                    </div>
                </div>
            )}

            {filteredAndSortedData.length > 0 && !isMonthFullyFinalized && (
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
            <ConfirmModal
                isOpen={confirmState.isOpen}
                title={confirmState.title}
                message={confirmState.message}
                onConfirm={confirmState.onConfirm}
                onCancel={closeConfirm}
                isDestructive={false} // C'est une action positive/neutre (bleue), pas une suppression
                confirmText="Finalize"
            />
        </section>
    );
}