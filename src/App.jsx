// src/App.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { app, auth, db } from '../firebase';
import useAuth from './hooks/useAuth';

import useCompanyConfig from './hooks/useCompanyConfig';
import useStaffList from './hooks/useStaffList';
import { calculateStaffLeaveBalances } from './utils/leaveCalculator';

import StaffManagementPage from './pages/StaffManagementPage';
import PlanningPage from './pages/PlanningPage';
import SettingsPage from './pages/SettingsPage';
import TeamLeaveManagementPage from './pages/TeamLeaveManagementPage';
import MyLeavePage from './pages/MyLeavePage';
import AttendancePage from './pages/AttendancePage';
import StaffDashboardPage from './pages/StaffDashboardPage';
import AttendanceReportsPage from './pages/AttendanceReportsPage';
import MySchedulePage from './pages/MySchedulePage';
import TeamSchedulePage from './pages/TeamSchedulePage';
import PayrollPage from './pages/PayrollPage';
import FinancialsPage from './pages/FinancialsPage';
import SalaryAdvancePage from './pages/SalaryAdvancePage';
import FinancialsDashboardPage from './pages/FinancialsDashboardPage';
import MyPayslipsPage from './pages/MyPayslipsPage';
import MyProfilePage from './pages/MyProfilePage';
import Sidebar from './components/common/Sidebar';
import LoginPage from './pages/LoginPage';

const HamburgerIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>);

export default function App() {
    const [loginError, setLoginError] = useState('');
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [staffProfile, setStaffProfile] = useState(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    // --- Global Branch State ---
    const [activeBranch, setActiveBranch] = useState('global');
    
    // --- Active View State ---
    const [activeRole, setActiveRole] = useState(null);

    const [leaveBalances, setLeaveBalances] = useState({ annual: 0, publicHoliday: 0, personal: 0 });
    const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
    const [unreadLeaveUpdatesCount, setUnreadLeaveUpdatesCount] = useState(0);
    const [pendingAdvanceCount, setPendingAdvanceCount] = useState(0);
    const [unreadAdvanceUpdatesCount, setUnreadAdvanceUpdatesCount] = useState(0);
    const [isFinancialsMenuOpen, setIsFinancialsMenuOpen] = useState(false);
    const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);

    const { user, userRole, hasStaffProfile, isLoading: isAuthLoading } = useAuth(auth, db);
    const companyConfig = useCompanyConfig(db, user);
    const staffList = useStaffList(db, user);

    useEffect(() => {
        if (userRole && !activeRole) {
            setActiveRole(userRole === 'staff' ? 'staff' : 'manager');
        }
    }, [userRole, activeRole]);

    useEffect(() => {
        if (hasStaffProfile && db && user) {
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
    }, [db, user, hasStaffProfile]);

    // --- THE MASTER FIX: Resolve the Branch Config at the Top Level! ---
    const resolvedConfig = useMemo(() => {
        if (!companyConfig) return null;
        
        let effectiveBranch = 'global';
        
        // If viewing as staff, force their native branch config so their Geofence works!
        if (activeRole === 'staff') {
            effectiveBranch = staffProfile?.branchId || 'global';
        } else {
            effectiveBranch = activeBranch;
        }
        
        if (!effectiveBranch || effectiveBranch === 'global') return companyConfig;

        const branchOverrides = companyConfig.branchSettings?.[effectiveBranch] || {};
        
        return {
            ...companyConfig,
            ...branchOverrides,
            attendanceBonus: branchOverrides.attendanceBonus || companyConfig.attendanceBonus || {},
            disciplinaryRules: branchOverrides.disciplinaryRules || companyConfig.disciplinaryRules || {},
            geofence: branchOverrides.geofence || companyConfig.geofence || {},
            financialRules: branchOverrides.financialRules || companyConfig.financialRules || {},
            departments: branchOverrides.departments || companyConfig.departments || [],
            publicHolidays: branchOverrides.publicHolidays || companyConfig.publicHolidays || []
        };
    }, [companyConfig, activeBranch, activeRole, staffProfile]);

    // --- MULTI-BRANCH FIX: Leave Requests Badge ---
    useEffect(() => {
        if (!db) return;
        if (['manager', 'admin', 'dept_manager', 'super_admin'].includes(userRole)) {
            // Apply branch filter if not looking at Global
            let q = query(collection(db, 'leave_requests'), where('status', '==', 'pending'));
            if (activeBranch && activeBranch !== 'global') {
                q = query(collection(db, 'leave_requests'), where('status', '==', 'pending'), where('branchId', '==', activeBranch));
            }
            const unsubscribe = onSnapshot(q, (snap) => setPendingLeaveCount(snap.size));
            return () => unsubscribe();
        }
        if (['staff', 'dept_manager', 'manager', 'admin', 'super_admin'].includes(userRole) && user) {
            const q = query(collection(db, 'leave_requests'), where('staffId', '==', user.uid), where('isReadByStaff', '==', false));
            const unsubscribe = onSnapshot(q, (snap) => setUnreadLeaveUpdatesCount(snap.size));
            return () => unsubscribe();
        }
    }, [userRole, db, user, activeBranch]); // <-- Added activeBranch dependency

    // --- MULTI-BRANCH FIX: Financials Badge ---
    useEffect(() => {
        if (!db) return;
        if (['manager', 'admin', 'super_admin'].includes(userRole)) {
            // Apply branch filter if not looking at Global
            let q = query(collection(db, 'salary_advances'), where('status', '==', 'pending'));
            if (activeBranch && activeBranch !== 'global') {
                q = query(collection(db, 'salary_advances'), where('status', '==', 'pending'), where('branchId', '==', activeBranch));
            }
            const unsubscribe = onSnapshot(q, (snap) => setPendingAdvanceCount(snap.size));
            return () => unsubscribe();
        }
        if (['staff', 'dept_manager', 'manager', 'admin', 'super_admin'].includes(userRole) && user) {
            const q = query(collection(db, 'salary_advances'), where('staffId', '==', user.uid), where('isReadByStaff', '==', false));
            const unsubscribe = onSnapshot(q, (snap) => setUnreadAdvanceUpdatesCount(snap.size));
            return () => unsubscribe();
        }
    }, [userRole, db, user, activeBranch]); // <-- Added activeBranch dependency

    useEffect(() => {
        // --- Using resolvedConfig to calculate accurate branch-specific holiday payouts ---
        if (hasStaffProfile && db && user && resolvedConfig && staffProfile) {
            const q = query(
                collection(db, 'leave_requests'),
                where('staffId', '==', user.uid),
                where('status', 'in', ['approved', 'pending'])
            );
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const requests = snapshot.docs.map(doc => doc.data());
                const balances = calculateStaffLeaveBalances(staffProfile, requests, resolvedConfig);
                if (balances) {
                    setLeaveBalances({ annual: balances.annual.remaining, publicHoliday: balances.ph.remaining, personal: balances.personal.remaining });
                }
            });
            return () => unsubscribe();
        } else {
            setLeaveBalances({ annual: 0, publicHoliday: 0, personal: 0 });
        }
    }, [db, user, hasStaffProfile, resolvedConfig, staffProfile]);

    const handleLogin = async (email, password) => {
        setLoginError('');
        if (!auth) return;
        try { await signInWithEmailAndPassword(auth, email, password); }
        catch (error) { setLoginError('Invalid email or password. Please try again.'); }
    };

    const handleLogout = async () => {
        if (!auth) return;
        await signOut(auth);
        setCurrentPage('dashboard');
        setActiveRole(null);
    };

    const isLoading = !auth || !db || isAuthLoading || (user && companyConfig === null) || (userRole && !activeRole);
    if (isLoading) { return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white"><div className="text-xl">Loading Da Moreno HR Portal...</div></div>; }
    if (!user) { return <LoginPage handleLogin={handleLogin} loginError={loginError} />; }

    const renderPageContent = () => {
        if (currentPage === 'dashboard') {
            if (activeRole === 'manager') {
                return <AttendancePage db={db} staffList={staffList} userRole={userRole} staffProfile={staffProfile} activeBranch={activeBranch} />;
            }
            if (activeRole === 'staff') {
                // Safely passing the resolved Branch Config down to fix the Geofence error!
                return <StaffDashboardPage db={db} user={user} companyConfig={resolvedConfig} leaveBalances={leaveBalances} staffList={staffList} setCurrentPage={setCurrentPage} />;
            }
        }

        const requireFullManager = (Component) => {
            if (!['admin', 'super_admin', 'manager'].includes(userRole)) {
                return (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <h2 className="text-4xl font-bold text-red-500 mb-4">Access Denied</h2>
                        <p className="text-gray-400">Your security clearance does not permit access to this sector.</p>
                    </div>
                );
            }
            return Component;
        };

        const requireDeptManager = (Component) => {
            if (!['admin', 'super_admin', 'manager', 'dept_manager'].includes(userRole)) {
                return (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <h2 className="text-4xl font-bold text-red-500 mb-4">Access Denied</h2>
                        <p className="text-gray-400">You do not have permission to view this page.</p>
                    </div>
                );
            }
            return Component;
        };

        switch (currentPage) {
            case 'planning': return activeRole === 'manager' ? requireDeptManager(<PlanningPage db={db} staffList={staffList} userRole={userRole} staffProfile={staffProfile} companyConfig={resolvedConfig} activeBranch={activeBranch} />) : <MySchedulePage db={db} user={user} companyConfig={resolvedConfig} />;
            case 'leave': return activeRole === 'manager' ? requireDeptManager(<TeamLeaveManagementPage db={db} user={user} userRole={userRole} staffList={staffList} companyConfig={resolvedConfig} activeBranch={activeBranch} />) : <MyLeavePage db={db} user={user} userRole={userRole} staffList={staffList} companyConfig={resolvedConfig} leaveBalances={leaveBalances} />;
            case 'my-profile': return <MyProfilePage staffProfile={staffProfile} />;
            case 'team-schedule': return <TeamSchedulePage db={db} user={user} companyConfig={resolvedConfig} />;
            case 'salary-advance': return <SalaryAdvancePage db={db} user={user} companyConfig={resolvedConfig} />;
            case 'financials-dashboard': return <FinancialsDashboardPage db={db} user={user} companyConfig={resolvedConfig} />;
            case 'my-payslips': return <MyPayslipsPage db={db} user={user} companyConfig={resolvedConfig} />;

            case 'staff': return requireFullManager(<StaffManagementPage auth={auth} db={db} staffList={staffList} departments={companyConfig?.departments || []} userRole={userRole} companyConfig={resolvedConfig} activeBranch={activeBranch} staffProfile={staffProfile} />);
            case 'reports': return requireFullManager(<AttendanceReportsPage db={db} staffList={staffList} activeBranch={activeBranch} userRole={userRole} />);
            case 'financials': return requireFullManager(<FinancialsPage db={db} staffList={staffList} activeBranch={activeBranch} userRole={userRole} />);
            case 'payroll': return requireFullManager(<PayrollPage db={db} staffList={staffList} companyConfig={resolvedConfig} activeBranch={activeBranch} />);
            
            // Settings needs the RAW config to save things safely, so we pass companyConfig here.
            case 'settings': return requireFullManager(<SettingsPage db={db} companyConfig={companyConfig} userRole={userRole} activeBranch={activeBranch} />);

            default: return <h2 className="text-3xl font-bold text-white">Dashboard</h2>;
        }
    };

    return (
        <div className="relative min-h-screen md:h-screen bg-gray-900 text-white font-sans md:flex md:overflow-hidden">
            {isMobileMenuOpen && (<div onClick={() => setIsMobileMenuOpen(false)} className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden" aria-hidden="true"></div>)}

            <Sidebar
                user={user}
                userRole={userRole}
                activeRole={activeRole}
                setActiveRole={setActiveRole}
                hasStaffProfile={hasStaffProfile}
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
                
                activeBranch={activeBranch}
                setActiveBranch={setActiveBranch}
                companyConfig={companyConfig}
            />

            <div className="flex-1 flex flex-col md:overflow-hidden">
                <header className="md:hidden bg-gray-800 p-4 shadow-md flex justify-between items-center sticky top-0 z-10">
                    <button onClick={() => setIsMobileMenuOpen(true)} className="text-gray-300 hover:text-white"><HamburgerIcon className="h-6 w-6" /></button>
                    <h1 className="text-lg font-bold text-white">Da Moreno HR</h1>
                </header>
                <main className="flex-1 p-6 md:p-10 overflow-auto">
                    {renderPageContent()}
                </main>
            </div>
        </div>
    );
}