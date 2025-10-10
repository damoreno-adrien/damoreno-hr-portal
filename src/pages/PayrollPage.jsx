import React, { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from '../components/Modal';

// Helper functions from the original file
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
        if (!companyConfig) {
            setError("Company settings are not loaded yet. Please wait and try again.");
            return;
        }
        setIsLoading(true);
        setError('');
        
        try {
            const year = payPeriod.year;
            const month = payPeriod.month - 1; // JS months are 0-11
            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);
            const daysInMonth = endDate.getDate();

            // --- 1. FETCH ALL REQUIRED DATA ---
            const functions = getFunctions();
            const calculateBonus = httpsCallable(functions, 'calculateBonus');

            // Fetch all data concurrently for efficiency
            const [
                attendanceSnapshot, 
                scheduleSnapshot, 
                allLeaveSnapshot, 
                advancesSnapshot,
                loansSnapshot,
                adjustmentsSnapshot,
                bonusResults
            ] = await Promise.all([
                getDocs(query(collection(db, "attendance"), where("date", ">=", startDate.toISOString().split('T')[0]), where("date", "<=", endDate.toISOString().split('T')[0]))),
                getDocs(query(collection(db, "schedules"), where("date", ">=", startDate.toISOString().split('T')[0]), where("date", "<=", endDate.toISOString().split('T')[0]))),
                getDocs(query(collection(db, "leave_requests"), where("status", "==", "approved"), where("startDate", ">=", `${year}-01-01`), where("endDate", "<=", `${year}-12-31`))),
                getDocs(query(collection(db, "salary_advances"), where("payPeriodYear", "==", year), where("payPeriodMonth", "==", month + 1), where("status", "==", "approved"))),
                getDocs(query(collection(db, "loans"), where("isActive", "==", true))),
                getDocs(query(collection(db, "monthly_adjustments"), where("payPeriodYear", "==", year), where("payPeriodMonth", "==", month + 1))),
                Promise.all(staffList.map(staff => calculateBonus({ staffId: staff.id, payPeriod: { year, month: month + 1 } }).then(result => ({ staffId: staff.id, ...result.data })).catch(err => ({ staffId: staff.id, bonusAmount: 0 }))))
            ]);

            const attendanceData = new Map(attendanceSnapshot.docs.map(doc => [`${doc.data().staffId}_${doc.data().date}`, doc.data()]));
            const scheduleData = scheduleSnapshot.docs.map(doc => doc.data());
            const allLeaveData = allLeaveSnapshot.docs.map(doc => doc.data());
            const advancesData = advancesSnapshot.docs.map(doc => doc.data());
            const loansData = loansSnapshot.docs.map(doc => doc.data());
            const adjustmentsData = adjustmentsSnapshot.docs.map(doc => doc.data());
            const bonusMap = new Map(bonusResults.map(res => [res.staffId, res]));
            const publicHolidays = companyConfig.publicHolidays.map(h => h.date);
            
            // --- 2. PROCESS PAYROLL FOR EACH STAFF MEMBER ---
            const data = staffList.map(staff => {
                const currentJob = getCurrentJob(staff);
                let basePay = 0, autoDeductions = 0, unpaidDaysList = [], hourlyTimesheet = [];

                // Calculate Base Pay (Monthly or Hourly)
                if (currentJob.payType === 'Monthly') {
                    basePay = currentJob.rate || 0;
                    const dailyRate = basePay / daysInMonth;
                    let unpaidDays = 0;
                    const monthLeave = allLeaveData.filter(l => l.staffId === staff.id && new Date(l.startDate) <= endDate && new Date(l.endDate) >= startDate);
                    const staffSchedules = scheduleData.filter(s => s.staffId === staff.id);
                    staffSchedules.forEach(schedule => {
                        const wasOnLeave = monthLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
                        const didAttend = attendanceData.has(`${staff.id}_${schedule.date}`);
                        if (!didAttend && !wasOnLeave && !publicHolidays.includes(schedule.date)) {
                            unpaidDays++;
                            unpaidDaysList.push({ date: schedule.date, reason: 'Absent' });
                        }
                    });
                    autoDeductions = dailyRate * unpaidDays;
                } else if (currentJob.payType === 'Hourly') {
                    const staffAttendance = Array.from(attendanceData.values()).filter(a => a.staffId === staff.id);
                    let totalHours = 0;
                    staffAttendance.forEach(att => {
                        const netHours = calculateHours(att.checkInTime, att.checkOutTime) - calculateHours(att.breakStart, att.breakEnd);
                        totalHours += netHours;
                        hourlyTimesheet.push({ date: att.date, checkIn: formatTime(att.checkInTime), checkOut: formatTime(att.checkOutTime), hours: netHours.toFixed(2) });
                    });
                    basePay = totalHours * (currentJob.rate || 0);
                }

                // --- 3. AGGREGATE ALL EARNINGS AND DEDUCTIONS ---
                const staffAdjustments = adjustmentsData.filter(a => a.staffId === staff.id);
                const otherEarnings = staffAdjustments.filter(a => a.type === 'Earning').reduce((sum, item) => sum + item.amount, 0);
                const otherDeductions = staffAdjustments.filter(a => a.type === 'Deduction').reduce((sum, item) => sum + item.amount, 0);

                const bonusInfo = bonusMap.get(staff.id) || { bonusAmount: 0 };
                const attendanceBonus = bonusInfo.bonusAmount;

                const grossPay = basePay + attendanceBonus + otherEarnings;

                // Social Security Calculation
                const ssoRate = (companyConfig.ssoRate || 5) / 100;
                const ssoCap = companyConfig.ssoCap || 750;
                const ssoDeduction = Math.min(grossPay * ssoRate, ssoCap);
                const ssoAllowance = ssoDeduction; // Allowance matches deduction

                const totalEarnings = grossPay + ssoAllowance;
                
                // Deductions
                const advanceDeduction = advancesData.filter(a => a.staffId === staff.id).reduce((sum, item) => sum + item.amount, 0);
                const loanDeduction = loansData.filter(l => l.staffId === staff.id).reduce((sum, item) => sum + item.monthlyRepayment, 0);
                
                const totalDeductions = autoDeductions + ssoDeduction + advanceDeduction + loanDeduction + otherDeductions;
                const netPay = totalEarnings - totalDeductions;

                return {
                    id: staff.id, name: staff.fullName, payType: currentJob.payType,
                    grossPay, totalDeductions, netPay,
                    // For payslip details
                    earnings: { basePay, attendanceBonus, ssoAllowance, others: staffAdjustments.filter(a => a.type === 'Earning') },
                    deductions: { absences: autoDeductions, sso: ssoDeduction, advance: advanceDeduction, loan: loanDeduction, others: staffAdjustments.filter(a => a.type === 'Deduction') },
                };
            });
            setPayrollData(data);
        } catch (err) {
            setError('Failed to generate payroll. Check browser console (F12) for details.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportPDF = () => { /* Placeholder for next step */ alert("PDF Export will be upgraded in the next step."); };
    const handleFinalizePayroll = async () => { /* Logic to finalize payroll */ };
    
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1];

    return (
        <div>
            {/* The Modal for detailed view will be upgraded in the next step */}
            {selectedStaffDetails && (
                <Modal isOpen={true} onClose={() => setSelectedStaffDetails(null)} title={`Payroll Details for ${selectedStaffDetails.name}`}>
                    <p>The detailed payslip view will be built in the next step.</p>
                </Modal>
            )}

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Payroll Generation</h2>
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8 flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Pay Period Month</label>
                    <select value={payPeriod.month} onChange={e => setPayPeriod(p => ({ ...p, month: e.target.value }))} className="w-full p-2 bg-gray-700 rounded-md">{months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                </div>
                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Pay Period Year</label>
                    <select value={payPeriod.year} onChange={e => setPayPeriod(p => ({ ...p, year: e.target.value }))} className="w-full p-2 bg-gray-700 rounded-md">{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
                </div>
                <button onClick={handleGeneratePayroll} disabled={isLoading} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 flex-shrink-0">{isLoading ? 'Generating...' : 'Generate'}</button>
                <button onClick={handleExportPDF} disabled={payrollData.length === 0} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 flex-shrink-0">Export to PDF</button>
            </div>
            
            {error && <p className="text-red-400 text-center mb-4">{error}</p>}

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Staff Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Gross Pay (THB)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Total Deductions (THB)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Net Pay (THB)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {payrollData.length > 0 ? payrollData.map(item => (
                            <tr key={item.id} onClick={() => setSelectedStaffDetails(item)} className="hover:bg-gray-700 cursor-pointer">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{item.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.grossPay.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.totalDeductions.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-amber-400">{item.netPay.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                            </tr>
                        )) : (
                            <tr><td colSpan="4" className="px-6 py-10 text-center text-gray-500">{isLoading ? 'Calculating payroll...' : 'Select a pay period and generate the payroll.'}</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            {payrollData.length > 0 && (
                <div className="mt-8 flex justify-end">
                    <button onClick={handleFinalizePayroll} disabled={isFinalizing} className="px-8 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold disabled:bg-gray-600">
                        {isFinalizing ? 'Finalizing...' : `Finalize Payroll for ${months[payPeriod.month-1]}`}
                    </button>
                </div>
            )}
        </div>
    );
};