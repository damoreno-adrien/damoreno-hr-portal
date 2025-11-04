// src/pages/StaffManagementPage.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import Modal from '../components/common/Modal';
import AddStaffForm from '../components/StaffProfile/AddStaffForm';
import StaffProfileModal from '../components/StaffProfile/StaffProfileModal';
import ImportConfirmationModal from '../components/common/ImportConfirmationModal';
import { Plus, Download, Upload } from 'lucide-react'; // Replaced custom icons
// import * as dateUtils from '../utils/dateUtils';
import { 
    fromFirestore, 
    differenceInCalendarMonths, 
    formatISODate, 
    formatDisplayDate 
} from '../utils/dateUtils';
import { app } from "../../firebase.js";

// --- NEW: Currency Formatter ---
const formatCurrency = (num) => {
    if (typeof num !== 'number') {
        num = 0;
    }
    return new Intl.NumberFormat('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    }).format(num);
};

// --- NEW: Seniority Calculator ---
const getSeniority = (startDateInput) => {
    const startDate = fromFirestore(startDateInput);
    if (!startDate) return 'Invalid date';

    const today = new Date();
    // Use differenceInCalendarMonths for a more intuitive "X years, Y months"
    const totalMonths = differenceInCalendarMonths(today, startDate);

    if (totalMonths < 0) return 'Starts in future';
    if (totalMonths === 0) return 'New this month';

    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;

    let parts = [];
    if (years > 0) parts.push(`${years} year${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);
    
    return parts.length > 0 ? parts.join(', ') : 'Less than a month';
};

// StatusBadge component
const StatusBadge = ({ status }) => {
    let statusText = 'Active';
    let statusClasses = "bg-green-500/20 text-green-300";

    if (status === 'inactive') {
        statusText = 'Inactive';
        statusClasses = "bg-red-500/20 text-red-300";
    } else if (status === null || status === undefined) {
        statusText = 'Active';
        statusClasses = "bg-green-500/20 text-green-300";
    } else if (status !== 'active') {
         statusText = status;
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
    const [isImporting, setIsImporting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isConfirmingImport, setIsConfirmingImport] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [csvDataToConfirm, setCsvDataToConfirm] = useState(null);
    const fileInputRef = useRef(null);

    const handleViewStaff = (staff) => setSelectedStaff(staff);
    const closeProfileModal = () => setSelectedStaff(null);

    const getDisplayName = (staff) => {
        if (!staff) return 'Unknown';
        if (staff.nickname) return staff.nickname;
        if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
        return staff.fullName || 'Unknown';
    };

    const getCurrentJob = (staff) => {
        if (!staff?.jobHistory || staff.jobHistory.length === 0) {
            return { position: 'N/A', department: 'Unassigned', rate: 0 }; // --- Added rate
        }
        return [...staff.jobHistory].sort((a, b) => {
             const timeA = a.startDate?.seconds ? a.startDate.toMillis() : 0;
             const timeB = b.startDate?.seconds ? b.startDate.toMillis() : 0;
             return timeB - timeA;
        })[0] || { position: 'N/A', department: 'Unassigned', rate: 0 }; // --- Added rate
    };


    const groupedStaff = useMemo(() => {
        const normalizedQuery = searchQuery.toLowerCase().trim();

        const filteredList = staffList.filter(staff => {
            const isArchived = staff.status === 'inactive';
            // This filter correctly handles the "Show Archived" toggle
            if (!showArchived && isArchived) {
                return false;
            }
            if (normalizedQuery) {
                const name = getDisplayName(staff).toLowerCase();
                const nickname = (staff.nickname || '').toLowerCase();
                const position = getCurrentJob(staff).position.toLowerCase();
                if (
                    !name.includes(normalizedQuery) &&
                    !nickname.includes(normalizedQuery) &&
                    !position.includes(normalizedQuery)
                ) {
                    return false;
                }
            }
            return true;
        });

        const grouped = filteredList.reduce((acc, staff) => {
            const department = getCurrentJob(staff).department || 'Unassigned';
            if (!acc[department]) {
                acc[department] = [];
            }
            acc[department].push(staff);
            return acc;
        }, {});

        Object.keys(grouped).forEach(dept => {
            grouped[dept].sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
        });

        return grouped;
    }, [staffList, showArchived, searchQuery]);

    const sortedDepartments = useMemo(() => Object.keys(groupedStaff).sort(), [groupedStaff]);

    useEffect(() => {
        if (selectedStaff) {
            const updatedStaff = staffList.find(staff => staff.id === selectedStaff.id);
            setSelectedStaff(updatedStaff || null);
        }
    }, [staffList, selectedStaff]);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const functions = getFunctions(app);
            const exportStaffData = httpsCallable(functions, 'exportStaffData');
            const result = await exportStaffData();
            const csvData = result.data.csvData;
            const filename = result.data.filename || `staff_export_${formatISODate(new Date())}_fallback.csv`;

            if (!csvData) {
                alert("No staff data to export.");
                return;
            }
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
        } catch (error) {
            console.error("Error exporting data:", error);
            alert(`Failed to export staff data: ${error.message}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportClick = () => {
        if (fileInputRef.current) {
            setImportResult(null);
            setAnalysisResult(null);
            setCsvDataToConfirm(null);
            fileInputRef.current.click();
        }
    };

    const handleFileSelected = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
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
            setAnalysisResult(null);
            setImportResult(null);
            try {
                const functions = getFunctions();
                const importStaffData = httpsCallable(functions, 'importStaffData');
                const result = await importStaffData({ csvData, confirm: false });
                if (result.data && result.data.analysis) {
                    setAnalysisResult(result.data.analysis);
                    setCsvDataToConfirm(csvData);
                    setIsConfirmModalOpen(true);
                } else {
                     setImportResult({
                         message: result.data?.result || "Analysis failed or returned no data.",
                         errors: result.data?.errors || ["Unknown analysis error."]
                     });
                }
            } catch (error) {
                 const errorDetails = error.details || `Code: ${error.code}, Message: ${error.message}`;
                setImportResult({
                    message: `Import analysis failed: ${error.message}`,
                    errors: Array.isArray(errorDetails) ? errorDetails : [String(errorDetails)]
                });
            } finally {
                setIsImporting(false);
            }
        };
        reader.onerror = () => {
            alert("Error reading file.");
            setIsImporting(false);
        };
        reader.readAsText(file);
    };

    const handleConfirmImport = async () => {
        if (!csvDataToConfirm) {
            alert("No CSV data to confirm.");
            return;
        }
        setIsConfirmingImport(true);
        setIsConfirmModalOpen(false);
        setImportResult(null);
        try {
            const functions = getFunctions();
            const importStaffData = httpsCallable(functions, 'importStaffData');
            const result = await importStaffData({ csvData: csvDataToConfirm, confirm: true });
            setImportResult({
                message: result.data.result,
                errors: result.data.errors || [],
                password: result.data.defaultPassword || null
            });
        } catch (error) {
            console.error("Error confirming import call:", error);
            const errorDetails = error.details || `Code: ${error.code}, Message: ${error.message}`;
            setImportResult({
                message: `Import confirmation failed: ${error.message}`,
                errors: Array.isArray(errorDetails) ? errorDetails : [String(errorDetails)]
            });
        } finally {
            setIsConfirmingImport(false);
            setCsvDataToConfirm(null);
            setAnalysisResult(null);
        }
    };

    const handleCancelImport = () => {
        setIsConfirmModalOpen(false);
        setAnalysisResult(null);
        setCsvDataToConfirm(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

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

             {/* Import Confirmation Modal */}
             <ImportConfirmationModal
                isOpen={isConfirmModalOpen}
                onClose={handleCancelImport}
                analysisResult={analysisResult}
                onConfirm={handleConfirmImport}
                isConfirming={isConfirmingImport}
            />

            {/* Header and Action Buttons */}
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Staff Management</h2>
                <div className="flex flex-wrap items-center gap-4 justify-start md:justify-end">
                    <div className="flex-grow w-full md:w-auto md:flex-grow-0">
                        <input
                            type="text"
                            placeholder="Search by name, nickname, or position..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full md:w-64 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-amber-500 focus:border-amber-500"
                        />
                    </div>
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
                    <button onClick={handleExport} disabled={isExporting || isImporting || isConfirmingImport} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500">
                        <Download className="h-5 w-5 mr-2" />
                        {isExporting ? 'Exporting...' : 'Export CSV'}
                    </button>
                    <button onClick={handleImportClick} disabled={isImporting || isConfirmingImport || isExporting} className="flex items-center bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500">
                        <Upload className="h-5 w-5 mr-2" />
                        {isImporting ? 'Analyzing...' : (isConfirmingImport ? 'Importing...' : 'Import CSV')}
                    </button>
                    <button onClick={() => setIsAddModalOpen(true)} disabled={isImporting || isConfirmingImport || isExporting} className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500">
                        <Plus className="h-5 w-5 mr-2" />
                        Invite Staff
                    </button>
                     <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelected}
                        accept=".csv, text/csv"
                        style={{ display: 'none' }}
                    />
                </div>
            </div>

             {/* FINAL Import Results Display */}
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
                            <p className="text-sm font-semibold text-red-300 mb-1">Errors encountered during final import:</p>
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
                            {/* --- NEW: Salary Column --- */}
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Salary (THB)</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Bonus Streak</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Start Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    {sortedDepartments.length === 0 && (
                         <tbody>
                            <tr>
                                {/* --- UPDATED: colSpan to 6 --- */}
                                <td colSpan="6" className="text-center py-10 text-gray-500">No staff members found matching the current filter.</td>
                            </tr>
                         </tbody>
                    )}
                    {sortedDepartments.map(department => (
                        <React.Fragment key={department}>
                            <tbody className="divide-y divide-gray-700">
                                <tr className="bg-gray-900 sticky top-0 z-10">
                                    {/* --- UPDATED: colSpan to 6 --- */}
                                    <th colSpan="6" className="px-6 py-2 text-left text-sm font-semibold text-amber-400">
                                        {department} ({groupedStaff[department].length})
                                    </th>
                                </tr>
                                {groupedStaff[department].map(staff => {
                                    const currentJob = getCurrentJob(staff);
                                    const startDate = staff.startDate?.seconds ? staff.startDate.toDate() : staff.startDate;

                                    return (
                                        <tr key={staff.id} onClick={() => handleViewStaff(staff)} className="hover:bg-gray-700 cursor-pointer">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{getDisplayName(staff)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{currentJob.position}</td>
                                            
                                            {/* --- NEW: Salary Cell --- */}
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 text-right">{formatCurrency(currentJob.rate)}</td>
                                            
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium text-amber-400">
                                                {staff.bonusStreak || 0}
                                            </td>

                                            {/* --- UPDATED: Start Date Cell with Tooltip --- */}
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                                <span className="cursor-help" title={getSeniority(startDate)}>
                                                    {formatDisplayDate(startDate)}
                                                </span>
                                            </td>

                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <StatusBadge status={staff.status} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </React.Fragment>
                    ))}
                </table>
            </div>
        </div>
    );
};