import React, { useState, useMemo } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../firebase.js"
import useWeeklyPlannerData from '../hooks/useWeeklyPlannerData';
import { ChevronLeft, ChevronRight, Download, Upload } from 'lucide-react';
import ShiftModal from '../components/Planning/ShiftModal.jsx'; // The new unified modal
import ImportConfirmationModal from '../components/common/ImportConfirmationModal.jsx';
import ExportOptionsModal from '../components/common/ExportOptionsModal.jsx'; 
import * as dateUtils from '../utils/dateUtils'; 
import { calculateAttendanceStatus, getStatusClass } from '../utils/statusUtils';

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

export default function PlanningPage({ db, staffList, userRole }) {
    const [currentWeekStart, setCurrentWeekStart] = useState(() => dateUtils.startOfWeek(new Date()));
    const { weekData, weekDates = [], loading, refetchWeekData } = useWeeklyPlannerData(db, currentWeekStart);
    
    // Simplified Modal State
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [selectedCellData, setSelectedCellData] = useState({ staffId: null, date: null, shift: null, attendance: null });

    // Export/Import State
    const [isExporting, setIsExporting] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importAnalysis, setImportAnalysis] = useState(null);
    const [importCsvContent, setImportCsvContent] = useState(null);

    // Navigation
    const handlePrevWeek = () => setCurrentWeekStart(prevDate => dateUtils.addDays(prevDate, -7));
    const handleNextWeek = () => setCurrentWeekStart(prevDate => dateUtils.addDays(prevDate, 7));

    // --- 🌟 SIMPLIFIED CLICK HANDLER ---
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

    // Helpers
    const weekEnd = dateUtils.addDays(currentWeekStart, 6);
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

    // ... (Import/Export handlers are unchanged, I will omit them for brevity unless you need them pasted again) ...
    // (You can keep your existing handleConfirmExport, handleImportFileSelect, handleImportConfirm functions here)
    // They do not interact with the grid logic.
    const handleConfirmExport = async ({ startDate, endDate, staffIds }) => {
        /* ... keep existing code ... */
        setIsExporting(true);
        try {
            const result = await exportPlanningData({ startDate, endDate, staffIds });
            const csvData = result.data.csvData;
            if (!csvData) { alert("No data found."); setIsExporting(false); return; }
            const blob = new Blob([`\uFEFF${csvData}`], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `planning_${startDate}_to_${endDate}.csv`);
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            setIsExportModalOpen(false);
        } catch (error) { console.error(error); alert(error.message); } finally { setIsExporting(false); }
    };
    const handleImportFileSelect = (e) => { /* ... keep existing logic ... */ 
        const file = e.target.files[0]; if(!file) return; setIsImporting(true);
        const reader = new FileReader();
        reader.onload = async(evt) => {
            setImportCsvContent(evt.target.result);
            try { const res = await importPlanningData({csvData: evt.target.result, confirm: false}); setImportAnalysis(res.data.analysis); }
            catch(err) { alert(err.message); } finally { setIsImporting(false); e.target.value = null;}
        };
        reader.readAsText(file);
    };
    const handleImportConfirm = async () => { /* ... keep existing logic ... */ 
        if(!importCsvContent) return; setIsImporting(true);
        try { await importPlanningData({csvData: importCsvContent, confirm: true}); refetchWeekData(); }
        catch(err) { alert(err.message); } finally { setIsImporting(false); setImportAnalysis(null); setImportCsvContent(null); }
    };
    const handleImportCancel = () => { setImportAnalysis(null); setImportCsvContent(null); };


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
                />
            )}

            {/* Import/Export Modals */}
            {importAnalysis && <ImportConfirmationModal isOpen={!!importAnalysis} onClose={handleImportCancel} onConfirm={handleImportConfirm} analysis={importAnalysis} isConfirming={isImporting} fileName="Planning Import" />}
            <ExportOptionsModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} onConfirm={handleConfirmExport} staffList={activeStaff} defaultStartDate={currentWeekStart} defaultEndDate={weekEnd} isExporting={isExporting} />

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Weekly Planning</h2>
                <div className="flex items-center space-x-4">
                    <button onClick={handlePrevWeek} className="p-2 rounded-md bg-gray-700 hover:bg-gray-600"><ChevronLeft className="h-6 w-6" /></button>
                    <span className="text-lg font-semibold text-amber-400 whitespace-nowrap">{dateUtils.formatCustom(currentWeekStart, 'dd MMM')} - {dateUtils.formatCustom(weekEnd, 'dd MMM, yyyy')}</span>
                    <button onClick={handleNextWeek} className="p-2 rounded-md bg-gray-700 hover:bg-gray-600"><ChevronRight className="h-6 w-6" /></button>
                    
                    <input type="file" id="planning-csv-import" className="hidden" accept=".csv" onChange={handleImportFileSelect} disabled={isImporting} />
                    <label htmlFor="planning-csv-import" className={`flex items-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg cursor-pointer ${isImporting ? 'opacity-50' : ''}`}><Upload className="h-5 w-5 mr-2" /> {isImporting ? '...' : 'Import'}</label>
                    <button onClick={() => setIsExportModalOpen(true)} disabled={isExporting} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"><Download className="h-5 w-5 mr-2" /> {isExporting ? '...' : 'Export'}</button>
                </div>
            </div>

            {loading ? <p className="text-center text-gray-400 my-10">Loading schedule...</p> : (
                <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-lg">
                    <table className="min-w-full divide-y divide-gray-700 border-collapse">
                        <thead className="bg-gray-900 sticky top-0 z-10">
                            <tr>
                                <th className="sticky left-0 bg-gray-900 px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-48 z-20">Staff</th>
                                {weekDates.map(d => (
                                    <th key={d.dateString} className="px-3 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider w-32 min-w-[8rem]">
                                        {d.dayName} <span className="block text-gray-400 font-normal">{d.dateNum}</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        {sortedDepartments.map(department => (
                            <React.Fragment key={department}>
                                <tbody><tr className="bg-gray-700 sticky top-[calc(theme(space.12)+theme(space.px))] z-10"><th colSpan={weekDates.length + 1} className="sticky left-0 bg-gray-700 px-4 py-2 text-left text-sm font-semibold text-amber-400 z-20">{department}</th></tr></tbody>
                                <tbody className="divide-y divide-gray-700">
                                    {groupedStaff[department].map(staff => (
                                        <tr key={staff.id} className="hover:bg-gray-600 group">
                                            <td className="sticky left-0 bg-gray-800 group-hover:bg-gray-600 px-4 py-3 whitespace-nowrap text-sm font-medium text-white w-48 z-10 transition-colors">
                                                {getDisplayName(staff)} <div className="text-xs text-gray-400">{getCurrentJob(staff).position}</div>
                                            </td>
                                            {weekDates.map(dateObj => {
                                                const shiftData = weekData[staff.id]?.[dateObj.dateString];
                                                const shift = shiftData?.schedule;
                                                
                                                // Calculate status just for the color class
                                                const { status } = calculateAttendanceStatus(shift, shiftData?.attendance, shiftData?.leave, dateObj.dateObject);
                                                const statusClass = getStatusClass(status);

                                                // Render Cell Content
                                                let cellContent = null;
                                                if (shift && shift.type === 'work') {
                                                    cellContent = `${shift.startTime} - ${shift.endTime}`;
                                                } else if (shift && shift.type === 'off') {
                                                    cellContent = <span className="text-gray-500 italic">Day Off</span>;
                                                } else if (status === 'Leave') {
                                                    cellContent = <span className="text-blue-400 italic">LEAVE</span>;
                                                } else if (status === 'Absent') {
                                                    // Only show Absent if there WAS a shift
                                                    cellContent = <span className="text-red-400 font-bold">Absent</span>;
                                                }

                                                return (
                                                    <td
                                                        key={dateObj.dateString}
                                                        onClick={() => handleCellClick(staff, dateObj, shiftData)}
                                                        className={`px-3 py-3 text-center text-sm transition-colors cursor-pointer w-32 min-w-[8rem] ${statusClass || 'text-white hover:bg-gray-700'}`}
                                                    >
                                                        {cellContent}
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
        </div>
    );
}