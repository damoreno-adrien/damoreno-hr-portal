// src/components/LeaveRequestForm.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { addDoc, collection, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import * as dateUtils from '../../utils/dateUtils'; // Use new standard

const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

// --- *** THIS IS THE FIX *** ---
export default function LeaveRequestForm({ db, user, onClose, existingRequests = [], existingRequest = null, userRole, staffList = [], companyConfig, leaveBalances, isModalOpen }) {
// --- *** END FIX *** ---
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
        } else {
            // Reset form when opening for a new request
            setLeaveType('Annual Leave');
            setStartDate('');
            setEndDate('');
            setReason('');
            setSelectedStaffId('');
        }
    }, [existingRequest, isModalOpen]); // This dependency array is now correct

    useEffect(() => {
        const start = dateUtils.parseISODateString(startDate);
        const end = dateUtils.parseISODateString(endDate);
        if (start && end && end < start) {
            setEndDate(startDate);
        }
    }, [startDate, endDate]);

    const totalDays = dateUtils.differenceInCalendarDays(endDate, startDate);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!leaveType || !startDate || !endDate || (isManagerCreating && !selectedStaffId)) {
            setError('Please fill in all required fields.');
            return;
        }

        const start = dateUtils.parseISODateString(startDate);
        const end = dateUtils.parseISODateString(endDate);

        if (end < start) {
            setError('The end date cannot be before the start date.');
            return;
        }

        if (userRole === 'staff') {
            if (leaveBalances) {
                if (leaveType === 'Public Holiday (In Lieu)' && totalDays > leaveBalances.publicHoliday) {
                    setError(`You only have ${leaveBalances.publicHoliday} public holiday credits available.`);
                    return;
                }
                if (leaveType === 'Annual Leave' && totalDays > leaveBalances.annual) {
                    setError(`You only have ${leaveBalances.annual} annual leave days available.`);
                    return;
                }
            }
        }

        const newStart = dateUtils.parseISODateString(startDate);
        const newEnd = dateUtils.parseISODateString(endDate);
        const checkStaffId = isManagerCreating ? selectedStaffId : (existingRequest ? existingRequest.staffId : user.uid);
        
        const overlaps = existingRequests.some(req => {
            if (req.staffId !== checkStaffId) return false;
            if (existingRequest && req.id === existingRequest.id) return false;
            
            const existingStart = dateUtils.parseISODateString(req.startDate);
            const existingEnd = dateUtils.parseISODateString(req.endDate);

            return newStart <= existingEnd && newEnd >= existingStart;
        });

        if (overlaps) {
            setError('The selected dates overlap with an existing leave request for this staff member.');
            return;
        }

        setIsSaving(true);
        
        const staffForRequest = staffList.find(s => s.id === checkStaffId) || { ...user, id: user.uid };

        const requestData = {
            staffId: checkStaffId,
            staffName: getDisplayName(staffForRequest),
            leaveType, startDate, endDate, totalDays, reason,
            status: existingRequest ? existingRequest.status : 'pending',
        };

        try {
            if (existingRequest) {
                // This is an EDIT
                const docRef = doc(db, 'leave_requests', existingRequest.id);
                await updateDoc(docRef, {
                    ...requestData,
                    lastEditedBy: user.uid,
                    lastEditedAt: serverTimestamp()
                });
            } else {
                // This is a NEW request
                let creatorName = 'Unknown User';
                const creatorProfile = staffList.find(s => s.id === user.uid);
                
                if (creatorProfile) {
                    creatorName = getDisplayName(creatorProfile);
                } else if (user.displayName) {
                    creatorName = user.displayName;
                } else if (userRole === 'manager') {
                    creatorName = 'Manager';
                }

                await addDoc(collection(db, 'leave_requests'), {
                    ...requestData,
                    requestedAt: serverTimestamp(),
                    status: isManagerCreating ? 'approved' : 'pending',
                    isReadByStaff: isManagerCreating ? false : null,
                    createdBy: user.uid,
                    createdByName: creatorName,
                });
            }
            onClose();
        } catch (err) {
            setError('Failed to submit request. Please try again.');
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const minStartDate = useMemo(() => {
        if (userRole === 'manager') {
            return null;
        }
        const tomorrow = dateUtils.addDays(new Date(), 1);
        return dateUtils.formatISODate(tomorrow);
    }, [userRole]);

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {isManagerCreating && (
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Select Staff Member</label>
                    <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md">
                        <option value="">-- Choose an employee --</option>
                        {staffList.map(staff => <option key={staff.id} value={staff.id}>{getDisplayName(staff)}</option>)}
                    </select>
                </div>
            )}
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Leave Type</label>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md">
                    <option>Annual Leave</option>
                    <option>Sick Leave</option>
                    <option>Personal Leave</option>
                    {(userRole === 'manager' || (leaveBalances && leaveBalances.publicHoliday > 0)) && (
                        <option>Public Holiday (In Lieu)</option>
                    )}
                </select>
                {userRole === 'staff' && leaveBalances && (
                    <div className="text-xs text-gray-400 mt-1 space-y-1">
                        <p>Annual Leave Remaining: {leaveBalances.annual}</p>
                        <p>Public Holiday Credits: {leaveBalances.publicHoliday}</p>
                    </div>
                )}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                    <input 
                        type="date" 
                        value={startDate} 
                        onChange={(e) => setStartDate(e.target.value)} 
                        min={minStartDate} 
                        className="w-full p-2 bg-gray-700 rounded-md" 
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                    <input 
                        type="date" 
                        value={endDate} 
                        onChange={(e) => setEndDate(e.target.value)} 
                        min={startDate || minStartDate} 
                        className="w-full p-2 bg-gray-700 rounded-md" 
                    />
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