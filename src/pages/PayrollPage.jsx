import React, { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';

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

export default function PayrollPage({ db, staffList }) {
    const [payPeriod, setPayPeriod] = useState({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
    });
    const [payrollData, setPayrollData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleGeneratePayroll = async () => {
        setIsLoading(true);
        setError('');
        
        try {
            const year = payPeriod.year;
            const month = payPeriod.month - 1;
            const startDate = new Date(year, month, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            const attendanceQuery = query(collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate));
            const leaveQuery = query(collection(db, "leave_requests"), where("status", "==", "approved"), where("startDate", "<=", endDate), where("endDate", ">=", startDate));
            const schedulesQuery = query(collection(db, "schedules"), where("date", ">=", startDate), where("date", "<=", endDate));
            
            const [attendanceSnapshot, leaveSnapshot, scheduleSnapshot] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery), getDocs(schedulesQuery)]);
            
            const attendanceData = attendanceSnapshot.docs.map(doc => doc.data());
            const leaveData = leaveSnapshot.docs.map(doc => doc.data());
            const scheduleData = scheduleSnapshot.docs.map(doc => doc.data());

            const data = staffList.map(staff => {
                const currentJob = getCurrentJob(staff);
                let grossPay = 0;
                let autoDeductions = 0;

                if (currentJob.payType === 'Monthly') {
                    grossPay = currentJob.rate || 0;
                    const dailyRate = grossPay / daysInMonth;
                    let unpaidDays = 0;

                    const unpaidLeave = leaveData.filter(l => l.staffId === staff.id && l.leaveType === 'Personal Leave');
                    unpaidLeave.forEach(l => { unpaidDays += l.totalDays; });

                    const staffSchedules = scheduleData.filter(s => s.staffId === staff.id);
                    staffSchedules.forEach(schedule => {
                        const wasOnLeave = leaveData.some(l => l.staffId === staff.id && schedule.date >= l.startDate && schedule.date <= l.endDate);
                        const didAttend = attendanceData.some(a => a.staffId === staff.id && a.date === schedule.date);
                        if (!didAttend && !wasOnLeave) { unpaidDays += 1; }
                    });
                    autoDeductions = dailyRate * unpaidDays;

                } else if (currentJob.payType === 'Hourly') {
                    const staffAttendance = attendanceData.filter(a => a.staffId === staff.id);
                    let totalHours = 0;
                    staffAttendance.forEach(att => {
                        const workHours = calculateHours(att.checkInTime, att.checkOutTime);
                        const breakHours = calculateHours(att.breakStart, att.breakEnd);
                        totalHours += (workHours - breakHours);
                    });
                    grossPay = totalHours * (currentJob.rate || 0);
                }

                return {
                    id: staff.id,
                    name: staff.fullName,
                    payType: currentJob.payType,
                    rate: currentJob.rate || 0,
                    grossPay: grossPay,
                    deductions: autoDeductions,
                    adjustments: 0,
                    notes: '',
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
            currentData.map(item => {
                if (item.id === staffId) {
                    return { ...item, [field]: value };
                }
                return item;
            })
        );
    };

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const years = [new Date().getFullYear(), new Date().getFullYear() - 1];

    return (
        <div>
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
                                <tr key={item.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{item.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.grossPay.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm"><input type="number" value={item.deductions} onChange={(e) => handleAdjustmentChange(item.id, 'deductions', e.target.value)} className="w-24 bg-gray-600 rounded-md p-1 text-white"/></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm"><input type="number" value={item.adjustments} onChange={(e) => handleAdjustmentChange(item.id, 'adjustments', e.target.value)} className="w-24 bg-gray-600 rounded-md p-1 text-white"/></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm"><input type="text" value={item.notes} onChange={(e) => handleAdjustmentChange(item.id, 'notes', e.target.value)} className="w-32 bg-gray-600 rounded-md p-1 text-white"/></td>
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