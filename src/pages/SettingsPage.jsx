/* src/pages/SettingsPage.jsx */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Shield, Building2, BookOpen, Gift, DollarSign, CalendarHeart, MapPin, Network, Palmtree, Key, Loader2 } from 'lucide-react';

import { CompanyInfoSettings } from '../components/Settings/CompanyInfoSettings';
import { RoleDescriptionsSettings } from '../components/Settings/RoleDescriptionsSettings';
import { AttendanceBonusSettings } from '../components/Settings/AttendanceBonusSettings';
import { FinancialRulesSettings } from '../components/Settings/FinancialRulesSettings';
import { LeaveEntitlementsSettings } from '../components/Settings/LeaveEntitlementsSettings';
import { PublicHolidaysSettings } from '../components/Settings/PublicHolidaysSettings';
import { GeofenceSettings } from '../components/Settings/GeofenceSettings';
import { DepartmentManager } from '../components/Settings/DepartmentManager';
import { AccessControlSettings } from '../components/Settings/AccessControlSettings'; 
import { PermissionMatrix } from '../components/Settings/PermissionMatrix'; 

// --- NEW: Import our Security Hook ---
import usePermissions from '../hooks/usePermissions';

export default function SettingsPage({ db, companyConfig, userRole }) {
    const [activeTab, setActiveTab] = useState('');
    
    // --- NEW: Fetch live permissions ---
    const { permissions, loadingPermissions } = usePermissions(db, userRole);

    const handleAddDepartment = async (deptName) => { 
        await updateDoc(doc(db, 'settings', 'company_config'), { departments: arrayUnion(deptName) }); 
    };
    const handleDeleteDepartment = async (dept) => { 
        if (window.confirm(`Delete department "${dept}"?`)) { 
            await updateDoc(doc(db, 'settings', 'company_config'), { departments: arrayRemove(dept) }); 
        } 
    };
    const handleAddHoliday = async (holiday) => { 
        await updateDoc(doc(db, 'settings', 'company_config'), { publicHolidays: arrayUnion(holiday) }); 
    };
    const handleDeleteHoliday = async (holiday) => { 
        if (window.confirm(`Delete holiday "${holiday.name}" (${holiday.date})?`)) { 
            await updateDoc(doc(db, 'settings', 'company_config'), { publicHolidays: arrayRemove(holiday) }); 
        } 
    };

    // --- UPGRADED: Tabs are now tied to Matrix Keys! ---
    const allTabs = [
        // Strictly Super Admin
        { id: 'permission-matrix', label: 'Permission Matrix', icon: Key, description: 'Super Admin access control.', superAdminOnly: true },
        
        // Matrix-Controlled Tabs
        { id: 'access-control', label: 'Access Control', icon: Shield, description: 'Manage users and security clearances.', permissionKey: 'canManageUsers' },
        { id: 'financial-rules', label: 'Financial Rules', icon: DollarSign, description: 'Tax, OT multipliers, and payroll configs.', permissionKey: 'canViewFinancialRules' },
        { id: 'geofence-config', label: 'Geofence Config', icon: MapPin, description: 'Set GPS boundaries for clock-ins.', permissionKey: 'canEditGeofence' },
        
        // Universally available to anyone who can access the Settings page (GMs, Admins)
        { id: 'company-info', label: 'Company Info', icon: Building2, description: 'Basic details and contact info.' },
        { id: 'manage-departments', label: 'Departments', icon: Network, description: 'Create and edit operational departments.' },
        { id: 'role-descriptions', label: 'Role Descriptions', icon: BookOpen, description: 'Define job responsibilities.' },
        { id: 'attendance-bonus', label: 'Attendance Bonus', icon: Gift, description: 'Rules for perfect attendance payouts.' },
        { id: 'leave-entitlements', label: 'Leave Entitlements', icon: Palmtree, description: 'Set yearly quotas for AL, Sick, etc.' },
        { id: 'public-holidays', label: 'Public Holidays', icon: CalendarHeart, description: 'Manage company recognized holidays.' },
    ];

    // Filter logic based on the live Matrix
    const availableTabs = allTabs.filter(tab => {
        if (tab.superAdminOnly && userRole !== 'super_admin') return false;
        
        // If this tab requires a specific permission, check the Matrix!
        if (tab.permissionKey && !permissions[tab.permissionKey]) return false;
        
        return true;
    });

    useEffect(() => {
        if (availableTabs.length > 0 && !availableTabs.find(t => t.id === activeTab)) {
            setActiveTab(availableTabs[0].id);
        }
    }, [userRole, activeTab, availableTabs, permissions]);

    const renderContent = () => {
        switch (activeTab) {
            case 'permission-matrix': return <PermissionMatrix db={db} />;
            case 'access-control': return <AccessControlSettings db={db} userRole={userRole} />;
            case 'company-info': return <CompanyInfoSettings db={db} companyConfig={companyConfig} />;
            case 'manage-departments': return <DepartmentManager departments={companyConfig?.departments || []} onAddDepartment={handleAddDepartment} onDeleteDepartment={handleDeleteDepartment} />;
            case 'role-descriptions': return <RoleDescriptionsSettings db={db} config={companyConfig} />;
            case 'attendance-bonus': return <AttendanceBonusSettings db={db} config={companyConfig} />;
            case 'financial-rules': return <FinancialRulesSettings db={db} config={companyConfig} />;
            case 'leave-entitlements': return <LeaveEntitlementsSettings db={db} config={companyConfig} />;
            case 'public-holidays': return <PublicHolidaysSettings db={db} config={companyConfig} onAddHoliday={handleAddHoliday} onDeleteHoliday={handleDeleteHoliday} />;
            case 'geofence-config': return <GeofenceSettings db={db} config={companyConfig} />;
            default: return <div className="flex justify-center py-20"><p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Select a module</p></div>;
        }
    };

    if (loadingPermissions) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
    }

    return (
        <div className="flex flex-col h-[calc(100vh-2rem)] animate-fadeIn">
            <div className="mb-4 md:mb-6 flex-shrink-0 flex justify-between items-start">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">System Settings</h2>
                    <p className="text-sm text-gray-400 mt-1">Manage company configurations, HR rules, and security.</p>
                </div>
            </div>

            <div className="md:hidden flex-shrink-0 mb-4">
                <select value={activeTab} onChange={(e) => setActiveTab(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white font-bold rounded-lg p-3 outline-none focus:ring-indigo-500 shadow-lg appearance-none cursor-pointer">
                    {availableTabs.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
                </select>
            </div>

            <div className="flex flex-col md:flex-row gap-6 flex-grow overflow-hidden">
                <div className="hidden md:flex w-64 lg:w-72 flex-shrink-0 bg-gray-800 rounded-xl border border-gray-700 shadow-lg flex-col">
                    <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex-shrink-0">
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Configuration Modules</h3>
                    </div>
                    <nav className="p-2 space-y-1 overflow-y-auto flex-grow custom-scrollbar">
                        {availableTabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-start text-left px-3 py-3 rounded-lg transition-all ${isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                                    <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                                    <div className="ml-3">
                                        <p className="text-sm font-bold leading-tight">{tab.label}</p>
                                        <p className={`text-[10px] mt-1 leading-tight ${isActive ? 'text-indigo-200' : 'text-gray-500'}`}>{tab.description}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </nav>
                </div>

                <div className="flex-grow bg-gray-900 rounded-xl border border-gray-700 overflow-y-auto shadow-inner custom-scrollbar p-4 md:p-6">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}