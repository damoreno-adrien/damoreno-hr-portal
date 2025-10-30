// src/pages/AttendanceReportsPage.jsx
import React, { useState, useRef, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import Modal from '../components/Modal';
import EditAttendanceModal from '../components/EditAttendanceModal';
import ImportConfirmationModal from '../components/ImportConfirmationModal';
import { DownloadIcon, UploadIcon } from '../components/Icons';
import * as dateUtils from '../utils/dateUtils';
import { app } from "../../firebase.js";

// --- *** THIS IS THE FIX: Point to the correct 'us-central1' region *** ---
const functions = getFunctions(app, "us-central1"); 
const exportAttendanceData = httpsCallable(functions, 'exportAttendanceData');
const importAttendanceData = httpsCallable(functions, 'importAttendanceData');
// --- *** END FIX *** ---

// Helper function for display name
const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName && staff.lastName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.firstName) return staff.firstName;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

export default function AttendanceReportsPage({ db, staffList }) {
    const [reportData, setReportData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [startDate, setStartDate] = useState(dateUtils.formatISODate(new Date()));
    const [endDate, setEndDate] = useState(dateUtils.formatISODate(new Date()));
    const [selectedStaffId, setSelectedStaffId] = useState('all');
    const [editingRecord, setEditingRecord] = useState(null);

    // --- State for Export ---
    const [isExporting, setIsExporting] = useState(false);

    // --- State for Import ---
    const [isImporting, setIsImporting] = useState(false);
    const [isConfirmingImport, setIsConfirmingImport] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [csvDataToConfirm, setCsvDataToConfirm] = useState(null);
    const fileInputRef = useRef(null);

    // --- Function to generate the report displayed on the page ---
    const handleGenerateReport = async () => {
        setIsLoading(true);
        setReportData([]);
        setImportResult(null);

        try {
            // --- 1. Fetch Schedules ---
            console.log(`Generating report for ${startDate} to ${endDate}`);
            const schedulesQuery = query(collection(db, "schedules"), where("date", ">=", startDate), where("date", "<=", endDate));
            const schedulesSnapshot = await getDocs(schedulesQuery);
            const schedulesMap = new Map();
            schedulesSnapshot.docs.forEach(doc => {
                const data = doc.data();
                schedulesMap.set(`${data.staffId}_${data.date}`, data);
            });
            console.log(`Fetched ${schedulesMap.size} schedule records.`);

            // --- 2. Fetch Attendance ---
            const attendanceQuery = query(collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate));
            const attendanceSnapshot = await getDocs(attendanceQuery);
            const attendanceMap = new Map();
            attendanceSnapshot.docs.forEach(doc => {
                const data = doc.data();
                attendanceMap.set(`${data.staffId}_${data.date}`, { id: doc.id, ...data });
            });
            console.log(`Fetched ${attendanceMap.size} attendance records.`);

            // --- 3. Fetch Approved Leave Requests ---
            const leaveQuery = query(
                collection(db, "leave_requests"),
                where("status", "==", "approved"),
                where("startDate", "<=", endDate)
            );
            const leaveSnapshot = await getDocs(leaveQuery);
            const leaveMap = new Map();
            
            leaveSnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.endDate >= startDate) {
                    const allLeaveDays = dateUtils.eachDayOfInterval(data.startDate, data.endDate);
                    allLeaveDays.forEach(day => {
                        const dateStr = dateUtils.formatISODate(day);
                        if (dateStr >= startDate && dateStr <= endDate) {
                            leaveMap.set(`${data.staffId}_${dateStr}`, data);
                        }
                    });
                }
            });
            console.log(`Found ${leaveMap.size} approved leave days in range.`);


            // --- 4. Process and Generate Report Data ---
            const staffToReport = selectedStaffId === 'all'
                ? staffList.filter(s => s.status !== 'inactive')
                : staffList.filter(s => s.id === selectedStaffId);

            const generatedData = [];
            const dateInterval = dateUtils.eachDayOfInterval(startDate, endDate);

            for (const staff of staffToReport) {
                if (!staff || !staff.id) continue;

                for (const day of dateInterval) {
                    const dateStr = dateUtils.formatISODate(day);
                    const key = `${staff.id}_${dateStr}`;

                    const schedule = schedulesMap.get(key);
                    const attendance = attendanceMap.get(key);
                    const approvedLeave = leaveMap.get(key);

                    let status = 'Unknown';
                    const checkInTime = dateUtils.fromFirestore(attendance?.checkInTime);

                    const isWorkSchedule = schedule && typeof schedule.type === 'string' && schedule.type.toLowerCase() === 'work';
                    const isOffSchedule = schedule && typeof schedule.type === 'string' && schedule.type.toLowerCase() === 'off';
                    const scheduledStartTimeStr = (isWorkSchedule && schedule.startTime) ? schedule.startTime : null;
                    const scheduledTime = scheduledStartTimeStr ? dateUtils.fromFirestore(`${dateStr}T${scheduledStartTimeStr}`) : null;


                    if (attendance) {
                        if (scheduledTime) {
                             if (checkInTime) {
                                if (checkInTime > scheduledTime) {
                                    const lateMinutes = Math.ceil((checkInTime.getTime() - scheduledTime.getTime()) / 60000);
                                    status = `Late (${lateMinutes}m)`;
                                } else {
                                    status = 'Present';
                                }
                            } else {
                                 status = 'Present (No Check-in?)';
                            }
                        } else if (isOffSchedule) {
                             status = 'Worked on Day Off';
                        } else {
                             status = 'Present (Unscheduled)';
                        }
                    } else {
                        if (approvedLeave) {
                            status = 'Leave';
                        } else if (isWorkSchedule) {
                            status = 'Absent';
                        } else if (isOffSchedule) {
                            status = 'Off';
                        } else if (!schedule) {
                            status = 'Off';
                        } else {
                            status = 'Off';
                        }
                    }

                    const checkOutTime = dateUtils.fromFirestore(attendance?.checkOutTime);
                    const breakStartTime = dateUtils.fromFirestore(attendance?.breakStart);
                    const breakEndTime = dateUtils.fromFirestore(attendance?.breakEnd);

                    let workHours = 0;
                    if (checkInTime && checkOutTime) {
                        workHours = (checkOutTime.getTime() - checkInTime.getTime());
                        if (breakStartTime && breakEndTime) {
                            workHours -= (breakEndTime.getTime() - breakStartTime.getTime());
                        }
                        workHours = Math.max(0, workHours) / 3600000;
                    }

                    if (status !== 'Unknown') {
                        generatedData.push({
                            id: attendance ? attendance.id : `no_attendance_${staff.id}_${dateStr}`,
                            staffId: staff.id,
                            staffName: getDisplayName(staff),
                            date: dateStr,
                            checkIn: checkInTime ? dateUtils.formatCustom(checkInTime, 'HH:mm') : '-',
                            checkOut: checkOutTime ? dateUtils.formatCustom(checkOutTime, 'HH:mm') : '-',
                            workHours: (status === 'Leave' || status === 'Off') ? 'N/A' : (workHours > 0 ? workHours.toFixed(2) : '0.00'),
                            status: status,
                            fullRecord: attendance || { staffId: staff.id, date: dateStr, id: null },
                        });
                    }
                }
            }

            generatedData.sort((a, b) => a.staffName.localeCompare(b.staffName) || a.date.localeCompare(b.date));
            setReportData(generatedData);
            console.log(`Generated ${generatedData.length} report rows.`);

        } catch (error) {
            console.error("Error generating attendance report: ", error);
             setImportResult({ message: "Error generating report.", errors: [error.message] });
        } finally {
            setIsLoading(false);
        }
    };


    // --- Other Handlers (Edit, Export, Import) ---

    const handleRowClick = (record) => {
        console.log("Editing record:", record);
        setEditingRecord(record);
    };

    const handleExport = async () => {
        if (!startDate || !endDate) {
            alert("Please select both a start and end date for the export.");
            return;
        }
        setIsExporting(true);
        setImportResult(null);
        try {
            // --- *** USE THE CORRECT 'functions' CONST *** ---
            console.log(`Calling exportAttendanceData for ${startDate} to ${endDate}`);
            const result = await exportAttendanceData({ startDate, endDate }); 

            const csvData = result.data.csvData;
            const filename = result.data.filename || `attendance_export_${startDate}_to_${endDate}_fallback.csv`;

            if (!csvData) {
                alert("No attendance data found for the selected period to export.");
                setIsExporting(false);
                return;
            }

            const blob = new Blob([`\uFEFF${csvData}`], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error("Error exporting attendance data:", error);
            const errorMsg = error.message || "Unknown export error";
            alert(`Failed to export attendance data: ${errorMsg}`);
             setImportResult({ message: "Export failed.", errors: [errorMsg] });
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportClick = () => {
        if (fileInputRef.current) {
            setImportResult(null);
            setAnalysisResult(null);
            setCsvDataToConfirm(null);
            setIsConfirmModalOpen(false);
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    const handleFileSelected = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
            alert("Invalid file type. Please upload a CSV file (.csv).");
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const csvData = e.target?.result;
            if (typeof csvData !== 'string') {
                alert("Could not read file content.");
                return;
            }

            setIsImporting(true);
            setAnalysisResult(null);
            setImportResult(null);
            console.log("Attendance Import Step 1: Calling importAttendanceData (Dry Run)...");

            try {
                // --- *** USE THE CORRECT 'functions' CONST *** ---
                const result = await importAttendanceData({ csvData, confirm: false });

                console.log("Attendance Import Step 1: Received response:", result);

                if (result.data && result.data.analysis) {
                    console.log("Attendance Import Step 1: Analysis data found. Opening confirmation modal.");
                    setAnalysisResult(result.data.analysis);
                    setCsvDataToConfirm(csvData);
                    setIsConfirmModalOpen(true);
                } else {
                    console.error("Attendance Import Step 1: Analysis data missing or invalid in response.", result.data);
                    setImportResult({
                        message: result.data?.result || "Analysis failed or returned no data.",
                        errors: result.data?.errors || ["Unknown analysis error."]
                    });
                }

            } catch (error) {
                console.error("Attendance Import Step 1: Error during analysis function call:", error);
                 const errorDetails = error.details || `Code: ${error.code}, Message: ${error.message}`;
                setImportResult({
                    message: `Import analysis failed: ${error.message}`,
                    errors: Array.isArray(errorDetails) ? errorDetails : [String(errorDetails)]
                });
            } finally {
                setIsImporting(false);
                 if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.onerror = () => {
            alert("Error reading file.");
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    const handleConfirmImport = async () => {
        if (!csvDataToConfirm) {
             alert("Internal error: No CSV data stored for confirmation.");
             handleCancelImport();
             return;
        }

        setIsConfirmingImport(true);
        setIsConfirmModalOpen(false);
        setImportResult(null);
        console.log("Attendance Import Step 2: Calling importAttendanceData (Confirm: true)...");

        try {
            // --- *** USE THE CORRECT 'functions' CONST *** ---
            const result = await importAttendanceData({ csvData: csvDataToConfirm, confirm: true });

            console.log("Attendance Import Step 2: Received final response:", result.data);
            setImportResult({
                message: result.data.result || "Import completed.",
                errors: result.data.errors || []
            });

             if (!result.data.errors || result.data.errors.length === 0) {
                 console.log("Attendance Import Step 2: Import seems successful, refreshing report...");
                 await handleGenerateReport();
             } else {
                 console.warn("Attendance Import Step 2: Import completed with errors, report not automatically refreshed.");
             }

        } catch (error) {
            console.error("Attendance Import Step 2: Error confirming import call:", error);
             const errorDetails = error.details || `Code: ${error.code}, Message: ${error.message}`;
            setImportResult({
                message: `Import confirmation failed: ${error.message}`,
                errors: Array.isArray(errorDetails) ? errorDetails : [String(errorDetails)]
            });
        } finally {
            setIsConfirmingImport(false);
            setCsvDataToConfirm(null);
            setAnalysisResult(null);
        }
    };

    const handleCancelImport = () => {
        setIsConfirmModalOpen(false);
        setAnalysisResult(null);
        setCsvDataToConfirm(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        console.log("Attendance Import: Cancelled.");
    };

    // --- Render Component JSX ---
    return (
        <div>
            {editingRecord && (
                <Modal isOpen={true} onClose={() => setEditingRecord(null)} title={editingRecord.fullRecord?.id ? "Edit Attendance Record" : "Manually Create Record"}>
                    <EditAttendanceModal
                        db={db}
                        record={editingRecord}
                        onClose={() => {
                            setEditingRecord(null);
                            handleGenerateReport();
                        }}
                     />
                </Modal>
            )}
            
            <ImportConfirmationModal
                isOpen={isConfirmModalOpen}
                onClose={handleCancelImport}
                analysis={analysisResult}
                onConfirm={handleConfirmImport}
                isLoading={isConfirmingImport}
                fileName="Attendance Import"
            />

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">Attendance Reports</h2>

            <div className="bg-gray-800 rounded-lg shadow-lg p-4 md:p-6 mb-8">
                 <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-4">
                     <div className="flex-grow">
                        <label htmlFor="startDate" className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                        <input
                            id="startDate"
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-amber-500 focus:border-amber-500 text-gray-200"
                         />
                    </div>
                     <div className="flex-grow">
                        <label htmlFor="endDate" className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                        <input
                            id="endDate"
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            min={startDate}
                            className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-amber-500 focus:border-amber-500 text-gray-200"
                         />
                    </div>
                     <div className="flex-grow">
                        <label htmlFor="staffSelect" className="block text-sm font-medium text-gray-300 mb-1">Staff Member</label>
                        <select
                            id="staffSelect"
                            value={selectedStaffId}
                            onChange={e => setSelectedStaffId(e.target.value)}
                            className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-amber-500 focus:border-amber-500 text-gray-200"
                        >
                            <option value="all">All Active Staff</option>
                            {staffList
                                .filter(s => s.status !== 'inactive')
                                .sort((a,b) => getDisplayName(a).localeCompare(getDisplayName(b)))
                                .map(staff => (
                                    <option key={staff.id} value={staff.id}>
                                        {getDisplayName(staff)}
                                    </option>
                                ))
                            }
                        </select>
                    </div>
                     <button
                        onClick={handleGenerateReport}
                        disabled={isLoading || isImporting || isConfirmingImport || isExporting}
                        className="w-full sm:w-auto px-5 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex-shrink-0 transition duration-150 ease-in-out text-white font-semibold"
                    >
                        {isLoading ? 'Generating...' : 'Generate Report'}
                    </button>
                 </div>
                <div className="flex flex-col sm:flex-row sm:justify-end gap-3 mt-4 border-t border-gray-700 pt-4">
                     <button
                        onClick={handleExport}
                        disabled={isExporting || isLoading || isImporting || isConfirmingImport}
                        className="flex items-center justify-center px-4 py-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-semibold transition duration-150 ease-in-out"
                    >
                        <DownloadIcon className="h-5 w-5 mr-2" />
                        {isExporting ? 'Exporting...' : 'Export CSV'}
                    </button>
                     <button
                        onClick={handleImportClick}
                        disabled={isImporting || isConfirmingImport || isLoading || isExporting}
                        className="flex items-center justify-center px-4 py-2 h-10 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-semibold transition duration-150 ease-in-out"
                    >
                        <UploadIcon className="h-5 w-5 mr-2" />
                        {isImporting ? 'Analyzing...' : (isConfirmingImport ? 'Importing...' : 'Import CSV')}
                    </button>
                     <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelected}
                        accept=".csv, text/csv, application/vnd.ms-excel"
                        style={{ display: 'none' }}
                      />
                </div>
            </div>

             {importResult && (
                <div className={`p-4 rounded-lg mb-6 shadow ${importResult.errors?.length > 0 ? 'bg-red-900/30 border border-red-700' : 'bg-green-900/30 border border-green-700'}`}>
                    <p className={`font-semibold ${importResult.errors?.length > 0 ? 'text-red-300' : 'text-green-300'}`}>
                        Import Result: {importResult.message}
                    </p>
                    {importResult.errors?.length > 0 && (
                        <div className="mt-3">
                            <p className="text-sm font-semibold text-red-300 mb-1">Errors encountered during import:</p>
                            <ul className="list-disc list-inside text-sm text-red-400 space-y-1 max-h-40 overflow-y-auto">
                                {importResult.errors.map((err, index) => (
                                    <li key={index}>{err}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
             )}

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Staff Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Check-In</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Check-Out</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Work Hours</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {isLoading ? (
                             <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500 italic">Generating report...</td></tr>
                        ) : reportData.length > 0 ? (
                            reportData.map((row) => (
                                <tr
                                    key={row.id || `${row.staffId}_${row.date}`}
                                    onClick={() => handleRowClick(row)}
                                    className="hover:bg-gray-700 cursor-pointer transition duration-150 ease-in-out"
                                >
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{row.staffName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{dateUtils.formatDisplayDate(row.date)}</td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${
                                        row.status === 'Absent' ? 'text-red-400' :
                                        row.status.startsWith('Late') ? 'text-yellow-400' :
                                        row.status === 'Leave' ? 'text-blue-400' :
                                        row.status === 'Off' ? 'text-gray-500' :
                                        row.status.includes('Worked on Day Off') ? 'text-orange-400' :
                                        'text-gray-300'
                                    }`}>{row.status}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.checkIn}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.checkOut}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.workHours}</td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500">No attendance data found for the selected criteria.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}