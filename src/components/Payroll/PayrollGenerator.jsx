import React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import usePayrollGenerator from '../../hooks/usePayrollGenerator';
import * as dateUtils from '../../utils/dateUtils';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'; // <-- NEW IMPORTS

const formatCurrency = (num) => num ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Generate years dynamically
const generateYears = (startYear = 2025) => {
    const currentYear = dateUtils.getYear(new Date()); 
    const years = [];
    for (let year = startYear; year <= currentYear + 1; year++) {
        years.push(year);
    }
    return years.sort((a, b) => b - a); 
};
const dynamicYears = generateYears(); 

export default function PayrollGenerator({ db, staffList, companyConfig, payPeriod, setPayPeriod, onViewDetails }) {
    const {
        payrollData, isLoading, isFinalizing, error, isMonthFullyFinalized,
        selectedForPayroll, totalSelectedNetPay,
        handleGeneratePayroll, handleFinalizePayroll, handleSelectOne, handleSelectAll,
    } = usePayrollGenerator(db, staffList, companyConfig, payPeriod);

    // --- NEW: Wrapper function to handle Auto-Deactivation after saving payroll ---
    const onFinalizeClick = async () => {
        // 1. Run the normal finalization process
        await handleFinalizePayroll();

        // 2. Check for staff whose offboarding date has passed
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const item of payrollData) {
            // Only process the ones we actually ran payroll for
            if (!selectedForPayroll.has(item.id)) continue; 
            
            const staff = staffList.find(s => s.id === item.id);
            if (staff && staff.offboardingSettings?.isPendingFutureOffboard) {
                const endDateObj = dateUtils.parseISODateString(staff.endDate);
                
                // If their end date is today or in the past, cleanly deactivate them!
                if (endDateObj && endDateObj <= today) {
                    try {
                        const staffRef = doc(db, 'staff_profiles', staff.id);
                        await updateDoc(staffRef, {
                            status: 'inactive',
                            'offboardingSettings.isPendingFutureOffboard': false, // Turn off the flag
                            'offboardingSettings.finalDeactivationDate': serverTimestamp()
                        });
                        console.log(`Successfully auto-deactivated ${staff.firstName || staff.nickname} post-payroll.`);
                    } catch (err) {
                        console.error(`Failed to auto-deactivate ${staff.firstName || staff.nickname}:`, err);
                    }
                }
            }
        }
    };

    const handleExportSummaryPDF = () => {
        const doc = new jsPDF();
        doc.text(`Payroll Summary - ${months[payPeriod.month - 1]} ${payPeriod.year}`, 14, 15);
        autoTable(doc, {
            head: [['Staff', 'Total Earnings', 'Total Deductions', 'Net Pay']],
            body: payrollData
                    .filter(item => selectedForPayroll.has(item.id)) 
                    .map(item => [item.displayName, formatCurrency(item.totalEarnings), formatCurrency(item.totalDeductions), formatCurrency(item.netPay)]),
            startY: 20,
            foot: [['TOTAL', '', '', formatCurrency(totalSelectedNetPay)]], 
            footStyles: { fontStyle: 'bold', fillColor: [230, 230, 230], textColor: 20 },
        });
        doc.save(`payroll_summary_${payPeriod.year}_${payPeriod.month}.pdf`);
    };

    const renderPayrollContent = () => {
        if (isLoading) {
            return <tr><td colSpan="5" className="px-6 py-10 text-center text-gray-500">Calculating...</td></tr>;
        }
        if (isMonthFullyFinalized) {
            return <tr><td colSpan="5" className="px-6 py-10 text-center text-green-400">Payroll for {months[payPeriod.month - 1]} {payPeriod.year} has been fully completed.</td></tr>;
        }
         if (error && payrollData.length === 0) {
            return <tr><td colSpan="5" className="px-6 py-10 text-center text-red-400">{error}</td></tr>;
        }
        if (payrollData.length > 0) {
            return payrollData.map(item => (
                <tr key={item.id} className="hover:bg-gray-700">
                    <td className="p-4">
                        <input type="checkbox" className="rounded border-gray-600 bg-gray-900 text-amber-600 focus:ring-amber-500" checked={selectedForPayroll.has(item.id)} onChange={() => handleSelectOne(item.id)} />
                    </td>
                    <td onClick={() => onViewDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white cursor-pointer">{item.displayName}</td>
                    <td onClick={() => onViewDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 cursor-pointer">{formatCurrency(item.totalEarnings)}</td>
                    <td onClick={() => onViewDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 cursor-pointer">{formatCurrency(item.totalDeductions)}</td>
                    
                    <td onClick={() => onViewDetails(item)} className={`px-6 py-4 whitespace-nowrap text-sm font-bold cursor-pointer ${item.netPay < 0 ? 'text-red-500' : 'text-amber-400'}`}>
                        {formatCurrency(item.netPay)}
                        {item.netPay < 0 && <span className="ml-2 text-xs text-red-400 font-normal">(Negative Pay!)</span>}
                    </td>
                </tr>
            ));
        }
        return <tr><td colSpan="5" className="px-6 py-10 text-center text-gray-500">Select a pay period and click Generate.</td></tr>;
    };

    return (
        <section className="mb-12">
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
                <button onClick={handleGeneratePayroll} disabled={isLoading || isFinalizing} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 flex-shrink-0 transition-colors">
                    {isLoading ? 'Generating...' : 'Generate'}
                </button>
                <button onClick={handleExportSummaryPDF} disabled={payrollData.length === 0 || selectedForPayroll.size === 0 || isLoading || isFinalizing} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 flex-shrink-0 transition-colors">
                    Export Selected
                </button>
            </div>

            {error && !isLoading && payrollData.length === 0 &&
                <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-center mb-6">
                    {error}
                </div>
            }

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="p-4 w-4">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-600 bg-gray-900 text-amber-600 focus:ring-amber-500"
                                    checked={payrollData.length > 0 && selectedForPayroll.size === payrollData.length}
                                    onChange={handleSelectAll}
                                    disabled={payrollData.length === 0 || isMonthFullyFinalized}
                                />
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Staff</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Total Earnings (THB)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Total Deductions (THB)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Net Pay (THB)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {renderPayrollContent()}
                    </tbody>
                </table>
            </div>
            {payrollData.length > 0 && !isMonthFullyFinalized && (
                 <div className="mt-8 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                        <span className="text-gray-400">Total for Selected ({selectedForPayroll.size}): </span>
                        <span className="text-2xl font-bold text-amber-400">{formatCurrency(totalSelectedNetPay)} THB</span>
                    </div>
                    {/* --- FIX: Switched onClick to use our new wrapper function --- */}
                    <button
                        onClick={onFinalizeClick}
                        disabled={isFinalizing || selectedForPayroll.size === 0}
                        className="w-full sm:w-auto px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold disabled:bg-gray-600 transition-colors"
                    >
                        {isFinalizing ? 'Finalizing...' : `Finalize Payroll for ${selectedForPayroll.size} Employee(s)`}
                    </button>
                </div>
            )}
        </section>
    );
}