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
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 transition-opacity duration-300">
            <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg m-4 transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale">
                <div className="flex justify-between items-center p-6 border-b border-gray-700">
                    <h3 className="text-2xl font-semibold text-white">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <XIcon className="h-7 w-7" />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[80vh]">
                    {children}
                </div>
            </div>
            <style jsx>{`
              @keyframes fadeInScale {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
              }
              .animate-fade-in-scale { animation: fadeInScale 0.3s forwards cubic-bezier(0.16, 1, 0.3, 1); }
            `}</style>
        </div>
    );
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
        if (!fullName || !position || !department || !startDate || !email || !password) {
            setError('Please fill out all fields.');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }
        setIsSaving(true);
        setError('');
        setSuccess('');

        try {
            const functionUrl = "https://createuser-3hzcubx72q-uc.a.run.app";
            const token = await auth.currentUser.getIdToken();

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ email, password, fullName, position, department, startDate }),
            });
            
            const responseData = await response.json();
            if (!response.ok) throw new Error(responseData.error || 'Something went wrong');
            
            setSuccess(`Successfully created user for ${email}!`);
            setTimeout(() => {
                onClose();
            }, 2000);

        } catch (err) {
            console.error("Error creating user:", err);
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
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
    const [currentDate, setCurrentDate] = useState(new Date());

    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const changeMonth = (offset) => {
        setCurrentDate(prevDate => {
            const newDate = new Date(prevDate);
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
    };

    const generateCalendarGrid = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        
        let startDayIndex = firstDayOfMonth.getDay() - 1;
        if (startDayIndex === -1) startDayIndex = 6;

        const grid = [];

        for (let i = 0; i < startDayIndex; i++) {
            grid.push({ key: `empty-${i}`, empty: true });
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isMonday = date.getDay() === 1;
            const scheduledStaff = isMonday ? [] : staffList.map(s => s.fullName);
            grid.push({ key: `day-${day}`, day, scheduledStaff });
        }
        return grid;
    };

    const calendarGrid = generateCalendarGrid();

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold text-white">Planning & Schedule</h2>
                <div className="flex items-center space-x-4">
                    <button onClick={() => changeMonth(-1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors">
                        <ChevronLeftIcon className="h-6 w-6" />
                    </button>
                    <h3 className="text-2xl font-semibold w-48 text-center">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h3>
                    <button onClick={() => changeMonth(1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors">
                        <ChevronRightIcon className="h-6 w-6" />
                    </button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-px bg-gray-700 border border-gray-700 rounded-lg overflow-hidden">
                {daysOfWeek.map(day => (
                    <div key={day} className="text-center py-3 bg-gray-800 text-xs font-bold text-gray-400 uppercase">{day}</div>
                ))}
                {calendarGrid.map(cell => (
                    cell.empty ? (<div key={cell.key} className="bg-gray-900"></div>) : (
                        <div key={cell.key} className="relative bg-gray-800 p-2 min-h-[120px]">
                            <div className="text-right text-sm font-bold text-white">{cell.day}</div>
                            <div className="mt-1">
                                {cell.scheduledStaff.map((name, index) => (
                                    <div key={index} className="text-xs bg-amber-600 text-white rounded px-1 py-0.5 mb-1 truncate">
                                        {name}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                ))}
            </div>
        </div>
    );
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
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [user, setUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loginError, setLoginError] = useState('');
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [staffList, setStaffList] = useState([]);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [departments, setDepartments] = useState([
        "Management", "Service", "Kitchen", "Pizza Department"
    ]);

    useEffect(() => {
        try {
            const firebaseConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            
            setAuth(authInstance);
            setDb(dbInstance);

            const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
                if (currentUser) {
                    const userDocRef = doc(dbInstance, 'users', currentUser.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    setUser(currentUser); // Set user first
                    setUserRole(userDocSnap.exists() ? userDocSnap.data().role : null); // Then set role
                } else {
                    setUser(null);
                    setUserRole(null);
                }
                setIsLoading(false);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase Initialization Error:", error);
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (userRole === 'manager' && db) {
            const staffCollectionRef = collection(db, 'staff_profiles');
            const unsubscribe = onSnapshot(staffCollectionRef, (querySnapshot) => {
                const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setStaffList(list);
            }, (error) => console.error("Error fetching staff list:", error));
            return () => unsubscribe();
        } else {
            setStaffList([]);
        }
    }, [userRole, db]);
    
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        if (!auth) return;
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            setLoginError('Invalid email or password. Please try again.');
        }
    };

    const handleLogout = async () => {
        if (!auth) return;
        await signOut(auth);
        setCurrentPage('dashboard');
    };
    
    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white"><div className="text-xl">Loading Da Moreno HR Portal...</div></div>;
    }

    if (!user) {
        return (
             <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
                <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-lg dark:bg-gray-800">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Da Moreno At Town</h1>
                        <p className="mt-2 text-gray-600 dark:text-gray-300">HR Management Portal</p>
                    </div>
                    <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                         <div className="rounded-md shadow-sm -space-y-px">
                            <div>
                                <input id="email-address" name="email" type="email" autoComplete="email" required className="w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
                            </div>
                            <div>
                                <input id="password" name="password" type="password" autoComplete="current-password" required className="w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                            </div>
                        </div>
                        {loginError && (<p className="mt-2 text-center text-sm text-red-600 dark:text-red-400">{loginError}</p>)}
                        <div>
                            <button type="submit" className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500">
                                <span className="absolute left-0 inset-y-0 flex items-center pl-3"><LogInIcon className="h-5 w-5 text-amber-500 group-hover:text-amber-400" /></span>
                                Sign in
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }
    
    const renderPageContent = () => {
        switch(currentPage) {
            case 'dashboard': return <h2 className="text-3xl font-bold text-white">Welcome, {user.email}!</h2>;
            case 'staff': return <StaffManagementPage auth={auth} db={db} staffList={staffList} departments={departments} />;
            case 'planning': return <PlanningPage staffList={staffList} />;
            case 'leave': return <h2 className="text-3xl font-bold text-white">Leave Management</h2>;
            case 'settings': return <SettingsPage />;
            default: return <h2 className="text-3xl font-bold text-white">Dashboard</h2>;
        }
    };

    const NavLink = ({ icon, label, page }) => (
        <button onClick={() => setCurrentPage(page)} className={`flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors ${currentPage === page ? 'bg-amber-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`}>
            {icon}
            <span className="ml-3">{label}</span>
        </button>
    );

    return (
        <div className="flex h-screen bg-gray-900 text-white font-sans">
            <aside className="w-64 bg-gray-800 flex flex-col p-4">
                 <div className="text-center py-4 mb-5 border-b border-gray-700">
                    <h1 className="text-2xl font-bold text-white">Da Moreno HR</h1>
                    <p className="text-sm text-amber-400 capitalize">{userRole} Portal</p>
                </div>
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
                     <div className="py-4 border-t border-gray-700 text-center">
                        <p className="text-sm text-gray-400 truncate">{user.email}</p>
                    </div>
                    <button onClick={handleLogout} className="flex items-center justify-center w-full px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700">
                        <LogOutIcon className="h-5 w-5"/>
                        <span className="ml-3 font-medium">Logout</span>
                    </button>
                </div>
            </aside>
            <main className="flex-1 p-10 overflow-auto">
                {renderPageContent()}
            </main>
        </div>
    );
}

