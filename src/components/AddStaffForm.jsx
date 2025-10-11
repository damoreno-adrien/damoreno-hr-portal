import React, { useState } from 'react';

export default function AddStaffForm({ auth, onClose, departments }) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [nickname, setNickname] = useState('');
    const [position, setPosition] = useState('');
    const [department, setDepartment] = useState(departments[0] || '');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [payType, setPayType] = useState('Monthly');
    const [rate, setRate] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!firstName || !lastName || !nickname || !position || !department || !startDate || !email || !password || !rate) {
            setError('Please fill out all fields.');
            return;
        }
        if (password.length < 6) { setError('Password must be at least 6 characters long.'); return; }
        setIsSaving(true);
        setError('');
        setSuccess('');

        try {
            const functionUrl = "https://createuser-3hzcubx72q-uc.a.run.app";
            const token = await auth.currentUser.getIdToken();

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ email, password, firstName, lastName, nickname, position, department, startDate, payType, rate }),
            });
            
            const responseData = await response.json();
            if (!response.ok) throw new Error(responseData.error || 'Something went wrong');
            
            setSuccess(`Successfully created user for ${email}!`);
            setTimeout(() => onClose(), 2000);

        } catch (err) { setError(err.message); } finally { setIsSaving(false); }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div><label className="block text-sm font-medium text-gray-300 mb-1">First Name</label><input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                <div><label className="block text-sm font-medium text-gray-300 mb-1">Last Name</label><input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label className="block text-sm font-medium text-gray-300 mb-1">Nickname</label><input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                <div><label className="block text-sm font-medium text-gray-300 mb-1">Email Address</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label className="block text-sm font-medium text-gray-300 mb-1">Department</label><select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">{departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}</select></div>
                 <div><label className="block text-sm font-medium text-gray-300 mb-1">Position</label><input type="text" value={position} onChange={(e) => setPosition(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                <div><label className="block text-sm font-medium text-gray-300 mb-1">Pay Type</label><select value={payType} onChange={(e) => setPayType(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"><option>Monthly</option><option>Hourly</option></select></div>
            </div>
            <div><label className="block text-sm font-medium text-gray-300 mb-1">{payType === 'Monthly' ? 'Base Salary (THB)' : 'Hourly Rate (THB)'}</label><input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
            <div className="border-t border-gray-700 pt-6">
                 <p className="text-sm text-gray-400 mb-4">Create Login Credentials:</p>
                 <div><label className="block text-sm font-medium text-gray-300 mb-1">Temporary Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
            </div>
            {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
            {success && <p className="text-green-400 text-sm text-center mt-2">{success}</p>}
            <div className="flex justify-end pt-4 space-x-4">
                <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg text-gray-300 bg-gray-600 hover:bg-gray-500">Cancel</button>
                <button type="submit" disabled={isSaving} className="px-6 py-2 rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800">{isSaving ? 'Creating...' : 'Create Staff'}</button>
            </div>
        </form>
    );
};