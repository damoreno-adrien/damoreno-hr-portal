import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { getFunctions } from "firebase/functions";
import useAuth from './hooks/useAuth';
import useCompanyConfig from './hooks/useCompanyConfig';

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
import FinancialsPage from './pages/FinancialsPage';
import SalaryAdvancePage from './pages/SalaryAdvancePage';
import FinancialsDashboardPage from './pages/FinancialsDashboardPage';
import MyPayslipsPage from './pages/MyPayslipsPage';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';

const HamburgerIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>);

export default function App() {
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [loginError, setLoginError] = useState('');
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [staffList, setStaffList] = useState([]);
    const [staffProfile, setStaffProfile] = useState(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [leaveBalances, setLeaveBalances] = useState({ annual: 0, publicHoliday: 0 });

    const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
    const [unreadLeaveUpdatesCount, setUnreadLeaveUpdatesCount] = useState(0);
    const [pendingAdvanceCount, setPendingAdvanceCount] = useState(0);
    const [unreadAdvanceUpdatesCount, setUnreadAdvanceUpdatesCount] = useState(0);
    const [isFinancialsMenuOpen, setIsFinancialsMenuOpen] = useState(false);
    const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);

    const { user, userRole, isLoading: isAuthLoading } = useAuth(auth, db);
    const companyConfig = useCompanyConfig(db);

    useEffect(() => {
        try {
            const firebaseConfigString = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_FIREBASE_CONFIG : (typeof __firebase_config__ !== 'undefined' ? __firebase_config__ : '{}');
            const firebaseConfig = JSON.parse(firebaseConfigString);
            if (!firebaseConfig.apiKey) {
                 console.error("Firebase config is missing or invalid!");
                 return;
            }
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            getFunctions(app);
            setAuth(authInstance);
            setDb(dbInstance);
        } catch (error) {
            console.error("Firebase Initialization Error:", error);
        }
    }, []);

    useEffect(() => {
        if (userRole === 'staff' && db && user) {
            const staffProfileRef = doc(db, 'staff_profiles', user.uid);
            const unsubscribe = onSnapshot(staffProfileRef, (staffProfileSnap) => {
                if (staffProfileSnap.exists()) {
                    setStaffProfile({ id: staffProfileSnap.id, ...staffProfileSnap.data() });
                }
            });
            return () => unsubscribe();
        } else {
            setStaffProfile(null);
        }
    }, [db, user, userRole]);


    useEffect(() => {
        if (!db) return;
        if (userRole === 'manager') {
            const q = query(collection(db, 'leave_requests'), where('status', '==', 'pending'));
            const unsubscribe = onSnapshot(q, (snap) => setPendingLeaveCount(snap.size));
            return () => unsubscribe();
        }
        if (userRole === 'staff' && user) {
            const q = query(collection(db, 'leave_requests'), where('staffId', '==', user.uid), where('isReadByStaff', '==', false));
            const unsubscribe = onSnapshot(q, (snap) => setUnreadLeaveUpdatesCount(snap.size));
            return () => unsubscribe();
        }
    }, [userRole, db, user]);

    useEffect(() => {
        if (!db) return;
        if (userRole === 'manager') {
            const q = query(collection(db, 'salary_advances'), where('status', '==', 'pending'));
            const unsubscribe = onSnapshot(q, (snap) => setPendingAdvanceCount(snap.size));
            return () => unsubscribe();
        }
        if (userRole === 'staff' && user) {
            const q = query(collection(db, 'salary_advances'), where('staffId', '==', user.uid), where('isReadByStaff', '==', false));
            const unsubscribe = onSnapshot(q, (snap) => setUnreadAdvanceUpdatesCount(snap.size));
            return () => unsubscribe();
        }
    }, [userRole, db, user]);

    useEffect(() => {
        if (db && user) {
            const staffCollectionRef = collection(db, 'staff_profiles');
            const unsubscribeStaff = onSnapshot(staffCollectionRef, (querySnapshot) => {
                const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setStaffList(list);
            });
            return () => unsubscribeStaff();
        } else {
            setStaffList([]);
        }
    }, [db, user]);

    useEffect(() => {
        if (userRole === 'staff' && db && user && companyConfig && staffProfile) {
            const currentYear = new Date().getFullYear();
            const q = query(collection(db, 'leave_requests'), where('staffId', '==', user.uid), where('status', 'in', ['approved', 'pending']), where('startDate', '>=', `${currentYear}-01-01`));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const today = new Date();
                const hireDate = new Date(staffProfile.startDate);
                const yearsOfService = (today - hireDate) / (1000 * 60 * 60 * 24 * 365);
                let annualLeaveEntitlement = 0;
                if (yearsOfService >= 1) { annualLeaveEntitlement = companyConfig.annualLeaveDays; }
                else if (hireDate.getFullYear() === currentYear) { const monthsWorked = 12 - hireDate.getMonth(); annualLeaveEntitlement = Math.floor((companyConfig.annualLeaveDays / 12) * monthsWorked); }
                const pastHolidays = companyConfig.publicHolidays.filter(h => new Date(h.date) < today && new Date(h.date).getFullYear() === currentYear);
                const earnedCredits = Math.min(pastHolidays.length, companyConfig.publicHolidayCreditCap);
                let usedAnnual = 0, usedPublicHoliday = 0;
                snapshot.docs.forEach(doc => {
                    const leave = doc.data();
                    if (leave.leaveType === 'Annual Leave') usedAnnual += leave.totalDays;
                    if (leave.leaveType === 'Public Holiday (In Lieu)') usedPublicHoliday += leave.totalDays;
                });
                setLeaveBalances({ annual: annualLeaveEntitlement - usedAnnual, publicHoliday: earnedCredits - usedPublicHoliday });
            });
            return () => unsubscribe();
        } else { setLeaveBalances({ annual: 0, publicHoliday: 0 }); }
    }, [db, user, userRole, companyConfig, staffProfile]);

    const handleLogin = async (email, password) => {
        setLoginError('');
        if (!auth) return;
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            setLoginError('Invalid email or password. Please try again.');
        }
    };
    const handleLogout = async () => { if (!auth) return; await signOut(auth); setCurrentPage('dashboard'); };

    const isLoading = isAuthLoading || companyConfig === null;
    if (isLoading) { return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white"><div className="text-xl">Loading Da Moreno HR Portal...</div></div>; }
    
    if (!user) {
        return (
            <LoginPage 
                handleLogin={handleLogin}
                loginError={loginError}
            />
        );
    }

    const renderPageContent = () => {
        if (currentPage === 'dashboard') {
            if (userRole === 'manager') return <AttendancePage db={db} staffList={staffList} />;
            if (userRole === 'staff') return <DashboardPage db={db} user={user} companyConfig={companyConfig} leaveBalances={leaveBalances} staffList={staffList} />;
        }
        switch(currentPage) {
            case 'staff': return <StaffManagementPage auth={auth} db={db} staffList={staffList} departments={companyConfig?.departments || []} userRole={userRole} />;
            case 'planning': return userRole === 'manager' ? <PlanningPage db={db} staffList={staffList} userRole={userRole} departments={companyConfig?.departments || []} /> : <MySchedulePage db={db} user={user} />;
            case 'team-schedule': return <TeamSchedulePage db={db} user={user} />;
            case 'leave': return <LeaveManagementPage db={db} user={user} userRole={userRole} staffList={staffList} companyConfig={companyConfig} leaveBalances={leaveBalances} />;
            case 'salary-advance': return <SalaryAdvancePage db={db} user={user} />;
            case 'financials-dashboard': return <FinancialsDashboardPage companyConfig={companyConfig} />;
            case 'my-payslips': return <MyPayslipsPage db={db} user={user} companyConfig={companyConfig} />;
            case 'reports': return <AttendanceReportsPage db={db} staffList={staffList} />;
            case 'financials': return <FinancialsPage db={db} staffList={staffList} />;
            case 'payroll': return <PayrollPage db={db} staffList={staffList} companyConfig={companyConfig} />;
            case 'settings': return <SettingsPage db={db} companyConfig={companyConfig} />;
            default: return <h2 className="text-3xl font-bold text-white">Dashboard</h2>;
        }
    };

    return (
        <div className="relative min-h-screen md:h-screen bg-gray-900 text-white font-sans md:flex md:overflow-hidden">
            {isMobileMenuOpen && ( <div onClick={() => setIsMobileMenuOpen(false)} className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden" aria-hidden="true"></div> )}
            
            <Sidebar 
                user={user}
                userRole={userRole}
                handleLogout={handleLogout}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                isMobileMenuOpen={isMobileMenuOpen}
                setIsMobileMenuOpen={setIsMobileMenuOpen}
                isSidebarCollapsed={isSidebarCollapsed}
                setIsSidebarCollapsed={setIsSidebarCollapsed}
                pendingLeaveCount={pendingLeaveCount}
                pendingAdvanceCount={pendingAdvanceCount}
                unreadLeaveUpdatesCount={unreadLeaveUpdatesCount}
                unreadAdvanceUpdatesCount={unreadAdvanceUpdatesCount}
                isFinancialsMenuOpen={isFinancialsMenuOpen}
                setIsFinancialsMenuOpen={setIsFinancialsMenuOpen}
                isSettingsMenuOpen={isSettingsMenuOpen}
                setIsSettingsMenuOpen={setIsSettingsMenuOpen}
            />

            <div className="flex-1 flex flex-col md:overflow-hidden">
                <header className="md:hidden bg-gray-800 p-4 shadow-md flex justify-between items-center sticky top-0 z-10">
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