/* src/components/Settings/AccessControlSettings.jsx */

import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../../firebase.js';
import { Shield, UserCog, UserPlus, Loader2, Eye, EyeOff, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

const functions = getFunctions(app);
const inviteAdminFunc = httpsCallable(functions, 'inviteAdmin');
const updateUserRoleFunc = httpsCallable(functions, 'updateUserRole');

export const AccessControlSettings = ({ db, userRole }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [showArchived, setShowArchived] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    const [newAdminName, setNewAdminName] = useState('');
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [newAdminPassword, setNewAdminPassword] = useState('');

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const usersSnap = await getDocs(collection(db, 'users'));
            const baseUsers = {};
            usersSnap.docs.forEach(doc => { baseUsers[doc.id] = { id: doc.id, ...doc.data() }; });

            const profilesSnap = await getDocs(collection(db, 'staff_profiles'));
            profilesSnap.docs.forEach(doc => {
                const profileData = doc.data();
                if (!baseUsers[doc.id]) baseUsers[doc.id] = { id: doc.id, role: 'staff' };
                baseUsers[doc.id].email = profileData.email || baseUsers[doc.id].email;
                baseUsers[doc.id].nickname = profileData.nickname || '';
                baseUsers[doc.id].name = profileData.firstName
                    ? `${profileData.firstName} ${profileData.lastName || ''}`
                    : profileData.fullName || profileData.nickname || baseUsers[doc.id].name || 'Unknown Name';
                baseUsers[doc.id].status = profileData.status || 'active';
            });
            setUsers(Object.values(baseUsers));
        } catch (error) { console.error("Failed to fetch users", error); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchUsers(); }, [db]);

    const handleInviteAdmin = async (e) => {
        e.preventDefault();
        if (!newAdminName || !newAdminEmail || newAdminPassword.length < 6) return alert("Please fill all fields. Password must be at least 6 characters.");
        setIsSaving(true);
        try {
            await inviteAdminFunc({ name: newAdminName, email: newAdminEmail, password: newAdminPassword });
            setNewAdminName(''); setNewAdminEmail(''); setNewAdminPassword('');
            alert("Success! Branch Director (Admin) account has been created.");
            await fetchUsers();
        } catch (error) { alert(`Error: ${error.message}`); }
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

    // Only Super Admins can see other Super Admins. Directors only see Directors.
    const executives = users.filter(u =>
        ['admin', 'super_admin'].includes(u.role) &&
        (userRole === 'super_admin' || u.role !== 'super_admin')
    );
    const workforce = users.filter(u => !['admin', 'super_admin'].includes(u.role));
    const filteredWorkforce = workforce.filter(u => showArchived ? true : (u.status !== 'archived' && u.status !== 'inactive'));

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
            {/* --- NEW: Blocking Loading Overlay --- */}
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
                    <h4 className="text-lg font-bold text-white flex items-center border-b border-gray-700 pb-2"><UserCog className="w-5 h-5 mr-2 text-amber-400" /> Executive Roster (Admins)</h4>
                    <p className="text-sm text-gray-400 mb-4">Admins have full access to the Command Center but do not have Staff Profiles (no clock-ins or payslips).</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {userRole === 'super_admin' && (
                            <form onSubmit={handleInviteAdmin} className="bg-gray-900/50 p-4 rounded-xl border border-gray-700 space-y-3">
                                <h5 className="font-bold text-gray-300 flex items-center text-sm"><UserPlus className="w-4 h-4 mr-2" /> Invite New Branch Director</h5>
                                <input type="text" placeholder="Full Name" value={newAdminName} onChange={e => setNewAdminName(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded-lg border border-gray-600 text-sm" />
                                <input type="email" placeholder="Email Address" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded-lg border border-gray-600 text-sm" />
                                <input type="password" placeholder="Temporary Password" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded-lg border border-gray-600 text-sm" />
                                <button type="submit" disabled={isSaving} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg text-sm transition-colors disabled:opacity-50">Create Admin Account</button>
                            </form>
                        )}
                        <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                            <h5 className="font-bold text-gray-300 text-sm mb-3">Current Executives</h5>
                            <div className="space-y-2">
                                {executives.map(user => (
                                    <div key={user.id} className="flex items-center justify-between bg-gray-800 p-2.5 rounded-lg border border-gray-700">
                                        <div><p className="text-sm font-bold text-white">{user.name || 'Unknown Name'}</p><p className="text-xs text-gray-400">{user.email}</p></div>
                                        <span className="bg-indigo-900/50 text-indigo-400 border border-indigo-700/50 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">{user.role}</span>
                                    </div>
                                ))}
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
                                {sortedWorkforce.length === 0 && <tr><td colSpan="2" className="px-4 py-8 text-center text-gray-500 italic">No staff found.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};