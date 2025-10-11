import React, { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import AddStaffForm from '../components/AddStaffForm';
import StaffProfileModal from '../components/StaffProfileModal';
import { PlusIcon } from '../components/Icons';

export default function StaffManagementPage({ auth, db, staffList, departments, userRole }) {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState(null);

    const handleViewStaff = (staff) => setSelectedStaff(staff);
    const closeProfileModal = () => setSelectedStaff(null);
    
    // Helper to get the display name, prioritizing nickname
    const getDisplayName = (staff) => {
        if (staff.nickname) return staff.nickname;
        if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
        return staff.fullName; // Fallback for old data
    };

    const getCurrentPosition = (staff) => {
        if (staff.jobHistory && staff.jobHistory.length > 0) {
            return staff.jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0].position;
        }
        return 'N/A';
    };
    
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
                <button onClick={() => setIsAddModalOpen(true)} className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0">
                    <PlusIcon className="h-5 w-5 mr-2" />
                    Invite New Staff
                </button>
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
                        {staffList.map(staff => (
                            <tr key={staff.id} onClick={() => handleViewStaff(staff)} className="hover:bg-gray-700 cursor-pointer">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{getDisplayName(staff)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{getCurrentPosition(staff)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{staff.startDate}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className="px-3 py-1 inline-flex text-xs font-semibold rounded-full bg-green-600 text-green-100">Active</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};