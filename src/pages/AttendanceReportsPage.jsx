import React, { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Modal from '../components/Modal';
import EditAttendanceModal from '../components/EditAttendanceModal';

// --- NEW HELPER FUNCTION ---
const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

export default function AttendanceReportsPage({ db, staffList }) {
    const [reportData, setReportData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedStaffId, setSelectedStaffId] = useState('all');
    const [editingRecord, setEditingRecord] = useState(null);

    const handleGenerateReport = async () => {
        setIsLoading(true);
        setReportData([]);

        try {
            const schedulesQuery = query(collection(db, "schedules"), where("date", ">=", startDate), where("date", "<=", endDate));
            const schedulesSnapshot = await getDocs(schedulesQuery);
            const schedulesMap = new Map();
            schedulesSnapshot.docs.forEach(doc => {
                const data = doc.data();
                schedulesMap.set(`${data.staffId}_${data.date}`, data);
            });

            const attendanceQuery = query(collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate));
            const attendanceSnapshot = await getDocs(attendanceQuery);
            const attendanceMap = new Map();
            attendanceSnapshot.docs.forEach(doc => {
                const data = doc.data();
                attendanceMap.set(`${data.staffId}_${data.date}`, {id: doc.id, ...data});
            });

            const staffToReport = selectedStaffId === 'all' ? staffList : staffList.filter(s => s.id === selectedStaffId);
            const generatedData = [];

            for (const staff of staffToReport) {
                for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
                    const dateStr = d.toISOString().split('T')[0];
                    const key = `${staff.id}_${dateStr}`;
                    const schedule = schedulesMap.get(key);
                    const attendance = attendanceMap.get(key);

                    if (schedule || attendance) {
                        const checkInTime = attendance?.checkInTime?.toDate();
                        const scheduledTime = schedule ? new Date(`${dateStr}T${schedule.startTime}`) : null;
                        
                        let status = 'On Time';
                        if (!attendance && schedule) status = 'Absent';
                        if (attendance && !schedule) status = 'Extra Shift';
                        if (checkInTime && scheduledTime && checkInTime > scheduledTime) {
                            const lateMinutes = Math.round((checkInTime - scheduledTime) / 60000);
                            status = `Late (${lateMinutes}m)`;
                        }

                        const checkOutTime = attendance?.checkOutTime?.toDate();
                        const breakStartTime = attendance?.breakStart?.toDate();
                        const breakEndTime = attendance?.breakEnd?.toDate();

                        let workHours = 0;
                        if (checkInTime && checkOutTime) {
                            workHours = (checkOutTime - checkInTime) / 3600000;
                            if (breakStartTime && breakEndTime) {
                                workHours -= (breakEndTime - breakStartTime) / 3600000;
                            }
                        }

                        generatedData.push({
                            id: attendance ? attendance.id : key,
                            staffId: staff.id,
                            staffName: getDisplayName(staff), // --- UPDATED ---
                            date: dateStr,
                            checkIn: checkInTime?.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) || '-',
                            checkOut: checkOutTime?.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) || '-',
                            workHours: workHours.toFixed(2),
                            status: status,
                            fullRecord: attendance,
                        });
                    }
                }
            }
            
            generatedData.sort((a, b) => a.staffName.localeCompare(b.staffName) || a.date.localeCompare(b.date));
            setReportData(generatedData);
        } catch (error) {
            console.error("Error generating report: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRowClick = (record) => {
        setEditingRecord(record);
    };

    return (
        <div>
            {editingRecord && (
                <Modal isOpen={true} onClose={() => setEditingRecord(null)} title={editingRecord.fullRecord ? "Edit Attendance Record" : "Create Attendance Record"}>
                    <EditAttendanceModal db={db} record={editingRecord} onClose={() => { setEditingRecord(null); handleGenerateReport(); }} />
                </Modal>
            )}

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Attendance Reports</h2>
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8 flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Staff Member</label>
                    <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md">
                        <option value="all">All Staff</option>
                        {/* --- UPDATED --- */}
                        {staffList.map(staff => <option key={staff.id} value={staff.id}>{getDisplayName(staff)}</option>)}
                    </select>
                </div>
                <button onClick={handleGenerateReport} disabled={isLoading} className="w-full sm:w-auto px-6 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 flex-shrink-0">
                    {isLoading ? 'Generating...' : 'Generate Report'}
                </button>
            </div>

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Staff Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Check-In</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Check-Out</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Work Hours</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {reportData.length > 0 ? reportData.map((row, index) => (
                            <tr key={index} onClick={() => handleRowClick(row)} className="hover:bg-gray-700 cursor-pointer">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{row.staffName}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.date}</td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${row.status === 'Absent' ? 'text-red-400' : (row.status.startsWith('Late') ? 'text-yellow-400' : 'text-gray-300')}`}>{row.status}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.checkIn}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.checkOut}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.workHours > 0 ? row.workHours : '-'}</td>
                            </tr>
                        )) : (
                            <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500">{isLoading ? 'Loading data...' : 'Select a date range and staff member to generate a report.'}</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}