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

// Helper function for display name
const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName && staff.lastName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.firstName) return staff.firstName;
    if (staff && staff.fullName) return staff.fullName; // Fallback to fullName if needed
    return 'Unknown Staff';
};

export default function AttendanceReportsPage({ db, staffList }) {
    const [reportData, setReportData] = useState([]);
    const [isLoading, setIsLoading] = useState(false); // For generating report
    // Default start/end dates to the current day
    const [startDate, setStartDate] = useState(dateUtils.formatISODate(new Date()));
    const [endDate, setEndDate] = useState(dateUtils.formatISODate(new Date()));
    const [selectedStaffId, setSelectedStaffId] = useState('all'); // Default to 'All Staff'
    const [editingRecord, setEditingRecord] = useState(null); // For the edit modal

    // --- State for Export ---
    const [isExporting, setIsExporting] = useState(false);

    // --- State for Import ---
    const [isImporting, setIsImporting] = useState(false); // For analysis step
    const [isConfirmingImport, setIsConfirmingImport] = useState(false); // For execution step
    const [importResult, setImportResult] = useState(null); // For final result message { message: string, errors: string[] }
    const [analysisResult, setAnalysisResult] = useState(null); // Stores results from dry run { creates: [], updates: [], noChanges: [], errors: [] }
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false); // Controls confirmation modal visibility
    const [csvDataToConfirm, setCsvDataToConfirm] = useState(null); // Stores raw CSV data between analysis and confirmation
    const fileInputRef = useRef(null); // Ref for the hidden file input element

    // --- Function to generate the report displayed on the page ---
    const handleGenerateReport = async () => {
        setIsLoading(true); // Start loading indicator
        setReportData([]); // Clear previous report data
        setImportResult(null); // Clear previous import results

        try {
            // --- 1. Fetch Schedules ---
            console.log(`Generating report for ${startDate} to ${endDate}`);
            const schedulesQuery = query(collection(db, "schedules"), where("date", ">=", startDate), where("date", "<=", endDate));
            const schedulesSnapshot = await getDocs(schedulesQuery);
            const schedulesMap = new Map(); // Key: "staffId_date", Value: schedule data
            schedulesSnapshot.docs.forEach(doc => {
                const data = doc.data();
                schedulesMap.set(`${data.staffId}_${data.date}`, data);
            });
            console.log(`Fetched ${schedulesMap.size} schedule records.`);

            // --- 2. Fetch Attendance ---
            const attendanceQuery = query(collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate));
            const attendanceSnapshot = await getDocs(attendanceQuery);
            const attendanceMap = new Map(); // Key: "staffId_date", Value: { id: docId, ...data }
            attendanceSnapshot.docs.forEach(doc => {
                const data = doc.data();
                attendanceMap.set(`${data.staffId}_${data.date}`, { id: doc.id, ...data }); // Store doc ID with data
            });
            console.log(`Fetched ${attendanceMap.size} attendance records.`);

            // --- 3. Fetch Approved Leave Requests ---
            // *** IMPORTANT: Adjust collection name and field names if different in your Firestore ***
            const leaveQuery = query(
                collection(db, "leave_requests"),      // ASSUMED collection name
                where("status", "==", "approved"),     // ASSUMED status field and value
                where("date", ">=", startDate),        // ASSUMED date field name
                where("date", "<=", endDate)
            );
            const leaveSnapshot = await getDocs(leaveQuery);
            const leaveMap = new Map(); // Key: "staffId_date", Value: leave request data
            leaveSnapshot.docs.forEach(doc => {
                const data = doc.data();
                // *** ASSUMING staffId field is "staffId" ***
                if(data.staffId && data.date) {
                   leaveMap.set(`${data.staffId}_${data.date}`, data);
                } else {
                    console.warn("Found leave request without staffId or date:", doc.id, data);
                }
            });
            console.log(`Found ${leaveMap.size} approved leave days in range.`);


            // --- 4. Process and Generate Report Data ---
            // Filter staff list based on selection
            const staffToReport = selectedStaffId === 'all'
                ? staffList // Use the full list passed as prop
                : staffList.filter(s => s.id === selectedStaffId);

            const generatedData = []; // Array to hold processed report rows
            const dateInterval = dateUtils.eachDayOfInterval(startDate, endDate); // Get all dates in the range

            // Loop through each relevant staff member
            for (const staff of staffToReport) {
                if (!staff || !staff.id) continue; // Skip if staff data is invalid

                // Loop through each day in the selected date range
                for (const day of dateInterval) {
                    const dateStr = dateUtils.formatISODate(day); // Format date as YYYY-MM-DD
                    const key = `${staff.id}_${dateStr}`; // Unique key for maps

                    // Look up data for this staff/day
                    const schedule = schedulesMap.get(key);
                    const attendance = attendanceMap.get(key);
                    const approvedLeave = leaveMap.get(key); // Check if on approved leave

                    // --- ADD LOGGING ---
                    if (attendance && !schedule && !approvedLeave) {
                        console.log(`DEBUG: Attendance found, but NO schedule/leave for ${getDisplayName(staff)} on ${dateStr}. Schedule lookup result:`, schedule);
                    }
                    if (attendance && schedule && schedule.type?.toLowerCase() !== 'work') {
                         console.log(`DEBUG: Attendance found, schedule type NOT 'work' for ${getDisplayName(staff)} on ${dateStr}. Schedule:`, schedule);
                    }
                     if (attendance && schedule && schedule.type?.toLowerCase() === 'work' && !schedule.startTime) {
                         console.log(`DEBUG: Attendance found, schedule type IS 'work' but startTime MISSING for ${getDisplayName(staff)} on ${dateStr}. Schedule:`, schedule);
                     }
                    // --- END LOGGING ---

                    // Determine if a row should be generated for this day
                    // Include if scheduled, attended, or on approved leave
                    if (schedule || attendance || approvedLeave) {
                        // --- Calculate Status ---
                        let status = 'Unknown'; // Default status
                        const checkInTime = dateUtils.fromFirestore(attendance?.checkInTime); // Convert Timestamp to JS Date or null

                        // Make schedule checks more robust (case-insensitive type, check startTime exists)
                        const isWorkSchedule = schedule?.type?.toLowerCase() === 'work';
                        const isOffSchedule = schedule?.type?.toLowerCase() === 'off';
                        const scheduledStartTimeStr = (isWorkSchedule && schedule?.startTime) ? schedule.startTime : null;
                        const scheduledTime = scheduledStartTimeStr ? dateUtils.fromFirestore(`${dateStr}T${scheduledStartTimeStr}`) : null; // Construct JS Date from schedule


                        if (attendance) { // Attendance record exists
                            if (scheduledTime) { // Scheduled Time Exists (implies type was 'work' and startTime existed)
                                if (checkInTime) {
                                    if (checkInTime > scheduledTime) { // Check for lateness
                                        // Calculate difference in minutes, rounding up
                                        const lateMinutes = Math.ceil((checkInTime.getTime() - scheduledTime.getTime()) / 60000);
                                        status = `Late (${lateMinutes}m)`;
                                    } else {
                                        status = 'Present'; // On time or early
                                    }
                                } else {
                                     status = 'Present (No Check-in?)'; // Data issue: Attendance exists but check-in missing
                                }
                            } else if (isOffSchedule) { // Scheduled Off but attended
                                 status = 'Worked on Day Off';
                            } else { // Attended, but not scheduled for work (or schedule missing details)
                                status = 'Present (Unscheduled)';
                            }
                        } else { // No attendance record found
                            if (approvedLeave) {
                                status = 'Leave'; // Confirmed approved leave overrides other statuses
                            } else if (isWorkSchedule) {
                                status = 'Absent'; // Scheduled for work, no attendance, not on leave
                            } else if (isOffSchedule) {
                                status = 'Off'; // Scheduled off, no attendance
                            } else {
                                // Neither attendance, schedule, nor leave.
                                // This case should be skipped by the outer `if` condition.
                                continue;
                            }
                        }

                        // --- Calculate Work Hours ---
                        const checkOutTime = dateUtils.fromFirestore(attendance?.checkOutTime);
                        const breakStartTime = dateUtils.fromFirestore(attendance?.breakStart);
                        const breakEndTime = dateUtils.fromFirestore(attendance?.breakEnd);

                        let workHours = 0;
                        // Calculate only if both check-in and check-out exist
                        if (checkInTime && checkOutTime) {
                            workHours = (checkOutTime.getTime() - checkInTime.getTime()); // Milliseconds worked
                            // Subtract break time if both start and end exist
                            if (breakStartTime && breakEndTime) {
                                workHours -= (breakEndTime.getTime() - breakStartTime.getTime());
                            }
                            workHours = Math.max(0, workHours) / 3600000; // Convert to hours, ensure non-negative
                        }

                        // --- Add Processed Row to Report Data ---
                        generatedData.push({
                            // Use attendance doc ID if available for editing, otherwise construct unique key
                            id: attendance ? attendance.id : `no_attendance_${staff.id}_${dateStr}`,
                            staffId: staff.id,
                            staffName: getDisplayName(staff), // Use helper for consistent naming
                            date: dateStr, // Keep as yyyy-MM-dd string
                            // Format times as HH:mm for display, show '-' if null
                            checkIn: checkInTime ? dateUtils.formatCustom(checkInTime, 'HH:mm') : '-',
                            checkOut: checkOutTime ? dateUtils.formatCustom(checkOutTime, 'HH:mm') : '-',
                            // Format work hours, show N/A for Leave/Off days
                            workHours: (status === 'Leave' || status === 'Off') ? 'N/A' : (workHours > 0 ? workHours.toFixed(2) : '0.00'),
                            status: status, // The calculated status (Present, Late, Absent, Leave, Off, etc.)
                            // Pass full attendance record (or placeholder) to Edit modal
                            // Include staffId/date even if no record exists, useful for creating one manually
                            fullRecord: attendance || { staffId: staff.id, date: dateStr, id: null }, // Ensure id is null if creating
                        });
                    } // End if (schedule || attendance || approvedLeave)
                } // End date loop
            } // End staff loop

            // Sort the generated data by staff name, then by date
            generatedData.sort((a, b) => a.staffName.localeCompare(b.staffName) || a.date.localeCompare(b.date));
            setReportData(generatedData); // Update state with the final report data
            console.log(`Generated ${generatedData.length} report rows.`);

        } catch (error) {
            // Catch errors during report generation
            console.error("Error generating attendance report: ", error);
             setImportResult({ message: "Error generating report.", errors: [error.message] }); // Display error to user
        } finally {
            setIsLoading(false); // Stop loading indicator
        }
    }; // --- End handleGenerateReport ---


    // --- Other Handlers (Edit, Export, Import) ---

    // Handler for clicking a table row to open the edit/create modal
    const handleRowClick = (record) => {
        console.log("Editing record:", record);
        setEditingRecord(record); // Pass the processed row data to the state
    };

    // Handler for the Export CSV button
    const handleExport = async () => {
        if (!startDate || !endDate) {
            alert("Please select both a start and end date for the export.");
            return;
        }
        setIsExporting(true);
        setImportResult(null); // Clear previous messages
        try {
            const functions = getFunctions(app);
            const exportAttendanceData = httpsCallable(functions, 'exportAttendanceData');
            console.log(`Calling exportAttendanceData for ${startDate} to ${endDate}`);
            const result = await exportAttendanceData({ startDate, endDate }); // Pass date range

            const csvData = result.data.csvData;
            const filename = result.data.filename || `attendance_export_${startDate}_to_${endDate}_fallback.csv`;

            if (!csvData) {
                alert("No attendance data found for the selected period to export.");
                return;
            }

            // Trigger CSV download in the browser
            const blob = new Blob([`\uFEFF${csvData}`], { type: 'text/csv;charset=utf-8;' }); // Add BOM for Excel UTF-8 compatibility
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click(); // Simulate click to download
            document.body.removeChild(link); // Clean up
            URL.revokeObjectURL(url); // Release object URL

        } catch (error) {
            console.error("Error exporting attendance data:", error);
            const errorMsg = error.message || "Unknown export error";
            alert(`Failed to export attendance data: ${errorMsg}`);
             setImportResult({ message: "Export failed.", errors: [errorMsg] }); // Show error
        } finally {
            setIsExporting(false); // Stop export loading indicator
        }
    };

    // Handler for the Import CSV button (triggers file input)
    const handleImportClick = () => {
        if (fileInputRef.current) {
            // Reset state before opening file dialog
            setImportResult(null);
            setAnalysisResult(null);
            setCsvDataToConfirm(null);
            setIsConfirmModalOpen(false);
            fileInputRef.current.value = ''; // Clear previous file selection
            fileInputRef.current.click();
        }
    };

    // Step 1 of Import: Read file and call Cloud Function for analysis (dry run)
    const handleFileSelected = (event) => {
        const file = event.target.files?.[0];
        if (!file) return; // No file selected
        // Don't reset value here, let the handler manage state

        // Basic file type validation
        if (!file.name.toLowerCase().endsWith('.csv') || file.type !== 'text/csv') {
            alert("Invalid file type. Please upload a CSV file (.csv).");
            if (fileInputRef.current) fileInputRef.current.value = ''; // Clear invalid selection
            return;
        }

        const reader = new FileReader();
        // Callback for when file is successfully read
        reader.onload = async (e) => {
            const csvData = e.target?.result;
            if (typeof csvData !== 'string') {
                alert("Could not read file content.");
                return;
            }

            setIsImporting(true); // Start analysis loading indicator
            setAnalysisResult(null);
            setImportResult(null);
            console.log("Attendance Import Step 1: Calling importAttendanceData (Dry Run)...");

            try {
                const functions = getFunctions(app);
                const importAttendanceData = httpsCallable(functions, 'importAttendanceData');
                // Call the function with CSV data and confirm: false
                const result = await importAttendanceData({ csvData, confirm: false });

                console.log("Attendance Import Step 1: Received response:", result);
                console.log("Attendance Import Step 1: Data:", result.data);

                // Check if the response contains the expected 'analysis' object
                if (result.data && result.data.analysis) {
                    console.log("Attendance Import Step 1: Analysis data found. Opening confirmation modal.");
                    setAnalysisResult(result.data.analysis); // Store the analysis results
                    setCsvDataToConfirm(csvData); // Store the raw CSV data for the confirmation step
                    setIsConfirmModalOpen(true); // Open the confirmation modal
                } else {
                    // Handle cases where analysis might fail server-side or return unexpected structure
                    console.error("Attendance Import Step 1: Analysis data missing or invalid in response.", result.data);
                    setImportResult({
                        message: result.data?.result || "Analysis failed or returned no data.",
                        errors: result.data?.errors || ["Unknown analysis error."]
                    });
                }

            } catch (error) {
                // Catch errors during the Cloud Function call itself (network, permissions, etc.)
                console.error("Attendance Import Step 1: Error during analysis function call:", error);
                 const errorDetails = error.details || `Code: ${error.code}, Message: ${error.message}`;
                setImportResult({
                    message: `Import analysis failed: ${error.message}`,
                    errors: Array.isArray(errorDetails) ? errorDetails : [String(errorDetails)]
                });
            } finally {
                setIsImporting(false); // Stop analysis loading indicator
                 console.log("Attendance Import Step 1: Analysis phase finished.");
                 // Clear file input value *after* processing is done (success or fail)
                 if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        // Callback for file reading errors
        reader.onerror = () => {
            alert("Error reading file.");
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = ''; // Clear on error too
        };
        // Start reading the file as text
        reader.readAsText(file);
    };

    // Step 2 of Import: Handle confirmation from the modal, call Cloud Function to execute
    const handleConfirmImport = async () => {
        if (!csvDataToConfirm) {
             alert("Internal error: No CSV data stored for confirmation.");
             handleCancelImport(); // Reset state
             return;
        }

        setIsConfirmingImport(true); // Start execution loading indicator
        setIsConfirmModalOpen(false); // Close the confirmation modal
        setImportResult(null); // Clear previous final results
        console.log("Attendance Import Step 2: Calling importAttendanceData (Confirm: true)...");

        try {
            const functions = getFunctions(app);
            const importAttendanceData = httpsCallable(functions, 'importAttendanceData');
            // Call the function with stored CSV data and confirm: true
            const result = await importAttendanceData({ csvData: csvDataToConfirm, confirm: true });

            console.log("Attendance Import Step 2: Received final response:", result.data);
            // Store the FINAL result message and errors
            setImportResult({
                message: result.data.result || "Import completed.", // Provide default message
                errors: result.data.errors || []
            });

            // Refresh the report data on the page ONLY if the import likely succeeded (e.g., no errors reported back)
             if (!result.data.errors || result.data.errors.length === 0) {
                 console.log("Attendance Import Step 2: Import seems successful, refreshing report...");
                 // Use a slight delay if needed to allow Firestore listeners to potentially update
                 // setTimeout(handleGenerateReport, 500);
                 await handleGenerateReport(); // Regenerate the report to show changes
             } else {
                 console.warn("Attendance Import Step 2: Import completed with errors, report not automatically refreshed.");
             }

        } catch (error) {
            // Catch errors during the confirmation Cloud Function call
            console.error("Attendance Import Step 2: Error confirming import call:", error);
             const errorDetails = error.details || `Code: ${error.code}, Message: ${error.message}`;
            setImportResult({
                message: `Import confirmation failed: ${error.message}`,
                errors: Array.isArray(errorDetails) ? errorDetails : [String(errorDetails)]
            });
        } finally {
            setIsConfirmingImport(false); // Stop execution loading indicator
            // Clear temporary state regardless of success/failure
            setCsvDataToConfirm(null);
            setAnalysisResult(null);
            console.log("Attendance Import Step 2: Confirmation phase finished.");
        }
    };

    // Step 3 of Import: Handle cancellation from the modal
    const handleCancelImport = () => {
        setIsConfirmModalOpen(false); // Close modal
        // Clear temporary state
        setAnalysisResult(null);
        setCsvDataToConfirm(null);
        // Ensure file input is cleared
        if (fileInputRef.current) fileInputRef.current.value = '';
        console.log("Attendance Import: Cancelled.");
    };


    // --- Render Component JSX ---
    return (
        <div>
            {/* Edit/Create Attendance Modal Instance */}
            {editingRecord && (
                <Modal isOpen={true} onClose={() => setEditingRecord(null)} title={editingRecord.fullRecord?.id ? "Edit Attendance Record" : "Manually Create Record"}>
                    <EditAttendanceModal
                        db={db}
                        record={editingRecord} // Pass the processed row data including fullRecord
                        onClose={() => {
                            setEditingRecord(null); // Close modal
                            handleGenerateReport(); // Refresh report after modal closes
                        }}
                     />
                </Modal>
            )}

             {/* Import Confirmation Modal Instance */}
             <ImportConfirmationModal
                isOpen={isConfirmModalOpen}
                onClose={handleCancelImport} // Use cancel handler
                analysisResult={analysisResult} // Pass analysis data
                onConfirm={handleConfirmImport} // Use confirm handler
                isConfirming={isConfirmingImport} // Pass execution loading state
            />

            {/* Page Title */}
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">Attendance Reports</h2>

             {/* Filter Controls & Action Buttons Panel */}
            <div className="bg-gray-800 rounded-lg shadow-lg p-4 md:p-6 mb-8">
                 {/* Filter Row */}
                 <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-4">
                    {/* Start Date Input */}
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
                    {/* End Date Input */}
                    <div className="flex-grow">
                        <label htmlFor="endDate" className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                        <input
                            id="endDate"
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            min={startDate} // Prevent end date being before start date
                            className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-amber-500 focus:border-amber-500 text-gray-200"
                         />
                    </div>
                    {/* Staff Selector Dropdown */}
                    <div className="flex-grow">
                        <label htmlFor="staffSelect" className="block text-sm font-medium text-gray-300 mb-1">Staff Member</label>
                        <select
                            id="staffSelect"
                            value={selectedStaffId}
                            onChange={e => setSelectedStaffId(e.target.value)}
                            className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 focus:ring-amber-500 focus:border-amber-500 text-gray-200"
                        >
                            <option value="all">All Staff</option>
                            {/* Sort staff list alphabetically by display name for dropdown */}
                            {staffList
                                .sort((a,b) => getDisplayName(a).localeCompare(getDisplayName(b)))
                                .map(staff => (
                                    <option key={staff.id} value={staff.id}>
                                        {getDisplayName(staff)}
                                    </option>
                                ))
                            }
                        </select>
                    </div>
                    {/* Generate Report Button */}
                    <button
                        onClick={handleGenerateReport}
                        // Disable if any operation is in progress
                        disabled={isLoading || isImporting || isConfirmingImport || isExporting}
                        className="w-full sm:w-auto px-5 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex-shrink-0 transition duration-150 ease-in-out text-white font-semibold"
                    >
                        {isLoading ? 'Generating...' : 'Generate Report'}
                    </button>
                 </div>

                 {/* Action Buttons Row (Export/Import) */}
                <div className="flex flex-col sm:flex-row sm:justify-end gap-3 mt-4 border-t border-gray-700 pt-4">
                     {/* Export Button */}
                     <button
                        onClick={handleExport}
                        // Disable if any operation is in progress
                        disabled={isExporting || isLoading || isImporting || isConfirmingImport}
                        className="flex items-center justify-center px-4 py-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-semibold transition duration-150 ease-in-out"
                    >
                        <DownloadIcon className="h-5 w-5 mr-2" />
                        {isExporting ? 'Exporting...' : 'Export CSV'}
                    </button>
                    {/* Import Button */}
                    <button
                        onClick={handleImportClick}
                        // Disable if any operation is in progress
                        disabled={isImporting || isConfirmingImport || isLoading || isExporting}
                        className="flex items-center justify-center px-4 py-2 h-10 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-semibold transition duration-150 ease-in-out"
                    >
                        <UploadIcon className="h-5 w-5 mr-2" />
                        {/* Show appropriate loading text */}
                        {isImporting ? 'Analyzing...' : (isConfirmingImport ? 'Importing...' : 'Import CSV')}
                    </button>
                    {/* Hidden File Input Element */}
                     <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelected}
                        accept=".csv, text/csv" // Specify accepted file types
                        style={{ display: 'none' }} // Keep it hidden
                      />
                </div>
            </div>


             {/* FINAL Import Results Display Area */}
             {importResult && (
                <div className={`p-4 rounded-lg mb-6 shadow ${importResult.errors?.length > 0 ? 'bg-red-900/30 border border-red-700' : 'bg-green-900/30 border border-green-700'}`}>
                    <p className={`font-semibold ${importResult.errors?.length > 0 ? 'text-red-300' : 'text-green-300'}`}>
                        Import Result: {importResult.message}
                    </p>
                    {/* Display errors if any occurred during import */}
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
                        {/* Conditional rendering based on loading state and data presence */}
                        {isLoading ? (
                             <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500 italic">Generating report...</td></tr>
                        ) : reportData.length > 0 ? (
                            // Map through report data to create table rows
                            reportData.map((row) => (
                                <tr
                                    key={row.id || `${row.staffId}_${row.date}`} // Use unique key
                                    onClick={() => handleRowClick(row)} // Allow clicking row to edit
                                    className="hover:bg-gray-700 cursor-pointer transition duration-150 ease-in-out"
                                >
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{row.staffName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{dateUtils.formatDisplayDate(row.date)}</td>
                                    {/* Apply dynamic text color based on status */}
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${
                                        row.status === 'Absent' ? 'text-red-400' :
                                        row.status.startsWith('Late') ? 'text-yellow-400' :
                                        row.status === 'Leave' ? 'text-blue-400' : // Color for Leave
                                        row.status === 'Off' ? 'text-gray-500' : // Color for Off
                                        row.status.includes('Worked on Day Off') ? 'text-orange-400' : // Color for working on day off
                                        'text-gray-300' // Default/Present/Unscheduled etc.
                                    }`}>{row.status}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.checkIn}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.checkOut}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.workHours}</td>
                                </tr>
                            ))
                        ) : (
                            // Message when no data is found or report hasn't been generated
                            <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500">No attendance data found for the selected criteria, or report not yet generated.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}