/* src/pages/AttendanceReportsPage.jsx */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, doc, onSnapshot, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import Modal from '../components/common/Modal';
import EditAttendanceModal from '../components/Attendance/EditAttendanceModal.jsx';
import FinancialAdjustmentsCalculator from '../components/Attendance/FinancialAdjustmentsCalculator.jsx';
import AttendanceExportOptionsModal from '../components/Attendance/AttendanceExportOptionsModal.jsx';
import * as dateUtils from '../utils/dateUtils';
import { calculateAttendanceStatus } from '../utils/statusUtils';
import { getCurrentJob, getDisplayName } from '../utils/staffUtils';
import { ArrowUp, ArrowDown, Download, Check, ChevronDown, Users, Clock, AlertTriangle, Calendar, Calculator as CalculatorIcon } from 'lucide-react';
import FinancialSummaryCard from '../components/Financials/FinancialSummaryCard';
import { generateCustomAttendanceExport } from '../utils/attendanceExport';

import FeedbackModal from '../components/common/FeedbackModal';

const formatDuration = (mins) => {
    if (!mins || mins === 0) return '0m';
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export default function AttendanceReportsPage({ db, staffList, activeBranch, userRole }) {
    const [unsortedReportData, setUnsortedReportData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const [startDate, setStartDate] = useState(() => {
        const today = new Date();
        return dateUtils.formatISODate(new Date(today.getFullYear(), today.getMonth(), 1));
    });
    const [endDate, setEndDate] = useState(dateUtils.formatISODate(new Date()));

    const [statusFilter, setStatusFilter] = useState('All');

    const [selectedStaffIds, setSelectedStaffIds] = useState([]);
    const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const [editingRecord, setEditingRecord] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'descending' });
    const [companyConfig, setCompanyConfig] = useState({});

    const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    const [feedbackModal, setFeedbackModal] = useState(null);
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

    const handleToggleStaff = (staffId) => setSelectedStaffIds(prev => prev.includes(staffId) ? prev.filter(id => id !== staffId) : [...prev, staffId]);
    const handleSelectAllStaff = () => setSelectedStaffIds(selectedStaffIds.length === relevantStaffList.length ? [] : relevantStaffList.map(s => s.id));

    const handleGenerateReport = async () => {
        setIsLoading(true); setUnsortedReportData([]);
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

            const generatedData = [];
            const dateInterval = dateUtils.eachDayOfInterval(startDate, endDate);
            const todayForReport = new Date(); todayForReport.setHours(23, 59, 59, 999);

            for (const staff of relevantStaffList) {
                let sStart = staff.startDate?.toDate ? staff.startDate.toDate() : new Date(staff.startDate || 0);
                let sEnd = staff.endDate?.toDate ? staff.endDate.toDate() : (staff.endDate ? new Date(staff.endDate) : null);
                sStart.setHours(0, 0, 0, 0);

                const job = getCurrentJob(staff);

                // CORRECTION : On résout la configuration spécifique à la branche du Staff !
                const branchConfig = companyConfig?.branchSettings?.[staff.branchId] || {};
                const resolvedConfig = { ...companyConfig, ...branchConfig };

                for (const day of dateInterval) {
                    if (day < sStart || (sEnd && day > sEnd)) continue;
                    if (day > todayForReport) continue;

                    const dateStr = dateUtils.formatISODate(day);
                    const key = `${staff.id}_${dateStr}`;
                    const schedule = schedulesMap.get(key);
                    const attendance = attendanceMap.get(key);
                    const approvedLeave = leaveMap.get(key);

                    // On utilise la configuration résolue
                    let { status, checkInTime, checkOutTime, suggestedLateMinutes, suggestedOtMinutes, approvedLateMinutes, approvedOtMinutes } = calculateAttendanceStatus(
                        schedule, attendance, approvedLeave, day, resolvedConfig
                    );

                    let baseStatus = status;
                    let varianceText = '';

                    const hasSchedule = schedule && schedule.type !== 'off';
                    const hasAttendance = attendance && attendance.checkInTime;

                    if (approvedLeave) baseStatus = 'Leave';
                    else if (hasAttendance) {
                        if (approvedOtMinutes > 0 && approvedLateMinutes > 0) {
                            baseStatus = 'Adjusted';
                            varianceText = `Paid OT: ${formatDuration(approvedOtMinutes)} | Deducted: ${formatDuration(approvedLateMinutes)}`;
                        } else if (approvedOtMinutes > 0) {
                            baseStatus = 'Paid OT';
                            varianceText = `Paid OT: ${formatDuration(approvedOtMinutes)}`;
                        } else if (approvedLateMinutes > 0) {
                            baseStatus = 'Penalty Late';
                            varianceText = `Deducted: ${formatDuration(approvedLateMinutes)}`;
                        } else if (!hasSchedule) {
                            baseStatus = 'Extra Shift';
                            if (suggestedOtMinutes > 0) varianceText = `Sug. OT: ${formatDuration(suggestedOtMinutes)}`;
                        } else if (suggestedLateMinutes > 0) {
                            baseStatus = 'Late';
                            varianceText = `Sug. Late: ${formatDuration(suggestedLateMinutes)}`;
                        } else {
                            baseStatus = 'Completed';
                            if (suggestedOtMinutes > 0) varianceText = `Sug. OT: ${formatDuration(suggestedOtMinutes)}`;
                        }
                    } else if (hasSchedule) baseStatus = 'Absent';
                    else baseStatus = 'Off';

                    // CORRECTION : Logique stricte de déduction de pause + conversion minutes
                    let workMinutes = 0;
                    let workHours = 0; // Conservé pour la rétrocompatibilité du tri

                    if (checkInTime && checkOutTime) {
                        let durationMs = checkOutTime.getTime() - checkInTime.getTime();
                        const breakMins = resolvedConfig.breakDurationMinutes !== undefined ? parseInt(resolvedConfig.breakDurationMinutes) : 60;
                        const standardBreakMs = breakMins * 60000;

                        if (attendance?.includesBreak !== false) {
                            if (attendance.breakStart) {
                                if (attendance.breakEnd) {
                                    const bStart = attendance.breakStart.toDate ? attendance.breakStart.toDate() : attendance.breakStart;
                                    const bEnd = attendance.breakEnd.toDate ? attendance.breakEnd.toDate() : attendance.breakEnd;
                                    const actualBreakMs = bEnd - bStart;
                                    durationMs -= Math.max(actualBreakMs, standardBreakMs);
                                } else {
                                    durationMs -= standardBreakMs;
                                }
                            } else if (durationMs > 5 * 3600000) {
                                durationMs -= standardBreakMs;
                            }
                        }
                        workMinutes = Math.max(0, Math.floor(durationMs / 60000));
                        workHours = workMinutes / 60;
                    }

                    generatedData.push({
                        id: attendance ? attendance.id : `no_attendance_${staff.id}_${dateStr}`,
                        staffId: staff.id,
                        staffName: getDisplayName(staff),
                        staffNickname: staff.nickname || staff.firstName,
                        staffFullName: staff.fullName || `${staff.firstName} ${staff.lastName || ''}`.trim(),
                        position: job.position || 'Staff',
                        date: dateStr,
                        checkIn: checkInTime ? dateUtils.formatCustom(checkInTime, 'HH:mm') : '-',
                        checkOut: checkOutTime ? dateUtils.formatCustom(checkOutTime, 'HH:mm') : '-',
                        workHours: ['Leave', 'Off', 'Absent'].includes(baseStatus) ? -1 : parseFloat(workHours.toFixed(2)),
                        workMinutes: ['Leave', 'Off', 'Absent'].includes(baseStatus) ? -1 : workMinutes, // <-- NOUVELLE DONNÉE
                        baseStatus: baseStatus,
                        varianceText: varianceText,
                        rawLateMinutes: suggestedLateMinutes || 0,
                        rawOtMinutes: suggestedOtMinutes || 0,
                        approvedLateMinutes: approvedLateMinutes || 0,
                        approvedOtMinutes: approvedOtMinutes || 0,
                        fullRecord: attendance || { staffId: staff.id, date: dateStr, id: null },
                    });
                }
            }
            setUnsortedReportData(generatedData);
        } catch (error) {
            console.error(error); setFeedbackModal({ type: 'error', title: 'Error', message: "Error generating report." });
        } finally { setIsLoading(false); }
    };

    const processedReportData = useMemo(() => {
        let data = [...unsortedReportData];

        if (selectedStaffIds.length > 0) {
            data = data.filter(r => selectedStaffIds.includes(r.staffId));
        }

        if (statusFilter !== 'All') {
            if (statusFilter === 'Late') data = data.filter(r => r.baseStatus.includes('Late') || r.rawLateMinutes > 0);
            else if (statusFilter === 'Overtime') data = data.filter(r => r.baseStatus.includes('OT') || r.rawOtMinutes > 0);
            else data = data.filter(r => r.baseStatus === statusFilter);
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

    const metricsSummary = useMemo(() => {
        const totalItems = processedReportData.length;
        if (totalItems === 0) return { complianceRate: 0, completedShifts: 0, plannedShifts: 0, totalApprovedLate: 0, totalSuggestedLate: 0, lateCount: 0, approvedOtHours: 0, suggestedOtHours: 0, absentCount: 0, leaveCount: 0 };

        let plannedShifts = 0, completedShifts = 0, totalApprovedLate = 0, totalSuggestedLate = 0, lateCount = 0, totalApprovedOt = 0, totalSuggestedOt = 0, absentCount = 0, leaveCount = 0;

        processedReportData.forEach(r => {
            if (r.baseStatus === 'Absent') { plannedShifts++; absentCount++; }
            else if (r.baseStatus === 'Leave') { leaveCount++; }
            else if (['Completed', 'Present', 'Extra Shift', 'Paid OT', 'Penalty Late', 'Adjusted', 'Late'].includes(r.baseStatus)) {
                completedShifts++;
                if (r.baseStatus !== 'Extra Shift') plannedShifts++;

                totalApprovedOt += r.approvedOtMinutes;
                totalSuggestedOt += r.rawOtMinutes;
                totalApprovedLate += r.approvedLateMinutes;
                totalSuggestedLate += r.rawLateMinutes;

                if (r.approvedLateMinutes > 0 || r.rawLateMinutes > 0) lateCount++;
            }
        });

        const complianceRate = plannedShifts > 0 ? Math.round((completedShifts / plannedShifts) * 100) : 100;
        const approvedOtHours = (totalApprovedOt / 60).toFixed(1);
        const suggestedOtHours = (totalSuggestedOt / 60).toFixed(1);

        return { complianceRate, completedShifts, plannedShifts, totalApprovedLate, totalSuggestedLate, lateCount, approvedOtHours, suggestedOtHours, absentCount, leaveCount };
    }, [processedReportData]);

    const requestSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending' }));
    const handleRowClick = (row) => setEditingRecord(row);

    const handleExecuteExport = (options) => {
        const branchName = activeBranch === 'global' ? 'All Branches' : `Branch ID: ${activeBranch}`;
        const result = generateCustomAttendanceExport({
            reportData: processedReportData,
            options,
            branchName,
            summary: metricsSummary
        });
        if (result?.success) setIsExportModalOpen(false);
    };

    const getSortIcon = (key) => { if (sortConfig.key !== key) return null; return sortConfig.direction === 'ascending' ? ' ↑' : ' ↓'; };

    return (
        <div className="pb-20">
            <FeedbackModal isOpen={!!feedbackModal} type={feedbackModal?.type} title={feedbackModal?.title} message={feedbackModal?.message} onClose={() => setFeedbackModal(null)} />

            {editingRecord && (
                <Modal isOpen={true} onClose={() => setEditingRecord(null)} title={editingRecord.fullRecord?.id ? "Edit Attendance Record" : "Manually Create Record"}>
                    <EditAttendanceModal db={db} record={editingRecord} onClose={() => { setEditingRecord(null); handleGenerateReport(); }} />
                </Modal>
            )}

            <AttendanceExportOptionsModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleExecuteExport}
                recordCount={processedReportData.length}
            />

            <FinancialAdjustmentsCalculator isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} reportData={processedReportData} staffList={staffList} />

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">Attendance Reports</h2>

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
                        <button onClick={() => setIsExportModalOpen(true)} disabled={isLoading || processedReportData.length === 0} className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow transition-colors">
                            <Download className="w-3.5 h-3.5 mr-1.5" /> Export Selected
                        </button>
                        {isSuperAdmin && (
                            <button onClick={() => setIsCalculatorOpen(true)} disabled={isLoading || processedReportData.length === 0} className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow transition-colors">
                                <CalculatorIcon className="w-3.5 h-3.5 mr-1.5" /> Calculate Adjustments
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {unsortedReportData.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 animate-in fade-in duration-300">
                    <div onClick={() => setStatusFilter(statusFilter === 'All' ? 'All' : 'All')} className="cursor-pointer transition-transform hover:scale-[1.02]">
                        <FinancialSummaryCard title="Shift Compliance Rate" value={`${metricsSummary.complianceRate}%`} subText={`${metricsSummary.completedShifts} done / ${metricsSummary.plannedShifts} scheduled`} isCurrency={false} icon={Calendar} color={metricsSummary.complianceRate > 90 ? "green" : "amber"} isActive={statusFilter === 'All'} />
                    </div>
                    <div onClick={() => setStatusFilter(statusFilter === 'Late' ? 'All' : 'Late')} className="cursor-pointer transition-transform hover:scale-[1.02]">
                        <FinancialSummaryCard
                            title="Accumulated Lateness"
                            value={`${formatDuration(metricsSummary.totalApprovedLate)} Deducted`}
                            subText={`${formatDuration(metricsSummary.totalSuggestedLate)} suggested | ${metricsSummary.lateCount} flags`}
                            isCurrency={false}
                            icon={Clock}
                            color={metricsSummary.totalApprovedLate > 0 ? "red" : (metricsSummary.totalSuggestedLate > 0 ? "amber" : "blue")}
                            isActive={statusFilter === 'Late'}
                        />
                    </div>
                    <div onClick={() => setStatusFilter(statusFilter === 'Overtime' ? 'All' : 'Overtime')} className="cursor-pointer transition-transform hover:scale-[1.02]">
                        <FinancialSummaryCard
                            title="Accumulated Overtime"
                            value={`${metricsSummary.approvedOtHours} Hours Paid`}
                            subText={`${metricsSummary.suggestedOtHours}h suggested`}
                            isCurrency={false}
                            icon={Clock}
                            color={metricsSummary.approvedOtHours > 0 ? "green" : "blue"}
                            isActive={statusFilter === 'Overtime'}
                        />
                    </div>
                    <div onClick={() => setStatusFilter(statusFilter === 'Absent' ? 'All' : 'Absent')} className="cursor-pointer transition-transform hover:scale-[1.02]">
                        <FinancialSummaryCard title="Absences & Approved Leaves" value={`A: ${metricsSummary.absentCount} | L: ${metricsSummary.leaveCount}`} subText="Loss parameters summary" isCurrency={false} icon={AlertTriangle} color="purple" isActive={statusFilter === 'Absent'} />
                    </div>
                </div>
            )}

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto border border-gray-700">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-300 uppercase cursor-pointer hover:text-white" onClick={() => requestSort('staffName')}>Staff Member{getSortIcon('staffName')}</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-300 uppercase cursor-pointer hover:text-white" onClick={() => requestSort('date')}>Date{getSortIcon('date')}</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-300 uppercase cursor-pointer hover:text-white" onClick={() => requestSort('baseStatus')}>Status{getSortIcon('baseStatus')}</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-300 uppercase">Variances (Flags)</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-300 uppercase">Check-In</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-300 uppercase">Check-Out</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-300 uppercase cursor-pointer hover:bg-gray-600" onClick={() => requestSort('workHours')}>Hours{getSortIcon('workHours')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {isLoading ? (
                            <tr><td colSpan="7" className="px-6 py-10 text-center text-gray-500 italic">Compiling cloud parameters...</td></tr>
                        ) : processedReportData.length > 0 ? (
                            processedReportData.map((row) => (
                                <tr key={row.id} onClick={() => handleRowClick(row)} className="hover:bg-gray-750 cursor-pointer transition duration-150">
                                    <td className="px-6 py-3 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div>
                                                <div className="text-sm font-bold text-white leading-tight">
                                                    {row.staffNickname}
                                                    {activeBranch === 'global' && (() => {
                                                        const staff = staffList.find(s => s.id === row.staffId);
                                                        if (!staff?.branchId) return null;
                                                        const bName = companyConfig?.branches?.find(b => b.id === staff.branchId)?.name || staff.branchId;
                                                        return <span className="ml-2 text-[9px] uppercase tracking-wider font-bold bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">{bName.replace('Da Moreno ', '')}</span>;
                                                    })()}
                                                </div>
                                                <div className="text-[10px] text-gray-400 mt-0.5">{row.staffFullName}</div>
                                                <div className="text-[10px] text-indigo-400 font-bold uppercase">{row.position}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{dateUtils.formatDisplayDate(row.date)}</td>

                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${row.baseStatus === 'Absent' ? 'text-red-500' :
                                        row.baseStatus === 'Off' ? 'text-gray-500 opacity-50' :
                                            row.baseStatus === 'Penalty Late' || row.baseStatus === 'Late' ? 'text-orange-500' :
                                                row.baseStatus === 'Paid OT' || row.baseStatus === 'Adjusted' ? 'text-purple-400' :
                                                    row.baseStatus === 'Leave' ? 'text-blue-400' :
                                                        row.baseStatus === 'Extra Shift' ? 'text-teal-400' :
                                                            'text-green-500'
                                        }`}>
                                        {row.baseStatus}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-xs font-bold">
                                        {row.varianceText ? (
                                            <span className={`px-2 py-1 rounded-md border ${row.varianceText.includes('Paid OT') ? 'bg-purple-900/20 border-purple-500/30 text-purple-400' :
                                                row.varianceText.includes('Deducted') ? 'bg-orange-900/20 border-orange-500/30 text-orange-400' :
                                                    row.varianceText.includes('Sug. OT') ? 'bg-emerald-900/10 border-emerald-500/30 text-emerald-400' :
                                                        row.varianceText.includes('Sug. Late') ? 'bg-yellow-900/10 border-yellow-500/30 text-yellow-400' :
                                                            'text-gray-400'
                                                }`}>
                                                {row.varianceText}
                                            </span>
                                        ) : (
                                            <span className="text-gray-600">-</span>
                                        )}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">{row.checkIn}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">{row.checkOut}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">{row.workMinutes < 0 ? 'N/A' : formatDuration(row.workMinutes)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="7" className="px-6 py-10 text-center text-gray-500 text-sm">No synchronized tracking parameters found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}