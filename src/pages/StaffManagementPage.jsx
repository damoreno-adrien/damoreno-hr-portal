import React, { useState, useEffect, useMemo, useRef } from 'react'; // Added useRef
import { getFunctions, httpsCallable } from "firebase/functions";
import Modal from '../components/Modal';
import AddStaffForm from '../components/AddStaffForm';
import StaffProfileModal from '../components/StaffProfileModal';
import { PlusIcon, DownloadIcon, UploadIcon } from '../components/Icons';
import * as dateUtils from '../utils/dateUtils'; // Use new standard

const StatusBadge = ({ status }) => {
    // Determine status text and classes
    let statusText = 'Active';
    let statusClasses = "bg-green-500/20 text-green-300";

    if (status === 'inactive') {
        statusText = 'Inactive';
        statusClasses = "bg-red-500/20 text-red-300";
    } else if (status === null || status === undefined) {
        // Explicitly handle null/undefined as Active (or based on future logic)
        statusText = 'Active';
        statusClasses = "bg-green-500/20 text-green-300";
    } else if (status !== 'active') {
         // Fallback for unexpected status values
         statusText = status; // Display the raw status if unknown
         statusClasses = "bg-gray-500/20 text-gray-300";
    }

    return (
        <span className={`px-3 py-1 inline-flex text-xs font-semibold rounded-full capitalize ${statusClasses}`}>
            {statusText}
        </span>
    );
};


export default function StaffManagementPage({ auth, db, staffList, departments, userRole }) {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [showArchived, setShowArchived] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // --- State for Import ---
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState(null); // { message: string, errors: string[], password?: string }
    const fileInputRef = useRef(null); // Ref for hidden file input

    const handleViewStaff = (staff) => setSelectedStaff(staff);
    const closeProfileModal = () => setSelectedStaff(null);

    const getDisplayName = (staff) => {
        if (staff.nickname) return staff.nickname;
        if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
        return staff.fullName || 'Unknown'; // Added fallback
    };

    const getCurrentJob = (staff) => {
        if (staff.jobHistory && staff.jobHistory.length > 0) {
            // Ensure sorting is robust even if startDate is missing briefly
            return [...staff.jobHistory].sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0))[0];
        }
        return { position: 'N/A', department: 'Unassigned' };
    };

    const groupedStaff = useMemo(() => {
        const filteredList = staffList.filter(staff => {
            if (showArchived) return true;
             // Rely on explicit 'active' status or handle undefined/null as active
            return staff.status === 'active' || staff.status === undefined || staff.status === null;
        });

        const grouped = filteredList.reduce((acc, staff) => {
            const department = getCurrentJob(staff).department || 'Unassigned';
            if (!acc[department]) {
                acc[department] = [];
            }
            acc[department].push(staff);
            return acc;
        }, {});

        // Sort staff within each department
        Object.keys(grouped).forEach(dept => {
            grouped[dept].sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
        });

        // Add departments that only contain archived staff if showArchived is true
        if (showArchived) {
            staffList.forEach(staff => {
                if (staff.status === 'inactive') {
                    const department = getCurrentJob(staff).department || 'Unassigned';
                    if (!grouped[department]) {
                        grouped[department] = [staff]; // Initialize with the archived staff
                    } else if (!grouped[department].some(s => s.id === staff.id)) {
                        grouped[department].push(staff); // Add if not already present
                        grouped[department].sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
                    }
                }
            });
        }

        return grouped;
    }, [staffList, showArchived]);

    const sortedDepartments = useMemo(() => Object.keys(groupedStaff).sort(), [groupedStaff]);

    useEffect(() => {
        // Update selected staff details if the main list changes while modal is open
        if (selectedStaff) {
            const updatedStaff = staffList.find(staff => staff.id === selectedStaff.id);
            setSelectedStaff(updatedStaff || null); // Close modal if staff no longer exists
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [staffList]); // Rerun only when staffList changes


    const handleExport = async () => {
        setIsExporting(true);
        try {
            const functions = getFunctions();
            const exportStaffData = httpsCallable(functions, 'exportStaffData');
            const result = await exportStaffData();
            const csvData = result.data.csvData;

            if (!csvData) {
                alert("No staff data to export.");
                setIsExporting(false); // Reset state even if no data
                return;
            }

            const blob = new Blob([`\uFEFF${csvData}`], { type: 'text/csv;charset=utf-8;' }); // Add BOM for Excel UTF-8 compatibility
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            const today = dateUtils.formatISODate(new Date()); // Use dateUtils
            link.setAttribute("download", `staff_export_${today}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url); // Clean up blob URL

        } catch (error) {
            console.error("Error exporting data:", error);
            alert("Failed to export staff data. Please try again.");
        } finally {
            setIsExporting(false);
        }
    };

    // --- Handlers for Import ---
    const handleImportClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileSelected = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Reset file input value immediately
        event.target.value = '';

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

            setIsImporting(true);
            setImportResult(null);
            try {
                const functions = getFunctions();
                const importStaffData = httpsCallable(functions, 'importStaffData');
                const result = await importStaffData({ csvData });
                setImportResult({
                    message: result.data.result,
                    errors: result.data.errors || [],
                    password: result.data.defaultPassword || null
                });
                // Note: staffList should ideally update via its hook, no manual refresh needed here
            } catch (error) {
                console.error("Error importing data:", error);
                setImportResult({
                    message: `Import failed: ${error.message}`,
                    errors: [error.details || "An unknown error occurred."]
                });
            } finally {
                setIsImporting(false);
            }
        };
        reader.onerror = () => {
            alert("Error reading file.");
            setIsImporting(false); // Ensure loading state is reset on read error
        };
        reader.readAsText(file);
    };
    // --- END: Import Handlers ---


    return (
        <div>
            {/* Add Staff Modal */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Invite New Staff Member">
                <AddStaffForm auth={auth} onClose={() => setIsAddModalOpen(false)} departments={departments} />
            </Modal>

            {/* Staff Profile Modal */}
            {selectedStaff && (
                 <Modal isOpen={true} onClose={closeProfileModal} title={`${getDisplayName(selectedStaff)}'s Profile`}>
                    <StaffProfileModal staff={selectedStaff} db={db} onClose={closeProfileModal} departments={departments} userRole={userRole} />
                </Modal>
            )}

            {/* Header and Action Buttons */}
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Staff Management</h2>
                <div className="flex flex-wrap items-center gap-4 justify-start md:justify-end"> {/* Control alignment */}
                    <div className="flex items-center">
                        <input
                            id="showArchived"
                            type="checkbox"
                            checked={showArchived}
                            onChange={(e) => setShowArchived(e.target.checked)}
                            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-amber-600 focus:ring-amber-500"
                        />
                        <label htmlFor="showArchived" className="ml-2 text-sm text-gray-300">Show Archived</label>
                    </div>
                    {/* Export Button */}
                    <button onClick={handleExport} disabled={isExporting || isImporting} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500">
                        <DownloadIcon className="h-5 w-5 mr-2" />
                        {isExporting ? 'Exporting...' : 'Export CSV'}
                    </button>
                    {/* Import Button */}
                    <button onClick={handleImportClick} disabled={isImporting || isExporting} className="flex items-center bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500">
                        <UploadIcon className="h-5 w-5 mr-2" />
                        {isImporting ? 'Importing...' : 'Import CSV'}
                    </button>
                    {/* Invite Button */}
                    <button onClick={() => setIsAddModalOpen(true)} disabled={isImporting || isExporting} className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500">
                        <PlusIcon className="h-5 w-5 mr-2" />
                        Invite Staff
                    </button>
                    {/* Hidden File Input */}
                     <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelected}
                        accept=".csv, text/csv" // Be more specific with accept types
                        style={{ display: 'none' }}
                    />
                </div>
            </div>

             {/* Import Results Display */}
             {importResult && (
                <div className={`p-4 rounded-lg mb-6 ${importResult.errors?.length > 0 ? 'bg-red-900/30 border border-red-700' : 'bg-green-900/30 border border-green-700'}`}>
                    <p className={`font-semibold ${importResult.errors?.length > 0 ? 'text-red-300' : 'text-green-300'}`}>
                        Import Result: {importResult.message}
                    </p>
                    {importResult.password && (
                        <p className="text-sm text-amber-300 mt-2">
                            New staff created with temporary password: <span className="font-bold">{importResult.password}</span> (Manager must reset this).
                        </p>
                    )}
                    {importResult.errors?.length > 0 && (
                        <div className="mt-3">
                            <p className="text-sm font-semibold text-red-300 mb-1">Errors encountered:</p>
                            <ul className="list-disc list-inside text-sm text-red-400 space-y-1 max-h-40 overflow-y-auto">
                                {importResult.errors.map((err, index) => <li key={index}>{err}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
             )}

            {/* Staff List Table */}
            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Display Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Position</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Start Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    {sortedDepartments.length === 0 && (
                         <tbody>
                            <tr>
                                <td colSpan="4" className="text-center py-10 text-gray-500">No staff members found matching the current filter.</td>
                            </tr>
                         </tbody>
                    )}
                    {sortedDepartments.map(department => (
                        <React.Fragment key={department}>
                            <tbody className="divide-y divide-gray-700">
                                <tr className="bg-gray-900 sticky top-0 z-10"> {/* Make header sticky */}
                                    <th colSpan="4" className="px-6 py-2 text-left text-sm font-semibold text-amber-400">
                                        {department} ({groupedStaff[department].length}) {/* Show count */}
                                    </th>
                                </tr>
                                {groupedStaff[department].map(staff => (
                                    <tr key={staff.id} onClick={() => handleViewStaff(staff)} className="hover:bg-gray-700 cursor-pointer">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{getDisplayName(staff)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{getCurrentJob(staff).position}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{dateUtils.formatDisplayDate(staff.startDate)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <StatusBadge status={staff.status} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </React.Fragment>
                    ))}
                </table>
            </div>
        </div>
    );
};