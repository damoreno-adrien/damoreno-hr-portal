/* src/pages/AttendanceReportsPage.jsx */

import React, { useState, useRef, useEffect } from 'react';
import { collection, query, where, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import Modal from '../components/common/Modal';
import EditAttendanceModal from '../components/Attendance/EditAttendanceModal.jsx';
import ImportConfirmationModal from '../components/common/ImportConfirmationModal.jsx';
import * as dateUtils from '../utils/dateUtils';
import { calculateAttendanceStatus } from '../utils/statusUtils';
import { app } from "../../firebase.js";
import { ArrowUp, ArrowDown, Download, Upload, Trash2, Check, ChevronDown } from 'lucide-react';

const functions = getFunctions(app, "us-central1"); 
const exportAttendanceData = httpsCallable(functions, 'exportAttendanceData');
const importAttendanceData = httpsCallable(functions, 'importAttendanceData');
const cleanupBadAttendanceIds = httpsCallable(functions, 'cleanupBadAttendanceIds');

const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName && staff.lastName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.firstName) return staff.firstName;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

export default function AttendanceReportsPage({ db, staffList }) {
    const [reportData, setReportData] = useState([]);
    const [unsortedReportData, setUnsortedReportData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [startDate, setStartDate] = useState(dateUtils.formatISODate(new Date()));
    const [endDate, setEndDate] = useState(dateUtils.formatISODate(new Date()));
    
    // Multi-Select State
    const [selectedStaffIds, setSelectedStaffIds] = useState([]); 
    const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const [editingRecord, setEditingRecord] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'staffName', direction: 'ascending' });
    const [companyConfig, setCompanyConfig] = useState({});

    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isConfirmingImport, setIsConfirmingImport] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [csvDataToConfirm, setCsvDataToConfirm] = useState(null);
    const fileInputRef = useRef(null);
    const [cleanupLoading, setCleanupLoading] = useState(false);
    const [cleanupResult, setCleanupResult] = useState(null);

    // 1. Fetch Config on Mount
    useEffect(() => {
        if (!db) return;
        const configRef = doc(db, 'settings', 'company_config');
        const unsub = onSnapshot(configRef, (snap) => {
            if (snap.exists()) setCompanyConfig(snap.data());
        });
        return () => unsub();
    }, [db]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsStaffDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleToggleStaff = (staffId) => {
        setSelectedStaffIds(prev => {
            if (prev.includes(staffId)) return prev.filter(id => id !== staffId);
            return [...prev, staffId];
        });
    };

    const handleSelectAllStaff = () => {
        const activeStaffIds = staffList.filter(s => s.status !== 'inactive').map(s => s.id);
        if (selectedStaffIds.length === activeStaffIds.length) {
            setSelectedStaffIds([]);
        } else {
            setSelectedStaffIds(activeStaffIds);
        }
    };

    const handleGenerateReport = async () => {
        setIsLoading(true);
        setUnsortedReportData([]);
        setImportResult(null);
        setCleanupResult(null);

        try {
            console.log(`Generating report for ${startDate} to ${endDate}`);
            
            const [schedulesSnapshot, attendanceSnapshot, leaveSnapshot] = await Promise.all([
                getDocs(query(collection(db, "schedules"), where("date", ">=", startDate), where("date", "<=", endDate))),
                getDocs(query(collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate))),
                getDocs(query(collection(db, "leave_requests"), where("status", "==", "approved"), where("startDate", "<=", endDate)))
            ]);

            const schedulesMap = new Map();
            schedulesSnapshot.docs.forEach(doc => {
                const data = doc.data();
                schedulesMap.set(`${data.staffId}_${data.date}`, data);
            });

            const attendanceMap = new Map();
            attendanceSnapshot.docs.forEach(doc => {
                const data = doc.data();
                attendanceMap.set(`${data.staffId}_${data.date}`, { id: doc.id, ...data });
            });

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

            const activeStaff = staffList.filter(s => s.status !== 'inactive');
            const staffToReport = selectedStaffIds.length === 0
                ? activeStaff 
                : activeStaff.filter(s => selectedStaffIds.includes(s.id));

            const generatedData = [];
            const dateInterval = dateUtils.eachDayOfInterval(startDate, endDate);

            for (const staff of staffToReport) {
                for (const day of dateInterval) {
                    const dateStr = dateUtils.formatISODate(day);
                    const key = `${staff.id}_${dateStr}`;

                    const schedule = schedulesMap.get(key);
                    const attendance = attendanceMap.get(key);
                    const approvedLeave = leaveMap.get(key);

                    // --- KEY FIX: Rely on statusUtils for the correct status ---
                    const { status, isLate, lateMinutes, otMinutes, checkInTime, checkOutTime } = calculateAttendanceStatus(
                        schedule, 
                        attendance, 
                        approvedLeave, 
                        day,
                        companyConfig
                    );

                    let displayStatus = status;
                    
                    if (isLate) {
                        displayStatus = `Late (${lateMinutes}m)`;
                    } else if (status === 'Overtime') {
                         const h = Math.floor(otMinutes / 60);
                         const m = otMinutes % 60;
                         displayStatus = `Overtime (+${h}h ${m}m)`;
                    } else if (status === 'Present') {
                        // Sometimes 'Present' can happen for Extra Shift
                        if (!schedule) displayStatus = 'Extra Shift';
                        else displayStatus = 'Completed';
                    }

                    let workHours = 0;
                    if (checkInTime && checkOutTime) {
                        let duration = checkOutTime.getTime() - checkInTime.getTime();
                         if (attendance.breakStart && attendance.breakEnd) {
                             const bStart = attendance.breakStart.toDate ? attendance.breakStart.toDate() : attendance.breakStart;
                             const bEnd = attendance.breakEnd.toDate ? attendance.breakEnd.toDate() : attendance.breakEnd;
                             duration -= (bEnd - bStart);
                         }
                         workHours = Math.max(0, duration) / 3600000;
                    }

                    if (displayStatus !== 'Empty') {
                        generatedData.push({
                            id: attendance ? attendance.id : `no_attendance_${staff.id}_${dateStr}`,
                            staffId: staff.id,
                            staffName: getDisplayName(staff),
                            date: dateStr,
                            checkIn: checkInTime ? dateUtils.formatCustom(checkInTime, 'HH:mm') : '-',
                            checkOut: checkOutTime ? dateUtils.formatCustom(checkOutTime, 'HH:mm') : '-',
                            workHours: (status === 'Leave' || status === 'Off') ? -1 : (workHours > 0 ? parseFloat(workHours.toFixed(2)) : 0),
                            status: displayStatus,
                            fullRecord: attendance || { staffId: staff.id, date: dateStr, id: null },
                        });
                    }
                }
            }
            setUnsortedReportData(generatedData);

        } catch (error) {
            console.error("Error generating report: ", error);
             setImportResult({ message: "Error generating report.", errors: [error.message] });
        } finally { setIsLoading(false); }
    };

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
        setSortConfig({ key, direction });
    };

    useEffect(() => {
        let sortableData = [...unsortedReportData];
        if (sortConfig.key !== null) {
            sortableData.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];
                if (sortConfig.key === 'workHours') {
                    aValue = aValue < 0 ? -1 : aValue;
                    bValue = bValue < 0 ? -1 : bValue;
                }
                if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        setReportData(sortableData);
    }, [unsortedReportData, sortConfig]);

    const handleRowClick = (record) => setEditingRecord(record);

    const handleExport = async () => {
        if (!startDate || !endDate) { alert("Please select both a start and end date."); return; }
        setIsExporting(true); setImportResult(null); setCleanupResult(null);
        try {
            const staffIdsToSend = selectedStaffIds.length > 0 ? selectedStaffIds : null;
            const result = await exportAttendanceData({ startDate, endDate, staffIds: staffIdsToSend }); 
            const csvData = result.data.csvData;
            const filename = result.data.filename || `attendance_export.csv`;
            if (!csvData) { alert("No data to export."); setIsExporting(false); return; }
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
        } catch (error) { console.error(error); alert(`Export failed: ${error.message}`); } 
        finally { setIsExporting(false); }
    };

    const handleImportClick = () => { if (fileInputRef.current) { setImportResult(null); setCleanupResult(null); setAnalysisResult(null); setCsvDataToConfirm(null); setIsConfirmModalOpen(false); fileInputRef.current.value = ''; fileInputRef.current.click(); } };
    
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
            setIsImporting(true); setAnalysisResult(null); setImportResult(null); setCleanupResult(null);
            try {
                const result = await importAttendanceData({ csvData, confirm: false });
                if (result.data && result.data.analysis) { setAnalysisResult(result.data.analysis); setCsvDataToConfirm(csvData); setIsConfirmModalOpen(true); } 
                else { setImportResult({ message: result.data?.result || "Analysis failed.", errors: result.data?.errors || [] }); }
            } catch (error) { setImportResult({ message: `Analysis failed: ${error.message}`, errors: [] }); } 
            finally { setIsImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
        };
        reader.readAsText(file);
    };

    const handleConfirmImport = async () => {
        if (!csvDataToConfirm) return;
        setIsConfirmingImport(true);
        setImportResult(null); 
        setCleanupResult(null);

        try {
            const result = await importAttendanceData({ csvData: csvDataToConfirm, confirm: true });
            setIsConfirmModalOpen(false); 

            if (!result.data.errors || result.data.errors.length === 0) {
                alert(`✅ Import Successful!\n\n${result.data.result}`);
                await handleGenerateReport(); 
            } else {
                setImportResult({ message: result.data.result, errors: result.data.errors || [] });
                alert("Import completed with some warnings. Please check the result message below the buttons.");
            }
        } catch (error) {
            setIsConfirmModalOpen(false);
            setImportResult({ message: `Import failed: ${error.message}`, errors: [] });
            alert(`Import Failed: ${error.message}`);
        } finally {
            setIsConfirmingImport(false);
            setCsvDataToConfirm(null);
            setAnalysisResult(null);
        }
    };

    const handleCancelImport = () => { setIsConfirmModalOpen(false); setAnalysisResult(null); setCsvDataToConfirm(null); if (fileInputRef.current) fileInputRef.current.value = ''; };
    
    const handleCleanup = async () => {
        if (!window.confirm("Run cleanup? This deletes bad attendance IDs.")) return;
        setCleanupLoading(true); setCleanupResult(null); setImportResult(null);
        try { const response = await cleanupBadAttendanceIds(); setCleanupResult({ message: response.data.message, error: false }); await handleGenerateReport(); } 
        catch (err) { setCleanupResult({ message: err.message, error: true }); } finally { setCleanupLoading(false); }
    };
    
    const getSortIcon = (key) => { if (sortConfig.key !== key) return null; return sortConfig.direction === 'ascending' ? <ArrowUp className="inline-block h-4 w-4 ml-1" /> : <ArrowDown className="inline-block h-4 w-4 ml-1" />; };

    return (
        <div>
            {editingRecord && ( <Modal isOpen={true} onClose={() => setEditingRecord(null)} title={editingRecord.fullRecord?.id ? "Edit Attendance Record" : "Manually Create Record"}> <EditAttendanceModal db={db} record={editingRecord} onClose={() => { setEditingRecord(null); handleGenerateReport(); }} /> </Modal> )}
            
            <ImportConfirmationModal 
                isOpen={isConfirmModalOpen} 
                onClose={handleCancelImport} 
                analysis={analysisResult} 
                onConfirm={handleConfirmImport} 
                isLoading={isConfirmingImport} 
                fileName="Attendance Import" 
                entityName="Records" 
            />

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">Attendance Reports</h2>

            <div className="bg-gray-800 rounded-lg shadow-lg p-4 md:p-6 mb-8">
                 <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-4">
                     <div className="flex-grow"><label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 text-gray-200" /></div>
                     <div className="flex-grow"><label className="block text-sm font-medium text-gray-300 mb-1">End Date</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 text-gray-200" /></div>
                     
                     <div className="flex-grow relative" ref={dropdownRef}>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Staff Selection</label>
                        <button onClick={() => setIsStaffDropdownOpen(!isStaffDropdownOpen)} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 text-gray-200 flex justify-between items-center">
                            <span>{selectedStaffIds.length === 0 ? "All Active Staff" : `${selectedStaffIds.length} Selected`}</span>
                            <ChevronDown className="h-4 w-4" />
                        </button>
                        
                        {isStaffDropdownOpen && (
                            <div className="absolute z-50 w-full mt-1 bg-gray-700 border border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                <div className="px-4 py-2 hover:bg-gray-600 cursor-pointer border-b border-gray-600 flex items-center" onClick={handleSelectAllStaff}>
                                    <div className={`w-4 h-4 mr-2 border rounded flex items-center justify-center ${selectedStaffIds.length === 0 ? 'bg-amber-600 border-amber-600' : 'border-gray-400'}`}>
                                        {selectedStaffIds.length === 0 && <Check className="h-3 w-3 text-white" />}
                                    </div>
                                    <span className="text-sm text-white font-bold">Select All / None</span>
                                </div>
                                {staffList.filter(s => s.status !== 'inactive').sort((a,b) => getDisplayName(a).localeCompare(getDisplayName(b))).map(staff => {
                                        const isSelected = selectedStaffIds.includes(staff.id);
                                        return (
                                            <div key={staff.id} className="px-4 py-2 hover:bg-gray-600 cursor-pointer flex items-center" onClick={() => handleToggleStaff(staff.id)}>
                                                <div className={`w-4 h-4 mr-2 border rounded flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-400'}`}>
                                                    {isSelected && <Check className="h-3 w-3 text-white" />}
                                                </div>
                                                <span className="text-sm text-gray-200">{getDisplayName(staff)}</span>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        )}
                    </div>

                     <button onClick={handleGenerateReport} disabled={isLoading || isImporting || isConfirmingImport || isExporting || cleanupLoading} className="w-full sm:w-auto px-5 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 text-white font-semibold">{isLoading ? 'Generating...' : 'Generate Report'}</button>
                 </div>
                <div className="flex flex-col sm:flex-row sm:justify-end gap-3 mt-4 border-t border-gray-700 pt-4">
                     <button onClick={handleExport} disabled={isExporting || isLoading} className="flex items-center justify-center px-4 py-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white font-semibold"> <Download className="h-5 w-5 mr-2" /> {isExporting ? 'Exporting...' : 'Export CSV'} </button>
                     <button onClick={handleImportClick} disabled={isImporting} className="flex items-center justify-center px-4 py-2 h-10 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-gray-500 text-white font-semibold"> <Upload className="h-5 w-5 mr-2" /> {isImporting ? 'Analyzing...' : 'Import CSV'} </button>
                     <input type="file" ref={fileInputRef} onChange={handleFileSelected} accept=".csv, text/csv, application/vnd.ms-excel" style={{ display: 'none' }} />
                    <button onClick={handleCleanup} disabled={cleanupLoading} className="flex items-center justify-center px-4 py-2 h-10 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-semibold"> <Trash2 className="h-5 w-5 mr-2" /> {cleanupLoading ? 'Cleaning...' : 'Run Cleanup'} </button>
                </div>
            </div>

             {cleanupResult && ( <div className={`p-4 rounded-lg mb-6 shadow ${cleanupResult.error ? 'bg-red-900/30 border border-red-700' : 'bg-green-900/30 border border-green-700'}`}> <p className={`font-semibold ${cleanupResult.error ? 'text-red-300' : 'text-green-300'}`}>{cleanupResult.error ? 'Cleanup Failed' : 'Cleanup Success'}</p> <p className="text-sm text-gray-300">{cleanupResult.message}</p> </div> )}
             {importResult && ( <div className={`p-4 rounded-lg mb-6 shadow ${importResult.errors?.length > 0 ? 'bg-red-900/30 border border-red-700' : 'bg-green-900/30 border border-green-700'}`}> <p className={`font-semibold ${importResult.errors?.length > 0 ? 'text-red-300' : 'text-green-300'}`}> Import Result: {importResult.message} </p> {importResult.errors?.length > 0 && ( <div className="mt-3"> <p className="text-sm font-semibold text-red-300 mb-1">Errors encountered during import:</p> <ul className="list-disc list-inside text-sm text-red-400 space-y-1 max-h-40 overflow-y-auto"> {importResult.errors.map((err, index) => ( <li key={index}>{err}</li> ))} </ul> </div> )} </div> )}

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"><button onClick={() => requestSort('staffName')} className="flex items-center hover:text-white">Staff Name {getSortIcon('staffName')}</button></th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"><button onClick={() => requestSort('date')} className="flex items-center hover:text-white">Date {getSortIcon('date')}</button></th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"><button onClick={() => requestSort('status')} className="flex items-center hover:text-white">Status {getSortIcon('status')}</button></th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"><button onClick={() => requestSort('checkIn')} className="flex items-center hover:text-white">Check-In {getSortIcon('checkIn')}</button></th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"><button onClick={() => requestSort('checkOut')} className="flex items-center hover:text-white">Check-Out {getSortIcon('checkOut')}</button></th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"><button onClick={() => requestSort('workHours')} className="flex items-center hover:text-white">Work Hours {getSortIcon('workHours')}</button></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {isLoading ? ( <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500 italic">Generating report...</td></tr> ) : reportData.length > 0 ? (
                            reportData.map((row) => (
                                <tr key={row.id || `${row.staffId}_${row.date}`} onClick={() => handleRowClick(row)} className="hover:bg-gray-700 cursor-pointer transition duration-150 ease-in-out">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{row.staffName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{dateUtils.formatDisplayDate(row.date)}</td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${
                                        row.status === 'Absent' ? 'text-red-400' :
                                        row.status.startsWith('Late') ? 'text-yellow-400' :
                                        row.status.startsWith('Overtime') ? 'text-green-400' : 
                                        row.status === 'Leave' ? 'text-blue-400' :
                                        row.status === 'Off' ? 'text-gray-500' :
                                        'text-gray-300'
                                    }`}>
                                        {row.status}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.checkIn}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.checkOut}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{row.workHours < 0 ? 'N/A' : row.workHours.toFixed(2)}</td>
                                </tr>
                            ))
                        ) : ( <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500">No attendance data found for the selected criteria.</td></tr> )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}