import React, { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from '../components/Modal';

// Helper to format currency
const formatCurrency = (num) => num ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// --- Payslip Detail Component ---
const PayslipDetailView = ({ details, companyConfig, payPeriod }) => {
    if (!details) return null;

    const handleExportIndividualPDF = async () => {
        const doc = new jsPDF();
        const payPeriodTitle = `${months[payPeriod.month - 1]} ${payPeriod.year}`;

        if (companyConfig?.companyLogoUrl) {
            try {
                const response = await fetch(companyConfig.companyLogoUrl);
                const blob = await response.blob();
                const reader = new FileReader();
                const base64Image = await new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                doc.addImage(base64Image, 'PNG', 14, 10, 30, 15);
            } catch (error) {
                console.error("Error loading company logo for PDF:", error);
            }
        }

        doc.setFontSize(18);
        doc.text("Salary Statement", 105, 15, { align: 'center' });
        doc.setFontSize(12);
        doc.text(`Month: ${payPeriodTitle}`, 105, 22, { align: 'center' });

        autoTable(doc, {
            body: [
                [{ content: 'Employee Name:', styles: { fontStyle: 'bold' } }, details.name],
                [{ content: 'Company:', styles: { fontStyle: 'bold' } }, companyConfig?.companyName || ''],
                [{ content: 'Address:', styles: { fontStyle: 'bold' } }, companyConfig?.companyAddress || ''],
                [{ content: 'Tax ID:', styles: { fontStyle: 'bold' } }, companyConfig?.companyTaxId || ''],
                [{ content: 'Position:', styles: { fontStyle: 'bold' } }, details.payType],
            ],
            startY: 30,
            theme: 'plain',
            styles: { fontSize: 10 },
        });

        const earningsBody = [
            ['Base Pay', formatCurrency(details.earnings.basePay)],
            ['Attendance Bonus', formatCurrency(details.earnings.attendanceBonus)],
            ['Social Security Allowance', formatCurrency(details.earnings.ssoAllowance)],
            ...details.earnings.others.map(e => [e.description, formatCurrency(e.amount)])
        ];
        const deductionsBody = [
            ['Absences', formatCurrency(details.deductions.absences)],
            ['Social Security', formatCurrency(details.deductions.sso)],
            ['Salary Advance', formatCurrency(details.deductions.advance)],
            ['Loan Repayment', formatCurrency(details.deductions.loan)],
            ...details.deductions.others.map(d => [d.description, formatCurrency(d.amount)])
        ];

        autoTable(doc, { head: [['Earnings', 'Amount (THB)']], body: earningsBody, foot: [['Total Earnings', formatCurrency(details.totalEarnings)]], startY: doc.lastAutoTable.finalY + 2, theme: 'grid', headStyles: { fillColor: [23, 23, 23] }, footStyles: { fillColor: [41, 41, 41], fontStyle: 'bold' } });
        autoTable(doc, { head: [['Deductions', 'Amount (THB)']], body: deductionsBody, foot: [['Total Deductions', formatCurrency(details.totalDeductions)]], startY: doc.lastAutoTable.finalY + 2, theme: 'grid', headStyles: { fillColor: [23, 23, 23] }, footStyles: { fillColor: [41, 41, 41], fontStyle: 'bold' } });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text("Net Pay:", 14, doc.lastAutoTable.finalY + 10);
        doc.text(`${formatCurrency(details.netPay)} THB`, 196, doc.lastAutoTable.finalY + 10, { align: 'right' });

        doc.save(`payslip_${details.name.replace(' ', '_')}_${payPeriod.year}_${payPeriod.month}.pdf`);
    };

    return (
        <div className="text-white">
            <div className="grid grid-cols-2 gap-8 mb-6">
                <div>
                    <h4 className="font-bold text-lg mb-2 border-b border-gray-600 pb-1">Earnings</h4>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><p>Base Pay:</p> <p>{formatCurrency(details.earnings.basePay)}</p></div>
                        <div className="flex justify-between"><p>Attendance Bonus:</p> <p>{formatCurrency(details.earnings.attendanceBonus)}</p></div>
                        <div className="flex justify-between"><p>SSO Allowance:</p> <p>{formatCurrency(details.earnings.ssoAllowance)}</p></div>
                        {details.earnings.others.map((e, i) => <div key={i} className="flex justify-between"><p>{e.description}:</p> <p>{formatCurrency(e.amount)}</p></div>)}
                    </div>
                    <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t border-gray-500"><p>Total Earnings:</p> <p>{formatCurrency(details.totalEarnings)}</p></div>
                </div>
                 <div>
                    <h4 className="font-bold text-lg mb-2 border-b border-gray-600 pb-1">Deductions</h4>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><p>Absences:</p> <p>{formatCurrency(details.deductions.absences)}</p></div>
                        <div className="flex justify-between"><p>Social Security:</p> <p>{formatCurrency(details.deductions.sso)}</p></div>
                        <div className="flex justify-between"><p>Salary Advance:</p> <p>{formatCurrency(details.deductions.advance)}</p></div>
                        <div className="flex justify-between"><p>Loan Repayment:</p> <p>{formatCurrency(details.deductions.loan)}</p></div>
                        {details.deductions.others.map((d, i) => <div key={i} className="flex justify-between"><p>{d.description}:</p> <p>{formatCurrency(d.amount)}</p></div>)}
                    </div>
                    <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t border-gray-500"><p>Total Deductions:</p> <p>{formatCurrency(details.totalDeductions)}</p></div>
                </div>
            </div>
            <div className="flex justify-between items-center bg-gray-900 p-4 rounded-lg mt-6">
                <h3 className="text-xl font-bold">NET PAY:</h3><p className="text-2xl font-bold text-amber-400">{formatCurrency(details.netPay)} THB</p>
            </div>
            <div className="flex justify-end mt-6"><button onClick={handleExportIndividualPDF} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-semibold">Export This Payslip to PDF</button></div>
        </div>
    );
};

const getCurrentJob = (staff) => { if (!staff?.jobHistory || staff.jobHistory.length === 0) { return { rate: 0, payType: 'Monthly' }; } const latestJob = staff.jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0]; if (latestJob.rate === undefined && latestJob.baseSalary !== undefined) { return { ...latestJob, rate: latestJob.baseSalary, payType: 'Monthly' }; } return latestJob; };
const calculateHours = (start, end) => { if (!start?.toDate || !end?.toDate) return 0; const diffMillis = end.toDate() - start.toDate(); return diffMillis / (1000 * 60 * 60); };
const formatTime = (timestamp) => timestamp ? timestamp.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'N/A';

export default function PayrollPage({ db, staffList, companyConfig }) {
    const [payPeriod, setPayPeriod] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
    const [payrollData, setPayrollData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [error, setError] = useState('');
    const [selectedStaffDetails, setSelectedStaffDetails] = useState(null);

    const handleGeneratePayroll = async () => {
        if (!companyConfig) { setError("Company settings are not loaded yet. Please wait and try again."); return; }
        setIsLoading(true);
        setError('');
        
        try {
            const year = payPeriod.year;
            const month = payPeriod.month - 1;
            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);
            const daysInMonth = endDate.getDate();
            
            const functions = getFunctions();
            const calculateBonus = httpsCallable(functions, 'calculateBonus');

            const [
                attendanceSnapshot, scheduleSnapshot, allLeaveSnapshot, advancesSnapshot,
                loansSnapshot, adjustmentsSnapshot, bonusResults
            ] = await Promise.all([
                getDocs(query(collection(db, "attendance"), where("date", ">=", startDate.toISOString().split('T')[0]), where("date", "<=", endDate.toISOString().split('T')[0]))),
                getDocs(query(collection(db, "schedules"), where("date", ">=", startDate.toISOString().split('T')[0]), where("date", "<=", endDate.toISOString().split('T')[0]))),
                getDocs(query(collection(db, "leave_requests"), where("status", "==", "approved"), where("startDate", ">=", `${year}-01-01`), where("endDate", "<=", `${year}-12-31`))),
                getDocs(query(collection(db, "salary_advances"), where("payPeriodYear", "==", year), where("payPeriodMonth", "==", month + 1), where("status", "==", "approved"))),
                getDocs(query(collection(db, "loans"), where("isActive", "==", true))),
                getDocs(query(collection(db, "monthly_adjustments"), where("payPeriodYear", "==", year), where("payPeriodMonth", "==", month + 1))),
                Promise.all(staffList.map(staff => calculateBonus({ staffId: staff.id, payPeriod: { year, month: month + 1 } }).then(result => ({ staffId: staff.id, ...result.data })).catch(err => ({ staffId: staff.id, bonusAmount: 0, newStreak: 0 }))))
            ]);

            const attendanceData = new Map(attendanceSnapshot.docs.map(doc => [`${doc.data().staffId}_${doc.data().date}`, doc.data()]));
            const scheduleData = scheduleSnapshot.docs.map(doc => doc.data());
            const allLeaveData = allLeaveSnapshot.docs.map(doc => doc.data());
            const advancesData = advancesSnapshot.docs.map(doc => doc.data());
            const loansData = loansSnapshot.docs.map(doc => doc.data());
            const adjustmentsData = adjustmentsSnapshot.docs.map(doc => doc.data());
            const bonusMap = new Map(bonusResults.map(res => [res.staffId, res]));
            const publicHolidays = companyConfig.publicHolidays.map(h => h.date);
            
            const data = staffList.map(staff => {
                const currentJob = getCurrentJob(staff);
                let basePay = 0, autoDeductions = 0;
                
                if (currentJob.payType === 'Monthly') {
                    basePay = currentJob.rate || 0;
                    const dailyRate = basePay / daysInMonth;
                    let unpaidDays = 0;
                    const monthLeave = allLeaveData.filter(l => l.staffId === staff.id && new Date(l.startDate) <= endDate && new Date(l.endDate) >= startDate);
                    const staffSchedules = scheduleData.filter(s => s.staffId === staff.id);
                    staffSchedules.forEach(schedule => {
                        const wasOnLeave = monthLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
                        const didAttend = attendanceData.has(`${staff.id}_${schedule.date}`);
                        if (!didAttend && !wasOnLeave && !publicHolidays.includes(schedule.date)) { unpaidDays++; }
                    });
                    autoDeductions = dailyRate * unpaidDays;
                } else if (currentJob.payType === 'Hourly') { 
                    const staffAttendance = Array.from(attendanceData.values()).filter(a => a.staffId === staff.id);
                    let totalHours = 0;
                    staffAttendance.forEach(att => {
                        const netHours = calculateHours(att.checkInTime, att.checkOutTime) - calculateHours(att.breakStart, att.breakEnd);
                        totalHours += netHours;
                    });
                    basePay = totalHours * (currentJob.rate || 0);
                }

                const staffAdjustments = adjustmentsData.filter(a => a.staffId === staff.id);
                const otherEarnings = staffAdjustments.filter(a => a.type === 'Earning').reduce((sum, item) => sum + item.amount, 0);
                const otherDeductions = staffAdjustments.filter(a => a.type === 'Deduction').reduce((sum, item) => sum + item.amount, 0);

                const bonusInfo = bonusMap.get(staff.id) || { bonusAmount: 0, newStreak: 0 };
                const attendanceBonus = bonusInfo.bonusAmount;
                const grossPayForSSO = basePay + otherEarnings;

                const ssoRate = (companyConfig.ssoRate || 5) / 100;
                const ssoCap = companyConfig.ssoCap || 750;
                const ssoDeduction = Math.min(grossPayForSSO * ssoRate, ssoCap);
                const ssoAllowance = ssoDeduction;

                const totalEarnings = basePay + attendanceBonus + otherEarnings + ssoAllowance;
                
                const advanceDeduction = advancesData.filter(a => a.staffId === staff.id).reduce((sum, item) => sum + item.amount, 0);
                const loanDeduction = loansData.filter(l => l.staffId === staff.id).reduce((sum, item) => sum + item.monthlyRepayment, 0);
                
                const totalDeductions = autoDeductions + ssoDeduction + advanceDeduction + loanDeduction + otherDeductions;
                const netPay = totalEarnings - totalDeductions;

                return {
                    id: staff.id, 
                    name: staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName,
                    payType: currentJob.position,
                    totalEarnings, totalDeductions, netPay,
                    bonusInfo: { newStreak: bonusInfo.newStreak },
                    earnings: { basePay, attendanceBonus, ssoAllowance, others: staffAdjustments.filter(a => a.type === 'Earning') },
                    deductions: { absences: autoDeductions, sso: ssoDeduction, advance: advanceDeduction, loan: loanDeduction, others: staffAdjustments.filter(a => a.type === 'Deduction') },
                };
            });
            setPayrollData(data);
        } catch (err) { setError('Failed to generate payroll. Check browser console (F12) for details.'); console.error(err);
        } finally { setIsLoading(false); }
    };

    const handleExportSummaryPDF = () => {
        const doc = new jsPDF();
        doc.text(`Payroll Summary - ${months[payPeriod.month - 1]} ${payPeriod.year}`, 14, 15);
        autoTable(doc, {
            head: [['Staff Name', 'Total Earnings', 'Total Deductions', 'Net Pay']],
            body: payrollData.map(item => [item.name, formatCurrency(item.totalEarnings), formatCurrency(item.totalDeductions), formatCurrency(item.netPay)]),
            startY: 20,
        });
        doc.save(`payroll_summary_${payPeriod.year}_${payPeriod.month}.pdf`);
    };
    
    const handleFinalizePayroll = async () => {
        if (!window.confirm(`Are you sure you want to finalize the payroll for ${months[payPeriod.month - 1]} ${payPeriod.year}? This will save the payslips and make them visible to staff.`)) {
            return;
        }

        setIsFinalizing(true);
        try {
            const functions = getFunctions();
            const finalizeAndStorePayslips = httpsCallable(functions, 'finalizeAndStorePayslips');
            const result = await finalizeAndStorePayslips({ payrollData, payPeriod });

            alert("Payroll finalized and payslips stored successfully!");
        } catch (error) {
            console.error("Error finalizing payroll:", error);
            alert(`Failed to finalize payroll: ${error.message}`);
        } finally {
            setIsFinalizing(false);
        }
    };
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1];

    return (
        <div>
            {selectedStaffDetails && (
                <Modal isOpen={true} onClose={() => setSelectedStaffDetails(null)} title={`Payslip Details for ${selectedStaffDetails.name}`}>
                    <PayslipDetailView details={selectedStaffDetails} companyConfig={companyConfig} payPeriod={payPeriod} />
                </Modal>
            )}

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Payroll Generation</h2>
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8 flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-grow"><label className="block text-sm font-medium text-gray-300 mb-1">Pay Period</label><select value={payPeriod.month} onChange={e => setPayPeriod(p => ({ ...p, month: e.target.value }))} className="w-full p-2 bg-gray-700 rounded-md">{months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
                <div className="flex-grow"><label className="block text-sm font-medium text-gray-300 mb-1 invisible">Year</label><select value={payPeriod.year} onChange={e => setPayPeriod(p => ({ ...p, year: e.target.value }))} className="w-full p-2 bg-gray-700 rounded-md">{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
                <button onClick={handleGeneratePayroll} disabled={isLoading} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 flex-shrink-0">{isLoading ? 'Generating...' : 'Generate'}</button>
                <button onClick={handleExportSummaryPDF} disabled={payrollData.length === 0} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 flex-shrink-0">Export Summary</button>
            </div>
            
            {error && <p className="text-red-400 text-center mb-4">{error}</p>}

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Display Name</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Total Earnings (THB)</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Total Deductions (THB)</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Net Pay (THB)</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {payrollData.length > 0 ? payrollData.map(item => {
                            const staffMember = staffList.find(s => s.id === item.id);
                            const displayName = staffMember?.nickname || item.name;

                            return (
                                <tr key={item.id} onClick={() => setSelectedStaffDetails(item)} className="hover:bg-gray-700 cursor-pointer">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{displayName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{formatCurrency(item.totalEarnings)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{formatCurrency(item.totalDeductions)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-amber-400">{formatCurrency(item.netPay)}</td>
                                </tr>
                            )
                        }) : ( <tr><td colSpan="4" className="px-6 py-10 text-center text-gray-500">{isLoading ? 'Calculating...' : 'Select a pay period and generate the payroll.'}</td></tr>)}
                    </tbody>
                </table>
            </div>
            {payrollData.length > 0 && (<div className="mt-8 flex justify-end"><button onClick={handleFinalizePayroll} disabled={isFinalizing} className="px-8 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold disabled:bg-gray-600">{isFinalizing ? 'Finalizing...' : `Finalize Payroll for ${months[payPeriod.month-1]}`}</button></div>)}
        </div>
    );
};