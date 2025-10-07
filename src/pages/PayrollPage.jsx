import React, { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from '../components/Modal';

const getCurrentJob = (staff) => {
    if (!staff?.jobHistory || staff.jobHistory.length === 0) {
        return { rate: 0, payType: 'Monthly' };
    }
    const latestJob = staff.jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
    if (latestJob.rate === undefined && latestJob.baseSalary !== undefined) {
        return { ...latestJob, rate: latestJob.baseSalary, payType: 'Monthly' };
    }
    return latestJob;
};

const calculateHours = (start, end) => {
    if (!start?.toDate || !end?.toDate) return 0;
    const diffMillis = end.toDate() - start.toDate();
    return diffMillis / (1000 * 60 * 60);
};

export default function PayrollPage({ db, staffList, companyConfig }) {
    const [payPeriod, setPayPeriod] = useState({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
    });
    const [payrollData, setPayrollData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedStaffDetails, setSelectedStaffDetails] = useState(null);

    const handleGeneratePayroll = async () => {
        if (!companyConfig) {
            setError("Company settings are not loaded yet. Please wait a moment and try again.");
            return;
        }
        setIsLoading(true);
        setError('');
        
        try {
            const year = payPeriod.year;
            const month = payPeriod.month - 1;
            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);
            const daysInMonth = endDate.getDate();

            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];
            const startOfYearStr = new Date(year, 0, 1).toISOString().split('T')[0];

            const attendanceQuery = query(collection(db, "attendance"), where("date", ">=", startDateStr), where("date", "<=", endDateStr));
            const schedulesQuery = query(collection(db, "schedules"), where("date", ">=", startDateStr), where("date", "<=", endDateStr));
            const allLeaveQuery = query(collection(db, "leave_requests"), where("status", "==", "approved"), where("startDate", ">=", startOfYearStr), where("endDate", "<=", new Date(year, 11, 31).toISOString().split('T')[0]));
            
            const [attendanceSnapshot, scheduleSnapshot, allLeaveSnapshot] = await Promise.all([
                getDocs(attendanceQuery), getDocs(schedulesQuery), getDocs(allLeaveQuery)
            ]);
            
            const attendanceData = attendanceSnapshot.docs.map(doc => doc.data());
            const scheduleData = scheduleSnapshot.docs.map(doc => doc.data());
            const allLeaveData = allLeaveSnapshot.docs.map(doc => doc.data());
            const publicHolidays = companyConfig.publicHolidays.map(h => h.date);

            const data = staffList.map(staff => {
                const currentJob = getCurrentJob(staff);
                let grossPay = 0;
                let autoDeductions = 0;
                let unpaidDaysList = [];
                let hourlyTimesheet = [];

                const hireDate = new Date(staff.startDate);
                const yearsOfService = (new Date(year, 11, 31) - hireDate) / (1000 * 60 * 60 * 24 * 365);
                let annualLeaveEntitlement = 0;
                if (yearsOfService >= 1) {
                    annualLeaveEntitlement = companyConfig.annualLeaveDays;
                } else if (hireDate.getFullYear() === year) {
                    const monthsWorked = 12 - hireDate.getMonth();
                    annualLeaveEntitlement = Math.floor((companyConfig.annualLeaveDays / 12) * monthsWorked);
                }
                
                const ytdLeave = allLeaveData.filter(l => l.staffId === staff.id);

                if (currentJob.payType === 'Monthly') {
                    grossPay = currentJob.rate || 0;
                    const dailyRate = grossPay / daysInMonth;
                    let unpaidDays = 0;

                    const monthLeave = ytdLeave.filter(l => new Date(l.startDate) <= endDate && new Date(l.endDate) >= startDate);
                    
                    monthLeave.forEach(leave => {
                        const totalDaysBeforeThisLeave = ytdLeave
                            .filter(l => l.leaveType === leave.leaveType && new Date(l.startDate) < new Date(leave.startDate))
                            .reduce((sum, l) => sum + l.totalDays, 0);
                        
                        let entitlement = 0;
                        if (leave.leaveType === 'Sick Leave') entitlement = companyConfig.paidSickDays;
                        if (leave.leaveType === 'Personal Leave') entitlement = companyConfig.paidPersonalDays;
                        if (leave.leaveType === 'Annual Leave') entitlement = annualLeaveEntitlement;

                        const daysOverLimit = Math.max(0, (totalDaysBeforeThisLeave + leave.totalDays) - entitlement);
                        const unpaidDaysForThisLeave = Math.min(leave.totalDays, daysOverLimit);

                        if (unpaidDaysForThisLeave > 0) {
                            unpaidDaysList.push({ date: leave.startDate, reason: `Unpaid ${leave.leaveType} (${unpaidDaysForThisLeave} days)` });
                            unpaidDays += unpaidDaysForThisLeave;
                        }
                    });

                    const staffSchedules = scheduleData.filter(s => s.staffId === staff.id);
                    staffSchedules.forEach(schedule => {
                        const wasOnLeave = monthLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
                        const didAttend = attendanceData.some(a => a.staffId === staff.id && a.date === schedule.date);
                        const isPublicHoliday = publicHolidays.includes(schedule.date);

                        if (!didAttend && !wasOnLeave && !isPublicHoliday) {
                            unpaidDays += 1;
                            unpaidDaysList.push({ date: schedule.date, reason: 'Absent' });
                        }
                    });
                    autoDeductions = dailyRate * unpaidDays;

                } else if (currentJob.payType === 'Hourly') {
                    const staffAttendance = attendanceData.filter(a => a.staffId === staff.id);
                    let totalHours = 0;
                    staffAttendance.forEach(att => {
                        const workHours = calculateHours(att.checkInTime, att.checkOutTime);
                        const breakHours = calculateHours(att.breakStart, att.breakEnd);
                        const netHours = workHours - breakHours;
                        totalHours += netHours;
                        hourlyTimesheet.push({
                            date: att.date,
                            checkIn: formatTime(att.checkInTime),
                            checkOut: formatTime(att.checkOutTime),
                            hours: netHours.toFixed(2)
                        });
                    });
                    grossPay = totalHours * (currentJob.rate || 0);
                }

                return {
                    id: staff.id, name: staff.fullName, payType: currentJob.payType,
                    rate: currentJob.rate || 0, grossPay: grossPay, deductions: autoDeductions,
                    adjustments: 0, notes: '',
                    unpaidDaysList, hourlyTimesheet,
                };
            });
            setPayrollData(data);
        } catch (err) {
            setError('Failed to generate payroll. A database index may be required. Please check the browser console (F12).');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAdjustmentChange = (staffId, field, value) => {
        setPayrollData(currentData =>
            currentData.map(item => item.id === staffId ? { ...item, [field]: value } : item)
        );
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        const payPeriodTitle = `${months[payPeriod.month - 1]} ${payPeriod.year}`;
        doc.text(`Payroll Report - ${payPeriodTitle}`, 14, 15);

        const tableColumns = ['Staff Name', 'Gross Pay', 'Deductions', 'Adjustments', 'Notes', 'Net Pay'];
        const tableRows = [];

        payrollData.forEach(item => {
            const netPay = (item.grossPay || 0) - (parseFloat(item.deductions) || 0) + (parseFloat(item.adjustments) || 0);
            const rowData = [
                item.name,
                item.grossPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                parseFloat(item.deductions).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                parseFloat(item.adjustments).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                item.notes,
                netPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            ];
            tableRows.push(rowData);
        });

        autoTable(doc, {
            head: [tableColumns],
            body: tableRows,
            startY: 20,
        });
        doc.save(`payroll_report_${payPeriod.year}_${payPeriod.month}.pdf`);
    };

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1];

    return (
        <div>
            {selectedStaffDetails && (
                <Modal isOpen={true} onClose={() => setSelectedStaffDetails(null)} title={`Payroll Details for ${selectedStaffDetails.name}`}>
                    <div className="space-y-4">
                        {selectedStaffDetails.payType === 'Monthly' ? (
                            <div>
                                <h4 className="font-semibold text-lg text-white mb-2">Deduction Details</h4>
                                {selectedStaffDetails.unpaidDaysList.length > 0 ? (
                                    <ul className="space-y-1 text-sm max-h-80 overflow-y-auto">
                                        {selectedStaffDetails.unpaidDaysList.map((day, i) => (
                                            <li key={i} className="flex justify-between p-2 bg-gray-700 rounded-md">
                                                <span className="text-gray-300">{day.date}</span>
                                                <span className="font-semibold text-red-400">{day.reason}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="text-gray-400 text-sm">No automatic deductions for this period.</p>}
                            </div>
                        ) : (
                            <div>
                                <h4 className="font-semibold text-lg text-white mb-2">Hourly Timesheet</h4>
                                {selectedStaffDetails.hourlyTimesheet.length > 0 ? (
                                    <div className="space-y-1 text-sm max-h-80 overflow-y-auto">
                                        {selectedStaffDetails.hourlyTimesheet.map((day, i) => (
                                            <li key={i} className="flex justify-between items-center p-2 bg-gray-700 rounded-md">
                                                <span className="text-gray-300">{day.date}</span>
                                                <span className="text-white">{day.checkIn} - {day.checkOut}</span>
                                                <span className="font-semibold text-amber-400">{day.hours} hours</span>
                                            </li>
                                        ))}
                                    </div>
                                ) : <p className="text-gray-400 text-sm">No hours recorded for this period.</p>}
                            </div>
                        )}
                    </div>
                </Modal>
            )}

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Payroll Generation</h2>
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8 flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Pay Period Month</label>
                    <select value={payPeriod.month} onChange={e => setPayPeriod(p => ({ ...p, month: e.target.value }))} className="w-full p-2 bg-gray-700 rounded-md">
                        {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Pay Period Year</label>
                    <select value={payPeriod.year} onChange={e => setPayPeriod(p => ({ ...p, year: e.target.value }))} className="w-full p-2 bg-gray-700 rounded-md">
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <button onClick={handleGeneratePayroll} disabled={isLoading} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 flex-shrink-0">
                    {isLoading ? 'Generating...' : 'Generate'}
                </button>
                <button onClick={handleExportPDF} disabled={payrollData.length === 0} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 flex-shrink-0">
                    Export to PDF
                </button>
            </div>
            
            {error && <p className="text-red-400 text-center mb-4">{error}</p>}

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Staff Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Gross Pay (THB)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Deductions (THB)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Adjustments (THB)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Notes</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Net Pay (THB)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {payrollData.length > 0 ? payrollData.map(item => {
                            const netPay = (item.grossPay || 0) - (parseFloat(item.deductions) || 0) + (parseFloat(item.adjustments) || 0);
                            return (
                                <tr key={item.id} onClick={() => setSelectedStaffDetails(item)} className="hover:bg-gray-700 cursor-pointer">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{item.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.grossPay.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm"><input type="number" value={item.deductions} onChange={(e) => handleAdjustmentChange(item.id, 'deductions', e.target.value)} onClick={e => e.stopPropagation()} className="w-24 bg-gray-600 rounded-md p-1 text-white"/></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm"><input type="number" value={item.adjustments} onChange={(e) => handleAdjustmentChange(item.id, 'adjustments', e.target.value)} onClick={e => e.stopPropagation()} className="w-24 bg-gray-600 rounded-md p-1 text-white"/></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm"><input type="text" value={item.notes} onChange={(e) => handleAdjustmentChange(item.id, 'notes', e.target.value)} onClick={e => e.stopPropagation()} className="w-32 bg-gray-600 rounded-md p-1 text-white"/></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-amber-400">{netPay.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                </tr>
                            )
                        }) : (
                            <tr>
                                <td colSpan="6" className="px-6 py-10 text-center text-gray-500">
                                    {isLoading ? 'Calculating payroll...' : 'Select a pay period and generate the payroll.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};