import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions"; // Added for export
import useWeeklyPlannerData from '../hooks/useWeeklyPlannerData';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, DownloadIcon } from '../components/Icons'; // Added DownloadIcon
import ShiftModal from '../components/ShiftModal';

const getDisplayName = (staff) => {
    if (!staff) return 'N/A';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    return staff.fullName || 'Unknown';
};

const getCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) {
        return { position: 'N/A', department: 'Unassigned' };
    }
    return [...staff.jobHistory].sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0))[0];
};

export default function PlanningPage({ db, staffList, userRole, departments }) {
    const [currentWeekStart, setCurrentWeekStart] = useState(() => {
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ...
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday
        return new Date(today.setDate(diff));
    });

    const { weekData, weekDates, loading, refetchWeekData } = useWeeklyPlannerData(db, currentWeekStart, staffList);
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [selectedShiftInfo, setSelectedShiftInfo] = useState({ staffId: null, date: null, shift: null });
    const [isExporting, setIsExporting] = useState(false); // State for export loading

    const handlePrevWeek = () => {
        setCurrentWeekStart(prevDate => {
            const newDate = new Date(prevDate);
            newDate.setDate(newDate.getDate() - 7);
            return newDate;
        });
    };

    const handleNextWeek = () => {
        setCurrentWeekStart(prevDate => {
            const newDate = new Date(prevDate);
            newDate.setDate(newDate.getDate() + 7);
            return newDate;
        });
    };

    const handleCellClick = (staffId, date, shift) => {
        setSelectedShiftInfo({ staffId, date, shift });
        setIsShiftModalOpen(true);
    };

    const closeModal = () => {
        setIsShiftModalOpen(false);
        setSelectedShiftInfo({ staffId: null, date: null, shift: null });
    };

    const weekStartFormatted = currentWeekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndFormatted = weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    // Filter staff to only include 'active' ones for planning
    const activeStaff = useMemo(() => staffList.filter(s => s.status === 'active' || s.status === undefined || s.status === null), [staffList]);

    // Group active staff by department for display
    const groupedStaff = useMemo(() => {
        const grouped = activeStaff.reduce((acc, staff) => {
            const department = getCurrentJob(staff).department || 'Unassigned';
            if (!acc[department]) acc[department] = [];
            acc[department].push(staff);
            return acc;
        }, {});
        // Sort staff within each department
        Object.values(grouped).forEach(list => list.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))));
        return grouped;
    }, [activeStaff]);

    const sortedDepartments = useMemo(() => Object.keys(groupedStaff).sort(), [groupedStaff]);

    // --- NEW: Handler for exporting the current week ---
    const handleExportWeek = async () => {
        setIsExporting(true);
        try {
            const functions = getFunctions();
            const exportPlanningData = httpsCallable(functions, 'exportPlanningData'); // Assumes function named 'exportPlanningData'

            // Calculate start and end dates in YYYY-MM-DD format
            const startDate = currentWeekStart.toISOString().split('T')[0];
            const endDate = weekEnd.toISOString().split('T')[0];

            const result = await exportPlanningData({ startDate, endDate });
            const csvData = result.data.csvData;

            if (!csvData) {
                alert("No planning data found for this week to export.");
                setIsExporting(false);
                return;
            }

            // Trigger CSV download
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

        } catch (error) {
            console.error("Error exporting planning data:", error);
            alert(`Failed to export planning data: ${error.message}`);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div>
            {isShiftModalOpen && (
                <ShiftModal
                    isOpen={isShiftModalOpen}
                    onClose={closeModal}
                    db={db}
                    staffId={selectedShiftInfo.staffId}
                    staffName={getDisplayName(staffList.find(s => s.id === selectedShiftInfo.staffId))}
                    date={selectedShiftInfo.date}
                    existingShift={selectedShiftInfo.shift}
                    onSaveSuccess={refetchWeekData} // Refetch data when a shift is saved/deleted
                />
            )}

            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Weekly Planning</h2>
                <div className="flex items-center space-x-4">
                    <button onClick={handlePrevWeek} className="p-2 rounded-md bg-gray-700 hover:bg-gray-600">
                        <ChevronLeftIcon className="h-6 w-6" />
                    </button>
                    <span className="text-lg font-semibold text-amber-400 whitespace-nowrap">
                        {weekStartFormatted} - {weekEndFormatted}
                    </span>
                    <button onClick={handleNextWeek} className="p-2 rounded-md bg-gray-700 hover:bg-gray-600">
                        <ChevronRightIcon className="h-6 w-6" />
                    </button>
                    {/* --- NEW: Export Button --- */}
                     <button
                        onClick={handleExportWeek}
                        disabled={isExporting}
                        className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500"
                        title="Export this week's schedule to CSV"
                    >
                        <DownloadIcon className="h-5 w-5 mr-2" />
                        {isExporting ? 'Exporting...' : 'Export Week'}
                    </button>
                </div>
            </div>

            {loading && <p className="text-center text-gray-400 my-10">Loading schedule...</p>}

            {!loading && (
                <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-lg">
                    <table className="min-w-full divide-y divide-gray-700 border-collapse">
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
                        {sortedDepartments.map(department => (
                             <React.Fragment key={department}>
                                <tbody>{/* Separate tbody for department header */}
                                    <tr className="bg-gray-700 sticky top-[calc(theme(space.12)+theme(space.px))] z-10"> {/* Adjust top based on header height */}
                                        <th colSpan={weekDates.length + 1} className="sticky left-0 bg-gray-700 px-4 py-2 text-left text-sm font-semibold text-amber-400 z-20">
                                            {department}
                                        </th>
                                    </tr>
                                </tbody>
                                <tbody className="divide-y divide-gray-700">
                                    {groupedStaff[department].map(staff => (
                                        <tr key={staff.id}>
                                            <td className="sticky left-0 bg-gray-800 group-hover:bg-gray-700 px-4 py-3 whitespace-nowrap text-sm font-medium text-white w-48 z-10">
                                                {getDisplayName(staff)}
                                                <div className="text-xs text-gray-400">{getCurrentJob(staff).position}</div>
                                            </td>
                                            {weekDates.map(dateObj => {
                                                const shift = weekData[staff.id]?.[dateObj.dateString];
                                                const displayTime = shift ? `${shift.startTime} - ${shift.endTime}` : '';
                                                return (
                                                    <td
                                                        key={dateObj.dateString}
                                                        onClick={() => handleCellClick(staff.id, dateObj.dateString, shift)}
                                                        className="px-3 py-3 text-center text-sm text-white hover:bg-gray-700 cursor-pointer w-32 min-w-[8rem]"
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
        </div>
    );
}