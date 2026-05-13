/* src/components/StaffProfile/AddStaffForm.jsx */

import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../../firebase';

const functions = getFunctions(app, 'asia-southeast1');
const createUser = httpsCallable(functions, 'createUser');

export default function AddStaffForm({ auth, onClose, departments, userRole, activeBranch, branches = [], managerProfile, companyConfig }) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [nickname, setNickname] = useState('');
    const [position, setPosition] = useState('');
    
    // --- GESTION DYNAMIQUE DES DÉPARTEMENTS ---
    const [availableDepartments, setAvailableDepartments] = useState([]);
    const [department, setDepartment] = useState('');

    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // PAY RULES STATE
    const [payType, setPayType] = useState('Salary');
    const [baseSalary, setBaseSalary] = useState('');
    const [hourlyRate, setHourlyRate] = useState('');
    const [standardDayHours, setStandardDayHours] = useState('8');
    const [isSsoRegistered, setIsSsoRegistered] = useState(true);
    const [holidayPolicy, setHolidayPolicy] = useState('in_lieu');

    // --- SECURE BRANCH LOGIC ---
    const determineDefaultBranch = () => {
        if (['manager', 'dept_manager'].includes(userRole)) return managerProfile?.branchId || '';
        if (activeBranch && activeBranch !== 'global') return activeBranch;
        if (branches.length === 1) return branches[0].id;
        return '';
    };

    const [branchId, setBranchId] = useState(determineDefaultBranch());
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        if (!branchId && branches.length === 1) {
            setBranchId(branches[0].id);
        }
    }, [branches, branchId]);

    // --- MISE À JOUR AUTOMATIQUE DES DÉPARTEMENTS SELON LA BRANCHE ---
    useEffect(() => {
        let deps = [];
        if (branchId && companyConfig?.branchSettings?.[branchId]?.departments) {
            deps = companyConfig.branchSettings[branchId].departments;
        } else if (companyConfig?.departments) {
            deps = companyConfig.departments;
        } else if (departments && departments.length > 0) {
            deps = departments;
        }

        setAvailableDepartments(deps);
        if (deps.length > 0) {
            setDepartment(deps[0]);
        } else {
            setDepartment('');
        }
    }, [branchId, companyConfig, departments]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!firstName || !lastName || !nickname || !position || !department || !startDate || !email || !password || !branchId) {
            setError('Please fill out all required fields, including the branch location and department.');
            return;
        }
        if (payType === 'Salary' && !baseSalary) { setError('Base Salary is required.'); return; }
        if (payType === 'Hourly' && !hourlyRate) { setError('Hourly Rate is required.'); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters long.'); return; }

        setIsSaving(true);
        setError('');
        setSuccess('');

        try {
            const numericRate = payType === 'Salary' ? Number(baseSalary) : Number(hourlyRate);

            // PAYLOAD TOTALEMENT À PLAT COMME ATTENDU PAR CREATEUSER.JS
            const userData = {
                // Core infos
                email,
                password,
                firstName,
                lastName,
                nickname,
                branchId,
                isSsoRegistered,
                holidayPolicy,
                
                // Job infos (Directement à la racine !)
                position,
                department,
                startDate,
                payType,
                rate: numericRate, 
                baseSalary: payType === 'Salary' ? numericRate : null,
                hourlyRate: payType === 'Hourly' ? numericRate : null,
                standardDayHours: Number(standardDayHours) || 8
            };

            const result = await createUser(userData);

            setSuccess(result.data.result || `Successfully created user for ${email}!`);
            setTimeout(() => onClose(), 2000);

        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {['admin', 'super_admin'].includes(userRole) && branches.length > 1 && (
                <div className="bg-indigo-900/30 p-4 rounded-lg border border-indigo-700 mb-6">
                    <label className="block text-sm font-bold text-indigo-400 mb-1">Target Branch Location</label>
                    <select
                        value={branchId}
                        onChange={(e) => setBranchId(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white outline-none focus:border-indigo-500"
                        required
                    >
                        <option value="" disabled>-- Select a branch for this staff --</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
            )}

            {['admin', 'super_admin'].includes(userRole) && branches.length === 1 && (
                <div className="px-4 py-2 bg-gray-800/50 rounded border border-gray-700 mb-4 flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">Assigning to:</span>
                    <span className="text-sm text-indigo-400 font-bold">{branches[0].name}</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">First Name</label>
                    <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Last Name</label>
                    <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" required />
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Nickname</label>
                    <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" required />
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Department</label>
                    <select 
                        value={department} 
                        onChange={(e) => setDepartment(e.target.value)} 
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white outline-none focus:border-amber-500" 
                        required
                    >
                        <option value="" disabled>-- Select Department --</option>
                        {availableDepartments.length > 0 ? (
                            availableDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)
                        ) : (
                            <option value="" disabled>{branchId ? 'No departments configured' : 'Select a branch first'}</option>
                        )}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Position</label>
                    <input type="text" value={position} onChange={(e) => setPosition(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" required />
                </div>
            </div>

            <hr className="border-gray-700" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Pay Type</label>
                    <select value={payType} onChange={(e) => setPayType(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" required>
                        <option value="Salary">Salary (Fixed Monthly)</option>
                        <option value="Hourly">Hourly (Per Hour)</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                {payType === 'Salary' ? (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-amber-400 mb-1">Base Salary (THB/Month)</label>
                            <input type="number" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" placeholder="e.g. 40000" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-amber-400 mb-1">Standard Daily Hours</label>
                            <input type="number" value={standardDayHours} onChange={(e) => setStandardDayHours(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" placeholder="e.g. 8" required />
                            <p className="text-xs text-gray-500 mt-1">Used for OT calculation (Full-time=8, Part-time=4)</p>
                        </div>
                    </>
                ) : (
                    <div>
                        <label className="block text-sm font-medium text-blue-400 mb-1">Hourly Rate (THB/Hour)</label>
                        <input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" placeholder="e.g. 150" required />
                    </div>
                )}
            </div>

            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 space-y-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isSsoRegistered}
                        onChange={(e) => setIsSsoRegistered(e.target.checked)}
                        className="h-5 w-5 rounded bg-gray-700 border-gray-600 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                        <span className="text-sm font-bold text-white">Enrolled in Social Security (SSO)</span>
                        <p className="text-xs text-gray-400 mt-0.5">Calculates the 5% SSO deduction & allowance in payroll.</p>
                    </div>
                </label>

                <div className="border-t border-gray-700 pt-4">
                    <label className="block text-sm font-bold text-indigo-400 mb-1">Public Holiday Policy</label>
                    <select
                        value={holidayPolicy}
                        onChange={(e) => setHolidayPolicy(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-indigo-500 outline-none"
                        required
                    >
                        <option value="in_lieu">In Lieu (Accrue substitute days off)</option>
                        <option value="paid">Paid (Cash payout on holiday)</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1.5">Determines if they earn days off or receive extra cash when working holidays.</p>
                </div>
            </div>

            <div className="border-t border-gray-700 pt-6">
                <p className="text-sm text-gray-400 mb-4">Create Login Credentials:</p>
                <div className="grid grid-cols-1">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Temporary Password</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" required />
                    </div>
                </div>
            </div>
            
            {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
            {success && <p className="text-green-400 text-sm text-center mt-2">{success}</p>}
            
            <div className="flex justify-end pt-4 space-x-4">
                <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg text-gray-300 bg-gray-600 hover:bg-gray-500">Cancel</button>
                <button type="submit" disabled={isSaving} className="px-6 py-2 rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800">
                    {isSaving ? 'Creating...' : 'Create Staff'}
                </button>
            </div>
        </form>
    );
}