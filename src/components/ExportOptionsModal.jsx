// src/components/ExportOptionsModal.jsx
import React, { useState, useMemo, useEffect } from 'react';
import Modal from './Modal';
import { DownloadIcon, XIcon } from './Icons'; // Assuming you have an XIcon for closing
import * as dateUtils from '../utils/dateUtils'; // Use your standard date utils

// Helper to get display name (copied from PlanningPage)
const getDisplayName = (staff) => {
    if (!staff) return 'N/A';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    return staff.fullName || 'Unknown';
};

export default function ExportOptionsModal({
    isOpen,
    onClose,
    onConfirm,
    staffList = [], // Pass in the active staff list
    defaultStartDate,
    defaultEndDate,
    isExporting
}) {
    // State for the form inputs
    const [startDate, setStartDate] = useState(defaultStartDate);
    const [endDate, setEndDate] = useState(defaultEndDate);
    const [selectedStaffIds, setSelectedStaffIds] = useState([]);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setStartDate(defaultStartDate);
            setEndDate(defaultEndDate);
            // Default to all staff selected
            selectAllStaff();
        }
    }, [isOpen, defaultStartDate, defaultEndDate, staffList]);

    const handleSelectAll = () => {
        if (selectedStaffIds.length === staffList.length) {
            setSelectedStaffIds([]); // Deselect all
        } else {
            selectAllStaff(); // Select all
        }
    };

    const selectAllStaff = () => {
        setSelectedStaffIds(staffList.map(s => s.id));
    };

    const handleStaffCheckboxChange = (staffId) => {
        setSelectedStaffIds(prev =>
            prev.includes(staffId)
                ? prev.filter(id => id !== staffId)
                : [...prev, staffId]
        );
    };

    const handleSubmit = () => {
        // Format dates to 'yyyy-MM-dd' for the function
        const formattedStartDate = dateUtils.formatISODate(startDate);
        const formattedEndDate = dateUtils.formatISODate(endDate);

        onConfirm({
            startDate: formattedStartDate,
            endDate: formattedEndDate,
            staffIds: selectedStaffIds
        });
    };

    // Memoize sorted staff list for performance
    const sortedStaffList = useMemo(() => {
        return [...staffList].sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
    }, [staffList]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Export Planning Options">
            <div className="space-y-6">
                
                {/* Date Range Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="export-start-date" className="block text-sm font-medium text-gray-300 mb-1">
                            Start Date
                        </label>
                        <input
                            type="date"
                            id="export-start-date"
                            value={dateUtils.formatISODate(startDate)} // Format for input
                            onChange={(e) => setStartDate(dateUtils.parseISODateString(e.target.value))}
                            className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border-gray-600 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="export-end-date" className="block text-sm font-medium text-gray-300 mb-1">
                            End Date
                        </label>
                        <input
                            type="date"
                            id="export-end-date"
                            value={dateUtils.formatISODate(endDate)} // Format for input
                            onChange={(e) => setEndDate(dateUtils.parseISODateString(e.target.value))}
                            className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border-gray-600 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                </div>

                {/* Staff Selection */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-300">
                            Select Staff ({selectedStaffIds.length} / {staffList.length})
                        </label>
                        <button
                            onClick={handleSelectAll}
                            className="text-sm font-medium text-blue-400 hover:text-blue-300"
                        >
                            {selectedStaffIds.length === staffList.length ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto bg-gray-900 rounded-lg p-3 border border-gray-700 space-y-2">
                        {sortedStaffList.map(staff => (
                            <label key={staff.id} className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded bg-gray-600 border-gray-500 text-blue-500 focus:ring-blue-600"
                                    checked={selectedStaffIds.includes(staff.id)}
                                    onChange={() => handleStaffCheckboxChange(staff.id)}
                                />
                                <span className="text-gray-200">{getDisplayName(staff)}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-4 pt-6 border-t border-gray-700">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isExporting}
                        className="mt-3 sm:mt-0 w-full sm:w-auto px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isExporting || selectedStaffIds.length === 0}
                        className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-500"
                    >
                        {isExporting ? 'Exporting...' : (
                            <>
                                <DownloadIcon className="inline-block h-5 w-5 mr-2" />
                                Export
                            </>
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
}