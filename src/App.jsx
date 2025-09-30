import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, onSnapshot, addDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

// --- Helper Icon Components ---
const LogInIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>);
const UserIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
const BriefcaseIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>);
const LogOutIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>);
const SendIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>);
const CalendarIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>);
const PlusIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>);
const XIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>);
const ChevronLeftIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>);
const ChevronRightIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>);
const SettingsIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>);


// --- Reusable Modal Component ---
const Modal = ({ isOpen, onClose, title, children }) => {
    // ... (code omitted for brevity)
};

// --- Add New Staff Form Component (UPGRADED for Departments) ---
const AddStaffForm = ({ auth, onClose, departments }) => {
    const [fullName, setFullName] = useState('');
    const [position, setPosition] = useState('');
    const [department, setDepartment] = useState(departments[0] || '');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        // ... (omitted for brevity - logic is similar, but will be adapted in the Cloud Function)
        
        // --- This is what our Cloud Function will do ---
        // 1. Create user in Firebase Auth
        // 2. Create user role in 'users' collection
        // 3. Create staff profile in 'staff_profiles' collection, now with a 'jobHistory' array
        
        // Placeholder for now
        alert("This form is updated. The Cloud Function needs to be updated next to save the job history.");
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-gray-300 mb-1">Full Name</label>
                    <input type="text" id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
                    <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="department" className="block text-sm font-medium text-gray-300 mb-1">Department</label>
                    <select id="department" value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                        {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                    </select>
                </div>
                 <div>
                    <label htmlFor="position" className="block text-sm font-medium text-gray-300 mb-1">Position</label>
                    <input type="text" id="position" value={position} onChange={(e) => setPosition(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
            </div>
             <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                <input type="date" id="startDate" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
            <div className="border-t border-gray-700 pt-6">
                 <p className="text-sm text-gray-400 mb-4">Create Login Credentials:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="temp-password-label" className="block text-sm font-medium text-gray-300 mb-1">Temporary Password</label>
                        <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                 </div>
            </div>
            {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
            {success && <p className="text-green-400 text-sm text-center mt-2">{success}</p>}
            <div className="flex justify-end pt-4 space-x-4">
                <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg text-gray-300 bg-gray-600 hover:bg-gray-500">Cancel</button>
                <button type="submit" disabled={isSaving} className="px-6 py-2 rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800">
                    {isSaving ? 'Creating...' : 'Create Staff'}
                </button>
            </div>
        </form>
    );
};

// --- Staff Profile View/Edit Component (UPGRADED for Job History) ---
const StaffProfileModal = ({ staff, db, onClose, departments }) => {
    // ... (code omitted for brevity, will be fully implemented in next step)
    // For now, it will display the current position and department
    const currentJob = staff.jobHistory && staff.jobHistory.length > 0
        ? staff.jobHistory[staff.jobHistory.length - 1]
        : { position: 'N/A', department: 'N/A' };

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                    <p className="text-sm text-gray-400">Full Name</p>
                    <p className="text-white text-lg">{staff.fullName}</p>
                </div>
                 <div>
                    <p className="text-sm text-gray-400">Email Address</p>
                    <p className="text-white text-lg">{staff.email}</p>
                </div>
                 <div>
                    <p className="text-sm text-gray-400">Current Department</p>
                    <p className="text-white text-lg">{currentJob.department}</p>
                </div>
                 <div>
                    <p className="text-sm text-gray-400">Current Position</p>
                    <p className="text-white text-lg">{currentJob.position}</p>
                </div>
            </div>
            <p className="text-center text-gray-400 italic">Full job history and editing coming in the next step!</p>
            <div className="flex justify-end pt-4 space-x-4 border-t border-gray-700 mt-6">
                <button onClick={onClose} className="px-6 py-2 rounded-lg text-gray-300 bg-gray-600 hover:bg-gray-500">Close</button>
            </div>
        </div>
    );
};

// --- Staff Management Page Component ---
const StaffManagementPage = ({ auth, db, staffList, departments }) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState(null);

    const handleViewStaff = (staff) => setSelectedStaff(staff);
    const closeProfileModal = () => setSelectedStaff(null);
    
    const getCurrentPosition = (staff) => {
        if (staff.jobHistory && staff.jobHistory.length > 0) {
            return staff.jobHistory[staff.jobHistory.length - 1].position;
        }
        return staff.position || 'N/A'; // Fallback for old data structure
    };

    return (
        <div>
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Invite New Staff Member">
                <AddStaffForm auth={auth} onClose={() => setIsAddModalOpen(false)} departments={departments} />
            </Modal>
            
            {selectedStaff && (
                 <Modal isOpen={true} onClose={closeProfileModal} title="Staff Profile">
                    <StaffProfileModal staff={selectedStaff} db={db} onClose={closeProfileModal} departments={departments} />
                </Modal>
            )}

            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold text-white">Staff Management</h2>
                <button onClick={() => setIsAddModalOpen(true)} className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg">
                    <PlusIcon className="h-5 w-5 mr-2" />
                    Invite New Staff
                </button>
            </div>
            <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Full Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Position</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Start Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {staffList.map(staff => (
                            <tr key={staff.id} onClick={() => handleViewStaff(staff)} className="hover:bg-gray-700 cursor-pointer">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{staff.fullName}</td>
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

// --- Planning Page Component ---
const PlanningPage = ({ staffList }) => {
    // ... (code omitted for brevity)
};

// --- Settings Page Component (Placeholder) ---
const SettingsPage = () => (
    <div>
        <h2 className="text-3xl font-bold text-white mb-8">Settings</h2>
        <div className="bg-gray-800 rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-semibold text-white">Manage Departments</h3>
            <p className="text-gray-400 mt-4">This section is under construction.</p>
            <p className="text-gray-400">You will soon be able to add, edit, and delete company departments here.</p>
        </div>
    </div>
);


// --- Main Application Component ---
export default function App() {
    // ... (state variables - no changes)
    const [departments, setDepartments] = useState([
        "Management", "Service", "Kitchen", "Pizza Department" // Hard-coded for now
    ]);

    useEffect(() => {
        // ... (Firebase initialization - no changes)
    }, []);

    useEffect(() => {
        // ... (Staff list fetching - no changes)
    }, [userRole, db]);

    // ... (login/logout handlers - no changes)
    
    // ... (loading/login screens - no changes)
    
    const renderPageContent = () => {
        switch(currentPage) {
            case 'dashboard': return <h2 className="text-3xl font-bold text-white">Welcome, {user.email}!</h2>;
            case 'staff': return <StaffManagementPage auth={auth} db={db} staffList={staffList} departments={departments} />;
            case 'planning': return <PlanningPage staffList={staffList} />;
            case 'leave': return <h2 className="text-3xl font-bold text-white">Leave Management</h2>;
            case 'settings': return <SettingsPage />;
            default: return <h2 className="text-3xl font-bold text-white">Dashboard</h2>;
        }
    }

    const NavLink = ({ icon, label, page }) => (
        <button onClick={() => setCurrentPage(page)} className={`flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors ${currentPage === page ? 'bg-amber-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`}>
            {icon}
            <span className="ml-3">{label}</span>
        </button>
    );

    return (
        <div className="flex h-screen bg-gray-900 text-white font-sans">
            <aside className="w-64 bg-gray-800 flex flex-col p-4">
                {/* ... (header) */}
                <nav className="flex-1 space-y-2">
                    {userRole === 'manager' && (
                        <>
                           <NavLink page="dashboard" label="Dashboard" icon={<UserIcon className="h-5 w-5"/>} />
                           <NavLink page="staff" label="Manage Staff" icon={<BriefcaseIcon className="h-5 w-5"/>} />
                           <NavLink page="planning" label="Planning" icon={<CalendarIcon className="h-5 w-5"/>} />
                           <NavLink page="leave" label="Leave Management" icon={<SendIcon className="h-5 w-5"/>} />
                           <NavLink page="settings" label="Settings" icon={<SettingsIcon className="h-5 w-5"/>} />
                        </>
                    )}
                     {userRole === 'staff' && (
                        <>
                           <NavLink page="dashboard" label="My Dashboard" icon={<UserIcon className="h-5 w-5"/>} />
                           <NavLink page="planning" label="My Schedule" icon={<CalendarIcon className="h-5 w-5"/>} />
                           <NavLink page="leave" label="My Leave" icon={<SendIcon className="h-5 w-5"/>} />
                        </>
                    )}
                </nav>
                <div className="mt-auto">
                     {/* ... (user email & logout) */}
                </div>
            </aside>
            <main className="flex-1 p-10 overflow-auto">
                {renderPageContent()}
            </main>
        </div>
    );
}

