import React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import usePayrollGenerator from '../hooks/usePayrollGenerator';

const formatCurrency = (num) => num ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const years = [new Date().getFullYear(), new Date().getFullYear() - 1];

export default function PayrollGenerator({ db, staffList, companyConfig, payPeriod, setPayPeriod, onViewDetails }) {
    const {
        payrollData, isLoading, isFinalizing, error, isMonthFullyFinalized,
        selectedForPayroll, totalSelectedNetPay,
        handleGeneratePayroll, handleFinalizePayroll, handleSelectOne, handleSelectAll,
    } = usePayrollGenerator(db, staffList, companyConfig, payPeriod);

    const handleExportSummaryPDF = () => {
        const doc = new jsPDF();
        doc.text(`Payroll Summary - ${months[payPeriod.month - 1]} ${payPeriod.year}`, 14, 15);
        autoTable(doc, {
            head: [['Staff', 'Total Earnings', 'Total Deductions', 'Net Pay']],
            body: payrollData.map(item => [item.displayName, formatCurrency(item.totalEarnings), formatCurrency(item.totalDeductions), formatCurrency(item.netPay)]),
            startY: 20,
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
        if (payrollData.length > 0) {
            return payrollData.map(item => (
                <tr key={item.id} className="hover:bg-gray-700">
                    <td className="p-4">
                        <input type="checkbox" className="rounded" checked={selectedForPayroll.has(item.id)} onChange={() => handleSelectOne(item.id)} />
                    </td>
                    <td onClick={() => onViewDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white cursor-pointer">{item.displayName}</td>
                    <td onClick={() => onViewDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 cursor-pointer">{formatCurrency(item.totalEarnings)}</td>
                    <td onClick={() => onViewDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 cursor-pointer">{formatCurrency(item.totalDeductions)}</td>
                    <td onClick={() => onViewDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm font-bold text-amber-400 cursor-pointer">{formatCurrency(item.netPay)}</td>
                </tr>
            ));
        }
        return <tr><td colSpan="5" className="px-6 py-10 text-center text-gray-500">Select a pay period and generate the payroll.</td></tr>;
    };

    return (
        <section className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Run New Payroll</h2>
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8 flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-grow"><label className="block text-sm font-medium text-gray-300 mb-1">Pay Period</label><select value={payPeriod.month} onChange={e => setPayPeriod(p => ({ ...p, month: Number(e.target.value) }))} className="w-full p-2 bg-gray-700 rounded-md">{months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
                <div className="flex-grow"><label className="block text-sm font-medium text-gray-300 mb-1 invisible">Year</label><select value={payPeriod.year} onChange={e => setPayPeriod(p => ({ ...p, year: Number(e.target.value) }))} className="w-full p-2 bg-gray-700 rounded-md">{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
                <button onClick={handleGeneratePayroll} disabled={isLoading} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 flex-shrink-0">{isLoading ? 'Generating...' : 'Generate'}</button>
                <button onClick={handleExportSummaryPDF} disabled={payrollData.length === 0} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 flex-shrink-0">Export Summary</button>
            </div>
            
            {error && <p className="text-red-400 text-center mb-4">{error}</p>}

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="p-4 w-4">
                                <input type="checkbox" className="rounded" checked={payrollData.length > 0 && selectedForPayroll.size === payrollData.length} onChange={handleSelectAll} />
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Staff</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Total Earnings (THB)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Total Deductions (THB)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Net Pay (THB)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {renderPayrollContent()}
                    </tbody>
                </table>
            </div>
            {payrollData.length > 0 && (
                <div className="mt-8 flex justify-between items-center">
                    <div>
                        <span className="text-gray-400">Total for Selected: </span>
                        <span className="text-2xl font-bold text-amber-400">{formatCurrency(totalSelectedNetPay)} THB</span>
                    </div>
                    <button 
                        onClick={handleFinalizePayroll} 
                        disabled={isFinalizing || selectedForPayroll.size === 0} 
                        className="px-8 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold disabled:bg-gray-600"
                    >
                        {isFinalizing ? 'Finalizing...' : `Finalize Payroll for ${selectedForPayroll.size} Employee(s)`}
                    </button>
                </div>
            )}
        </section>
    );
}