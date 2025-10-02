import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export default function LeaveRequestForm({ db, user, onClose }) {
    const [leaveType, setLeaveType] = useState('Annual Leave');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const calculateDays = (start, end) => {
        if (!start || !end) return 0;
        const diffTime = Math.abs(new Date(end) - new Date(start));
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    };

    const totalDays = calculateDays(startDate, endDate);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!leaveType || !startDate || !endDate) {
            setError('Please fill in all date and type fields.');
            return;
        }
        setIsSaving(true);
        setError('');

        try {
            await addDoc(collection(db, 'leave_requests'), {
                staffId: user.uid,
                staffName: user.displayName || user.email,
                leaveType,
                startDate,
                endDate,
                totalDays,
                reason,
                status: 'pending',
                requestedAt: serverTimestamp()
            });
            onClose();
        } catch (err) {
            setError('Failed to submit request. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Leave Type</label>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md">
                    <option>Annual Leave</option>
                    <option>Sick Leave</option>
                    <option>Personal Leave</option>
                </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
            </div>
             <div>
                <p className="text-sm text-gray-400">Total days: <span className="font-bold text-white">{totalDays > 0 ? totalDays : ''}</span></p>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Reason (Optional)</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows="3" className="w-full p-2 bg-gray-700 rounded-md"></textarea>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex justify-end pt-4 space-x-4">
                <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-600">Cancel</button>
                <button type="submit" disabled={isSaving} className="px-6 py-2 rounded-lg bg-amber-600">{isSaving ? 'Submitting...' : 'Submit Request'}</button>
            </div>
        </form>
    );
};

