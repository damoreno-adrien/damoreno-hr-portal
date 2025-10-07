import React, { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';

const getCurrentJob = (staff) => {
    if (!staff?.jobHistory || staff.jobHistory.length === 0) {
        return { rate: 0, payType: 'Monthly' };
    }
    return staff.jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
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
            const month = payPeriod.month - 1; // JS months are 0-11
            const startDate = new Date(year, month, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            // 1. Fetch all necessary data for the period
            const attendanceQuery = query(collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate));
            const leaveQuery = query(collection(db, "leave_requests"), where("status", "==", "approved"), where("startDate", "<=", endDate), where("endDate", ">=", startDate));
            const schedulesQuery = query(collection(db, "schedules"), where("date", ">=", startDate), where("date", "<=", endDate));
            
            const [attendanceSnapshot, leaveSnapshot, scheduleSnapshot] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery), getDocs(schedulesQuery)]);
            
            const attendanceData = attendanceSnapshot.docs.map(doc => doc.data());
            const leaveData = leaveSnapshot.docs.map(doc => doc.data());
            const scheduleData = scheduleSnapshot.docs.map(doc => doc.data());

            // 2. Process payroll for each staff member
            const data = staffList.map(staff => {
                const currentJob = getCurrentJob(staff);
                let netPay = 0;
                let deductions = 0;

                if (currentJob.payType === 'Monthly') {
                    const dailyRate = currentJob.rate / daysInMonth;
                    let unpaidDays = 0;

                    // Find unpaid leave days
                    const unpaidLeave = leaveData.filter(l => l.staffId === staff.id && l.leaveType === 'Personal Leave');
                    unpaidLeave.forEach(l => {
                        // This simple calculation adds all days in the range.
                        // A more complex version would handle partial month ranges.
                        unpaidDays += l.totalDays;
                    });

                    // Find absent days
                    const staffSchedules = scheduleData.filter(s => s.staffId === staff.id);
                    staffSchedules.forEach(schedule => {
                        const wasOnLeave = leaveData.some(l => l.staffId === staff.id && schedule.date >= l.startDate && schedule.date <= l.endDate);
                        const didAttend = attendanceData.some(a => a.staffId === staff.id && a.date === schedule.date);
                        if (!didAttend && !wasOnLeave) {
                            unpaidDays += 1;
                        }
                    });

                    deductions = dailyRate * unpaidDays;
                    netPay = currentJob.rate - deductions;

                } else if (currentJob.payType === 'Hourly') {
                    const staffAttendance = attendanceData.filter(a => a.staffId === staff.id);
                    let totalHours = 0;
                    staffAttendance.forEach(att => {
                        const grossHours = calculateHours(att.checkInTime, att.checkOutTime);
                        const breakHours = calculateHours(att.breakStart, att.breakEnd);
                        totalHours += (grossHours - breakHours);
                    });
                    netPay = totalHours * currentJob.rate;
                }

                return {
                    id: staff.id,
                    name: staff.fullName,
                    baseSalary: currentJob.rate,
                    payType: currentJob.payType,
                    deductions: deductions.toFixed(2),
                    netPay: netPay.toFixed(2),
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
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Pay Rate (THB)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Deductions (THB)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Net Pay (THB)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {payrollData.length > 0 ? payrollData.map(item => (
                            <tr key={item.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{item.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.baseSalary.toLocaleString()} <span className="text-xs text-gray-500">{item.payType === 'Monthly' ? '/mo' : '/hr'}</span></td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-red-400">{item.deductions > 0 ? item.deductions : '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-amber-400">{parseFloat(item.netPay).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                     <span className="px-3 py-1 inline-flex text-xs font-semibold rounded-full bg-gray-600 text-gray-100">Ready</span>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="5" className="px-6 py-10 text-center text-gray-500">
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