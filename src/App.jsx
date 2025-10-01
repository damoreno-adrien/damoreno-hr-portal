import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, onSnapshot, addDoc, serverTimestamp, setDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

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
const TrashIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>);

// --- Reusable Modal Component ---
const Modal = ({ isOpen, onClose, title, children }) => { /* ... code omitted ... */ };
// --- Add New Staff Form Component ---
const AddStaffForm = ({ auth, onClose, departments }) => { /* ... code omitted ... */ };
// --- Staff Profile View/Edit Component ---
const StaffProfileModal = ({ staff, db, onClose, departments }) => { /* ... code omitted ... */ };
// --- Staff Management Page Component ---
const StaffManagementPage = ({ auth, db, staffList, departments }) => { /* ... code omitted ... */ };
// --- Settings Page Component ---
const SettingsPage = ({ db, departments }) => { /* ... code omitted ... */ };

// --- Functional Planning Page Component with Week View ---
const PlanningPage = ({ staffList }) => {
    // Helper function to get the start of the week (Monday)
    const getStartOfWeek = (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        return new Date(d.setDate(diff));
    };

    const [startOfWeek, setStartOfWeek] = useState(getStartOfWeek(new Date()));

    const changeWeek = (offset) => {
        setStartOfWeek(prevDate => {
            const newDate = new Date(prevDate);
            newDate.setDate(newDate.getDate() + (7 * offset));
            return newDate;
        });
    };
    
    const days = Array.from({ length: 7 }).map((_, i) => {
        const date = new Date(startOfWeek);
        date.setDate(date.getDate() + i);
        return date;
    });

    const formatDate = (date) => {
        const isToday = new Date().toDateString() === date.toDateString();
        return (
            <div className={`text-center py-4 border-b-2 ${isToday ? 'border-amber-500' : 'border-gray-700'} border-r border-gray-700`}>
                <p className={`font-bold ${isToday ? 'text-amber-400' : 'text-white'}`}>{date.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                <p className={`text-2xl font-light ${isToday ? 'text-white' : 'text-gray-300'}`}>{date.getDate()}</p>
            </div>
        );
    };

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);

    const weekRangeString = `${startOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${endOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold text-white">Weekly Planner</h2>
                <div className="flex items-center space-x-4">
                    <button onClick={() => changeWeek(-1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors">
                        <ChevronLeftIcon className="h-6 w-6" />
                    </button>
                    <h3 className="text-xl font-semibold w-64 text-center">{weekRangeString}</h3>
                    <button onClick={() => changeWeek(1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors">
                        <ChevronRightIcon className="h-6 w-6" />
                    </button>
                </div>
            </div>

            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <div className="min-w-[1200px]">
                    <div className="grid grid-cols-[200px_repeat(7,1fr)]">
                        {/* Header Row */}
                        <div className="px-4 py-3 font-medium text-white border-b-2 border-r border-gray-700 flex items-center">STAFF</div>
                        {days.map(day => (
                            <div key={day.toISOString()}>
                                {formatDate(day)}
                            </div>
                        ))}

                        {/* Staff Rows */}
                        {staffList.map(staff => (
                            <div key={staff.id} className="grid grid-cols-subgrid col-span-8 border-t border-gray-700">
                                <div className="px-4 py-3 font-medium text-white border-r border-gray-700 h-16 flex items-center">
                                    {staff.fullName}
                                </div>
                                {/* Shift Cells */}
                                {days.map(day => (
                                    <div key={day.toISOString()} className="border-r border-gray-700 h-16 flex items-center justify-center">
                                        {/* Placeholder for shift info */}
                                        <button className="text-gray-500 hover:text-white transition-colors">
                                            <PlusIcon className="h-6 w-6"/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};


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
    const [departments, setDepartments] = useState([]);

    useEffect(() => {
        try {
            // FIX: This logic now correctly handles both Vercel and local preview environments.
            const firebaseConfigString = typeof import.meta.env !== 'undefined'
                ? import.meta.env.VITE_FIREBASE_CONFIG
                : (typeof __firebase_config__ !== 'undefined' ? __firebase_config__ : '{}');
            
            const firebaseConfig = JSON.parse(firebaseConfigString);

            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            
            setAuth(authInstance);
            setDb(dbInstance);

            const unsubscribeAuth = onAuthStateChanged(authInstance, async (currentUser) => {
                if (currentUser) {
                    const userDocRef = doc(dbInstance, 'users', currentUser.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    setUser(currentUser);
                    setUserRole(userDocSnap.exists() ? userDocSnap.data().role : null);
                } else {
                    setUser(null);
                    setUserRole(null);
                }
                setIsLoading(false);
            });
            return () => unsubscribeAuth();
        } catch (error) {
            console.error("Firebase Initialization Error:", error);
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!db) return;
        const configDocRef = doc(db, 'settings', 'company_config');
        const unsubscribeSettings = onSnapshot(configDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setDepartments(docSnap.data().departments || []);
            } else {
                const defaultConfig = { departments: ["Management", "Service", "Kitchen", "Pizza Department"] };
                setDoc(configDocRef, defaultConfig);
            }
        });
        
        return () => unsubscribeSettings();
    }, [db]);


    useEffect(() => {
        if (userRole === 'manager' && db) {
            const staffCollectionRef = collection(db, 'staff_profiles');
            const unsubscribeStaff = onSnapshot(staffCollectionRef, (querySnapshot) => {
                const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setStaffList(list);
            }, (error) => console.error("Error fetching staff list:", error));
            return () => unsubscribeStaff();
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
                         <div className="rounded-md shadow-sm">
                            <div>
                                <input id="email-address" name="email" type="email" autoComplete="email" required className="w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
                            </div>
                            <div className="-mt-px">
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
            case 'settings': return <SettingsPage db={db} departments={departments} />;
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
                    <button onClick={() => auth && signOut(auth)} className="flex items-center justify-center w-full px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700">
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

