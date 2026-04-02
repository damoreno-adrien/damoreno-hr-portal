import React, { useState, useEffect, useMemo } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import Modal from '../components/common/Modal';
import AddStaffForm from '../components/StaffProfile/AddStaffForm';
import StaffProfileModal from '../components/StaffProfile/StaffProfileModal';
import { Plus, Download, FileText } from 'lucide-react'; 
import { 
    fromFirestore, 
    differenceInCalendarMonths, 
    formatISODate, 
    formatDisplayDate,
    isStaffActiveOnDate,
    getDynamicStaffStatus
} from '../utils/dateUtils';
import { app } from "../../firebase.js";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Helper: Currency Formatter ---
const formatCurrency = (num) => {
    if (typeof num !== 'number') {
        num = 0;
    }
    return new Intl.NumberFormat('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    }).format(num);
};

// --- Helper: Seniority Calculator ---
const getSeniority = (startDateInput) => {
    const startDate = fromFirestore(startDateInput);
    if (!startDate) return 'Invalid date';

    const today = new Date();
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

// --- Helper: Status Badge ---
const StatusBadge = ({ staff }) => {
    const status = getDynamicStaffStatus(staff);
    return (
        <span className={`px-3 py-1 inline-flex text-xs font-semibold rounded-full ${status.color}`}>
            {status.label}
        </span>
    );
};

export default function StaffManagementPage({ auth, db, staffList, departments, userRole, companyConfig }) {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [showArchived, setShowArchived] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const handleViewStaff = (staff) => setSelectedStaff(staff);
    const closeProfileModal = () => setSelectedStaff(null);

    const getDisplayName = (staff) => {
        if (!staff) return 'Unknown';
        if (staff.nickname) return staff.nickname;
        if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
        return staff.fullName || 'Unknown';
    };

    // --- Robust Job Retrieval ---
    const getCurrentJob = (staff) => {
        if (!staff?.jobHistory || staff.jobHistory.length === 0) {
            return { position: 'N/A', department: 'Unassigned', displayRate: 0, payType: 'Salary' };
        }
        
        // Sort by date descending (newest first)
        const latestJob = [...staff.jobHistory].sort((a, b) => {
             const dateA = fromFirestore(b.startDate) || new Date(0);
             const dateB = fromFirestore(a.startDate) || new Date(0);
             return dateA - dateB;
        })[0];

        // Determine correct rate to display based on structure
        let rate = 0;
        if (latestJob.payType === 'Hourly') {
            rate = latestJob.hourlyRate || latestJob.rate || 0;
        } else {
            // Salary (or legacy Monthly)
            rate = latestJob.baseSalary || latestJob.rate || 0;
        }

        return { ...latestJob, displayRate: rate };
    };

    const groupedStaff = useMemo(() => {
        const normalizedQuery = searchQuery.toLowerCase().trim();

        const filteredList = staffList.filter(staff => {
            // A staff member is only hidden if their end date has actually passed
            const isHistoricallyArchived = !isStaffActiveOnDate(staff, new Date());
            
            if (!showArchived && isHistoricallyArchived) {
                return false;
            }
            
            // Search Logic
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

    // --- PDF Export Function ---
    const handleExportPDF = () => {
        const doc = new jsPDF();
        const today = new Date().toLocaleDateString('en-GB');
        
        doc.setFontSize(18);
        doc.text("Staff List", 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated on: ${today}`, 14, 26);

        const tableBody = [];

        sortedDepartments.forEach(dept => {
            groupedStaff[dept].forEach(staff => {
                const currentJob = getCurrentJob(staff);
                const startDate = fromFirestore(staff.startDate);
                
                const rateLabel = currentJob.payType === 'Hourly' ? '/hr' : '/mo';
                const salaryDisplay = `${formatCurrency(currentJob.displayRate)} ${rateLabel}`;

                tableBody.push([
                    getDisplayName(staff),
                    dept,
                    currentJob.position,
                    salaryDisplay,
                    staff.bonusStreak || 0,
                    formatDisplayDate(startDate),
                    staff.status || 'Active'
                ]);
            });
        });

        autoTable(doc, {
            startY: 35,
            head: [['Name', 'Department', 'Position', 'Salary', 'Streak', 'Start Date', 'Status']],
            body: tableBody,
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            styles: { fontSize: 9 },
        });

        doc.save(`staff_list_${new Date().toISOString().split('T')[0]}.pdf`);
    };

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

    return (
        <div>
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Invite New Staff Member">
                <AddStaffForm auth={auth} onClose={() => setIsAddModalOpen(false)} departments={departments} />
            </Modal>

            {selectedStaff && (
                 <Modal isOpen={true} onClose={closeProfileModal} title={`${getDisplayName(selectedStaff)}'s Profile`}>
                    <StaffProfileModal 
                        staff={selectedStaff} 
                        db={db} 
                        companyConfig={companyConfig}
                        onClose={closeProfileModal} 
                        departments={departments} 
                        userRole={userRole} 
                    />
                </Modal>
            )}

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
                    
                    <div className="flex space-x-2">
                        <button onClick={handleExport} disabled={isExporting} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500">
                            <Download className="h-5 w-5 mr-2" />
                            {isExporting ? 'Exporting...' : 'CSV'}
                        </button>
                        <button onClick={handleExportPDF} disabled={isExporting} className="flex items-center bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500">
                            <FileText className="h-5 w-5 mr-2" />
                            PDF
                        </button>
                    </div>

                    <button onClick={() => setIsAddModalOpen(true)} disabled={isExporting} className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500">
                        <Plus className="h-5 w-5 mr-2" />
                        Invite Staff
                    </button>
                </div>
            </div>

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Display Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Position</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Salary (THB)</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Bonus Streak</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Start Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    {sortedDepartments.length === 0 && (
                         <tbody>
                            <tr>
                                <td colSpan="6" className="text-center py-10 text-gray-500">No staff members found matching the current filter.</td>
                            </tr>
                         </tbody>
                    )}
                    {sortedDepartments.map(department => (
                        <React.Fragment key={department}>
                            <tbody className="divide-y divide-gray-700">
                                <tr className="bg-gray-900 sticky top-0 z-10">
                                    <th colSpan="6" className="px-6 py-2 text-left text-sm font-semibold text-amber-400">
                                        {department} ({groupedStaff[department].length})
                                    </th>
                                </tr>
                                {groupedStaff[department].map(staff => {
                                    const currentJob = getCurrentJob(staff);
                                    const startDate = fromFirestore(staff.startDate);

                                    return (
                                        <tr key={staff.id} onClick={() => handleViewStaff(staff)} className="hover:bg-gray-700 cursor-pointer">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                                                <div className="flex items-center">
                                                    <span>{getDisplayName(staff)}</span>
                                                    {staff.offboardingSettings?.isPendingFutureOffboard && staff.status === 'active' && (
                                                        <span className="ml-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex whitespace-nowrap">
                                                            Leaving: {formatDisplayDate(staff.endDate)}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{currentJob.position}</td>
                                            
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 text-right">
                                                {formatCurrency(currentJob.displayRate)} 
                                                <span className="text-xs text-gray-500 ml-1">
                                                    {currentJob.payType === 'Hourly' ? '/hr' : '/mo'}
                                                </span>
                                            </td>
                                            
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium text-amber-400">
                                                {staff.bonusStreak || 0}
                                            </td>

                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                                <span className="cursor-help" title={getSeniority(startDate)}>
                                                    {formatDisplayDate(startDate)}
                                                </span>
                                            </td>

                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <StatusBadge staff={staff} />
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
}