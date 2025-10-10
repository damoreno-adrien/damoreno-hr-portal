import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, onSnapshot, setDoc, query, where } from 'firebase/firestore';
import { getFunctions } from "firebase/functions";

import StaffManagementPage from './pages/StaffManagementPage';
import PlanningPage from './pages/PlanningPage';
import LeaveManagementPage from './pages/LeaveManagementPage';
import SettingsPage from './pages/SettingsPage';
import AttendancePage from './pages/AttendancePage';
import DashboardPage from './pages/DashboardPage';
import AttendanceReportsPage from './pages/AttendanceReportsPage';
import MySchedulePage from './pages/MySchedulePage';
import TeamSchedulePage from './pages/TeamSchedulePage';
import PayrollPage from './pages/PayrollPage';
import FinancialsPage from './pages/FinancialsPage'; // 1. IMPORT THE NEW PAGE
import { UserIcon, UsersIcon, BriefcaseIcon, CalendarIcon, SendIcon, SettingsIcon, LogOutIcon, LogInIcon, BarChartIcon, DollarSignIcon, XIcon, ChevronLeftIcon, ChevronRightIcon } from './components/Icons';

const HamburgerIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>);

export default function App() {
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [user, setUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loginError, setLoginError] = useState('');
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [staffList, setStaffList] = useState([]);
    const [staffProfile, setStaffProfile] = useState(null); 
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [companyConfig, setCompanyConfig] = useState(null);
    const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
    const [unreadLeaveUpdatesCount, setUnreadLeaveUpdatesCount] = useState(0);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [leaveBalances, setLeaveBalances] = useState({ annual: 0, publicHoliday: 0 });

    useEffect(() => {
        try {
            const firebaseConfigString = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_FIREBASE_CONFIG : (typeof __firebase_config__ !== 'undefined' ? __firebase_config__ : '{}');
            const firebaseConfig = JSON.parse(firebaseConfigString);
            if (!firebaseConfig.apiKey) {
                 console.error("Firebase config is missing or invalid!"); setIsLoading(false); return;
            }
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            getFunctions(app);
            setAuth(authInstance); setDb(dbInstance);
            const unsubscribeAuth = onAuthStateChanged(authInstance, async (currentUser) => {
                if (currentUser) {
                    const userDocRef = doc(dbInstance, 'users', currentUser.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    const role = userDocSnap.exists() ? userDocSnap.data().role : null;
                    setUser(currentUser); setUserRole(role);
                    if (role === 'staff') {
                        const staffProfileRef = doc(dbInstance, 'staff_profiles', currentUser.uid);
                        onSnapshot(staffProfileRef, (staffProfileSnap) => {
                            if (staffProfileSnap.exists()) {
                                setStaffProfile({ id: staffProfileSnap.id, ...staffProfileSnap.data() });
                            }
                        });
                    }
                } else {
                    setUser(null); setUserRole(null); setStaffProfile(null);
                }
                setIsLoading(false);
            });
            return () => unsubscribeAuth();
        } catch (error) {
            console.error("Firebase Initialization Error:", error); setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!db) return;
        const configDocRef = doc(db, 'settings', 'company_config');
        const unsubscribe = onSnapshot(configDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setCompanyConfig(docSnap.data());
            } else {
                const defaultConfig = { 
                    departments: ["Management", "Service", "Kitchen", "Pizza Department"],
                    paidSickDays: 30, paidPersonalDays: 3, annualLeaveDays: 6,
                    publicHolidays: [], publicHolidayCreditCap: 13,
                    geofence: { latitude: 7.88342, longitude: 98.3873, radius: 50 },
                    attendanceBonus: { month1: 400, month2: 800, month3: 1200, allowedAbsences: 0, allowedLates: 1 }
                };
                setDoc(configDocRef, defaultConfig);
                setCompanyConfig(defaultConfig);
            }
        });
        return () => unsubscribe();
    }, [db]);

    useEffect(() => {
        if (userRole === 'manager' && db) {
            const q = query(collection(db, 'leave_requests'), where('status', '==', 'pending'));
            const unsubscribe = onSnapshot(q, (querySnapshot) => setPendingRequestsCount(querySnapshot.size));
            return () => unsubscribe();
        } else { setPendingRequestsCount(0); }
    }, [userRole, db]);

    useEffect(() => {
        if (userRole === 'staff' && db && user) {
            const q = query(collection(db, 'leave_requests'), where('staffId', '==', user.uid), where('isReadByStaff', '==', false));
            const unsubscribe = onSnapshot(q, (querySnapshot) => setUnreadLeaveUpdatesCount(querySnapshot.size));
            return () => unsubscribe();
        } else { setUnreadLeaveUpdatesCount(0); }
    }, [userRole, user, db]);

    useEffect(() => {
        if (userRole === 'manager' && db) {
            const staffCollectionRef = collection(db, 'staff_profiles');
            const unsubscribeStaff = onSnapshot(staffCollectionRef, (querySnapshot) => {
                const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setStaffList(list);
            }, (error) => console.error("Error fetching staff list:", error));
            return () => unsubscribeStaff();
        } else { setStaffList([]); }
    }, [userRole, db]);

    useEffect(() => {
        if (userRole === 'staff' && db && user && companyConfig && staffProfile) {
            const currentYear = new Date().getFullYear();
            const q = query(
                collection(db, 'leave_requests'),
                where('staffId', '==', user.uid),
                where('status', 'in', ['approved', 'pending']),
                where('startDate', '>=', `${currentYear}-01-01`)
            );

            // Use onSnapshot for real-time updates
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const today = new Date();
                const hireDate = new Date(staffProfile.startDate);
                const yearsOfService = (today - hireDate) / (1000 * 60 * 60 * 24 * 365);
                let annualLeaveEntitlement = 0;
                if (yearsOfService >= 1) {
                    annualLeaveEntitlement = companyConfig.annualLeaveDays;
                } else if (hireDate.getFullYear() === currentYear) {
                    const monthsWorked = 12 - hireDate.getMonth();
                    annualLeaveEntitlement = Math.floor((companyConfig.annualLeaveDays / 12) * monthsWorked);
                }

                const pastHolidays = companyConfig.publicHolidays
                    .filter(h => new Date(h.date) < today && new Date(h.date).getFullYear() === currentYear);
                const earnedCredits = Math.min(pastHolidays.length, companyConfig.publicHolidayCreditCap);

                let usedAnnual = 0;
                let usedPublicHoliday = 0;
                snapshot.docs.forEach(doc => {
                    const leave = doc.data();
                    if (leave.leaveType === 'Annual Leave') usedAnnual += leave.totalDays;
                    if (leave.leaveType === 'Public Holiday (In Lieu)') usedPublicHoliday += leave.totalDays;
                });
                
                setLeaveBalances({
                    annual: annualLeaveEntitlement - usedAnnual,
                    publicHoliday: earnedCredits - usedPublicHoliday,
                });
            });

            return () => unsubscribe(); // Cleanup the listener

        } else {
            setLeaveBalances({ annual: 0, publicHoliday: 0 });
        }
    }, [db, user, userRole, companyConfig, staffProfile]);
    
    const handleLogin = async (e) => { e.preventDefault(); setLoginError(''); if (!auth) return; try { await signInWithEmailAndPassword(auth, email, password); } catch (error) { setLoginError('Invalid email or password. Please try again.'); } };
    const handleLogout = async () => { if (!auth) return; await signOut(auth); setCurrentPage('dashboard'); };
    
    if (isLoading) { return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white"><div className="text-xl">Loading Da Moreno HR Portal...</div></div>; }
    if (!user) { return ( <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900"><div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-lg dark:bg-gray-800"> <div className="text-center"> <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Da Moreno At Town</h1> <p className="mt-2 text-gray-600 dark:text-gray-300">HR Management Portal</p></div> <form className="mt-8 space-y-6" onSubmit={handleLogin}> <div className="rounded-md shadow-sm"> <div> <input id="email-address" name="email" type="email" autoComplete="email" required className="w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} /> </div> <div className="-mt-px"> <input id="password" name="password" type="password" autoComplete="current-password" required className="w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} /> </div></div> {loginError && (<p className="mt-2 text-center text-sm text-red-600 dark:text-red-400">{loginError}</p>)} <div> <button type="submit" className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"> <span className="absolute left-0 inset-y-0 flex items-center pl-3"><LogInIcon className="h-5 w-5 text-amber-500 group-hover:text-amber-400" /></span> Sign in </button> </div> </form> </div></div> ); }
    
    const renderPageContent = () => {
        if (currentPage === 'dashboard') {
            if (userRole === 'manager') return <AttendancePage db={db} staffList={staffList} />;
            if (userRole === 'staff') return <DashboardPage db={db} user={user} companyConfig={companyConfig} leaveBalances={leaveBalances} />;
        }
        switch(currentPage) {
            case 'staff': return <StaffManagementPage auth={auth} db={db} staffList={staffList} departments={companyConfig?.departments || []} userRole={userRole} />;
            case 'planning':
                if (userRole === 'manager') return <PlanningPage db={db} staffList={staffList} userRole={userRole} departments={companyConfig?.departments || []} />;
                if (userRole === 'staff') return <MySchedulePage db={db} user={user} />;
                return null;
            case 'team-schedule': return <TeamSchedulePage db={db} user={user} />;
            case 'leave': return <LeaveManagementPage db={db} user={user} userRole={userRole} staffList={staffList} companyConfig={companyConfig} leaveBalances={leaveBalances} />;
            case 'reports': return <AttendanceReportsPage db={db} staffList={staffList} />;
            case 'financials': return <FinancialsPage db={db} staffList={staffList} />; // 2. ADD PAGE TO RENDERER
            case 'payroll': return <PayrollPage db={db} staffList={staffList} companyConfig={companyConfig} />;
            case 'settings': return <SettingsPage db={db} companyConfig={companyConfig} />;
            default: return <h2 className="text-3xl font-bold text-white">Dashboard</h2>;
        }
    };
    
    const NavLink = ({ icon, label, page, badgeCount }) => (
        <button 
            onClick={() => { setCurrentPage(page); setIsMobileMenuOpen(false); }} 
            className={`flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors ${currentPage === page ? 'bg-amber-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
        >
            <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center w-full' : ''}`}>
                {icon}
                <span className={`ml-3 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'hidden' : 'inline'}`}>{label}</span>
            </div>
            {!isSidebarCollapsed && badgeCount > 0 && ( 
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {badgeCount}
                </span> 
            )}
        </button>
    );

    return (
        <div className="relative min-h-screen md:flex bg-gray-900 text-white font-sans">
            {isMobileMenuOpen && ( <div onClick={() => setIsMobileMenuOpen(false)} className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden" aria-hidden="true"></div> )}
            <aside className={`fixed inset-y-0 left-0 bg-gray-800 flex flex-col transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-all duration-300 ease-in-out z-30 ${isSidebarCollapsed ? 'w-24' : 'w-64'}`}>
                <div className="flex justify-between items-center text-center py-4 mb-5 border-b border-gray-700 px-4">
                    <div className={`overflow-hidden ${isSidebarCollapsed ? 'hidden' : 'inline'}`}>
                        <h1 className="text-2xl font-bold text-white whitespace-nowrap">Da Moreno HR</h1>
                        <p className="text-sm text-amber-400 capitalize">{userRole} Portal</p>
                    </div>
                    <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-1 text-gray-400 hover:text-white">
                        <XIcon className="h-6 w-6"/>
                    </button>
                </div>
                <nav className="flex-1 space-y-2 px-4">
                    {userRole === 'manager' && (
                        <>
                           <NavLink page="dashboard" label="Dashboard" icon={<UserIcon className="h-5 w-5"/>} />
                           <NavLink page="staff" label="Manage Staff" icon={<BriefcaseIcon className="h-5 w-5"/>} />
                           <NavLink page="planning" label="Planning" icon={<CalendarIcon className="h-5 w-5"/>} />
                           <NavLink page="leave" label="Leave Management" icon={<SendIcon className="h-5 w-5"/>} badgeCount={pendingRequestsCount} />
                           <NavLink page="reports" label="Reports" icon={<BarChartIcon className="h-5 w-5"/>} />
                           <NavLink page="financials" label="Financials" icon={<DollarSignIcon className="h-5 w-5"/>} />
                           <NavLink page="payroll" label="Payroll" icon={<DollarSignIcon className="h-5 w-5"/>} /> 
                           {/* 3. ADD NAVIGATION LINK */}
                           <NavLink page="settings" label="Settings" icon={<SettingsIcon className="h-5 w-5"/>} />
                        </>
                    )}
                     {userRole === 'staff' && (
                        <>
                           <NavLink page="dashboard" label="My Dashboard" icon={<UserIcon className="h-5 w-5"/>} />
                           <NavLink page="planning" label="My Schedule" icon={<CalendarIcon className="h-5 w-5"/>} />
                           <NavLink page="team-schedule" label="Team Schedule" icon={<UsersIcon className="h-5 w-5"/>} />
                           <NavLink page="leave" label="My Leave" icon={<SendIcon className="h-5 w-5"/>} badgeCount={unreadLeaveUpdatesCount} />
                        </>
                    )}
                </nav>
                <div className="mt-auto p-4">
                    <div className={`py-4 border-t border-gray-700 text-center ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
                        <p className="text-sm text-gray-400 truncate">{user.email}</p>
                    </div>
                    <button onClick={handleLogout} className={`flex items-center justify-center w-full px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700`}>
                        <LogOutIcon className="h-5 w-5"/>
                        <span className={`ml-3 font-medium ${isSidebarCollapsed ? 'hidden' : 'inline'}`}>Logout</span>
                    </button>
                    <div className="hidden md:block border-t border-gray-700 mt-4 pt-4">
                        <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="flex items-center justify-center w-full py-2 text-gray-400 hover:bg-gray-700 rounded-lg">
                            {isSidebarCollapsed ? <ChevronRightIcon className="h-6 w-6" /> : <ChevronLeftIcon className="h-6 w-6" />}
                        </button>
                    </div>
                </div>
            </aside>
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="md:hidden bg-gray-800 p-4 shadow-md flex justify-between items-center">
                    <button onClick={() => setIsMobileMenuOpen(true)} className="text-gray-300 hover:text-white">
                        <HamburgerIcon className="h-6 w-6" />
                    </button>
                    <h1 className="text-lg font-bold text-white">Da Moreno HR</h1>
                </header>
                <main className="flex-1 p-6 md:p-10 overflow-auto">
                    {renderPageContent()}
                </main>
            </div>
        </div>
    );
}