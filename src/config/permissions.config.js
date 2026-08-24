/* src/config/permissions.config.js */
import { Settings, Users, DollarSign } from 'lucide-react';

export const PERMISSION_CATEGORIES = [
    {
        name: 'System & Configuration',
        icon: Settings,
        keys: [
            { key: 'canManageUsers', label: 'Manage Users & Clearances', desc: 'Access the Access Control panel' },
            { key: 'canViewAuditLogs', label: 'View Audit Logs', desc: 'Read the system action history' },
            { key: 'canEditCompanyInfo', label: 'Edit Company Info', desc: 'Change global company settings' },
            { key: 'canEditGeofence', label: 'Edit Geofences', desc: 'Modify GPS boundaries' }
        ]
    },
    {
        name: 'HR & Staff Management',
        icon: Users,
        keys: [
            { key: 'canApproveLeave', label: 'Approve Leave', desc: 'Accept or reject staff leave requests' },
            { key: 'canOffboardStaff', label: 'Offboard Staff', desc: 'Archive and terminate staff members' },
            { key: 'canResetPassword', label: 'Reset Passwords', desc: 'Force password reset for staff' },
            { key: 'canEditDepartments', label: 'Edit Departments', desc: 'Create/Delete structural departments' },
            { key: 'canEditRoleDescriptions', label: 'Edit Role Descriptions', desc: 'Modify job descriptions' }
        ]
    },
    {
        name: 'Financials & Payroll',
        icon: DollarSign,
        keys: [
            { key: 'canViewFinancialRules', label: 'View Financial Rules', desc: 'See tax and payroll multipliers' },
            { key: 'canEditFinancialRules', label: 'Edit Financial Rules', desc: 'Modify financial settings' },
            { key: 'canEditBonusRules', label: 'Edit Bonus Rules', desc: 'Change attendance bonus amounts' },
            { key: 'canEditLeavePolicies', label: 'Edit Leave Policies', desc: 'Modify annual leave quotas' },
            { key: 'canEditHolidays', label: 'Edit Holidays', desc: 'Manage public holidays' },
            { key: 'canRunPayroll', label: 'Run Payroll', desc: 'Generate and lock monthly payslips' }
        ]
    }
];

// Exports automatiques pour le reste de l'application
export const ALL_PERMISSION_KEYS = PERMISSION_CATEGORIES.flatMap(cat => cat.keys.map(p => p.key));

// LE NOUVEAU REGISTRE DES RÔLES
export const ROLE_DEFINITIONS = [
    { id: 'staff', label: 'Staff (No Admin Access)', level: 1 },
    { id: 'dept_manager', label: 'Department Manager', level: 2 },
    { id: 'manager', label: 'General Manager', level: 3 },
    { id: 'admin', label: 'Branch Admin (Limited View)', level: 4 },
    { id: 'super_admin', label: 'Global Super Admin (Full View)', level: 5 }
];

export const DEFAULT_ROLE_IDS = ROLE_DEFINITIONS.map(role => role.id);