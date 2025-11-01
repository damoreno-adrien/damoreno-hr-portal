import React from 'react';
// --- This is the new import line ---
import { 
    User, Users, Briefcase, Calendar, Send, Settings, LogOut, 
    BarChart, DollarSign, X, ChevronLeft, ChevronRight, 
    ChevronDown, ChevronUp 
} from 'lucide-react';

const settingsSections = [
    { id: 'company-info', title: 'Company Information' },
    { id: 'attendance-bonus', title: 'Attendance Bonus' },
    { id: 'financial-rules', title: 'Financial & Payroll Rules' },
    { id: 'leave-entitlements', title: 'Leave Entitlements' },
    { id: 'public-holidays', title: 'Public Holidays' },
    { id: 'geofence-config', title: 'Geofence Configuration' },
    { id: 'manage-departments', title: 'Manage Departments' },
];

const NavLink = ({ icon, label, page, badgeCount, isSidebarCollapsed, setCurrentPage, setIsMobileMenuOpen, currentPage }) => (
    <button onClick={() => { setCurrentPage(page); setIsMobileMenuOpen(false); }} className={`flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors ${currentPage === page ? 'bg-amber-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`}>
        <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center w-full' : ''}`}>
            {icon}
            <span className={`ml-3 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'hidden' : 'inline'}`}>{label}</span>
        </div>
        {!isSidebarCollapsed && badgeCount > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{badgeCount}</span>
        )}
    </button>
);

export default function Sidebar({
    user, userRole, handleLogout, currentPage, setCurrentPage,
    isMobileMenuOpen, setIsMobileMenuOpen, isSidebarCollapsed, setIsSidebarCollapsed,
    pendingLeaveCount, pendingAdvanceCount, unreadLeaveUpdatesCount, unreadAdvanceUpdatesCount,
    isFinancialsMenuOpen, setIsFinancialsMenuOpen, isSettingsMenuOpen, setIsSettingsMenuOpen
}) {
    const handleSettingsClick = () => {
        if (isSidebarCollapsed) {
            setIsSidebarCollapsed(false); 
            setIsSettingsMenuOpen(true);  
        } else {
            setIsSettingsMenuOpen(!isSettingsMenuOpen); 
        }
    };

    return (
        <aside className={`fixed inset-y-0 left-0 bg-gray-800 flex flex-col transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-all duration-300 ease-in-out z-30 ${isSidebarCollapsed ? 'w-24' : 'w-64'}`}>
            <div className="flex justify-between items-center text-center py-4 mb-5 border-b border-gray-700 px-4">
                <div className={`overflow-hidden ${isSidebarCollapsed ? 'hidden' : 'inline'}`}>
                    <h1 className="text-2xl font-bold text-white whitespace-nowrap">Da Moreno HR</h1>
                    <p className="text-sm text-amber-400 capitalize">{userRole} Portal</p>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-1 text-gray-400 hover:text-white">
                    <X className="h-6 w-6" />
                </button>
            </div>
            <nav className="flex-1 space-y-2 px-4 overflow-y-auto">
                {userRole === 'manager' && (
                    <>
                        <NavLink page="dashboard" label="Dashboard" icon={<User className="h-5 w-5" />} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />
                        <NavLink page="staff" label="Manage Staff" icon={<Briefcase className="h-5 w-5" />} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />
                        <NavLink page="planning" label="Planning" icon={<Calendar className="h-5 w-5" />} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />
                        <NavLink page="leave" label="Leave Management" icon={<Send className="h-5 w-5" />} badgeCount={pendingLeaveCount} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />
                        <NavLink page="reports" label="Reports" icon={<BarChart className="h-5 w-5" />} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />
                        <NavLink page="financials" label="Financials" icon={<DollarSign className="h-5 w-5" />} badgeCount={pendingAdvanceCount} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />
                        <NavLink page="payroll" label="Payroll" icon={<DollarSign className="h-5 w-5" />} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />

                        <div>
                            <button
                                onClick={handleSettingsClick}
                                className={`flex items-center justify-between w-full px-4 py-3 text-left rounded-lg transition-colors ${currentPage === 'settings' ? 'bg-amber-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
                            >
                                <div className="flex items-center">
                                    <Settings className="h-5 w-5" />
                                    <span className={`ml-3 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'hidden' : 'inline'}`}>Settings</span>
                                </div>
                                {!isSidebarCollapsed && ((isSettingsMenuOpen || currentPage === 'settings') ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />)}
                            </button>
                            {(isSettingsMenuOpen || currentPage === 'settings') && !isSidebarCollapsed && (
                                <div className="py-2 pl-8 space-y-1">
                                    {settingsSections.map(section => (
                                        <a
                                            key={section.id}
                                            href={`#${section.id}`}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setCurrentPage('settings');
                                                setIsMobileMenuOpen(false);
                                                setTimeout(() => {
                                                    document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' });
                                                }, 50);
                                            }}
                                            className="block text-sm text-gray-400 hover:text-white p-2 rounded-lg"
                                        >
                                            {section.title}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
                {userRole === 'staff' && (
                    <>
                        <NavLink page="dashboard" label="My Dashboard" icon={<User className="h-5 w-5" />} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />
                        <NavLink page="my-profile" label="My Profile" icon={<Briefcase className="h-5 w-5" />} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />
                        <NavLink page="planning" label="My Schedule" icon={<Calendar className="h-5 w-5" />} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />
                        <NavLink page="team-schedule" label="Team Schedule" icon={<Users className="h-5 w-5" />} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />
                        <NavLink page="leave" label="My Leave" icon={<Send className="h-5 w-5" />} badgeCount={unreadLeaveUpdatesCount} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />

                        <div>
                            <button
                                onClick={() => setIsFinancialsMenuOpen(!isFinancialsMenuOpen)}
                                className="flex items-center justify-between w-full px-4 py-3 text-left rounded-lg hover:bg-gray-700 text-gray-300"
                            >
                                <div className="flex items-center">
                                    <DollarSign className="h-5 w-5" />
                                    <span className={`ml-3 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'hidden' : 'inline'}`}>Financials</span>
                                </div>
                                {!isSidebarCollapsed && ((isFinancialsMenuOpen || ['financials-dashboard', 'salary-advance', 'my-payslips'].includes(currentPage)) ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />)}
                            </button>
                            {(isFinancialsMenuOpen || ['financials-dashboard', 'salary-advance', 'my-payslips'].includes(currentPage)) && !isSidebarCollapsed && (
                                <div className="py-2 pl-8 space-y-2">
                                    <NavLink page="financials-dashboard" label="Dashboard" icon={<BarChart className="h-5 w-5" />} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />
                                    <NavLink page="salary-advance" label="Salary Advance" icon={<Send className="h-5 w-5" />} badgeCount={unreadAdvanceUpdatesCount} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />
                                    <NavLink page="my-payslips" label="My Payslips" icon={<Briefcase className="h-5 w-5" />} {...{ currentPage, setCurrentPage, setIsMobileMenuOpen, isSidebarCollapsed }} />
                                </div>
                            )}
                        </div>
                    </>
                )}
            </nav>
            <div className="mt-auto p-4">
                <div className={`py-4 border-t border-gray-700 text-center ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
                    <p className="text-sm text-gray-400 truncate">{user.email}</p>
                </div>
                <button onClick={handleLogout} className={`flex items-center justify-center w-full px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700`}>
                    <LogOut className="h-5 w-5" />
                    <span className={`ml-3 font-medium ${isSidebarCollapsed ? 'hidden' : 'inline'}`}>Logout</span>
                </button>
                <div className="hidden md:block border-t border-gray-700 mt-4 pt-4">
                    <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="flex items-center justify-center w-full py-2 text-gray-400 hover:bg-gray-700 rounded-lg">
                        {isSidebarCollapsed ? <ChevronRight className="h-6 w-6" /> : <ChevronLeft className="h-6 w-6" />}
                    </button>
                </div>
            </div>
        </aside>
    );
}