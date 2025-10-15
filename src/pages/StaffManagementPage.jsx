import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../components/Modal';
import AddStaffForm from '../components/AddStaffForm';
import StaffProfileModal from '../components/StaffProfileModal';
import { PlusIcon } from '../components/Icons';

// NEW: A StatusBadge component for consistent styling
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
    const [showArchived, setShowArchived] = useState(false); // NEW: State for filtering

    const handleViewStaff = (staff) => setSelectedStaff(staff);
    const closeProfileModal = () => setSelectedStaff(null);
    
    const getDisplayName = (staff) => {
        if (staff.nickname) return staff.nickname;
        if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
        return staff.fullName;
    };

    const getCurrentPosition = (staff) => {
        if (staff.jobHistory && staff.jobHistory.length > 0) {
            return staff.jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0].position;
        }
        return 'N/A';
    };
    
    // NEW: Memoized and filtered list of staff to display
    const staffToDisplay = useMemo(() => {
        return staffList
            .filter(staff => {
                // If showArchived is true, show everyone. Otherwise, only show staff who are NOT inactive.
                if (showArchived) return true;
                return staff.status !== 'inactive';
            })
            .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
    }, [staffList, showArchived]);
    
    useEffect(() => {
        if (selectedStaff) {
            const updatedStaff = staffList.find(staff => staff.id === selectedStaff.id);
            if (updatedStaff) { setSelectedStaff(updatedStaff); }
        }
    }, [staffList, selectedStaff?.id]);

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
                    {/* NEW: Toggle to show archived staff */}
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
                    <tbody className="divide-y divide-gray-700">
                        {/* UPDATED: Map over the filtered/sorted list */}
                        {staffToDisplay.map(staff => (
                            <tr key={staff.id} onClick={() => handleViewStaff(staff)} className="hover:bg-gray-700 cursor-pointer">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{getDisplayName(staff)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{getCurrentPosition(staff)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{staff.startDate}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {/* UPDATED: Dynamically show status */}
                                    <StatusBadge status={staff.status} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};