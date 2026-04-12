/* src/components/Settings/BranchManager.jsx */
import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, collection, query, where, getDocs } from 'firebase/firestore';
import { Building, Plus, MapPin, AlertTriangle, Trash2, Users, Shield } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

// --- NOUVEAUX IMPORTS POUR L'AUDIT LOG ---
import { getAuth } from 'firebase/auth';
import { app } from '../../../firebase';
import { logSystemAction } from '../../utils/auditLogger';

// --- 1. THE DANGER ZONE SUB-COMPONENT ---
const DangerZoneBranchDelete = ({ branches, db }) => { // <-- Ajout de 'db' ici
    const [branchToDelete, setBranchToDelete] = useState('');
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    
    const auth = getAuth(app); // Initialisation auth

    const handleDelete = async () => {
        if (confirmText !== branchToDelete) {
            alert("Confirmation text does not match the Branch ID.");
            return;
        }

        if (window.confirm(`FINAL WARNING: This will permanently erase ALL staff, attendance, and financial data for ${branchToDelete}. This cannot be undone.`)) {
            setIsDeleting(true);
            try {
                const functions = getFunctions(app, "asia-southeast1");
                const deleteBranchData = httpsCallable(functions, 'deleteBranchData');
                
                const result = await deleteBranchData({ branchId: branchToDelete });
                
                // --- LOG ACTION (CRITIQUE) ---
                await logSystemAction(
                    db, 
                    auth.currentUser, 
                    'global', // Action globale car on supprime une branche
                    'DELETE_BRANCH', 
                    `CRITICAL: Permanently erased all data for branch ID: ${branchToDelete}`
                );
                // -----------------------------

                alert(result.data.message);
                
                setBranchToDelete('');
                setConfirmText('');
            } catch (error) {
                alert(`Deletion failed: ${error.message}`);
            } finally {
                setIsDeleting(false);
            }
        }
    };

    return (
        <div className="mt-12 bg-red-900/20 border border-red-700/50 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500" />
                <h3 className="text-xl font-bold text-red-500">Danger Zone: Erase Branch</h3>
            </div>
            <p className="text-sm text-gray-300 mb-6">
                This tool is for cleaning up Sandbox/UAT environments. It will permanently destroy all staff records, leave requests, attendance logs, and configuration data associated with the selected branch.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Select Branch to Erase</label>
                    <select 
                        value={branchToDelete} 
                        onChange={(e) => setBranchToDelete(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2.5 text-white outline-none focus:border-red-500"
                    >
                        <option value="">-- Select Branch --</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
                        ))}
                    </select>
                </div>

                {branchToDelete && (
                    <>
                        <div>
                            <label className="block text-xs font-bold text-red-400 mb-1 uppercase tracking-wider">Type '{branchToDelete}' to confirm</label>
                            <input 
                                type="text" 
                                value={confirmText} 
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder="Confirm ID..."
                                className="w-full bg-gray-800 border border-red-700/50 rounded-lg p-2.5 text-white outline-none focus:border-red-500"
                            />
                        </div>
                        <button 
                            onClick={handleDelete}
                            disabled={isDeleting || confirmText !== branchToDelete}
                            className="flex items-center justify-center bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Trash2 className="w-5 h-5 mr-2" />
                            {isDeleting ? 'Nuking Data...' : 'Destroy Branch'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

// --- 2. THE MAIN COMPONENT ---
export function BranchManager({ db, config }) {
    const [newBranchName, setNewBranchName] = useState('');
    const [newBranchId, setNewBranchId] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [branchStats, setBranchStats] = useState({});

    const auth = getAuth(app); // Initialisation auth

    const branches = config?.branches || [];

    // --- DATA FETCHING: Get Active Staff and Directors ---
    useEffect(() => {
        const fetchBranchStats = async () => {
            if (!db || branches.length === 0) return;

            try {
                // 1. Fetch all active staff
                const staffQuery = query(collection(db, 'staff_profiles'), where('status', '==', 'active'));
                const staffSnap = await getDocs(staffQuery);

                // 2. Fetch all users to find Admins/Directors
                const usersSnap = await getDocs(collection(db, 'users'));

                // Create a mapping of UID to Name for better display
                const nameMap = {};
                staffSnap.forEach(doc => {
                    const data = doc.data();
                    nameMap[doc.id] = data.nickname || data.firstName || data.fullName || 'Unknown';
                });

                const stats = {};
                branches.forEach(b => {
                    stats[b.id] = { activeStaff: 0, admins: [] };
                });

                // Count active staff per branch
                staffSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.branchId && stats[data.branchId]) {
                        stats[data.branchId].activeStaff += 1;
                    }
                });

                // Find Admins/Directors per branch
                usersSnap.forEach(doc => {
                    const data = doc.data();
                    if (['admin', 'super_admin', 'manager'].includes(data.role)) {
                        if (Array.isArray(data.branchIds)) {
                            data.branchIds.forEach(bId => {
                                if (stats[bId]) {
                                    const displayName = nameMap[doc.id] || data.name || data.email || 'Admin';
                                    if (!stats[bId].admins.includes(displayName)) {
                                        stats[bId].admins.push(displayName);
                                    }
                                }
                            });
                        }
                    }
                });

                setBranchStats(stats);
            } catch (error) {
                console.error("Error fetching branch stats:", error);
            }
        };

        fetchBranchStats();
    }, [db, branches]);

    // Auto-generate a safe ID when typing the name
    const handleNameChange = (e) => {
        const name = e.target.value;
        setNewBranchName(name);
        
        if (!newBranchId || newBranchId.startsWith('br_')) {
            const generatedId = 'br_' + name.toLowerCase().replace(/[^a-z0-9]/g, '');
            setNewBranchId(generatedId);
        }
    };

    const handleAddBranch = async (e) => {
        e.preventDefault();
        if (!newBranchName || !newBranchId) return;

        if (branches.some(b => b.id === newBranchId)) {
            alert("This Branch ID already exists! Please use a unique ID.");
            return;
        }

        setIsSaving(true);
        try {
            const configRef = doc(db, 'settings', 'company_config');
            await updateDoc(configRef, {
                branches: arrayUnion({
                    id: newBranchId,
                    name: newBranchName,
                    createdAt: new Date().toISOString()
                })
            });

            // --- LOG ACTION ---
            await logSystemAction(
                db, 
                auth.currentUser, 
                'global', 
                'ADD_BRANCH', 
                `Registered a new branch: ${newBranchName} (${newBranchId})`
            );
            // ------------------

            setNewBranchName('');
            setNewBranchId('');
        } catch (error) {
            console.error("Error adding branch:", error);
            alert("Failed to add branch.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="bg-gray-900/50 p-6 border-b border-gray-700">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-500/20 p-2 rounded-lg">
                        <Building className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">Company Branches</h3>
                        <p className="text-sm text-gray-400">Register new physical locations and establishments.</p>
                    </div>
                </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Add New Branch Form */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-lg">
                        <h4 className="font-bold text-white mb-4 flex items-center">
                            <Plus className="w-5 h-5 mr-2 text-indigo-400" />
                            Register New Branch
                        </h4>
                        <form onSubmit={handleAddBranch} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Branch Name (UI Display)</label>
                                <input 
                                    type="text" 
                                    required
                                    value={newBranchName} 
                                    onChange={handleNameChange} 
                                    placeholder="e.g., Da Moreno Patong" 
                                    className="w-full bg-gray-900 text-white p-2.5 rounded-lg border border-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Branch ID (Database Key)</label>
                                <input 
                                    type="text" 
                                    required
                                    value={newBranchId} 
                                    onChange={(e) => setNewBranchId(e.target.value)} 
                                    placeholder="e.g., br_patong" 
                                    className="w-full bg-gray-900/50 text-indigo-300 font-mono text-sm p-2.5 rounded-lg border border-gray-600 focus:border-indigo-500 outline-none"
                                />
                                <p className="text-[10px] text-amber-500 mt-1 font-bold">WARNING: This ID is permanent and cannot be changed later.</p>
                            </div>
                            <button 
                                type="submit" 
                                disabled={isSaving || !newBranchName || !newBranchId}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50 flex justify-center items-center"
                            >
                                {isSaving ? 'Registering...' : 'Register Branch'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Registered Branches List */}
                <div className="lg:col-span-2 space-y-4">
                    <h4 className="font-bold text-white flex items-center border-b border-gray-700 pb-2">
                        <MapPin className="w-5 h-5 mr-2 text-emerald-400" />
                        Active Establishments
                    </h4>
                    {branches.length === 0 ? (
                        <div className="bg-gray-800/50 p-8 rounded-xl border border-gray-700 border-dashed text-center">
                            <p className="text-gray-400 italic">No branches registered yet. Add your first location to get started.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {branches.map((branch) => {
                                const stats = branchStats[branch.id] || { activeStaff: 0, admins: [] };
                                
                                return (
                                    <div key={branch.id} className="bg-gray-800 p-5 rounded-xl border border-gray-700 flex flex-col relative overflow-hidden group shadow-md">
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-bl-full -mr-12 -mt-12 transition-transform group-hover:scale-150"></div>
                                        
                                        <div className="relative z-10 flex justify-between items-start mb-3">
                                            <div>
                                                <h5 className="font-bold text-lg text-white mb-0.5 leading-tight">{branch.name}</h5>
                                                <p className="text-[11px] text-indigo-400 font-mono">ID: {branch.id}</p>
                                            </div>
                                        </div>

                                        {/* Rich Data Display */}
                                        <div className="mt-auto pt-4 border-t border-gray-700 space-y-3 relative z-10">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-400 flex items-center"><Users className="w-4 h-4 mr-2" /> Active Staff:</span>
                                                <span className="font-bold text-white bg-gray-900 border border-gray-700 px-2 py-0.5 rounded">{stats.activeStaff}</span>
                                            </div>
                                            
                                            <div className="flex flex-col text-sm">
                                                <span className="text-gray-400 mb-1.5 flex items-center"><Shield className="w-4 h-4 mr-2" /> Assigned Directors:</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {stats.admins.length > 0 ? stats.admins.map((admin, i) => (
                                                        <span key={i} className="text-xs font-medium bg-indigo-900/40 text-indigo-300 border border-indigo-700/50 px-2 py-0.5 rounded">
                                                            {admin}
                                                        </span>
                                                    )) : (
                                                        <span className="text-xs text-amber-500 bg-amber-900/20 px-2 py-0.5 rounded border border-amber-700/50">None assigned</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Render Danger Zone at the bottom */}
            <div className="px-6 pb-6">
                <DangerZoneBranchDelete branches={branches} db={db} /> 
            </div>
        </div>
    );
}