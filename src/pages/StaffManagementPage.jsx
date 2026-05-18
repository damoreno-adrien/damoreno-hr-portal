/* src/pages/StaffManagementPage.jsx */
import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import Modal from '../components/common/Modal';
import AddStaffForm from '../components/StaffProfile/AddStaffForm';
import StaffProfileModal from '../components/StaffProfile/StaffProfileModal';
import { Plus, Download } from 'lucide-react';
import {
    fromFirestore,
    differenceInCalendarMonths,
    formatDisplayDate,
    isStaffActiveOnDate,
    getDynamicStaffStatus
} from '../utils/dateUtils';
import StaffExportOptionsModal from '../components/StaffProfile/StaffExportOptionsModal';
import FeedbackModal from '../components/common/FeedbackModal';
import { generateCustomStaffExport } from '../utils/staffExport'; // <-- NOUVEL IMPORT

// --- Helpers ---
const formatCurrency = (num) => {
    if (typeof num !== 'number') num = 0;
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};

const getSeniority = (startDateInput) => {
    const startDate = fromFirestore(startDateInput);
    if (!startDate) return 'Invalid date';
    const totalMonths = differenceInCalendarMonths(new Date(), startDate);
    if (totalMonths < 0) return 'Starts in future';
    if (totalMonths === 0) return 'New this month';
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    let parts = [];
    if (years > 0) parts.push(`${years} year${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);
    return parts.length > 0 ? parts.join(', ') : 'Less than a month';
};

const StatusBadge = ({ staff }) => {
    const status = getDynamicStaffStatus(staff);
    return <span className={`px-3 py-1 inline-flex text-xs font-semibold rounded-full ${status.color}`}>{status.label}</span>;
};

export default function StaffManagementPage({ auth, db, staffList, departments, userRole, companyConfig, activeBranch, staffProfile }) {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [showArchived, setShowArchived] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [feedbackModal, setFeedbackModal] = useState(null);
    const [adminBranchIds, setAdminBranchIds] = useState([]);

    useEffect(() => {
        const uid = auth?.currentUser?.uid || getAuth().currentUser?.uid;
        if (['admin', 'manager'].includes(userRole) && uid && db) {
            getDoc(doc(db, 'users', uid)).then(snap => {
                if (snap.exists()) setAdminBranchIds(snap.data().branchIds || []);
            }).catch(err => console.error("Failed to fetch admin branches:", err));
        }
    }, [db, userRole, auth]);
    
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
            return { position: 'N/A', department: 'Unassigned', displayRate: 0, payType: 'Salary' };
        }
        const latestJob = [...staff.jobHistory].sort((a, b) => {
            const dateA = fromFirestore(b.startDate) || new Date(0);
            const dateB = fromFirestore(a.startDate) || new Date(0);
            return dateA - dateB;
        })[0];
        let rate = latestJob.payType === 'Hourly' ? (latestJob.hourlyRate || latestJob.rate || 0) : (latestJob.baseSalary || latestJob.rate || 0);
        return { ...latestJob, displayRate: rate };
    };

    const availableBranches = useMemo(() => {
        if (userRole === 'super_admin') return companyConfig?.branches || [];
        return (companyConfig?.branches || []).filter(b => adminBranchIds.includes(b.id));
    }, [companyConfig, userRole, adminBranchIds]);

    const groupedStaff = useMemo(() => {
        const normalizedQuery = searchQuery.toLowerCase().trim();
        const filteredList = staffList.filter(staff => {
            const isHistoricallyArchived = !isStaffActiveOnDate(staff, new Date());
            if (!showArchived && isHistoricallyArchived) return false;
            if (activeBranch === 'global') {
                if (userRole === 'admin' && !adminBranchIds.includes(staff.branchId)) return false;
            } else if (activeBranch && staff.branchId !== activeBranch) return false;

            if (normalizedQuery) {
                const name = getDisplayName(staff).toLowerCase();
                const nickname = (staff.nickname || '').toLowerCase();
                const position = getCurrentJob(staff).position.toLowerCase();
                if (!name.includes(normalizedQuery) && !nickname.includes(normalizedQuery) && !position.includes(normalizedQuery)) return false;
            }
            return true;
        });

        const grouped = filteredList.reduce((acc, staff) => {
            const department = getCurrentJob(staff).department || 'Unassigned';
            if (!acc[department]) acc[department] = [];
            acc[department].push(staff);
            return acc;
        }, {});

        Object.keys(grouped).forEach(dept => {
            grouped[dept].sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
        });

        return grouped;
    }, [staffList, showArchived, searchQuery, activeBranch, userRole, adminBranchIds]);

    const sortedDepartments = useMemo(() => Object.keys(groupedStaff).sort(), [groupedStaff]);

    useEffect(() => {
        if (selectedStaff) {
            const updatedStaff = staffList.find(staff => staff.id === selectedStaff.id);
            setSelectedStaff(updatedStaff || null);
        }
    }, [staffList, selectedStaff]);

    // --- NOUVELLE LOGIQUE D'EXPORT BASÉE SUR LE RÔLE ---
    const handleExportClick = () => {
        if (userRole === 'super_admin') {
            setIsExportModalOpen(true);
        } else {
            const defaultFields = [
                { id: 'name', label: 'Full Name' },
                { id: 'department', label: 'Department' },
                { id: 'position', label: 'Position' },
                { id: 'email', label: 'Email' },
                { id: 'phone', label: 'Phone' },
                { id: 'startDate', label: 'Start Date' },
                { id: 'status', label: 'Status' }
            ];
            
            generateCustomStaffExport({
                staffList,
                filters: { department: 'All', status: 'Active' },
                sortConfig: { key: 'department', dir: 'asc' },
                selectedFields: defaultFields,
                format: 'pdf',
                branchName: activeBranch === 'global' ? 'All My Branches' : `Branch: ${activeBranch}`,
                activeBranch, // <-- AJOUTÉ
                userRole,     // <-- AJOUTÉ
                adminBranchIds // <-- AJOUTÉ
            });
            
            setFeedbackModal({ type: 'success', title: 'Export Generated', message: "Your standard PDF report has been downloaded." });
        }
    };

    return (
        <div className="relative">
            <FeedbackModal isOpen={!!feedbackModal} type={feedbackModal?.type} title={feedbackModal?.title} message={feedbackModal?.message} onClose={() => setFeedbackModal(null)} />
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Invite New Staff Member">
                <AddStaffForm auth={auth} onClose={() => setIsAddModalOpen(false)} departments={departments} userRole={userRole} activeBranch={activeBranch} branches={availableBranches} managerProfile={staffProfile} companyConfig={companyConfig} />
            </Modal>
            {selectedStaff && (
                <Modal isOpen={true} onClose={() => setSelectedStaff(null)} title={`${getDisplayName(selectedStaff)}'s Profile`}>
                    <StaffProfileModal staff={selectedStaff} db={db} companyConfig={companyConfig} onClose={() => setSelectedStaff(null)} departments={departments} userRole={userRole} branches={availableBranches} />
                </Modal>
            )}

            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Staff Management</h2>
                <div className="flex flex-wrap items-center gap-4 justify-start md:justify-end">
                    <div className="flex-grow w-full md:w-auto md:flex-grow-0">
                        <input type="text" placeholder="Search by name, nickname, or position..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full md:w-64 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-amber-500 focus:border-amber-500" />
                    </div>

                    <div className="flex items-center">
                        <input id="showArchived" type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-amber-600 focus:ring-amber-500" />
                        <label htmlFor="showArchived" className="ml-2 text-sm text-gray-300">Show Archived</label>
                    </div>

                    {/* BOUTON D'EXPORT UNIQUE */}
                    <button onClick={handleExportClick} className="flex items-center px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold text-sm shadow transition-colors">
                        <Download className="w-4 h-4 mr-2" /> Export Data
                    </button>

                    <button onClick={() => setIsAddModalOpen(true)} className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0">
                        <Plus className="h-5 w-5 mr-2" /> Invite Staff
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
                        <tbody><tr><td colSpan="6" className="text-center py-10 text-gray-500">No staff members found matching the current filter.</td></tr></tbody>
                    )}
                    {sortedDepartments.map(department => (
                        <React.Fragment key={department}>
                            <tbody className="divide-y divide-gray-700">
                                <tr className="bg-gray-900 sticky top-0 z-10"><th colSpan="6" className="px-6 py-2 text-left text-sm font-semibold text-amber-400">{department} ({groupedStaff[department].length})</th></tr>
                                {groupedStaff[department].map(staff => {
                                    const currentJob = getCurrentJob(staff);
                                    const startDate = fromFirestore(staff.startDate);
                                    const bName = companyConfig?.branches?.find(b => b.id === staff.branchId)?.name || staff.branchId || 'Unknown';
                                    return (
                                        <tr key={staff.id} onClick={() => handleViewStaff(staff)} className="hover:bg-gray-700 cursor-pointer">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                                                <div className="flex items-center">
                                                    <span>{getDisplayName(staff)}</span>
                                                    {activeBranch === 'global' && staff.branchId && (
                                                        <span className="ml-2 text-[9px] uppercase tracking-wider font-bold bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                                                            {bName.replace('Da Moreno ', '')}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{currentJob.position}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 text-right">{formatCurrency(currentJob.displayRate)} <span className="text-xs text-gray-500 ml-1">{currentJob.payType === 'Hourly' ? '/hr' : '/mo'}</span></td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium text-amber-400">{staff.bonusStreak || 0}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300"><span className="cursor-help" title={getSeniority(startDate)}>{formatDisplayDate(startDate)}</span></td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm"><StatusBadge staff={staff} /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </React.Fragment>
                    ))}
                </table>
            </div>
            
            {/* MODALE EXPORT: Seul le Super Admin pourra y accéder */}
            <StaffExportOptionsModal 
                isOpen={isExportModalOpen} 
                onClose={() => setIsExportModalOpen(false)} 
                staffList={staffList} 
                activeBranch={activeBranch} 
                userRole={userRole}
                adminBranchIds={adminBranchIds}
            />
        </div>
    );
}