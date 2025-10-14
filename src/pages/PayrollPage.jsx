import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, onSnapshot, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from '../components/Modal';
import PayslipDetailView from '../components/PayslipDetailView';

const formatCurrency = (num) => num ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const getCurrentJob = (staff) => { if (!staff?.jobHistory || staff.jobHistory.length === 0) { return { rate: 0, payType: 'Monthly', department: 'N/A' }; } const latestJob = staff.jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0]; if (latestJob.rate === undefined && latestJob.baseSalary !== undefined) { return { ...latestJob, rate: latestJob.baseSalary, payType: 'Monthly' }; } return latestJob; };
const calculateHours = (start, end) => { if (!start?.toDate || !end?.toDate) return 0; const diffMillis = end.toDate() - start.toDate(); return diffMillis / (1000 * 60 * 60); };
const formatTime = (timestamp) => timestamp ? timestamp.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'N/A';

export default function PayrollPage({ db, staffList, companyConfig }) {
    const [payPeriod, setPayPeriod] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
    const [payrollData, setPayrollData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [error, setError] = useState('');
    const [selectedStaffDetails, setSelectedStaffDetails] = useState(null);
    const [isMonthFullyFinalized, setIsMonthFullyFinalized] = useState(false);

    const [history, setHistory] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [expandedRunId, setExpandedRunId] = useState(null);

    const [selectedForPayroll, setSelectedForPayroll] = useState(new Set());

    const handleGeneratePayroll = async () => {
        if (!companyConfig) { setError("Company settings are not loaded yet. Please wait and try again."); return; }
        setIsLoading(true);
        setError('');
        setIsMonthFullyFinalized(false);
        
        try {
            const year = payPeriod.year;
            const month = payPeriod.month - 1;

            const finalizedPayslipsSnap = await getDocs(query(
                collection(db, "payslips"),
                where("payPeriodYear", "==", year),
                where("payPeriodMonth", "==", month + 1)
            ));
            const finalizedStaffIds = new Set(finalizedPayslipsSnap.docs.map(doc => doc.data().staffId));

            const staffToProcess = staffList.filter(staff => !finalizedStaffIds.has(staff.id));
            
            if (staffToProcess.length === 0 && staffList.length > 0) {
                setPayrollData([]);
                setIsMonthFullyFinalized(true);
                setIsLoading(false);
                return;
            }

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
                Promise.all(staffToProcess.map(staff => calculateBonus({ staffId: staff.id, payPeriod: { year, month: month + 1 } }).then(result => ({ staffId: staff.id, ...result.data })).catch(err => ({ staffId: staff.id, bonusAmount: 0, newStreak: 0 }))))
            ]);

            const attendanceData = new Map(attendanceSnapshot.docs.map(doc => [`${doc.data().staffId}_${doc.data().date}`, doc.data()]));
            const scheduleData = scheduleSnapshot.docs.map(doc => doc.data());
            const allLeaveData = allLeaveSnapshot.docs.map(doc => doc.data());
            const advancesData = advancesSnapshot.docs.map(doc => doc.data());
            const loansData = loansSnapshot.docs.map(doc => doc.data());
            const adjustmentsData = adjustmentsSnapshot.docs.map(doc => doc.data());
            const bonusMap = new Map(bonusResults.map(res => [res.staffId, res]));
            const publicHolidays = companyConfig.publicHolidays.map(h => h.date);
            
            const data = staffToProcess.map(staff => {
                const currentJob = getCurrentJob(staff);
                const displayName = `${staff.nickname || staff.firstName} (${currentJob.department || 'N/A'})`;

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
                    displayName: displayName,
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

    useEffect(() => {
        if (payrollData.length > 0) {
            const allIds = new Set(payrollData.map(p => p.id));
            setSelectedForPayroll(allIds);
        } else {
            setSelectedForPayroll(new Set());
        }
    }, [payrollData]);

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
    
    const handleFinalizePayroll = async () => {
        const dataToFinalize = payrollData.filter(p => selectedForPayroll.has(p.id));

        if (dataToFinalize.length === 0) {
            alert("Please select at least one employee to finalize.");
            return;
        }

        if (!window.confirm(`Are you sure you want to finalize payroll for ${dataToFinalize.length} employee(s) for ${months[payPeriod.month - 1]} ${payPeriod.year}?`)) {
            return;
        }

        setIsFinalizing(true);
        try {
            const functions = getFunctions();
            const finalizeAndStorePayslips = httpsCallable(functions, 'finalizeAndStorePayslips');
            await finalizeAndStorePayslips({ payrollData: dataToFinalize, payPeriod });

            alert("Payroll finalized and payslips stored successfully!");
            handleGeneratePayroll();
        } catch (error) {
            console.error("Error finalizing payroll:", error);
            alert(`Failed to finalize payroll: ${error.message}`);
        } finally {
            setIsFinalizing(false);
        }
    };
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1];

    useEffect(() => {
        if (!db) return;
        setIsLoadingHistory(true);
        const q = query(collection(db, 'payslips'), orderBy('generatedAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const payslips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const grouped = payslips.reduce((acc, payslip) => {
                const key = `${payslip.payPeriodYear}-${payslip.payPeriodMonth}`;
                if (!acc[key]) {
                    acc[key] = {
                        id: key,
                        year: payslip.payPeriodYear,
                        month: payslip.payPeriodMonth,
                        payslips: [],
                        totalAmount: 0,
                    };
                }
                acc[key].payslips.push(payslip);
                acc[key].totalAmount += payslip.netPay;
                return acc;
            }, {});

            const historyArray = Object.values(grouped).sort((a, b) => {
                if (a.year !== b.year) return b.year - a.year;
                return b.month - a.month;
            });
            
            setHistory(historyArray);
            setIsLoadingHistory(false);
        });

        return () => unsubscribe();
    }, [db]);
    
    const handleToggleExpand = (runId) => {
        setExpandedRunId(prevId => (prevId === runId ? null : runId));
    };

    const handleSelectOne = (staffId) => {
        setSelectedForPayroll(prev => {
            const newSet = new Set(prev);
            if (newSet.has(staffId)) {
                newSet.delete(staffId);
            } else {
                newSet.add(staffId);
            }
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (selectedForPayroll.size === payrollData.length) {
            setSelectedForPayroll(new Set());
        } else {
            setSelectedForPayroll(new Set(payrollData.map(p => p.id)));
        }
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
                    <td onClick={() => setSelectedStaffDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white cursor-pointer">{item.displayName}</td>
                    <td onClick={() => setSelectedStaffDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 cursor-pointer">{formatCurrency(item.totalEarnings)}</td>
                    <td onClick={() => setSelectedStaffDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 cursor-pointer">{formatCurrency(item.totalDeductions)}</td>
                    <td onClick={() => setSelectedStaffDetails(item)} className="px-6 py-4 whitespace-nowrap text-sm font-bold text-amber-400 cursor-pointer">{formatCurrency(item.netPay)}</td>
                </tr>
            ));
        }
        return <tr><td colSpan="5" className="px-6 py-10 text-center text-gray-500">Select a pay period and generate the payroll.</td></tr>;
    };

    return (
        <div>
            {selectedStaffDetails && (
                <Modal isOpen={true} onClose={() => setSelectedStaffDetails(null)} title={`Payslip Details for ${selectedStaffDetails.name}`}>
                    <PayslipDetailView details={selectedStaffDetails} companyConfig={companyConfig} payPeriod={payPeriod} />
                </Modal>
            )}

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
                                    <input 
                                        type="checkbox" 
                                        className="rounded"
                                        checked={payrollData.length > 0 && selectedForPayroll.size === payrollData.length}
                                        onChange={handleSelectAll}
                                    />
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
                    <div className="mt-8 flex justify-end">
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

            <hr className="border-gray-700 my-12" />

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
                                <div onClick={() => handleToggleExpand(run.id)} className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-700">
                                    <div>
                                        <p className="font-bold text-lg text-white">{months[run.month - 1]} {run.year}</p>
                                        <p className="text-sm text-gray-400">{run.payslips.length} employees paid • Total: {formatCurrency(run.totalAmount)} THB</p>
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
                                                        <tr key={p.id}>
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
        </div>
    );
};