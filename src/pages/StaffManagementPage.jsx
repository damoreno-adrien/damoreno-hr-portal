import React, { useState, useEffect, useMemo } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import Modal from '../components/Modal';
import AddStaffForm from '../components/AddStaffForm';
import StaffProfileModal from '../components/StaffProfileModal';
import { PlusIcon, DownloadIcon } from '../components/Icons'; // Assuming DownloadIcon exists

const StatusBadge = ({ status }) => {
    const statusClass = status === 'inactive'
        ? "bg-red-500/20 text-red-300"
        : "bg-green-500/20 text-green-300";
    const text = status === 'inactive' ? 'Inactive' : 'Active';
    return (
        <span className={`px-3 py-1 inline-flex text-xs font-semibold rounded-full ${statusClass}`}>
            {text}
        </span>
    );
};

export default function StaffManagementPage({ auth, db, staffList, departments, userRole }) {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [showArchived, setShowArchived] = useState(false);
    const [isExporting, setIsExporting] = useState(false); // NEW state for export

    const handleViewStaff = (staff) => setSelectedStaff(staff);
    const closeProfileModal = () => setSelectedStaff(null);
    
    const getDisplayName = (staff) => {
        if (staff.nickname) return staff.nickname;
        if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
        return staff.fullName;
    };

    const getCurrentJob = (staff) => {
        if (staff.jobHistory && staff.jobHistory.length > 0) {
            return staff.jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
        }
        return { position: 'N/A', department: 'Unassigned' };
    };
    
    const groupedStaff = useMemo(() => {
        const filteredList = staffList.filter(staff => {
            if (showArchived) return true;
            return staff.status !== 'inactive';
        });

        const grouped = filteredList.reduce((acc, staff) => {
            const department = getCurrentJob(staff).department;
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
    }, [staffList, showArchived]);
    
    const sortedDepartments = useMemo(() => Object.keys(groupedStaff).sort(), [groupedStaff]);
    
    useEffect(() => {
        if (selectedStaff) {
            const updatedStaff = staffList.find(staff => staff.id === selectedStaff.id);
            if (updatedStaff) { setSelectedStaff(updatedStaff); }
        }
    }, [staffList, selectedStaff?.id]);
    
    // NEW: Handler for exporting data
    const handleExport = async () => {
        setIsExporting(true);
        try {
            const functions = getFunctions();
            const exportStaffData = httpsCallable(functions, 'exportStaffData');
            const result = await exportStaffData();
            const csvData = result.data.csvData;

            if (!csvData) {
                alert("No staff data to export.");
                return;
            }

            const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            const today = new Date().toISOString().split('T')[0];
            link.setAttribute("download", `staff_export_${today}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error("Error exporting data:", error);
            alert("Failed to export staff data. Please try again.");
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
                    <StaffProfileModal staff={selectedStaff} db={db} onClose={closeProfileModal} departments={departments} userRole={userRole} />
                </Modal>
            )}

            <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Staff Management</h2>
                <div className="flex items-center space-x-4">
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
                    {/* NEW: Export Button */}
                    <button onClick={handleExport} disabled={isExporting} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:bg-gray-500">
                        <DownloadIcon className="h-5 w-5 mr-2" />
                        {isExporting ? 'Exporting...' : 'Export to CSV'}
                    </button>
                    <button onClick={() => setIsAddModalOpen(true)} className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0">
                        <PlusIcon className="h-5 w-5 mr-2" />
                        Invite New Staff
                    </button>
                </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Display Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Position</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Start Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                        </tr>
                    </thead>
                    {sortedDepartments.map(department => (
                        <tbody key={department} className="divide-y divide-gray-700">
                            <tr className="bg-gray-900">
                                <th colSpan="4" className="px-6 py-2 text-left text-sm font-semibold text-amber-400">
                                    {department}
                                </th>
                            </tr>
                            {groupedStaff[department].map(staff => (
                                <tr key={staff.id} onClick={() => handleViewStaff(staff)} className="hover:bg-gray-700 cursor-pointer">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{getDisplayName(staff)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{getCurrentJob(staff).position}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{staff.startDate}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <StatusBadge status={staff.status} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    ))}
                </table>
            </div>
        </div>
    );
};