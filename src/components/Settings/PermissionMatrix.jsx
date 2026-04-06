/* src/components/Settings/PermissionMatrix.jsx */

import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { ShieldAlert, Loader2 } from 'lucide-react';

// The master list of all permissions in the app
const PERMISSION_KEYS = [
    { key: 'canViewFinancialRules', label: 'View Financial Rules', desc: 'Access taxes, OT multipliers, etc.' },
    { key: 'canEditFinancialRules', label: 'Edit Financial Rules', desc: 'Modify taxes, OT multipliers, etc.' },
    { key: 'canApproveLeave', label: 'Approve Leave', desc: 'Approve or reject team vacations.' },
    { key: 'canEditGeofence', label: 'Edit Geofences', desc: 'Change GPS clock-in boundaries.' },
    { key: 'canRunPayroll', label: 'Run Payroll', desc: 'Generate and finalize monthly payroll.' },
    { key: 'canManageUsers', label: 'Manage Users', desc: 'Promote/Demote staff roles.' }
];

// The default roles and our STRICT visual column order!
const DEFAULT_ROLES = ['staff', 'dept_manager', 'manager', 'admin', 'super_admin'];

export function PermissionMatrix({ db }) {
    const [matrix, setMatrix] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const docRef = doc(db, 'settings', 'role_permissions');
        
        const unsubscribe = onSnapshot(docRef, async (snapshot) => {
            if (snapshot.exists()) {
                setMatrix(snapshot.data());
                setLoading(false);
            } else {
                // If it doesn't exist yet, create it with safe defaults!
                const initialData = {};
                DEFAULT_ROLES.forEach(role => {
                    initialData[role] = {};
                    PERMISSION_KEYS.forEach(p => {
                        // By default, only give admins/super_admins full power
                        initialData[role][p.key] = ['admin', 'super_admin'].includes(role);
                    });
                });
                await setDoc(docRef, initialData);
            }
        });

        return () => unsubscribe();
    }, [db]);

    const handleToggle = async (role, permissionKey, currentValue) => {
        // Super Admins can never have their powers turned off to prevent locking yourself out!
        if (role === 'super_admin') {
            alert("Super Admin permissions cannot be restricted.");
            return;
        }

        const docRef = doc(db, 'settings', 'role_permissions');
        await updateDoc(docRef, {
            [`${role}.${permissionKey}`]: !currentValue
        });
    };

    if (loading || !matrix) {
        return <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
    }

    // --- FIX: Forcefully sort the columns so they NEVER jump around randomly ---
    const currentRoles = Object.keys(matrix).sort((a, b) => {
        const indexA = DEFAULT_ROLES.indexOf(a);
        const indexB = DEFAULT_ROLES.indexOf(b);
        
        // If a brand new custom role is added later, push it to the end alphabetically
        if (indexA === -1 && indexB === -1) return a.localeCompare(b);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        
        // Otherwise, obey the strict DEFAULT_ROLES hierarchy
        return indexA - indexB;
    });

    return (
        <div className="space-y-6 animate-fadeIn pb-10">
            <div className="bg-red-900/20 border border-red-700/50 p-4 rounded-xl flex gap-4 items-start">
                <ShieldAlert className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
                <div>
                    <h3 className="text-red-400 font-bold">Super Admin Override</h3>
                    <p className="text-sm text-red-300/80 mt-1">
                        Any changes made here instantly alter what users can see and do across the entire application. Be careful when granting financial or payroll access.
                    </p>
                </div>
            </div>

            <div className="overflow-x-auto bg-gray-800 rounded-xl border border-gray-700 shadow-xl custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-900 border-b border-gray-700">
                            <th className="p-4 text-xs font-black text-gray-500 uppercase tracking-widest min-w-[250px] sticky left-0 bg-gray-900 z-10">
                                System Permission
                            </th>
                            {currentRoles.map(role => (
                                <th key={role} className="p-4 text-center text-xs font-black text-white uppercase tracking-wider min-w-[120px] border-l border-gray-800">
                                    {role.replace('_', ' ')}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50">
                        {PERMISSION_KEYS.map((perm) => (
                            <tr key={perm.key} className="hover:bg-gray-700/20 transition-colors">
                                <td className="p-4 sticky left-0 bg-gray-800 z-10 shadow-[4px_0_10px_rgba(0,0,0,0.1)]">
                                    <p className="font-bold text-gray-200">{perm.label}</p>
                                    <p className="text-[10px] text-gray-500 mt-1">{perm.desc}</p>
                                </td>
                                {currentRoles.map(role => {
                                    const isGranted = matrix[role]?.[perm.key] || false;
                                    const isSuperAdmin = role === 'super_admin';
                                    return (
                                        <td key={role} className="p-4 text-center border-l border-gray-700/50">
                                            <button 
                                                onClick={() => handleToggle(role, perm.key, isGranted)}
                                                disabled={isSuperAdmin}
                                                className={`w-6 h-6 rounded flex items-center justify-center mx-auto transition-all ${
                                                    isGranted 
                                                    ? 'bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)]' 
                                                    : 'bg-gray-900 border border-gray-600 text-transparent'
                                                } ${isSuperAdmin ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110'}`}
                                            >
                                                ✓
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}