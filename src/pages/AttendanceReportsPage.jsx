/* src/pages/AttendanceReportsPage.jsx */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, doc, onSnapshot, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from "firebase/functions";
import Modal from '../components/common/Modal';
import EditAttendanceModal from '../components/Attendance/EditAttendanceModal.jsx';
import ImportConfirmationModal from '../components/common/ImportConfirmationModal.jsx';
import * as dateUtils from '../utils/dateUtils';
import { calculateAttendanceStatus } from '../utils/statusUtils';
import { app } from "../../firebase.js";
import { ArrowUp, ArrowDown, Download, Upload, Trash2, Check, ChevronDown, Users, Clock, AlertTriangle, Calendar } from 'lucide-react';
import FinancialSummaryCard from '../components/Financials/FinancialSummaryCard'; 
import { exportAttendancePDF } from '../utils/attendanceExport';

// --- IMPORTS DES MODALES ---
import FeedbackModal from '../components/common/FeedbackModal';
import ConfirmModal from '../components/common/ConfirmModal';

const functions = getFunctions(app, "asia-southeast1");
const exportAttendanceData = httpsCallable(functions, 'exportAttendanceData');
const importAttendanceData = httpsCallable(functions, 'importAttendanceData');
const cleanupBadAttendanceIds = httpsCallable(functions, 'cleanupBadAttendanceIds');

const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName && staff.lastName) return `${staff.firstName} ${staff.lastName}`;
    return staff?.firstName || staff?.fullName || 'Unknown Staff';
};

export default function AttendanceReportsPage({ db, staffList, activeBranch, userRole }) {
    const [unsortedReportData, setUnsortedReportData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [startDate, setStartDate] = useState(dateUtils.formatISODate(new Date()));
    const [endDate, setEndDate] = useState(dateUtils.formatISODate(new Date()));
    const [statusFilter, setStatusFilter] = useState('All'); 

    const [selectedStaffIds, setSelectedStaffIds] = useState([]);
    const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const [editingRecord, setEditingRecord] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'descending' });
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

    const [feedbackModal, setFeedbackModal] = useState(null);
    const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });
    const [adminBranchIds, setAdminBranchIds] = useState([]);

    const isSuperAdmin = userRole === 'super_admin';

    useEffect(() => {
        const uid = getAuth().currentUser?.uid;
        if (userRole === 'admin' && uid && db) {
            getDoc(doc(db, 'users', uid)).then(snap => {
                if (snap.exists()) setAdminBranchIds(snap.data().branchIds || []);
            }).catch(err => console.error(err));
        }
    }, [db, userRole]);

    useEffect(() => {
        if (!db) return;
        const unsub = onSnapshot(doc(db, 'settings', 'company_config'), (snap) => {
            if (snap.exists()) setCompanyConfig(snap.data());
        });
        return () => unsub();
    }, [db]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsStaffDropdownOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const relevantStaffList = useMemo(() => {
        if (!staffList || !startDate || !endDate) return [];
        const reportStart = new Date(startDate); reportStart.setHours(0, 0, 0, 0);
        const reportEnd = new Date(endDate); reportEnd.setHours(23, 59, 59, 999);

        return staffList.filter(staff => {
            let sStart = staff.startDate?.toDate ? staff.startDate.toDate() : new Date(staff.startDate || 0);
            let sEnd = staff.endDate?.toDate ? staff.endDate.toDate() : (staff.endDate ? new Date(staff.endDate) : null);
            sStart.setHours(0, 0, 0, 0); if (sEnd) sEnd.setHours(23, 59, 59, 999);

            if (sStart > reportEnd) return false;
            if (sEnd && sEnd < reportStart) return false;

            if (activeBranch === 'global') {
                if (userRole === 'admin' && !adminBranchIds.includes(staff.branchId)) return false;
            } else if (activeBranch && staff.branchId !== activeBranch) {
                return false;
            }
            return true;
        });
    }, [staffList, startDate, endDate, activeBranch, userRole, adminBranchIds]);

    const handleToggleStaff = (staffId) => {
        setSelectedStaffIds(prev => prev.includes(staffId) ? prev.filter(id => id !== staffId) : [...prev, staffId]);
    };

    const handleSelectAllStaff = () => {
        setSelectedStaffIds(selectedStaffIds.length === relevantStaffList.length ? [] : relevantStaffList.map(s => s.id));
    };

    const handleGenerateReport = async () => {
        setIsLoading(true); setUnsortedReportData([]); setImportResult(null); setCleanupResult(null);
        try {
            const [schedulesSnapshot, attendanceSnapshot, leaveSnapshot] = await Promise.all([
                getDocs(query(collection(db, "schedules"), where("date", ">=", startDate), where("date", "<=", endDate))),
                getDocs(query(collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate))),
                getDocs(query(collection(db, "leave_requests"), where("status", "==", "approved"), where("startDate", "<=", endDate)))
            ]);

            const schedulesMap = new Map();
            schedulesSnapshot.docs.forEach(d => schedulesMap.set(`${d.data().staffId}_${d.data().date}`, d.data()));

            const attendanceMap = new Map();
            attendanceSnapshot.docs.forEach(d => attendanceMap.set(`${d.data().staffId}_${d.data().date}`, { id: d.id, ...d.data() }));

            const leaveMap = new Map();
            leaveSnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.endDate >= startDate) {
                    dateUtils.eachDayOfInterval(data.startDate, data.endDate).forEach(day => {
                        const dateStr = dateUtils.formatISODate(day);
                        if (dateStr >= startDate && dateStr <= endDate) leaveMap.set(`${data.staffId}_${dateStr}`, data);
                    });
                }
            });

            // On compile toujours toutes les données pour rendre les filtres instantanés
            const staffToReport = relevantStaffList; 
            const generatedData = [];
            const dateInterval = dateUtils.eachDayOfInterval(startDate, endDate);
            const todayForReport = new Date(); todayForReport.setHours(23, 59, 59, 999);

            for (const staff of staffToReport) {
                let sStart = staff.startDate?.toDate ? staff.startDate.toDate() : new Date(staff.startDate || 0);
                let sEnd = staff.endDate?.toDate ? staff.endDate.toDate() : (staff.endDate ? new Date(staff.endDate) : null);
                sStart.setHours(0, 0, 0, 0);

                for (const day of dateInterval) {
                    if (day < sStart || (sEnd && day > sEnd)) continue;
                    if (day > todayForReport) continue;

                    const dateStr = dateUtils.formatISODate(day);
                    const key = `${staff.id}_${dateStr}`;
                    const schedule = schedulesMap.get(key);
                    const attendance = attendanceMap.get(key);
                    const approvedLeave = leaveMap.get(key);

                    let { status, isLate, lateMinutes, otMinutes, checkInTime, checkOutTime } = calculateAttendanceStatus(
                        schedule, attendance, approvedLeave, day, companyConfig
                    );

                    let displayStatus = status;
                    const hasSchedule = schedule && schedule.type !== 'off';
                    const hasAttendance = attendance && attendance.checkInTime;

                    if (approvedLeave) displayStatus = 'Leave';
                    else if (hasAttendance) {
                         if (isLate) displayStatus = `Late (${lateMinutes}m)`;
                         else if (status === 'Overtime' && otMinutes > 0) {
                            const h = Math.floor(otMinutes / 60); const m = otMinutes % 60;
                            displayStatus = `Overtime (+${h}h ${m}m)`;
                         } else if (!hasSchedule) displayStatus = 'Extra Shift';
                         else displayStatus = 'Completed';
                    } else if (hasSchedule) displayStatus = 'Absent';
                    else displayStatus = 'Off';

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

                    generatedData.push({
                        id: attendance ? attendance.id : `no_attendance_${staff.id}_${dateStr}`,
                        staffId: staff.id,
                        staffName: getDisplayName(staff),
                        date: dateStr,
                        checkIn: checkInTime ? dateUtils.formatCustom(checkInTime, 'HH:mm') : '-',
                        checkOut: checkOutTime ? dateUtils.formatCustom(checkOutTime, 'HH:mm') : '-',
                        workHours: ['Leave', 'Off', 'Absent'].includes(displayStatus) ? -1 : (workHours > 0 ? parseFloat(workHours.toFixed(2)) : 0),
                        status: displayStatus,
                        rawLateMinutes: isLate ? lateMinutes : 0,
                        rawOtMinutes: status === 'Overtime' ? otMinutes : 0,
                        fullRecord: attendance || { staffId: staff.id, date: dateStr, id: null },
                    });
                }
            }
            setUnsortedReportData(generatedData);
        } catch (error) {
            console.error(error); setImportResult({ message: "Error generating report.", errors: [error.message] });
        } finally { setIsLoading(false); }
    };

    // --- APPLICATION FILTRES (STAFF + STATUT) & TRI DYNAMIQUE ---
    const processedReportData = useMemo(() => {
        let data = [...unsortedReportData];

        if (selectedStaffIds.length > 0) {
            data = data.filter(r => selectedStaffIds.includes(r.staffId));
        }
        
        if (statusFilter !== 'All') {
            if (statusFilter === 'Late') data = data.filter(r => r.status.startsWith('Late'));
            else if (statusFilter === 'Overtime') data = data.filter(r => r.status.startsWith('Overtime'));
            else data = data.filter(r => r.status === statusFilter);
        }

        data.sort((a, b) => {
            let aVal = a[sortConfig.key], bVal = b[sortConfig.key];
            if (sortConfig.key === 'workHours') { aVal = aVal < 0 ? -1 : aVal; bVal = bVal < 0 ? -1 : bVal; }
            if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        });

        return data;
    }, [unsortedReportData, statusFilter, sortConfig, selectedStaffIds]);

    // --- CALCUL DES STATISTIQUES (Basé sur les données filtrées) ---
    const metricsSummary = useMemo(() => {
        const totalItems = processedReportData.length;
        if (totalItems === 0) return { complianceRate: 0, completedShifts: 0, plannedShifts: 0, totalLateMinutes: 0, lateCount: 0, totalOtHours: 0, absentCount: 0, leaveCount: 0 };

        let plannedShifts = 0, completedShifts = 0, totalLateMinutes = 0, lateCount = 0, totalOtMinutes = 0, absentCount = 0, leaveCount = 0;

        processedReportData.forEach(r => {
            if (r.status === 'Absent') { plannedShifts++; absentCount++; }
            else if (r.status === 'Leave') { leaveCount++; }
            else if (r.status === 'Extra Shift') { completedShifts++; totalOtMinutes += (r.workHours * 60); }
            else if (r.status === 'Completed') { plannedShifts++; completedShifts++; }
            else if (r.status.startsWith('Late')) { plannedShifts++; completedShifts++; lateCount++; totalLateMinutes += r.rawLateMinutes; }
            else if (r.status.startsWith('Overtime')) { plannedShifts++; completedShifts++; totalOtMinutes += r.rawOtMinutes; }
        });

        const complianceRate = plannedShifts > 0 ? Math.round((completedShifts / plannedShifts) * 100) : 100;
        const totalOtHours = (totalOtMinutes / 60).toFixed(1);

        return { complianceRate, completedShifts, plannedShifts, totalLateMinutes, lateCount, totalOtHours, absentCount, leaveCount };
    }, [processedReportData]);

    const requestSort = (key) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending' }));
    };

    const handleRowClick = (row) => {
        setEditingRecord(row);
    };

    const handleExportLocalPDF = () => {
        const branchName = activeBranch === 'global' ? 'All Branches' : `Branch ID: ${activeBranch}`;
        exportAttendancePDF({ reportData: processedReportData, startDate, endDate, summary: metricsSummary, activeBranch, branchName });
    };

    const handleExportCSV = async () => {
        setIsExporting(true); setImportResult(null); setCleanupResult(null);
        try {
            const result = await exportAttendanceData({ startDate, endDate, staffIds: selectedStaffIds.length > 0 ? selectedStaffIds : null });
            if (!result.data.csvData) { setFeedbackModal({ type: 'warning', title: 'Empty Export', message: "No data found." }); return; }
            const blob = new Blob([`\uFEFF${result.data.csvData}`], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = result.data.filename || `attendance_export.csv`;
            link.click();
        } catch (error) { setFeedbackModal({ type: 'error', title: 'Export Failed', message: error.message }); }
        finally { setIsExporting(false); }
    };

    const handleImportClick = () => {
        fileInputRef.current.value = ''; fileInputRef.current.click();
    };

    const handleFileSelected = (event) => {
        const file = event.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            setIsImporting(true);
            try {
                const result = await importAttendanceData({ csvData: e.target.result, confirm: false });
                if (result.data?.analysis) { setAnalysisResult(result.data.analysis); setCsvDataToConfirm(e.target.result); setIsConfirmModalOpen(true); }
                else setImportResult({ message: result.data?.result || "Analysis failed.", errors: result.data?.errors || [] });
            } catch (error) { setImportResult({ message: error.message, errors: [] }); }
            finally { setIsImporting(false); }
        };
        reader.readAsText(file);
    };

    const handleConfirmImport = async () => {
        setIsConfirmingImport(true);
        try {
            const result = await importAttendanceData({ csvData: csvDataToConfirm, confirm: true });
            setIsConfirmModalOpen(false);
            if (!result.data.errors?.length) {
                setFeedbackModal({ type: 'success', title: 'Import Complete', message: result.data.result });
                await handleGenerateReport();
            } else { setImportResult({ message: result.data.result, errors: result.data.errors }); }
        } catch (error) { setFeedbackModal({ type: 'error', title: 'Import Failed', message: error.message }); }
        finally { setIsConfirmingImport(false); setCsvDataToConfirm(null); }
    };

    const handleCleanup = async () => {
        setConfirmState({
            isOpen: true, title: "Run Database Cleanup", message: "Are you sure you want to scrub corrupted attendance IDs?", isDestructive: true, confirmText: "Run Cleanup",
            onConfirm: async () => {
                setConfirmState({ isOpen: false }); setCleanupLoading(true);
                try {
                    const res = await cleanupBadAttendanceIds();
                    setCleanupResult({ message: res.data.message, error: false });
                    await handleGenerateReport();
                } catch (err) { setCleanupResult({ message: err.message, error: true }); }
                finally { setCleanupLoading(false); }
            },
            onCancel: () => setConfirmState({ isOpen: false })
        });
    };

    const getSortIcon = (key) => { if (sortConfig.key !== key) return null; return sortConfig.direction === 'ascending' ? ' ↑' : ' ↓'; };

    return (
        <div className="pb-20">
            <FeedbackModal isOpen={!!feedbackModal} type={feedbackModal?.type} title={feedbackModal?.title} message={feedbackModal?.message} onClose={() => setFeedbackModal(null)} />
            <ConfirmModal isOpen={confirmState.isOpen} title={confirmState.title} message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} isDestructive={confirmState.isDestructive} confirmText={confirmState.confirmText} />
            
            {editingRecord && (
                <Modal isOpen={true} onClose={() => setEditingRecord(null)} title={editingRecord.fullRecord?.id ? "Edit Attendance Record" : "Manually Create Record"}>
                    <EditAttendanceModal db={db} record={editingRecord} onClose={() => { setEditingRecord(null); handleGenerateReport(); }} />
                </Modal>
            )}
            
            <ImportConfirmationModal isOpen={isConfirmModalOpen} onClose={() => setIsConfirmModalOpen(false)} analysis={analysisResult} onConfirm={handleConfirmImport} isLoading={isConfirmingImport} fileName="Attendance Import" entityName="Records" />

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">Attendance Reports</h2>

            {/* SECTION FILTRES PRINCIPAUX */}
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-6 border border-gray-700">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Start Date</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 text-gray-200 text-sm outline-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">End Date</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 text-gray-200 text-sm outline-none" />
                    </div>
                    <div className="relative" ref={dropdownRef}>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Staff Member</label>
                        <button onClick={() => setIsStaffDropdownOpen(!isStaffDropdownOpen)} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 text-gray-200 text-sm flex justify-between items-center outline-none">
                            <span className="truncate">{selectedStaffIds.length === 0 ? "All Active Team" : `${selectedStaffIds.length} Selected`}</span>
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                        </button>
                        {isStaffDropdownOpen && (
                            <div className="absolute z-50 w-full mt-1 bg-gray-700 border border-gray-600 rounded-md shadow-2xl max-h-60 overflow-y-auto">
                                <div className="px-4 py-2 hover:bg-gray-600 cursor-pointer border-b border-gray-600 flex items-center" onClick={handleSelectAllStaff}>
                                    <div className={`w-4 h-4 mr-2 border rounded flex items-center justify-center ${selectedStaffIds.length === 0 ? 'bg-amber-600 border-amber-600' : 'border-gray-400'}`}>
                                        {selectedStaffIds.length === 0 && <Check className="h-3 w-3 text-white" />}
                                    </div>
                                    <span className="text-xs text-white font-bold">Select All / None</span>
                                </div>
                                {relevantStaffList.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))).map(staff => (
                                    <div key={staff.id} className="px-4 py-2 hover:bg-gray-600 cursor-pointer flex items-center" onClick={() => handleToggleStaff(staff.id)}>
                                        <div className={`w-4 h-4 mr-2 border rounded flex items-center justify-center ${selectedStaffIds.includes(staff.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-400'}`}>
                                            {selectedStaffIds.includes(staff.id) && <Check className="h-3 w-3 text-white" />}
                                        </div>
                                        <span className="text-xs text-gray-200">{getDisplayName(staff)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <button onClick={handleGenerateReport} disabled={isLoading} className="px-5 py-2 h-10 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 text-white font-bold text-sm shadow-lg transition-colors">
                        {isLoading ? 'Processing...' : 'Compile Metrics'}
                    </button>
                </div>

                {/* ZONE ACTIONS ROUTINES ET PASSAGES SÉCURISÉS */}
                <div className="flex flex-wrap gap-2 justify-between items-center mt-5 pt-4 border-t border-gray-700/60">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Isolate:</label>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="p-1.5 bg-gray-700 border border-gray-600 text-white rounded text-xs outline-none">
                            <option value="All">-- Show All Activities --</option>
                            <option value="Completed">Completed Shifts</option>
                            <option value="Late">Late Incidents</option>
                            <option value="Absent">No Show / Absences</option>
                            <option value="Leave">Approved Leaves</option>
                            <option value="Extra Shift">Extra Shifts</option>
                            <option value="Off">Scheduled Off Jumps</option>
                        </select>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={handleExportLocalPDF} disabled={isLoading || processedReportData.length === 0} className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow transition-colors">
                            <Download className="w-3.5 h-3.5 mr-1.5" /> Export PDF
                        </button>
                        
                        {isSuperAdmin && (
                            <>
                                <button onClick={handleExportCSV} disabled={isExporting || isLoading} className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs shadow transition-colors">
                                    <Download className="w-3.5 h-3.5 mr-1.5" /> Backup CSV
                                </button>
                                <button onClick={handleImportClick} disabled={isImporting} className="flex items-center px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-bold text-xs shadow transition-colors">
                                    <Upload className="w-3.5 h-3.5 mr-1.5" /> Inject CSV
                                </button>
                                <button onClick={handleCleanup} disabled={cleanupLoading} className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-xs shadow transition-colors">
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> DB Scrub
                                </button>
                                <input type="file" ref={fileInputRef} onChange={handleFileSelected} accept=".csv" style={{ display: 'none' }} />
                            </>
                        )}
                    </div>
                </div>
            </div>

            {cleanupResult && (
                <div className={`p-4 rounded-lg mb-4 border ${cleanupResult.error ? 'bg-red-900/20 border-red-800 text-red-400' : 'bg-green-900/20 border-green-800 text-green-400'}`}>
                    <p className="text-xs font-mono">{cleanupResult.message}</p>
                </div>
            )}

            {/* ENCART ANALYTICS DYNAMIQUE & INTERACTIF */}
            {unsortedReportData.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 animate-in fade-in duration-300">
                    <div onClick={() => setStatusFilter(statusFilter === 'All' ? 'All' : 'All')} className="cursor-pointer transition-transform hover:scale-[1.02]">
                        <FinancialSummaryCard title="Shift Compliance Rate" value={`${metricsSummary.complianceRate}%`} subText={`${metricsSummary.completedShifts} done / ${metricsSummary.plannedShifts} scheduled`} isCurrency={false} icon={Calendar} color={metricsSummary.complianceRate > 90 ? "green" : "amber"} isActive={statusFilter === 'All'} />
                    </div>
                    <div onClick={() => setStatusFilter(statusFilter === 'Late' ? 'All' : 'Late')} className="cursor-pointer transition-transform hover:scale-[1.02]">
                        <FinancialSummaryCard title="Accumulated Lateness" value={`${metricsSummary.totalLateMinutes} Mins`} subText={`${metricsSummary.lateCount} flag events registered`} isCurrency={false} icon={Clock} color={metricsSummary.totalLateMinutes > 0 ? "red" : "blue"} isActive={statusFilter === 'Late'} />
                    </div>
                    <div onClick={() => setStatusFilter(statusFilter === 'Overtime' ? 'All' : 'Overtime')} className="cursor-pointer transition-transform hover:scale-[1.02]">
                        <FinancialSummaryCard title="Accumulated Overtime" value={`${metricsSummary.totalOtHours} Hours`} subText="Additional compiled hours" isCurrency={false} icon={Clock} color="green" isActive={statusFilter === 'Overtime'} />
                    </div>
                    <div onClick={() => setStatusFilter(statusFilter === 'Absent' ? 'All' : 'Absent')} className="cursor-pointer transition-transform hover:scale-[1.02]">
                        <FinancialSummaryCard title="Absences & Approved Leaves" value={`A: ${metricsSummary.absentCount} | L: ${metricsSummary.leaveCount}`} subText="Loss parameters summary" isCurrency={false} icon={AlertTriangle} color="purple" isActive={statusFilter === 'Absent'} />
                    </div>
                </div>
            )}

            {/* GRILLE PRINCIPALE DES DONNÉES COMPILÉES */}
            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto border border-gray-700">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-300 uppercase cursor-pointer hover:text-white" onClick={() => requestSort('staffName')}>Staff Member{getSortIcon('staffName')}</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-300 uppercase cursor-pointer hover:text-white" onClick={() => requestSort('date')}>Date{getSortIcon('date')}</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-300 uppercase cursor-pointer hover:text-white" onClick={() => requestSort('status')}>Status{getSortIcon('status')}</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-300 uppercase">Check-In</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-300 uppercase">Check-Out</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-300 uppercase cursor-pointer hover:bg-gray-600" onClick={() => requestSort('workHours')}>Hours{getSortIcon('workHours')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {isLoading ? (
                            <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500 italic">Compiling cloud parameters...</td></tr>
                        ) : processedReportData.length > 0 ? (
                            processedReportData.map((row) => (
                                <tr key={row.id} onClick={() => handleRowClick(row)} className="hover:bg-gray-750 cursor-pointer transition duration-150">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white flex items-center">
                                        {row.staffName}
                                        {activeBranch === 'global' && (() => {
                                            const staff = staffList.find(s => s.id === row.staffId);
                                            if (!staff?.branchId) return null;
                                            const bName = companyConfig?.branches?.find(b => b.id === staff.branchId)?.name || staff.branchId;
                                            return <span className="ml-2 text-[9px] uppercase tracking-wider font-bold bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">{bName.replace('Da Moreno ', '')}</span>;
                                        })()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{dateUtils.formatDisplayDate(row.date)}</td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${
                                        row.status === 'Absent' ? 'text-red-400' :
                                        row.status.startsWith('Late') ? 'text-yellow-400' :
                                        row.status.startsWith('Overtime') ? 'text-green-400' :
                                        row.status === 'Leave' ? 'text-blue-400' :
                                        row.status === 'Off' ? 'text-gray-500' : 'text-gray-300'
                                    }`}>
                                        {row.status}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">{row.checkIn}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">{row.checkOut}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">{row.workHours < 0 ? 'N/A' : `${row.workHours.toFixed(2)} h`}</td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500 text-sm">No synchronized tracking parameters found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}