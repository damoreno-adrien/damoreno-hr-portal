import React, { useState, useEffect } from 'react';
import { addDoc, collection, serverTimestamp, doc, updateDoc } from 'firebase/firestore';

export default function LeaveRequestForm({ db, user, onClose, existingRequests = [], existingRequest = null, userRole, staffList = [], companyConfig, publicHolidayCredits = 0 }) {
    const [leaveType, setLeaveType] = useState('Annual Leave');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [selectedStaffId, setSelectedStaffId] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const isManagerCreating = userRole === 'manager' && !existingRequest;

    useEffect(() => {
        if (existingRequest) {
            setLeaveType(existingRequest.leaveType);
            setStartDate(existingRequest.startDate);
            setEndDate(existingRequest.endDate);
            setReason(existingRequest.reason || '');
            setSelectedStaffId(existingRequest.staffId);
        }
    }, [existingRequest]);

    useEffect(() => {
        if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
            setEndDate('');
        }
    }, [startDate, endDate]);

    const calculateDays = (start, end) => {
        if (!start || !end || new Date(end) < new Date(start)) return 0;
        const diffTime = Math.abs(new Date(end) - new Date(start));
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    };

    const totalDays = calculateDays(startDate, endDate);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!leaveType || !startDate || !endDate || (isManagerCreating && !selectedStaffId)) {
            setError('Please fill in all required fields.');
            return;
        }
        if (new Date(endDate) < new Date(startDate)) {
            setError('The end date cannot be before the start date.');
            return;
        }

        const newStart = new Date(startDate);
        const newEnd = new Date(endDate);
        const checkStaffId = isManagerCreating ? selectedStaffId : (existingRequest ? existingRequest.staffId : user.uid);
        
        const overlaps = existingRequests.some(req => {
            if (req.staffId !== checkStaffId) return false;
            if (existingRequest && req.id === existingRequest.id) return false;
            const existingStart = new Date(req.startDate);
            const existingEnd = new Date(req.endDate);
            return newStart <= existingEnd && newEnd >= existingStart;
        });

        if (overlaps) {
            setError('The selected dates overlap with an existing leave request for this staff member.');
            return;
        }

        setIsSaving(true);
        const selectedStaff = staffList.find(s => s.id === selectedStaffId);
        const requestData = {
            staffId: checkStaffId,
            staffName: isManagerCreating ? selectedStaff.fullName : (existingRequest ? existingRequest.staffName : (user.displayName || user.email)),
            leaveType, startDate, endDate, totalDays, reason,
            status: existingRequest ? existingRequest.status : 'pending',
        };

        try {
            if (existingRequest) {
                const docRef = doc(db, 'leave_requests', existingRequest.id);
                await updateDoc(docRef, requestData);
            } else {
                await addDoc(collection(db, 'leave_requests'), {
                    ...requestData,
                    requestedAt: serverTimestamp(),
                    status: isManagerCreating ? 'approved' : 'pending',
                    isReadByStaff: isManagerCreating ? false : null,
                });
            }
            onClose();
        } catch (err) {
            setError('Failed to submit request. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {isManagerCreating && (
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Select Staff Member</label>
                    <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md">
                        <option value="">-- Choose an employee --</option>
                        {staffList.map(staff => <option key={staff.id} value={staff.id}>{staff.fullName}</option>)}
                    </select>
                </div>
            )}
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Leave Type</label>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md">
                    <option>Annual Leave</option>
                    <option>Sick Leave</option>
                    <option>Personal Leave</option>
                    {(userRole === 'manager' || publicHolidayCredits > 0) && (
                        <option>Public Holiday (In Lieu)</option>
                    )}
                </select>
                {userRole === 'staff' && (
                    <p className="text-xs text-gray-400 mt-1">Available Public Holiday Credits: {publicHolidayCredits}</p>
                )}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
            </div>
             <div><p className="text-sm text-gray-400">Total days: <span className="font-bold text-white">{totalDays > 0 ? totalDays : ''}</span></p></div>
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