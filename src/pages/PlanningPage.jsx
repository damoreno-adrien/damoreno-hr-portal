/* src/pages/PlanningPage.jsx */

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../firebase.js"
import useWeeklyPlannerData from '../hooks/useWeeklyPlannerData';
// 1. IMPORT NEW ICONS
import { 
    ChevronLeft, ChevronRight, Download, Upload, 
    CheckCircle, Clock, Coffee, Check, Flame // Added Flame for OT
} from 'lucide-react';
import ShiftModal from '../components/Planning/ShiftModal.jsx'; 
import ImportConfirmationModal from '../components/common/ImportConfirmationModal.jsx';
import ExportOptionsModal from '../components/common/ExportOptionsModal.jsx'; 
import * as dateUtils from '../utils/dateUtils'; 
import { calculateAttendanceStatus, getStatusClass } from '../utils/statusUtils';
import Modal from '../components/common/Modal.jsx';
import EditAttendanceModal from '../components/Attendance/EditAttendanceModal.jsx';

const functionsAsia = getFunctions(app, "asia-southeast1");
const exportPlanningData = httpsCallable(functionsAsia, 'exportPlanningData');
const importPlanningData = httpsCallable(functionsAsia, 'importPlanningData');

const getDisplayName = (staff) => {
    if (!staff) return 'N/A';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    return staff.fullName || 'Unknown';
};

const getCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || !staff.jobHistory.length === 0) {
        return { position: 'N/A', department: 'Unassigned' };
    }
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB;
    })[0];
};

export default function PlanningPage({ db, staffList, userRole, departments }) {
    const [currentWeekStart, setCurrentWeekStart] = useState(() => {
        return dateUtils.startOfWeek(new Date());
    });
    const { weekData, weekDates = [], loading, refetchWeekData } = useWeeklyPlannerData(db, currentWeekStart);
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [selectedCellData, setSelectedCellData] = useState({ staffId: null, date: null, shift: null, attendance: null });
    
    // Attendance Editing State
    const [isEditAttendanceModalOpen, setIsEditAttendanceModalOpen] = useState(false);
    const [attendanceRecordToEdit, setAttendanceRecordToEdit] = useState(null);

    const [isExporting, setIsExporting] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importAnalysis, setImportAnalysis] = useState(null);
    const [importCsvContent, setImportCsvContent] = useState(null);
    const [importError, setImportError] = useState(null);

    const handlePrevWeek = () => {
        setCurrentWeekStart(prevDate => dateUtils.addDays(prevDate, -7));
    };

    const handleNextWeek = () => {
        setCurrentWeekStart(prevDate => dateUtils.addDays(prevDate, 7));
    };

    // --- CLICK HANDLER ---
    const handleCellClick = (staff, dateObj, shiftData) => {
        // Open the unified Manager Modal for EVERY interaction
        setSelectedCellData({
            staffId: staff.id,
            date: dateObj.dateObject,
            shift: shiftData?.schedule || null,
            attendance: shiftData?.attendance || null // Pass attendance so we know if we need to warn about deleting it
        });
        setIsShiftModalOpen(true);
    };

    // --- ATTENDANCE EDITING HANDLERS (RESTORED) ---
    const handleOpenAttendanceEditor = (data) => {
        const { staffId, staffName, date, rawAttendance } = data;
        const dateString = dateUtils.formatISODate(date);

        const recordForModal = {
            id: rawAttendance?.id || `${staffId}_${dateString}`,
            staffName: staffName,
            date: dateString,
            staffId: staffId,
            fullRecord: rawAttendance ? {
                ...rawAttendance,
                checkInTime: rawAttendance.checkInTime?.toDate ? rawAttendance.checkInTime.toDate() : rawAttendance.checkInTime,
                checkOutTime: rawAttendance.checkOutTime?.toDate ? rawAttendance.checkOutTime.toDate() : rawAttendance.checkOutTime,
                breakStart: rawAttendance.breakStart?.toDate ? rawAttendance.breakStart.toDate() : rawAttendance.breakStart,
                breakEnd: rawAttendance.breakEnd?.toDate ? rawAttendance.breakEnd.toDate() : rawAttendance.breakEnd,
            } : null 
        };
        
        setAttendanceRecordToEdit(recordForModal);
        setIsEditAttendanceModalOpen(true); 
    };

    const handleCloseAttendanceEditor = () => {
        setIsEditAttendanceModalOpen(false);
        setAttendanceRecordToEdit(null);
        refetchWeekData(); 
    };

    // --- Wrapper Handler for ShiftModal ---
    const handleEditAttendanceFromModal = () => {
        // 1. Close the shift modal (editor)
        setIsShiftModalOpen(false);
        
        // 2. Open the attendance editor with the correct data
        if (selectedCellData && selectedCellData.staffId && selectedCellData.date) {
             handleOpenAttendanceEditor({
                staffId: selectedCellData.staffId,
                staffName: getDisplayName(staffList.find(s => s.id === selectedCellData.staffId)),
                date: selectedCellData.date,
                rawAttendance: selectedCellData.attendance
            });
        }
    };

    const weekEnd = dateUtils.addDays(currentWeekStart, 6);
    const weekStartFormatted = dateUtils.formatCustom(currentWeekStart, 'dd MMM');
    const weekEndFormatted = dateUtils.formatCustom(weekEnd, 'dd MMM, yyyy');

    const activeStaff = useMemo(() => staffList.filter(s => s.status === 'active' || s.status === undefined || s.status === null), [staffList]);

    const groupedStaff = useMemo(() => {
        const grouped = activeStaff.reduce((acc, staff) => {
            const department = getCurrentJob(staff).department || 'Unassigned';
            if (!acc[department]) acc[department] = [];
            acc[department].push(staff);
            return acc;
        }, {});
        Object.values(grouped).forEach(list => list.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))));
        return grouped;
    }, [activeStaff]);

    const sortedDepartments = useMemo(() => Object.keys(groupedStaff).sort(), [groupedStaff]);

    const handleConfirmExport = async ({ startDate, endDate, staffIds }) => {
        setIsExporting(true);
        try {
            const result = await exportPlanningData({ startDate, endDate, staffIds });
            const csvData = result.data.csvData;

            if (!csvData) {
                alert("No planning data found for the selected options.");
                setIsExporting(false);
                return;
            }

            const blob = new Blob([`\uFEFF${csvData}`], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `planning_${startDate}_to_${endDate}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setIsExportModalOpen(false);
        } catch (error) {
            console.error("Error exporting planning data:", error);
            alert(`Failed to export planning data: ${error.message}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportFileSelect = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setImportError(null);
        setIsImporting(true);

        const reader = new FileReader();
        reader.onload = async (e) => {
            const csvContent = e.target.result;
            setImportCsvContent(csvContent);
            try {
                const result = await importPlanningData({ csvData: csvContent, confirm: false });
                if (result.data.analysis) {
                    setImportAnalysis(result.data.analysis);
                } else {
                    throw new Error("Invalid analysis response from server.");
                }
            } catch (error) {
                console.error("Error during planning import analysis:", error);
                setImportError(`Analysis Failed: ${error.message}`);
                setImportAnalysis(null);
            } finally {
                setIsImporting(false);
                event.target.value = null;
            }
        };
        reader.onerror = () => {
            console.error("Error reading file");
            setImportError("Error reading file.");
            setIsImporting(false);
        };
        reader.readAsText(file);
    };

    const handleImportConfirm = async () => {
        if (!importCsvContent) return;

        setIsImporting(true);
        setImportError(null);
        try {
            const result = await importPlanningData({ csvData: importCsvContent, confirm: true });

            if (result.data.errors && result.data.errors.length > 0) {
                alert(`Import completed with errors:\n- ${result.data.errors.join('\n- ')}`);
            } else {
                alert(result.data.result || "Planning import completed successfully!");
            }

            refetchWeekData(); 

        } catch (error) {
            console.error("Error confirming planning import:", error);
            alert(`Import Failed: ${error.message}`);
        } finally {
            setIsImporting(false);
            setImportAnalysis(null);
            setImportCsvContent(null);
        }
    };

    const handleImportCancel = () => {
        setImportAnalysis(null);
        setImportCsvContent(null);
        setImportError(null);
    };
    

    return (
        <div>
            {isShiftModalOpen && (
                <ShiftModal
                    isOpen={isShiftModalOpen}
                    onClose={() => setIsShiftModalOpen(false)}
                    db={db}
                    staffId={selectedCellData.staffId}
                    staffName={getDisplayName(staffList.find(s => s.id === selectedCellData.staffId))}
                    date={selectedCellData.date}
                    existingShift={selectedCellData.shift}
                    existingAttendance={selectedCellData.attendance}
                    onSaveSuccess={refetchWeekData}
                    onEditAttendance={handleEditAttendanceFromModal}
                />
            )}

            {isEditAttendanceModalOpen && (
                <Modal
                    isOpen={isEditAttendanceModalOpen}
                    onClose={handleCloseAttendanceEditor}
                    title="Edit Attendance Record"
                >
                    <EditAttendanceModal
                        db={db}
                        record={attendanceRecordToEdit}
                        onClose={handleCloseAttendanceEditor}
                    />
                </Modal>
            )}

            {importAnalysis && (
                <ImportConfirmationModal
                    isOpen={!!importAnalysis}
                    onClose={handleImportCancel}
                    onConfirm={handleImportConfirm}
                    analysis={importAnalysis}
                    isConfirming={isImporting}
                    fileName="Planning Import"
                />
            )}
            
            <ExportOptionsModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onConfirm={handleConfirmExport}
                staffList={activeStaff}
                defaultStartDate={currentWeekStart}
                defaultEndDate={weekEnd}
                isExporting={isExporting}
            />


            {/* Header section */}
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Weekly Planning</h2>
                <div className="flex items-center space-x-4">
                    <button onClick={handlePrevWeek} className="p-2 rounded-md bg-gray-700 hover:bg-gray-600" title="Previous Week">
                        <ChevronLeft className="h-6 w-6" />
                    </button>
                    <span className="text-lg font-semibold text-amber-400 whitespace-nowrap">
                        {weekStartFormatted} - {weekEndFormatted}
                    </span>
                    <button onClick={handleNextWeek} className="p-2 rounded-md bg-gray-700 hover:bg-gray-600" title="Next Week">
                        <ChevronRight className="h-6 w-6" />
                    </button>

                    <input
                        type="file"
                        id="planning-csv-import"
                        className="hidden"
                        accept=".csv"
                        onChange={handleImportFileSelect}
                        disabled={isImporting}
                    />
                    <label
                        htmlFor="planning-csv-import"
                        className={`flex items-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 cursor-pointer ${isImporting ? 'bg-gray-500 cursor-not-allowed' : ''}`}
                        title="Import a planning schedule from CSV"
                    >
                        <Upload className="h-5 w-5 mr-2" />
                        {isImporting ? 'Analyzing...' : 'Import'}
                    </label>

                    <button
                        onClick={() => setIsExportModalOpen(true)}
                        disabled={isExporting || loading || isImporting}
                        className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500"
                        title="Export schedule data..."
                    >
                        <Download className="h-5 w-5 mr-2" />
                        {isExporting ? 'Exporting...' : 'Export'}
                    </button>
                </div>
            </div>

            {/* Loading indicator */}
            {loading && <p className="text-center text-gray-400 my-10">Loading schedule...</p>}

            {/* Schedule Table */}
            {!loading && weekDates && weekDates.length > 0 && (
                <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-lg">
                    <table className="min-w-full divide-y divide-gray-700 border-collapse">
                        {/* Table Header */}
                        <thead className="bg-gray-900 sticky top-0 z-10">
                            <tr>
                                <th className="sticky left-0 bg-gray-900 px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-48 z-20">Staff</th>
                                {weekDates.map(dateObj => (
                                    <th key={dateObj.dateString} className="px-3 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider w-32 min-w-[8rem]">
                                        {dateObj.dayName} <span className="block text-gray-400 font-normal">{dateObj.dateNum}</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        {/* Table Body */}
                        {sortedDepartments.map(department => (
                            <React.Fragment key={department}>
                                <tbody>
                                    <tr className="bg-gray-700 sticky top-[calc(theme(space.12)+theme(space.px))] z-10">
                                        <th colSpan={weekDates.length + 1} className="sticky left-0 bg-gray-700 px-4 py-2 text-left text-sm font-semibold text-amber-400 z-20">
                                            {department}
                                        </th>
                                    </tr>
                                </tbody>
                                <tbody className="divide-y divide-gray-700">
                                    {groupedStaff[department].map(staff => (
                                        <tr key={staff.id} className="hover:bg-gray-600 group">
                                            <td className="sticky left-0 bg-gray-800 group-hover:bg-gray-600 px-4 py-3 whitespace-nowrap text-sm font-medium text-white w-48 z-10 transition-colors">
                                                {getDisplayName(staff)}
                                                <div className="text-xs text-gray-400">{getCurrentJob(staff).position}</div>
                                            </td>
                                            {weekDates.map(dateObj => {
                                                const shiftData = weekData[staff.id]?.[dateObj.dateString];
                                                const shift = shiftData?.schedule;
                
                                                // Get all info from our upgraded util function
                                                const { 
                                                    status, 
                                                    isLate, 
                                                    otMinutes,
                                                    checkInTime, // Actual attendance check-in
                                                    checkOutTime // Actual attendance check-out
                                                } = calculateAttendanceStatus(
                                                    shift, 
                                                    shiftData?.attendance, 
                                                    shiftData?.leave, 
                                                    dateObj.dateObject
                                                );
                                                
                                                const statusClass = getStatusClass(status);

                                                // --- REWRITTEN CELL CONTENT LOGIC ---
                                                let cellContent = null;
                                                const baseTextClass = "flex items-center justify-center gap-1.5 text-xs";
                                                
                                                // Determine what time to show. Prioritize attendance time.
                                                let timeToShow = '';
                                                if (status === 'Present' || status === 'Late' || status === 'On Break' || status === 'Completed') {
                                                    // Use ATTENDANCE time
                                                    const start = checkInTime ? dateUtils.formatCustom(checkInTime, 'HH:mm') : '...';
                                                    const end = checkOutTime ? dateUtils.formatCustom(checkOutTime, 'HH:mm') : '...';
                                                    timeToShow = `${start} - ${end}`;
                                                } else if (shift && shift.type === 'work') {
                                                    // Use SCHEDULE time
                                                    timeToShow = `${shift.startTime} - ${shift.endTime}`;
                                                }
                                                // ------------------------------------

                                                switch (status) {
                                                    case 'Present':
                                                        cellContent = (<div className={`${baseTextClass} text-green-300`}><CheckCircle className="w-3 h-3" /><span>{timeToShow}</span></div>);
                                                        break;
                                                    case 'Late':
                                                        cellContent = (<div className={`${baseTextClass} text-yellow-300`}><Clock className="w-3 h-3" /><span className="font-semibold">(Late)</span><span>{timeToShow}</span></div>);
                                                        break;
                                                    case 'On Break':
                                                         cellContent = (<div className={`${baseTextClass} text-orange-300`}><Coffee className="w-3 h-3" /><span className="font-semibold">(Break)</span><span>{timeToShow}</span></div>);
                                                        break;
                                                    case 'Completed':
                                                        cellContent = (<div className={`${baseTextClass} text-gray-400`}><Check className="w-3 h-3" /><span className="italic">(Done)</span><span>{timeToShow}</span></div>);
                                                        break;
                                                    case 'Absent':
                                                        cellContent = (
                                                            <>
                                                                <span className="text-red-400 font-bold">Absent</span>
                                                                {timeToShow && <span className="text-xs text-gray-500 block">{timeToShow}</span>}
                                                            </>
                                                        );
                                                        break;
                                                    case 'Leave':
                                                        cellContent = <span className="text-blue-400 italic">LEAVE</span>;
                                                        break;
                                                    case 'Off':
                                                        cellContent = <span className="text-gray-500 italic">Day Off</span>;
                                                        break;
                                                    default: // 'Empty'
                                                        if (shift && shift.type === 'work') {
                                                            // Future scheduled shift
                                                            cellContent = <span className="text-white">{timeToShow}</span>;
                                                        }
                                                        break;
                                                }

                                                return (
                                                    <td
                                                        key={dateObj.dateString}
                                                        onClick={() => handleCellClick(staff, dateObj, shiftData)}
                                                        className={`px-3 py-3 text-center text-sm transition-colors cursor-pointer w-32 min-w-[8rem] ${statusClass}`}
                                                        title={shift ? `Click to view/edit` : `Click to add shift`}
                                                    >
                                                        {cellContent}
                                                        
                                                        {/* NEW: OT BADGE */}
                                                        {otMinutes > 0 && (
                                                            <div className="text-xs font-bold text-orange-400 flex items-center justify-center gap-1 mt-1" title="Overtime">
                                                                <Flame className="w-3 h-3" />
                                                                <span>+{Math.floor(otMinutes / 60)}h {otMinutes % 60}m</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </React.Fragment>
                        ))}
                    </table>
                </div>
            )}
            {!loading && (!weekDates || weekDates.length === 0) && (
                <p className="text-center text-gray-500 my-10">Could not load schedule data for this week.</p>
            )}
        </div>
    );
}