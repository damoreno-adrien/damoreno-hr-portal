import React, { useState, useRef } from 'react'; // Added useRef
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions"; // Import Firebase Functions
import Modal from '../components/Modal';
import EditAttendanceModal from '../components/EditAttendanceModal';
import ImportConfirmationModal from '../components/ImportConfirmationModal'; // Import confirmation modal
import { DownloadIcon, UploadIcon } from '../components/Icons'; // Import icons
import * as dateUtils from '../utils/dateUtils';
import { app } from "../../firebase.js"; // Import Firebase app

// Helper function for display name (keep as is)
const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

export default function AttendanceReportsPage({ db, staffList }) {
    const [reportData, setReportData] = useState([]);
    const [isLoading, setIsLoading] = useState(false); // For generating report
    const [startDate, setStartDate] = useState(dateUtils.formatISODate(new Date()));
    const [endDate, setEndDate] = useState(dateUtils.formatISODate(new Date()));
    const [selectedStaffId, setSelectedStaffId] = useState('all');
    const [editingRecord, setEditingRecord] = useState(null);

    // --- State for Export ---
    const [isExporting, setIsExporting] = useState(false);

    // --- State for Import ---
    const [isImporting, setIsImporting] = useState(false); // For analysis step
    const [isConfirmingImport, setIsConfirmingImport] = useState(false); // For execution step
    const [importResult, setImportResult] = useState(null); // For final result message
    const [analysisResult, setAnalysisResult] = useState(null); // For dry run results
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [csvDataToConfirm, setCsvDataToConfirm] = useState(null);
    const fileInputRef = useRef(null); // Ref for hidden file input

    // Function to generate the report displayed on the page (keep existing logic)
    const handleGenerateReport = async () => {
        setIsLoading(true);
        setReportData([]);
        setImportResult(null); // Clear previous import results when generating new report

        try {
            // Fetch schedules
            const schedulesQuery = query(collection(db, "schedules"), where("date", ">=", startDate), where("date", "<=", endDate));
            const schedulesSnapshot = await getDocs(schedulesQuery);
            const schedulesMap = new Map();
            schedulesSnapshot.docs.forEach(doc => {
                const data = doc.data();
                schedulesMap.set(`${data.staffId}_${data.date}`, data);
            });

            // Fetch attendance
            const attendanceQuery = query(collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate));
            const attendanceSnapshot = await getDocs(attendanceQuery);
            const attendanceMap = new Map();
            attendanceSnapshot.docs.forEach(doc => {
                const data = doc.data();
                // Store doc.id with the data
                attendanceMap.set(`${data.staffId}_${data.date}`, { id: doc.id, ...data });
            });

            const staffToReport = selectedStaffId === 'all' ? staffList : staffList.filter(s => s.id === selectedStaffId);
            const generatedData = [];
            const dateInterval = dateUtils.eachDayOfInterval(startDate, endDate);

            for (const staff of staffToReport) {
                for (const day of dateInterval) {
                    const dateStr = dateUtils.formatISODate(day);
                    const key = `${staff.id}_${dateStr}`;
                    const schedule = schedulesMap.get(key);
                    const attendance = attendanceMap.get(key);

                    // Only include rows relevant to the report filters/data
                    if (schedule || attendance) {
                        const checkInTime = dateUtils.fromFirestore(attendance?.checkInTime);
                        const scheduledTime = schedule ? dateUtils.fromFirestore(`${dateStr}T${schedule.startTime}`) : null;

                        let status = 'On Time';
                        if (!attendance && schedule) status = 'Absent';
                        if (attendance && !schedule) status = 'Extra Shift'; // Or 'Unscheduled'
                        if (checkInTime && scheduledTime && checkInTime > scheduledTime) {
                            const lateMinutes = Math.round((checkInTime - scheduledTime) / 60000);
                            status = `Late (${lateMinutes}m)`;
                        }
                        // Handle case where check-in exists but no schedule
                        if (checkInTime && !scheduledTime && attendance) {
                            status = 'Unscheduled Clock-in';
                        }


                        const checkOutTime = dateUtils.fromFirestore(attendance?.checkOutTime);
                        const breakStartTime = dateUtils.fromFirestore(attendance?.breakStart);
                        const breakEndTime = dateUtils.fromFirestore(attendance?.breakEnd);

                        let workHours = 0;
                        if (checkInTime && checkOutTime) {
                            workHours = (checkOutTime - checkInTime) / 3600000; // hours
                            if (breakStartTime && breakEndTime) {
                                workHours -= (breakEndTime - breakStartTime) / 3600000; // subtract break hours
                            }
                            workHours = Math.max(0, workHours); // Ensure hours are not negative
                        }

                        generatedData.push({
                            // Use attendance doc ID if available, otherwise construct a unique key
                            id: attendance ? attendance.id : `no_attendance_${staff.id}_${dateStr}`,
                            staffId: staff.id,
                            staffName: getDisplayName(staff),
                            date: dateStr, // Keep as yyyy-MM-dd string
                            checkIn: checkInTime ? dateUtils.formatCustom(checkInTime, 'HH:mm') : '-', // Use HH:mm for display
                            checkOut: checkOutTime ? dateUtils.formatCustom(checkOutTime, 'HH:mm') : '-',
                            workHours: workHours > 0 ? workHours.toFixed(2) : '0.00',
                            status: status,
                            // Pass full attendance record (or null) to Edit modal for context
                            fullRecord: attendance || { staffId: staff.id, date: dateStr }, // Pass staffId/date even if no record exists
                        });
                    }
                }
            }

            // Sort data after generation
            generatedData.sort((a, b) => a.staffName.localeCompare(b.staffName) || a.date.localeCompare(b.date));
            setReportData(generatedData);
        } catch (error) {
            console.error("Error generating report: ", error);
            // Consider adding user feedback here, e.g., using setImportResult
             setImportResult({ message: "Error generating report.", errors: [error.message] });
        } finally {
            setIsLoading(false);
        }
    };

    // Handler for clicking a row to edit
    const handleRowClick = (record) => {
        // Pass the simplified row data and the original fullRecord if available
        setEditingRecord(record);
    };

    // --- Export Handler ---
    const handleExport = async () => {
        // Check if dates are selected
        if (!startDate || !endDate) {
            alert("Please select both a start and end date for the export.");
            return;
        }
        setIsExporting(true);
        setImportResult(null); // Clear previous results
        try {
            const functions = getFunctions(app); // Get functions instance
            const exportAttendanceData = httpsCallable(functions, 'exportAttendanceData');
            // Pass the selected date range to the function
            const result = await exportAttendanceData({ startDate, endDate });

            const csvData = result.data.csvData;
            const filename = result.data.filename || `attendance_export_${startDate}_to_${endDate}_fallback.csv`;

            if (!csvData) {
                alert("No attendance data found for the selected period to export.");
                return;
            }

            // Trigger CSV download
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
            alert(`Failed to export attendance data: ${error.message}`);
             setImportResult({ message: "Export failed.", errors: [error.message] });
        } finally {
            setIsExporting(false);
        }
    };

    // --- Import Handlers ---
    const handleImportClick = () => {
        if (fileInputRef.current) {
            setImportResult(null); // Clear previous results
            setAnalysisResult(null);
            setCsvDataToConfirm(null);
            fileInputRef.current.click(); // Open file dialog
        }
    };

    // Step 1: Read file and perform DRY RUN analysis
    const handleFileSelected = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        event.target.value = ''; // Reset file input immediately

        if (!file.name.toLowerCase().endsWith('.csv') || file.type !== 'text/csv') {
            alert("Invalid file type. Please upload a CSV file (.csv).");
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const csvData = e.target?.result;
            if (typeof csvData !== 'string') {
                alert("Could not read file content.");
                return;
            }

            setIsImporting(true); // Indicate analysis is running
            setAnalysisResult(null);
            setImportResult(null);
            console.log("Attendance Import Step 1: Calling importAttendanceData (Dry Run)...");

            try {
                const functions = getFunctions(app);
                const importAttendanceData = httpsCallable(functions, 'importAttendanceData');
                // Call with confirm: false for dry run
                const result = await importAttendanceData({ csvData, confirm: false });

                console.log("Attendance Import Step 1: Received response:", result);
                console.log("Attendance Import Step 1: Data:", result.data);

                if (result.data && result.data.analysis) {
                    console.log("Attendance Import Step 1: Analysis data found. Opening confirmation modal.");
                    setAnalysisResult(result.data.analysis);
                    setCsvDataToConfirm(csvData);
                    setIsConfirmModalOpen(true);
                } else {
                    console.error("Attendance Import Step 1: Analysis data missing.", result.data);
                    setImportResult({
                        message: result.data?.result || "Analysis failed or returned no data.",
                        errors: result.data?.errors || ["Unknown analysis error."]
                    });
                }

            } catch (error) {
                console.error("Attendance Import Step 1: Error during analysis call:", error);
                 const errorDetails = error.details || `Code: ${error.code}, Message: ${error.message}`;
                setImportResult({
                    message: `Import analysis failed: ${error.message}`,
                    errors: Array.isArray(errorDetails) ? errorDetails : [String(errorDetails)]
                });
            } finally {
                setIsImporting(false); // Analysis finished
                 console.log("Attendance Import Step 1: Analysis phase finished.");
            }
        };
        reader.onerror = () => { alert("Error reading file."); setIsImporting(false); };
        reader.readAsText(file);
    };

    // Step 2: Handle confirmation from the modal
    const handleConfirmImport = async () => {
        if (!csvDataToConfirm) { alert("No CSV data to confirm."); return; }

        setIsConfirmingImport(true);
        setIsConfirmModalOpen(false);
        setImportResult(null);
        console.log("Attendance Import Step 2: Calling importAttendanceData (Confirm)...");

        try {
            const functions = getFunctions(app);
            const importAttendanceData = httpsCallable(functions, 'importAttendanceData');
            // Call with confirm: true to execute
            const result = await importAttendanceData({ csvData: csvDataToConfirm, confirm: true });

            console.log("Attendance Import Step 2: Received response:", result.data);
            // Store the FINAL result
            setImportResult({
                message: result.data.result,
                errors: result.data.errors || []
            });
            // Refresh the report data on the page after successful import
             if (result.data.errors?.length === 0) {
                 console.log("Attendance Import Step 2: Import successful, refreshing report...");
                 await handleGenerateReport(); // Await regeneration
             }

        } catch (error) {
            console.error("Attendance Import Step 2: Error confirming import:", error);
             const errorDetails = error.details || `Code: ${error.code}, Message: ${error.message}`;
            setImportResult({
                message: `Import confirmation failed: ${error.message}`,
                errors: Array.isArray(errorDetails) ? errorDetails : [String(errorDetails)]
            });
        } finally {
            setIsConfirmingImport(false);
            setCsvDataToConfirm(null);
            setAnalysisResult(null);
            console.log("Attendance Import Step 2: Confirmation phase finished.");
        }
    };

    // Step 3: Handle cancellation
    const handleCancelImport = () => {
        setIsConfirmModalOpen(false);
        setAnalysisResult(null);
        setCsvDataToConfirm(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div>
            {/* Edit/Create Attendance Modal */}
            {editingRecord && (
                <Modal isOpen={true} onClose={() => setEditingRecord(null)} title={editingRecord.fullRecord?.id ? "Edit Attendance Record" : "Manually Create Record"}>
                    <EditAttendanceModal
                        db={db}
                        record={editingRecord} // Pass the simplified row data
                        onClose={() => {
                            setEditingRecord(null);
                            handleGenerateReport(); // Refresh report after modal closes
                        }}
                     />
                </Modal>
            )}

             {/* Import Confirmation Modal */}
             <ImportConfirmationModal
                isOpen={isConfirmModalOpen}
                onClose={handleCancelImport}
                analysisResult={analysisResult}
                onConfirm={handleConfirmImport}
                isConfirming={isConfirmingImport}
            />

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">Attendance Reports</h2>

             {/* Filter Controls & Action Buttons */}
            <div className="bg-gray-800 rounded-lg shadow-lg p-4 md:p-6 mb-8">
                 {/* Filter Row */}
                 <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-4">
                    <div className="flex-grow">
                        <label htmlFor="startDate" className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                        <input id="startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-amber-500 focus:border-amber-500" />
                    </div>
                    <div className="flex-grow">
                        <label htmlFor="endDate" className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                        <input id="endDate" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-amber-500 focus:border-amber-500" />
                    </div>
                    <div className="flex-grow">
                        <label htmlFor="staffSelect" className="block text-sm font-medium text-gray-300 mb-1">Staff Member</label>
                        <select id="staffSelect" value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-amber-500 focus:border-amber-500">
                            <option value="all">All Staff</option>
                            {staffList.sort((a,b) => getDisplayName(a).localeCompare(getDisplayName(b))).map(staff => <option key={staff.id} value={staff.id}>{getDisplayName(staff)}</option>)}
                        </select>
                    </div>
                    <button onClick={handleGenerateReport} disabled={isLoading || isImporting || isConfirmingImport || isExporting} className="w-full sm:w-auto px-5 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 flex-shrink-0 transition duration-150 ease-in-out">
                        {isLoading ? 'Generating...' : 'Generate Report'}
                    </button>
                 </div>

                 {/* Action Buttons Row */}
                <div className="flex flex-col sm:flex-row sm:justify-end gap-3 mt-4">
                     <button
                        onClick={handleExport}
                        disabled={isExporting || isLoading || isImporting || isConfirmingImport}
                        className="flex items-center justify-center px-4 py-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white font-semibold transition duration-150 ease-in-out"
                    >
                        <DownloadIcon className="h-5 w-5 mr-2" />
                        {isExporting ? 'Exporting...' : 'Export CSV'}
                    </button>
                    <button
                        onClick={handleImportClick}
                        disabled={isImporting || isConfirmingImport || isLoading || isExporting}
                        className="flex items-center justify-center px-4 py-2 h-10 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-gray-500 text-white font-semibold transition duration-150 ease-in-out"
                    >
                        <UploadIcon className="h-5 w-5 mr-2" />
                        {isImporting ? 'Analyzing...' : (isConfirmingImport ? 'Importing...' : 'Import CSV')}
                    </button>
                    {/* Hidden File Input */}
                     <input type="file" ref={fileInputRef} onChange={handleFileSelected} accept=".csv, text/csv" style={{ display: 'none' }} />
                </div>
            </div>


             {/* FINAL Import Results Display */}
             {importResult && (
                <div className={`p-4 rounded-lg mb-6 ${importResult.errors?.length > 0 ? 'bg-red-900/30 border border-red-700' : 'bg-green-900/30 border border-green-700'}`}>
                    <p className={`font-semibold ${importResult.errors?.length > 0 ? 'text-red-300' : 'text-green-300'}`}>
                        Import Result: {importResult.message}
                    </p>
                    {importResult.errors?.length > 0 && (
                        <div className="mt-3">
                            <p className="text-sm font-semibold text-red-300 mb-1">Errors encountered during import:</p>
                            <ul className="list-disc list-inside text-sm text-red-400 space-y-1 max-h-40 overflow-y-auto">
                                {importResult.errors.map((err, index) => <li key={index}>{err}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
             )}


            {/* Attendance Report Table */}
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
                        {reportData.length > 0 ? reportData.map((row) => ( // Use row.id for key if stable, otherwise index
                            <tr key={row.id || `${row.staffId}_${row.date}`} onClick={() => handleRowClick(row)} className="hover:bg-gray-700 cursor-pointer">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{row.staffName}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{dateUtils.formatDisplayDate(row.date)}</td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${row.status === 'Absent' ? 'text-red-400' : (row.status.startsWith('Late') ? 'text-yellow-400' : 'text-gray-300')}`}>{row.status}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.checkIn}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.checkOut}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.workHours}</td>
                            </tr>
                        )) : (
                            <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500">{isLoading ? 'Loading data...' : 'Select filters and click "Generate Report" or import data.'}</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}