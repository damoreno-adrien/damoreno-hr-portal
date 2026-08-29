import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import usePermissions from '../../hooks/usePermissions';
import { PERMISSION_CATEGORIES } from '../../config/permissions.config';
import { Loader2, Shield, Save, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

export function StaffPermissionsOverrides({ db, staffId, userRole, staffProfile }) {
    const { permissions } = usePermissions(db, userRole, getAuth().currentUser?.uid);
    const [targetRole, setTargetRole] = useState('staff');
    const [roleDefaults, setRoleDefaults] = useState({});
    const [customOverrides, setCustomOverrides] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const fetchPermissions = async () => {
            try {
                // 1. Récupérer d'abord le rôle réel et les overrides actuels de l'utilisateur
                const userDoc = await getDoc(doc(db, 'users', staffId));
                let userActualRole = 'staff';

                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    userActualRole = userData.role || 'staff';
                    setTargetRole(userActualRole);
                    
                    if (userData.customPermissions) {
                        setCustomOverrides(userData.customPermissions);
                    }
                }

                // 2. Récupérer la matrice globale pour CE rôle spécifique
                const matrixDoc = await getDoc(doc(db, 'settings', 'role_permissions'));
                if (matrixDoc.exists()) {
                    const matrixData = matrixDoc.data();
                    setRoleDefaults(matrixData[userActualRole] || {});
                }
            } catch (err) {
                setError("Failed to load permissions: " + err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchPermissions();
    }, [db, staffId]);

    const handleToggle = (key) => {
        // Vérification hiérarchique et permissions
        if (!permissions.canManageUsers) {
            setError("You don't have permission to modify user permissions");
            return;
        }
        if (ROLE_HIERARCHY[staffProfile.role]?.level >= ROLE_HIERARCHY[userRole]?.level) {
            setError("You can't modify permissions for roles equal or higher than yours");
            return;
        }
        setCustomOverrides(prev => {
            const newOverrides = { ...prev };
            const defaultVal = !!roleDefaults[key];
            const currentOverride = newOverrides[key];
            
            // Logique de toggle à 3 états (Hérité -> Forcé True -> Forcé False)
            if (currentOverride === undefined) {
                // Si pas d'override, on inverse la valeur par défaut
                newOverrides[key] = !defaultVal;
            } else if (currentOverride !== defaultVal) {
                // Si l'override est différent du défaut, on le remet au défaut (supprime l'override)
                delete newOverrides[key];
            }
            return newOverrides;
        });
    };

    const handleSave = async () => {
        if (!permissions.canManageUsers) {
            setError("You don't have permission to save permission overrides");
            return;
        }

        setSaving(true);
        setError('');
        setSuccess(false);
        try {
            const batch = writeBatch(db);
            
            // Update both staff profile and user doc for consistency
            batch.update(doc(db, 'staff_profiles', staffId), {
                customPermissions: customOverrides
            });
            batch.update(doc(db, 'users', staffId), {
                customPermissions: customOverrides
            });

            await batch.commit();
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center p-4"><Loader2 className="animate-spin text-indigo-500" /></div>;

    return (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-4">
            <div
                onClick={() => setIsOpen(prev => !prev)}
                className="flex items-center justify-between border-b border-gray-700 pb-4 cursor-pointer select-none"
            >
                <div>
                    <h4 className="text-base font-semibold text-white flex items-center gap-2">
                        <Shield className="h-5 w-5 text-indigo-400" />
                        Manage Custom Clearances
                    </h4>
                    <p className="text-sm text-gray-400 mt-1">
                        Base role: <span className="font-bold text-gray-300">{targetRole.toUpperCase()}</span>. 
                        Modify specific permissions for this user.
                    </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleSave(); }} 
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Overrides
                    </button>
                    {isOpen ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                </div>
            </div>

            {error && <div className="text-red-400 text-sm bg-red-900/30 p-3 rounded-md flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}
            {success && <div className="text-green-400 text-sm bg-green-900/30 p-3 rounded-md">Permissions successfully updated.</div>}

            <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="space-y-6">
                    {PERMISSION_CATEGORIES.map((category) => (
                        <div key={category.name} className="space-y-3">
                            <h5 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <category.icon className="h-4 w-4" /> {category.name}
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {category.keys.map((perm) => {
                                    const defaultVal = !!roleDefaults[perm.key];
                                    const hasOverride = customOverrides[perm.key] !== undefined;
                                    const finalVal = hasOverride ? customOverrides[perm.key] : defaultVal;

                                    return (
                                        <div key={perm.key} className={`flex flex-col p-3 rounded-lg border ${hasOverride ? 'bg-indigo-900/20 border-indigo-700/50' : 'bg-gray-900/50 border-gray-700'} transition-colors`}>
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-medium text-gray-200 cursor-pointer flex-1">
                                                    {perm.label}
                                                </label>
                                                <input
                                                    type="checkbox"
                                                    checked={finalVal}
                                                    onChange={() => handleToggle(perm.key)}
                                                    className="h-4 w-4 rounded border-gray-600 text-indigo-600 focus:ring-indigo-500 bg-gray-700 cursor-pointer"
                                                />
                                            </div>
                                            <div className="flex justify-between items-center mt-1">
                                                <span className="text-xs text-gray-500">{perm.desc}</span>
                                                {hasOverride && (
                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${finalVal ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                                                        OVERRIDDEN
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
