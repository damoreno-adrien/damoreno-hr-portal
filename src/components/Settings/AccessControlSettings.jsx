/* src/components/Settings/AccessControlSettings.jsx */

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../../firebase.js';
import { Shield, UserCog, UserPlus, Loader2, Eye, EyeOff, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Check, X, Trash2 } from 'lucide-react';

const functions = getFunctions(app, "asia-southeast1");
const inviteAdminFunc = httpsCallable(functions, 'inviteAdminHandler');
const updateUserRoleFunc = httpsCallable(functions, 'updateUserRoleHandler');
const updateAdminBranchesFunc = httpsCallable(functions, 'updateAdminBranchesHandler');

export const AccessControlSettings = ({ db, userRole, selectedBranchId, branches = [] }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [showArchived, setShowArchived] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    const [creationMode, setCreationMode] = useState('new'); 
    const [selectedExistingUserId, setSelectedExistingUserId] = useState('');

    const [newAdminName, setNewAdminName] = useState('');
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [newAdminPassword, setNewAdminPassword] = useState('');
    const [newAdminRole, setNewAdminRole] = useState('admin');
    const [newAdminBranches, setNewAdminBranches] = useState([]);

    const [editingAdminId, setEditingAdminId] = useState(null);
    const [editingBranches, setEditingBranches] = useState([]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const usersSnap = await getDocs(collection(db, 'users'));
            const baseUsers = {};
            usersSnap.docs.forEach(doc => { 
                baseUsers[doc.id] = { id: doc.id, hasAdminProfile: true, ...doc.data() }; 
            });

            const profilesSnap = await getDocs(collection(db, 'staff_profiles'));
            profilesSnap.docs.forEach(doc => {
                const profileData = doc.data();
                if (!baseUsers[doc.id]) baseUsers[doc.id] = { id: doc.id, role: 'staff' };
                
                baseUsers[doc.id].hasStaffProfile = true; 
                baseUsers[doc.id].email = profileData.email || baseUsers[doc.id].email;
                baseUsers[doc.id].nickname = profileData.nickname || '';
                baseUsers[doc.id].name = profileData.firstName
                    ? `${profileData.firstName} ${profileData.lastName || ''}`
                    : profileData.fullName || profileData.nickname || baseUsers[doc.id].name || 'Unknown Name';
                baseUsers[doc.id].status = profileData.status || 'active';
                baseUsers[doc.id].branchId = profileData.branchId || baseUsers[doc.id].branchId || 'global'; 
            });
            setUsers(Object.values(baseUsers));
        } catch (error) { console.error("Failed to fetch users", error); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchUsers(); }, [db]);

    const handleBranchToggle = (branchId, isEditing = false) => {
        const currentList = isEditing ? editingBranches : newAdminBranches;
        const setList = isEditing ? setEditingBranches : setNewAdminBranches;
        
        if (currentList.includes(branchId)) {
            setList(currentList.filter(id => id !== branchId));
        } else {
            setList([...currentList, branchId]);
        }
    };

    const handleInviteAdmin = async (e) => {
        e.preventDefault();
        if (!newAdminName || !newAdminEmail || newAdminPassword.length < 6) return alert("Please fill all fields. Password must be at least 6 characters.");
        if (newAdminRole === 'admin' && newAdminBranches.length === 0) return alert("Please select at least one branch for this Admin.");
        
        setIsSaving(true);
        try {
            await inviteAdminFunc({ 
                name: newAdminName, 
                email: newAdminEmail, 
                password: newAdminPassword,
                role: newAdminRole,
                branchIds: newAdminRole === 'super_admin' ? ['global'] : newAdminBranches
            });
            setNewAdminName(''); setNewAdminEmail(''); setNewAdminPassword(''); setNewAdminBranches([]);
            alert(`Success! ${newAdminRole === 'super_admin' ? 'Global Super Admin' : 'Branch Admin'} account created.`);
            await fetchUsers();
        } catch (error) { alert(`Error: ${error.message}`); }
        finally { setIsSaving(false); }
    };

    const handlePromoteStaff = async (e) => {
        e.preventDefault();
        if (!selectedExistingUserId) return alert("Please select a staff member to promote.");
        if (newAdminRole === 'admin' && newAdminBranches.length === 0) return alert("Please select at least one branch for this Admin.");

        setIsSaving(true);
        try {
            const targetUser = workforce.find(u => u.id === selectedExistingUserId);
            
            await setDoc(doc(db, 'users', targetUser.id), {
                email: targetUser.email || '',
                name: targetUser.name || '',
                role: newAdminRole,
                branchIds: newAdminRole === 'super_admin' ? ['global'] : newAdminBranches
            }, { merge: true });

            setSelectedExistingUserId(''); setNewAdminBranches([]);
            alert(`Success! ${targetUser.name} has been promoted to ${newAdminRole === 'super_admin' ? 'Super Admin' : 'Branch Admin'}.`);
            await fetchUsers();
        } catch (error) { alert(`Error: ${error.message}`); }
        finally { setIsSaving(false); }
    };

    const handleSaveAdminBranches = async (adminId) => {
        if (editingBranches.length === 0) return alert("Admin must be assigned to at least one branch.");
        setIsSaving(true);
        try {
            await updateAdminBranchesFunc({ targetUid: adminId, branchIds: editingBranches });
            setEditingAdminId(null);
            await fetchUsers();
        } catch (error) { alert(`Error: ${error.message}`); }
        finally { setIsSaving(false); }
    };

    const handleRevokeAdmin = async (adminId, adminName) => {
        if (!window.confirm(`DANGER: Are you sure you want to revoke executive access for ${adminName}? They will no longer be able to access the Command Center.`)) return;
        setIsSaving(true);
        try {
            await deleteDoc(doc(db, 'users', adminId));
            alert(`Executive access revoked for ${adminName}.`);
            await fetchUsers();
        } catch (error) { alert(`Error revoking access: ${error.message}`); }
        finally { setIsSaving(false); }
    };

    // --- NOUVEAU : Fonction de rétrogradation (Demote) ---
    const handleDemoteExecutive = async (admin) => {
        if (!admin.hasStaffProfile) {
            return alert(`Cannot demote ${admin.name}. They must have a Staff Profile first to ensure they are assigned to a specific branch.`);
        }
        if (!window.confirm(`Are you sure you want to demote ${admin.name} to General Manager? They will lose access to the Executive Roster and Command Center.`)) return;
        
        setIsSaving(true);
        try {
            await updateUserRoleFunc({ targetUid: admin.id, newRole: 'manager' });
            alert(`Success! ${admin.name} has been demoted to General Manager.`);
            await fetchUsers();
        } catch (error) { alert(`Error demoting: ${error.message}`); }
        finally { setIsSaving(false); }
    };

    const handleGenerateStaffProfile = async (admin) => {
        if (!window.confirm(`Generate a Staff Profile for ${admin.name}? This will allow them to use the "Switch to Staff" portal to request leave and clock in.`)) return;
        setIsSaving(true);
        try {
            const fallbackBranch = (admin.branchIds && admin.branchIds.length > 0 && admin.branchIds[0] !== 'global') 
                ? admin.branchIds[0] 
                : (branches.length > 0 ? branches[0].id : 'global');

            await setDoc(doc(db, 'staff_profiles', admin.id), {
                email: admin.email || '',
                firstName: admin.name || 'Executive',
                lastName: '',
                nickname: 'Admin',
                role: 'staff',
                status: 'active',
                branchId: fallbackBranch,
                payType: 'Salary',
                baseSalary: 0,
                createdAt: new Date().toISOString()
            });
            alert(`Staff profile created for ${admin.name}! They can now access the Staff Portal.`);
            await fetchUsers();
        } catch (error) { alert(`Error creating staff profile: ${error.message}`); }
        finally { setIsSaving(false); }
    };

    const handleRoleChange = async (targetUid, newRole, userName) => {
        if (!window.confirm(`Are you sure you want to change ${userName}'s security clearance to ${newRole.toUpperCase()}?`)) return;
        setIsSaving(true);
        try {
            await updateUserRoleFunc({ targetUid, newRole });
            alert(`Success! ${userName} is now authorized as a ${newRole.toUpperCase()}.`);
            await fetchUsers();
        } catch (error) { alert(`Error updating role: ${error.message}`); }
        finally { setIsSaving(false); }
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    if (loading) return <div className="text-gray-400 p-4 flex items-center"><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading Access Control...</div>;

    const executives = users.filter(u =>
        ['admin', 'super_admin'].includes(u.role) &&
        (userRole === 'super_admin' || u.role !== 'super_admin')
    );
    
    const workforce = users.filter(u => !['admin', 'super_admin'].includes(u.role));
    const filteredWorkforce = workforce.filter(u => {
        const matchesBranch = u.branchId === selectedBranchId;
        const matchesArchive = showArchived ? true : (u.status !== 'archived' && u.status !== 'inactive');
        return matchesBranch && matchesArchive;
    });

    const sortedWorkforce = [...filteredWorkforce].sort((a, b) => {
        if (sortConfig.key === 'name') {
            const nameA = (a.name || '').toLowerCase(); const nameB = (b.name || '').toLowerCase();
            return sortConfig.direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        }
        if (sortConfig.key === 'role') {
            const weight = { manager: 3, dept_manager: 2, staff: 1 };
            const roleA = weight[a.role || 'staff'] || 0; const roleB = weight[b.role || 'staff'] || 0;
            return sortConfig.direction === 'asc' ? roleA - roleB : roleB - roleA;
        }
        return 0;
    });

    return (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden relative" id="access-control">
            {isSaving && (
                <div className="absolute inset-0 bg-gray-900/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                    <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
                    <p className="text-white font-bold tracking-widest uppercase">Updating Security Clearance...</p>
                </div>
            )}

            <div className="bg-gray-900/50 p-6 border-b border-gray-700">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-500/20 p-2 rounded-lg"><Shield className="w-6 h-6 text-indigo-400" /></div>
                    <div><h3 className="text-xl font-bold text-white">Access Control & Security</h3><p className="text-sm text-gray-400">Manage executive access and promote working staff.</p></div>
                </div>
            </div>

            <div className="p-6 space-y-8">
                {/* Executive Section */}
                <div className="space-y-4">
                    <h4 className="text-lg font-bold text-white flex items-center border-b border-gray-700 pb-2"><UserCog className="w-5 h-5 mr-2 text-amber-400" /> Executive Roster</h4>
                    <p className="text-sm text-gray-400 mb-4">Executives have full access to the Command Center but do not have clock-in profiles.</p>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {userRole === 'super_admin' && (
                            <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700 space-y-4 h-max">
                                <div className="flex justify-between items-center mb-2">
                                    <h5 className="font-bold text-gray-300 flex items-center text-sm"><UserPlus className="w-4 h-4 mr-2" /> Add Executive</h5>
                                </div>
                                
                                <div className="flex gap-2 border-b border-gray-700 pb-3">
                                    <button onClick={() => setCreationMode('new')} className={`text-xs font-bold px-3 py-1.5 rounded transition-colors ${creationMode === 'new' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Create New</button>
                                    <button onClick={() => setCreationMode('existing')} className={`text-xs font-bold px-3 py-1.5 rounded transition-colors ${creationMode === 'existing' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Promote Staff</button>
                                </div>

                                <form onSubmit={creationMode === 'new' ? handleInviteAdmin : handlePromoteStaff} className="space-y-3">
                                    {creationMode === 'existing' && (
                                        <select value={selectedExistingUserId} onChange={e => setSelectedExistingUserId(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded-lg border border-gray-600 text-sm outline-none focus:border-indigo-500">
                                            <option value="">-- Select Manager to Promote --</option>
                                            {/* --- CORRECTION: Filtré par succursale ET par rôle Manager --- */}
                                            {filteredWorkforce
                                                .filter(u => ['manager', 'dept_manager'].includes(u.role))
                                                .map(u => (
                                                <option key={u.id} value={u.id}>{u.name} ({u.email || 'No Email'})</option>
                                            ))}
                                        </select>
                                    )}

                                    <select value={newAdminRole} onChange={e => setNewAdminRole(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded-lg border border-gray-600 text-sm outline-none focus:border-indigo-500">
                                        <option value="admin">Branch Admin (Limited View)</option>
                                        <option value="super_admin">Global Super Admin (Full View)</option>
                                    </select>
                                    
                                    {newAdminRole === 'admin' && (
                                        <div className="bg-gray-800 p-3 rounded-lg border border-gray-600">
                                            <p className="text-xs text-gray-400 font-bold mb-2 uppercase tracking-wider">Assign Branches:</p>
                                            <div className="flex flex-col gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                                                {branches.map(b => (
                                                    <label key={b.id} className="flex items-center gap-2 cursor-pointer group">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={newAdminBranches.includes(b.id)}
                                                            onChange={() => handleBranchToggle(b.id)}
                                                            className="rounded border-gray-600 bg-gray-900 text-indigo-500 focus:ring-indigo-500 cursor-pointer" 
                                                        />
                                                        <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{b.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {creationMode === 'new' && (
                                        <>
                                            <input type="text" placeholder="Full Name" value={newAdminName} onChange={e => setNewAdminName(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded-lg border border-gray-600 text-sm outline-none focus:border-indigo-500" />
                                            <input type="email" placeholder="Email Address" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded-lg border border-gray-600 text-sm outline-none focus:border-indigo-500" />
                                            <input type="password" placeholder="Temporary Password" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded-lg border border-gray-600 text-sm outline-none focus:border-indigo-500" />
                                        </>
                                    )}
                                    
                                    <button type="submit" disabled={isSaving} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
                                        {creationMode === 'new' ? 'Create Account' : 'Promote to Executive'}
                                    </button>
                                </form>
                            </div>
                        )}
                        
                        <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700 h-max">
                            <h5 className="font-bold text-gray-300 text-sm mb-3">Current Executives</h5>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {executives.map(user => {
                                    const isEditing = editingAdminId === user.id;
                                    
                                    let assignedString = "Unknown";
                                    if (user.role === 'super_admin') {
                                        assignedString = "Global System Access";
                                    } else if (user.branchIds && Array.isArray(user.branchIds)) {
                                        const names = user.branchIds.map(id => branches.find(b => b.id === id)?.name?.replace('Da Moreno ', '')).filter(Boolean);
                                        assignedString = names.length > 0 ? names.join(', ') : 'No Branches Assigned';
                                    }

                                    return (
                                        <div key={user.id} className="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-sm">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-bold text-white">{user.name || 'Unknown Name'}</p>
                                                        <span className={`border text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${user.role === 'super_admin' ? 'bg-purple-900/50 text-purple-400 border-purple-700/50' : 'bg-indigo-900/50 text-indigo-400 border-indigo-700/50'}`}>{user.role}</span>
                                                    </div>
                                                    <p className="text-[10px] text-gray-400 mt-1 mb-2">
                                                        Assigned: <span className="text-gray-300 font-medium">{assignedString}</span>
                                                    </p>
                                                </div>
                                                
                                                {/* --- CORRECTION: Seuls les Super Admins peuvent modifier les profils Executives --- */}
                                                {userRole === 'super_admin' && (
                                                    <div className="flex gap-1">
                                                        {!user.hasStaffProfile && (
                                                            <button onClick={() => handleGenerateStaffProfile(user)} className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors" title="Generate Staff Profile">
                                                                <UserPlus className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        
                                                        {user.role !== 'super_admin' && !isEditing && (
                                                            <>
                                                                <button onClick={() => handleDemoteExecutive(user)} className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors" title="Demote to General Manager">
                                                                    <ArrowDown className="w-4 h-4" />
                                                                </button>
                                                                <button onClick={() => { setEditingAdminId(user.id); setEditingBranches(user.branchIds || []); }} className="p-1.5 text-gray-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors" title="Edit Assigned Branches">
                                                                    <Edit2 className="w-4 h-4" />
                                                                </button>
                                                                <button onClick={() => handleRevokeAdmin(user.id, user.name)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Revoke Executive Access">
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {isEditing && (
                                                <div className="mt-3 pt-3 border-t border-gray-700 animate-fadeIn">
                                                    <p className="text-xs text-gray-400 font-bold mb-2 uppercase tracking-wider">Edit Assignments:</p>
                                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                                        {branches.map(b => (
                                                            <label key={b.id} className="flex items-center gap-2 cursor-pointer group">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={editingBranches.includes(b.id)}
                                                                    onChange={() => handleBranchToggle(b.id, true)}
                                                                    className="rounded border-gray-600 bg-gray-900 text-indigo-500 focus:ring-indigo-500 cursor-pointer" 
                                                                />
                                                                <span className="text-xs text-gray-300 group-hover:text-white transition-colors">{b.name.replace('Da Moreno ', '')}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleSaveAdminBranches(user.id)} className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-1.5 rounded flex justify-center items-center gap-1 transition-colors"><Check className="w-3 h-3"/> Save</button>
                                                        <button onClick={() => setEditingAdminId(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-bold py-1.5 rounded flex justify-center items-center gap-1 transition-colors"><X className="w-3 h-3"/> Cancel</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Workforce Section */}
                <div className="space-y-4 pt-4 border-t border-gray-700">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-700 pb-2 gap-2">
                        <h4 className="text-lg font-bold text-white flex items-center"><Shield className="w-5 h-5 mr-2 text-green-400" /> Staff Permissions</h4>
                        <button onClick={() => setShowArchived(!showArchived)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${showArchived ? 'bg-indigo-900/40 text-indigo-300 border-indigo-700' : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-white'}`}>
                            {showArchived ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />} {showArchived ? "Showing Archived" : "Hide Archived"}
                        </button>
                    </div>

                    <div className="bg-gray-900/50 rounded-xl border border-gray-700 overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-800 select-none">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-white transition-colors group" onClick={() => handleSort('name')}>
                                        <div className="flex items-center gap-1">Team Member {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />) : <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />}</div>
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-white transition-colors group" onClick={() => handleSort('role')}>
                                        <div className="flex items-center justify-end gap-1">{sortConfig.key === 'role' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />) : <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />} Security Clearance</div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {sortedWorkforce.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-800/50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-white">{user.name} {user.nickname && <span className="text-gray-400 font-normal">({user.nickname})</span>}</p>
                                                {user.status !== 'active' && <span className="bg-red-900/30 text-red-400 border border-red-800/50 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">Archived</span>}
                                            </div>
                                            <p className="text-xs text-gray-400">{user.email || 'No email registered'}</p>
                                            <p className="text-[9px] text-gray-600 font-mono mt-0.5">UID: {user.id}</p>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <select
                                                value={user.role || 'staff'}
                                                onChange={(e) => handleRoleChange(user.id, e.target.value, user.name)}
                                                disabled={isSaving}
                                                className={`text-sm rounded-lg px-3 py-1.5 border outline-none font-medium text-right cursor-pointer ${user.role === 'manager' ? 'bg-amber-900/30 text-amber-400 border-amber-700/50' : user.role === 'dept_manager' ? 'bg-teal-900/30 text-teal-400 border-teal-700/50' : 'bg-gray-800 text-gray-400 border-gray-600'}`}
                                            >
                                                <option value="staff" className="bg-gray-800 text-white font-medium">Staff (No Admin Access)</option>
                                                <option value="dept_manager" className="bg-gray-800 text-white font-medium">Department Manager</option>
                                                <option value="manager" className="bg-gray-800 text-white font-medium">General Manager</option>
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                                {sortedWorkforce.length === 0 && <tr><td colSpan="2" className="px-4 py-8 text-center text-gray-500 italic">No staff found for this branch.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};