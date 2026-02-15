import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../../firebase'; 

const functions = getFunctions(app, 'asia-southeast1');
const createUser = httpsCallable(functions, 'createUser');

export default function AddStaffForm({ auth, onClose, departments }) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [nickname, setNickname] = useState('');
    const [position, setPosition] = useState('');
    const [department, setDepartment] = useState(departments[0] || '');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    
    // NEW STATE for Pay Rules
    const [payType, setPayType] = useState('Salary');
    const [baseSalary, setBaseSalary] = useState('');
    const [hourlyRate, setHourlyRate] = useState('');
    const [standardDayHours, setStandardDayHours] = useState('8');
    const [isSsoRegistered, setIsSsoRegistered] = useState(true);

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!firstName || !lastName || !nickname || !position || !department || !startDate || !email || !password) {
            setError('Please fill out all required fields.');
            return;
        }
        if (payType === 'Salary' && !baseSalary) { setError('Base Salary is required.'); return; }
        if (payType === 'Hourly' && !hourlyRate) { setError('Hourly Rate is required.'); return; }

        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }

        setIsSaving(true);
        setError('');
        setSuccess('');

        try {
            // Prepare payload matching new structure
            const userData = {
                email, password, firstName, lastName, nickname, position, department, startDate, payType,
                isSsoRegistered,
                baseSalary: payType === 'Salary' ? parseInt(baseSalary, 10) : null,
                standardDayHours: payType === 'Salary' ? parseInt(standardDayHours, 10) : null,
                hourlyRate: payType === 'Hourly' ? parseInt(hourlyRate, 10) : null,
                
                // Legacy 'rate' field for safety/backwards compatibility if needed by backend logic immediately
                rate: payType === 'Salary' ? parseInt(baseSalary, 10) : parseInt(hourlyRate, 10) 
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
                    <select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" required>
                        {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
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

            {/* CONDITIONAL PAY INPUTS */}
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
            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
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
            </div>

            <div className="border-t border-gray-700 pt-6"></div>

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
};