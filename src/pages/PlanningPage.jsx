import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../firebase.js" // Adjusted import path
import useWeeklyPlannerData from '../hooks/useWeeklyPlannerData';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, DownloadIcon } from '../components/Icons';
import ShiftModal from '../components/ShiftModal';
import * as dateUtils from '../utils/dateUtils'; // Use new standard

// *** INITIALIZE FUNCTIONS FOR ASIA REGION ***
// const functionsDefault = getFunctions(app, "us-central1");
const functionsAsia = getFunctions(app, "asia-southeast1");
const exportPlanningData = httpsCallable(functionsAsia, 'exportPlanningDataHandler'); // Use correct handler name

// Helper function to get display name
const getDisplayName = (staff) => {
    if (!staff) return 'N/A';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    return staff.fullName || 'Unknown';
};

// Helper function to get current job using standard date utils
const getCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) {
        return { position: 'N/A', department: 'Unassigned' };
    }
    // Ensure sorting is robust using date-fns
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB; // Sort descending (most recent first)
    })[0];
};

export default function PlanningPage({ db, staffList, userRole, departments }) {
    // State for the starting date of the currently viewed week
    const [currentWeekStart, setCurrentWeekStart] = useState(() => {
        // Use standard function
        return dateUtils.startOfWeek(new Date());
    });

    // Custom hook to fetch weekly schedule data
    // Removed staffList dependency as it's not directly used by the hook
    const { weekData, weekDates = [], loading, refetchWeekData } = useWeeklyPlannerData(db, currentWeekStart);

    // State for the shift editing modal
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [selectedShiftInfo, setSelectedShiftInfo] = useState({ staffId: null, date: null, shift: null });

    // State for export loading indicator
    const [isExporting, setIsExporting] = useState(false);

    // Navigation handlers using standard date utils
    const handlePrevWeek = () => {
        setCurrentWeekStart(prevDate => dateUtils.addDays(prevDate, -7));
    };

    const handleNextWeek = () => {
        setCurrentWeekStart(prevDate => dateUtils.addDays(prevDate, 7));
    };

    // Click handler using standard date parsing
    const handleCellClick = (staffId, dateString, shift) => {
        // Use our parser to correctly interpret yyyy-MM-dd as a local date
        const dateObject = dateUtils.parseISODateString(dateString);
        setSelectedShiftInfo({ staffId, date: dateObject, shift }); // Pass Date object
        setIsShiftModalOpen(true);
    };

    // Handler to close the shift modal
    const closeModal = () => {
        setIsShiftModalOpen(false);
        setSelectedShiftInfo({ staffId: null, date: null, shift: null }); // Reset selected info
    };

    // Formatted date range string for display using standard utils
    const weekEnd = dateUtils.addDays(currentWeekStart, 6);
    const weekStartFormatted = dateUtils.formatCustom(currentWeekStart, 'dd MMM');
    const weekEndFormatted = dateUtils.formatCustom(weekEnd, 'dd MMM, yyyy');


    // Filter staff list to only include active members for planning
    const activeStaff = useMemo(() => staffList.filter(s => s.status === 'active' || s.status === undefined || s.status === null), [staffList]);

    // Group active staff by department
    const groupedStaff = useMemo(() => {
        const grouped = activeStaff.reduce((acc, staff) => {
            const department = getCurrentJob(staff).department || 'Unassigned';
            if (!acc[department]) acc[department] = [];
            acc[department].push(staff);
            return acc;
        }, {});
        // Sort staff within each department by display name
        Object.values(grouped).forEach(list => list.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))));
        return grouped;
    }, [activeStaff]);

    // Get sorted department names for rendering sections
    const sortedDepartments = useMemo(() => Object.keys(groupedStaff).sort(), [groupedStaff]);

    // Handler for exporting the current week's schedule
    const handleExportWeek = async () => {
        setIsExporting(true);
        try {
            // exportPlanningData callable defined at top level
            const startDate = dateUtils.formatISODate(currentWeekStart);
            const endDate = dateUtils.formatISODate(weekEnd);

            // Use the correctly initialized callable function
            const result = await exportPlanningData({ startDate, endDate });
            const csvData = result.data.csvData;

            if (!csvData) {
                alert("No planning data found for this week to export.");
                setIsExporting(false); // Reset loading state
                return;
            }

            // Trigger CSV download with BOM for Excel compatibility
            const blob = new Blob([`\uFEFF${csvData}`], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `planning_${startDate}_to_${endDate}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url); // Clean up the blob URL

        } catch (error) {
            console.error("Error exporting planning data:", error);
            alert(`Failed to export planning data: ${error.message}`);
        } finally {
            setIsExporting(false);
        }
    };

    // Main component render
    return (
        <div>
            {isShiftModalOpen && (
                <ShiftModal
                    isOpen={isShiftModalOpen}
                    onClose={closeModal}
                    db={db}
                    staffId={selectedShiftInfo.staffId}
                    staffName={ getDisplayName(staffList.find(s => s.id === selectedShiftInfo.staffId)) || 'Unknown Staff' }
                    date={selectedShiftInfo.date}
                    existingShift={selectedShiftInfo.shift}
                    onSaveSuccess={refetchWeekData}
                />
            )}

            {/* Header section with title and navigation/export buttons */}
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Weekly Planning</h2>
                <div className="flex items-center space-x-4">
                    <button onClick={handlePrevWeek} className="p-2 rounded-md bg-gray-700 hover:bg-gray-600" title="Previous Week">
                        <ChevronLeftIcon className="h-6 w-6" />
                    </button>
                    <span className="text-lg font-semibold text-amber-400 whitespace-nowrap">
                        {weekStartFormatted} - {weekEndFormatted}
                    </span>
                    <button onClick={handleNextWeek} className="p-2 rounded-md bg-gray-700 hover:bg-gray-600" title="Next Week">
                        <ChevronRightIcon className="h-6 w-6" />
                    </button>
                     {/* Export Button */}
                     <button
                        onClick={handleExportWeek}
                        disabled={isExporting || loading} // Disable while loading or exporting
                        className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500"
                        title="Export this week's schedule to CSV"
                    >
                        <DownloadIcon className="h-5 w-5 mr-2" />
                        {isExporting ? 'Exporting...' : 'Export Week'}
                    </button>
                </div>
            </div>

            {/* Loading indicator */}
            {loading && <p className="text-center text-gray-400 my-10">Loading schedule...</p>}

            {/* Schedule Table - Render only when not loading and weekDates are available */}
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
                        {/* Table Body - Grouped by Department */}
                        {sortedDepartments.map(department => (
                             <React.Fragment key={department}>
                                <tbody>{/* Department Header Row */}
                                    {/* Adjust top based on actual header height if needed */}
                                    <tr className="bg-gray-700 sticky top-[calc(theme(space.12)+theme(space.px))] z-10">
                                        <th colSpan={weekDates.length + 1} className="sticky left-0 bg-gray-700 px-4 py-2 text-left text-sm font-semibold text-amber-400 z-20">
                                            {department}
                                        </th>
                                    </tr>
                                </tbody>
                                <tbody className="divide-y divide-gray-700">
                                    {/* Staff Rows within Department */}
                                    {groupedStaff[department].map(staff => (
                                        <tr key={staff.id} className="hover:bg-gray-600 group"> {/* Use group hover for cell bg */}
                                            <td className="sticky left-0 bg-gray-800 group-hover:bg-gray-600 px-4 py-3 whitespace-nowrap text-sm font-medium text-white w-48 z-10 transition-colors">
                                                {getDisplayName(staff)}
                                                <div className="text-xs text-gray-400">{getCurrentJob(staff).position}</div>
                                            </td>
                                            {/* Date Cells for each staff member */}
                                            {weekDates.map(dateObj => {
                                                const shift = weekData[staff.id]?.[dateObj.dateString];
                                                const displayTime = shift ? `${shift.startTime} - ${shift.endTime}` : '';
                                                return (
                                                    <td
                                                        key={dateObj.dateString}
                                                        onClick={() => handleCellClick(staff.id, dateObj.dateString, shift)}
                                                        className="px-3 py-3 text-center text-sm text-white hover:bg-gray-700 cursor-pointer w-32 min-w-[8rem] transition-colors"
                                                        title={shift ? `Click to edit ${getDisplayName(staff)}'s shift` : `Click to add shift for ${getDisplayName(staff)}`}
                                                    >
                                                        {displayTime || <span className="text-gray-600 italic">OFF</span>}
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
            {/* Fallback message if loading finishes but data/dates are missing */}
            {!loading && (!weekDates || weekDates.length === 0) && (
                <p className="text-center text-gray-500 my-10">Could not load schedule data for this week.</p>
            )}
        </div>
    );
}