import React, { useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

const formatTime = (timestamp) => {
    if (!timestamp?.toDate) return '-';
    return timestamp.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const calculateHours = (start, end) => {
    if (!start?.toDate || !end?.toDate) return 0;
    const diffMillis = end.toDate() - start.toDate();
    return diffMillis / (1000 * 60 * 60);
};

export default function AttendanceReportsPage({ db, staffList }) {
    const today = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [reportData, setReportData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleGenerateReport = async () => {
        if (!startDate || !endDate) {
            setError('Please select both a start and end date.');
            return;
        }
        setIsLoading(true);
        setError('');
        setReportData([]);

        try {
            const schedulesQuery = query(
                collection(db, "schedules"),
                where("date", ">=", startDate),
                where("date", "<=", endDate)
            );
            const schedulesSnapshot = await getDocs(schedulesQuery);
            const schedulesData = schedulesSnapshot.docs.map(doc => doc.data());

            const attendanceQuery = query(
                collection(db, "attendance"),
                where("date", ">=", startDate),
                where("date", "<=", endDate)
            );
            const attendanceSnapshot = await getDocs(attendanceQuery);
            const attendanceMap = new Map();
            attendanceSnapshot.docs.forEach(doc => {
                const data = doc.data();
                const key = `${data.staffId}_${data.date}`;
                attendanceMap.set(key, data);
            });

            const processedData = schedulesData.map(schedule => {
                const key = `${schedule.staffId}_${schedule.date}`;
                const attendance = attendanceMap.get(key);
                const staffMember = staffList.find(s => s.id === schedule.staffId);

                if (!attendance) {
                    return {
                        id: key, date: schedule.date, staffName: staffMember?.fullName || 'Unknown',
                        checkInTime: '-', checkOutTime: '-', breakHours: 0, totalHours: 0, status: 'Absent'
                    };
                }

                const breakHours = calculateHours(attendance.breakStart, attendance.breakEnd);
                const grossHours = calculateHours(attendance.checkInTime, attendance.checkOutTime);
                const netHours = grossHours - breakHours;

                const scheduledStart = new Date(`${schedule.date}T${schedule.startTime}`);
                scheduledStart.setMinutes(scheduledStart.getMinutes() + 5);
                const actualCheckIn = attendance.checkInTime.toDate();
                const status = actualCheckIn > scheduledStart ? 'Late' : 'Completed';
                
                return {
                    id: key, date: schedule.date, staffName: staffMember?.fullName || 'Unknown',
                    checkInTime: attendance.checkInTime,
                    checkOutTime: attendance.checkOutTime,
                    breakHours: breakHours.toFixed(2),
                    totalHours: netHours.toFixed(2),
                    status: attendance.checkOutTime ? status : 'On Shift',
                };
            });

            processedData.sort((a, b) => {
                if (a.date < b.date) return -1;
                if (a.date > b.date) return 1;
                if (a.staffName < b.staffName) return -1;
                if (a.staffName > b.staffName) return 1;
                return 0;
            });

            setReportData(processedData);

        } catch (err) {
            setError('Failed to generate report. A database index may be required. Please check the browser console (F12) for a link to create it.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };
    
    const StatusBadge = ({ status }) => {
        let color = 'bg-gray-500';
        if (status === 'Completed') color = 'bg-green-600';
        if (status === 'Late') color = 'bg-yellow-500';
        if (status === 'Absent') color = 'bg-red-600';
        if (status === 'On Shift') color = 'bg-blue-500';
        return <span className={`px-3 py-1 inline-flex text-xs font-semibold rounded-full ${color} text-white`}>{status}</span>;
    };

    return (
        <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Attendance Reports</h2>
            
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8 flex flex-col space-y-4 md:space-y-0 md:flex-row md:items-end md:space-x-4">
                 <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
                <button onClick={handleGenerateReport} disabled={isLoading} className="w-full md:w-auto px-6 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 flex-shrink-0">
                    {isLoading ? 'Generating...' : 'Generate Report'}
                </button>
            </div>

            {error && <p className="text-red-400 text-center mb-4">{error}</p>}
            
            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                 <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Staff Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Check-In</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Check-Out</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Break (Hrs)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Hours Worked</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {reportData.length > 0 ? reportData.map(item => (
                            <tr key={item.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.date}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{item.staffName}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{formatTime(item.checkInTime)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{formatTime(item.checkOutTime)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.breakHours > 0 ? item.breakHours : '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-amber-400">{item.totalHours > 0 ? item.totalHours : '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm"><StatusBadge status={item.status} /></td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="7" className="px-6 py-10 text-center text-gray-500">
                                    {isLoading ? 'Loading data...' : 'No data to display. Please generate a report.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};