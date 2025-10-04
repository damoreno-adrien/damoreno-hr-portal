import React, { useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

// Helper to format a Firestore timestamp to HH:mm, or return a placeholder
const formatTime = (timestamp) => {
    if (!timestamp?.toDate) return '-';
    return timestamp.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

// Helper to calculate the difference between two timestamps in hours
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
            // 1. Fetch attendance data for the selected date range
            const attendanceQuery = query(
                collection(db, "attendance"),
                where("date", ">=", startDate),
                where("date", "<=", endDate),
                orderBy("date", "asc")
            );
            const attendanceSnapshot = await getDocs(attendanceQuery);
            const attendanceData = attendanceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // For simplicity, this version calculates hours directly from attendance data.
            // A future enhancement could cross-reference with the 'schedules' collection to find absences.
            const processedData = attendanceData.map(att => {
                const staffMember = staffList.find(s => s.id === att.staffId);
                const totalHours = calculateHours(att.checkInTime, att.checkOutTime);
                // Note: This simple version doesn't account for breaks. This can be added later.
                return {
                    ...att,
                    staffName: staffMember ? staffMember.fullName : 'Unknown Staff',
                    totalHours: totalHours.toFixed(2), // Format to 2 decimal places
                };
            });
            
            setReportData(processedData);

        } catch (err) {
            setError('Failed to generate report. You may need to create a database index. Please check the browser console for a link.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-8">Attendance Reports</h2>
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8 flex items-end gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
                <button onClick={handleGenerateReport} disabled={isLoading} className="px-6 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600">
                    {isLoading ? 'Generating...' : 'Generate Report'}
                </button>
            </div>

            {error && <p className="text-red-400 text-center mb-4">{error}</p>}
            
            <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                 <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Staff Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Check-In</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Check-Out</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Total Hours</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {reportData.length > 0 ? reportData.map(item => (
                            <tr key={item.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.date}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{item.staffName}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{formatTime(item.checkInTime)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{formatTime(item.checkOutTime)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-amber-400">{item.totalHours}</td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="5" className="px-6 py-10 text-center text-gray-500">
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