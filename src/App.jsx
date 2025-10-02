import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, onSnapshot, setDoc } from 'firebase/firestore';

// Import Pages
import StaffManagementPage from './pages/StaffManagementPage';
import PlanningPage from './pages/PlanningPage';
import LeaveManagementPage from './pages/LeaveManagementPage';
import SettingsPage from './pages/SettingsPage';
import AttendancePage from './pages/AttendancePage';

// Import Icons
import { UserIcon, BriefcaseIcon, CalendarIcon, SendIcon, SettingsIcon, LogOutIcon, LogInIcon } from './components/Icons';

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
            const firebaseConfigString = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_FIREBASE_CONFIG : (typeof __firebase_config__ !== 'undefined' ? __firebase_config__ : '{}');
            const firebaseConfig = JSON.parse(firebaseConfigString);
            
            if (!firebaseConfig.apiKey) {
                 console.error("Firebase config is missing or invalid!");
                 setIsLoading(false);
                 return;
            }

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
            case 'dashboard': return <AttendancePage db={db} staffList={staffList} />;
            case 'staff': return <StaffManagementPage auth={auth} db={db} staffList={staffList} departments={departments} />;
            case 'planning': return <PlanningPage db={db} staffList={staffList} />;
            case 'leave': return <LeaveManagementPage db={db} user={user} userRole={userRole} />;
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

