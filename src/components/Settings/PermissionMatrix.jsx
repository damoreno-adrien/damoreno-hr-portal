/* src/components/Settings/PermissionMatrix.jsx */

import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { app } from '../../../firebase.js';
import { logSystemAction } from '../../utils/auditLogger';
import FeedbackModal from '../common/FeedbackModal';
import { PERMISSION_CATEGORIES, DEFAULT_ROLE_IDS } from '../../config/permissions.config';
import { Tooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';

export function PermissionMatrix({ db }) {
    const [matrix, setMatrix] = useState(null);
    const [loading, setLoading] = useState(true);
    const [feedbackModal, setFeedbackModal] = useState(null);
    const auth = getAuth(app); 

    useEffect(() => {
        const docRef = doc(db, 'settings', 'role_permissions');
        
        const unsubscribe = onSnapshot(docRef, async (snapshot) => {
            if (snapshot.exists()) {
                setMatrix(snapshot.data());
                setLoading(false);
            } else {
                const initialData = {};
                const FLAT_KEYS = PERMISSION_CATEGORIES.flatMap(cat => cat.keys);
                
                DEFAULT_ROLE_IDS.forEach(role => {
                    initialData[role] = {};
                    FLAT_KEYS.forEach(p => {
                        initialData[role][p.key] = ['admin', 'super_admin'].includes(role);
                    });
                });
                await setDoc(docRef, initialData);
            }
        });

        return () => unsubscribe();
    }, [db]);

    const handleToggle = async (role, permissionKey, currentValue) => {
      // Double vérification sécurité
      if (role === 'super_admin' || !permissions.canManageUsers) {
        setFeedbackModal({
          type: 'error',
          title: 'Action refusée',
          message: "Vous n'avez pas les droits pour cette modification"
        });
        return;
      }
        if (role === 'super_admin') {
            setFeedbackModal({ type: 'error', title: 'Action Blocked', message: "Super Admin permissions cannot be restricted." });
            return;
        }

        const docRef = doc(db, 'settings', 'role_permissions');
        await updateDoc(docRef, {
            [`${role}.${permissionKey}`]: !currentValue
        });

        const actionType = !currentValue ? 'GRANT_PERMISSION' : 'REVOKE_PERMISSION';
        const statusText = !currentValue ? 'Granted' : 'Revoked';
        
        await logSystemAction(db, auth.currentUser, 'global', actionType, `${statusText} '${permissionKey}' for role: ${role.toUpperCase()}`);
    };

    if (loading || !matrix) {
        return <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
    }

    const currentRoles = Object.keys(matrix).sort((a, b) => {
        const indexA = DEFAULT_ROLE_IDS.indexOf(a);
        const indexB = DEFAULT_ROLE_IDS.indexOf(b);
        if (indexA === -1 && indexB === -1) return a.localeCompare(b);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    return (
        <div className="space-y-6 animate-fadeIn pb-10 relative">
            <FeedbackModal isOpen={!!feedbackModal} type={feedbackModal?.type} title={feedbackModal?.title} message={feedbackModal?.message} onClose={() => setFeedbackModal(null)} />

            <Tooltip 
                id="perm-tooltip" 
                className="!bg-gray-900 !text-gray-100 !border !border-indigo-700/50 !text-xs !max-w-xs !z-50 !shadow-xl"
                place="top"
            />

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
                            <th className="p-4 text-xs font-black text-gray-500 uppercase tracking-widest min-w-[250px] sticky left-0 bg-gray-900 z-20">
                                System Permission
                            </th>
                            {currentRoles.map(role => (
                                <th key={role} className="p-4 text-center text-xs font-black text-white uppercase tracking-wider min-w-[120px] border-l border-gray-800 z-10 relative">
                                    {role.replace('_', ' ')}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50">
                        {PERMISSION_CATEGORIES.map((category) => (
                            <React.Fragment key={category.name}>
                                <tr className="bg-gray-850 border-y border-gray-700">
                                    <td colSpan={currentRoles.length + 1} className="px-4 py-2 sticky left-0 z-10 bg-gray-900/90 backdrop-blur">
                                        <div className="flex items-center gap-2">
                                            <category.icon className="w-4 h-4 text-indigo-400" />
                                            <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">{category.name}</span>
                                        </div>
                                    </td>
                                </tr>
                                {category.keys.map((perm) => (
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
                                                        aria-label={`${isGranted ? 'Revoke' : 'Grant'} ${perm.label} for ${role}`}
                                                        data-tooltip-id="perm-tooltip" 
                                                        data-tooltip-content={`${perm.label}: ${perm.desc}`}
                                                    >
                                                        ✓
                                                    </button>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
