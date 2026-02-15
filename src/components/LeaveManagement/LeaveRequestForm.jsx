// src/components/LeaveManagement/LeaveRequestForm.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { addDoc, collection, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import * as dateUtils from '../../utils/dateUtils';
import { AlertTriangle } from 'lucide-react'; 

const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

// --- MODIFIED: Added `initialData` to props ---
export default function LeaveRequestForm({ db, user, onClose, existingRequests = [], existingRequest = null, initialData = null, userRole, staffList = [], companyConfig, leaveBalances, isModalOpen }) {
    const [leaveType, setLeaveType] = useState('Annual Leave');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [selectedStaffId, setSelectedStaffId] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const isManagerCreating = userRole === 'manager' && !existingRequest;
    
    const targetStaffBalances = useMemo(() => {
        const targetId = isManagerCreating ? selectedStaffId : (existingRequest ? existingRequest.staffId : user.uid);
        if (!targetId) return null;

        const staffProfile = staffList.find(s => s.id === targetId) || (user.uid === targetId ? user : null);
        if (!staffProfile || !companyConfig) return null;

        const currentYear = new Date().getFullYear();
        
        let hireDate = new Date();
        if (staffProfile.startDate) {
            if (staffProfile.startDate.toDate) hireDate = staffProfile.startDate.toDate();
            else if (typeof staffProfile.startDate === 'string') hireDate = dateUtils.parseISODateString(staffProfile.startDate) || new Date(staffProfile.startDate);
        }
        
        const yearsOfService = (new Date() - hireDate) / (1000 * 60 * 60 * 24 * 365);
        
        let annualQuota = 0;
        if (yearsOfService >= 1) { 
            annualQuota = Number(companyConfig.annualLeaveDays) || 0; 
        } else if (hireDate.getFullYear() === currentYear) { 
            const monthsWorked = 12 - hireDate.getMonth(); 
            annualQuota = Math.floor((Number(companyConfig.annualLeaveDays) / 12) * monthsWorked); 
        }

        const sickQuota = Number(companyConfig.paidSickDays) || 30;
        const personalQuota = Number(companyConfig.paidPersonalDays) || 0;
        
        const today = new Date();
        const pastHolidays = (companyConfig.publicHolidays || []).filter(h => {
            const d = dateUtils.parseISODateString(h.date);
            return d && d < today && d.getFullYear() === currentYear;
        });
        const phQuota = Math.min(pastHolidays.length, Number(companyConfig.publicHolidayCreditCap) || 15);

        let used = { annual: 0, sick: 0, personal: 0, ph: 0 };
        
        existingRequests.forEach(req => {
            if (req.staffId !== targetId) return;
            if (req.status === 'rejected') return; 
            
            const reqDate = dateUtils.parseISODateString(req.startDate);
            if (!reqDate || reqDate.getFullYear() !== currentYear) return;

            if (req.leaveType === 'Annual Leave') used.annual += req.totalDays;
            if (req.leaveType === 'Sick Leave') used.sick += req.totalDays;
            if (req.leaveType === 'Personal Leave') used.personal += req.totalDays;
            if (req.leaveType === 'Public Holiday (In Lieu)') used.ph += req.totalDays;
        });

        return {
            annual: { total: annualQuota, used: used.annual, remaining: Math.max(0, annualQuota - used.annual) },
            sick: { total: sickQuota, used: used.sick, remaining: Math.max(0, sickQuota - used.sick) },
            personal: { total: personalQuota, used: used.personal, remaining: Math.max(0, personalQuota - used.personal) },
            ph: { total: phQuota, used: used.ph, remaining: Math.max(0, phQuota - used.ph) }
        };
    }, [selectedStaffId, user.uid, isManagerCreating, existingRequests, staffList, companyConfig, existingRequest]);

    // --- MODIFIED: Listen for initialData to prefill the form ---
    useEffect(() => {
        if (existingRequest) {
            setLeaveType(existingRequest.leaveType);
            setStartDate(existingRequest.startDate);
            setEndDate(existingRequest.endDate);
            setReason(existingRequest.reason || '');
            setSelectedStaffId(existingRequest.staffId);
        } else if (initialData) {
            // Fill with the clicked calendar data
            setLeaveType('Annual Leave');
            setStartDate(initialData.startDate || '');
            setEndDate(initialData.endDate || '');
            setReason('');
            setSelectedStaffId(initialData.staffId || '');
        } else {
            setLeaveType('Annual Leave');
            setStartDate('');
            setEndDate('');
            setReason('');
            setSelectedStaffId('');
        }
    }, [existingRequest, initialData, isModalOpen]);

    useEffect(() => {
        const start = dateUtils.parseISODateString(startDate);
        const end = dateUtils.parseISODateString(endDate);
        if (start && end && end < start) setEndDate(startDate);
    }, [startDate, endDate]);

    const totalDays = dateUtils.differenceInCalendarDays(endDate, startDate);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!leaveType || !startDate || !endDate || (isManagerCreating && !selectedStaffId)) {
            setError('Please fill in all required fields.');
            return;
        }
        
        if (targetStaffBalances) {
            let balance = 0;
            let label = '';
            if (leaveType === 'Annual Leave') { balance = targetStaffBalances.annual.remaining; label = 'Annual Leave'; }
            if (leaveType === 'Public Holiday (In Lieu)') { balance = targetStaffBalances.ph.remaining; label = 'PH Credits'; }
            if (leaveType === 'Personal Leave') { balance = targetStaffBalances.personal.remaining; label = 'Personal Leave'; }
            
            if (userRole === 'staff' && leaveType !== 'Sick Leave' && totalDays > balance) {
                setError(`Insufficient ${label}. You have ${balance} remaining, but requested ${totalDays}.`);
                return;
            }
        }

        const daysOverQuota = targetStaffBalances ? (targetStaffBalances.sick.used + totalDays) - targetStaffBalances.sick.total : 0;

        if (userRole === 'staff' && leaveType === 'Sick Leave' && daysOverQuota > 0) {
            if (!window.confirm(`This request exceeds your 30-day paid sick leave quota. The ${daysOverQuota} days over the limit will be unpaid. Do you still want to submit?`)) {
                return;
            }
        }

        setIsSaving(true);
        const checkStaffId = isManagerCreating ? selectedStaffId : (existingRequest ? existingRequest.staffId : user.uid);
        const staffForRequest = staffList.find(s => s.id === checkStaffId) || { ...user, id: user.uid };

        const requestData = {
            staffId: checkStaffId,
            staffName: getDisplayName(staffForRequest),
            staffDepartment: staffForRequest.department || null,
            leaveType, startDate, endDate, totalDays, reason,
            status: existingRequest ? existingRequest.status : 'pending',
        };

        try {
            if (existingRequest) {
                await updateDoc(doc(db, 'leave_requests', existingRequest.id), { ...requestData, lastEditedBy: user.uid, lastEditedAt: serverTimestamp() });
            } else {
                let creatorName = 'Unknown';
                const creator = staffList.find(s => s.id === user.uid);
                if (creator) creatorName = getDisplayName(creator);
                
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
        } catch (err) { setError('Failed to submit.'); console.error(err); } 
        finally { setIsSaving(false); }
    };

    const minStartDate = userRole === 'manager' ? null : dateUtils.formatISODate(dateUtils.addDays(new Date(), 1));

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {isManagerCreating && (
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Select Staff Member</label>
                    <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md text-white border-gray-600">
                        <option value="">-- Choose an employee --</option>
                        {staffList.filter(s => s.status !== 'inactive').map(staff => <option key={staff.id} value={staff.id}>{getDisplayName(staff)}</option>)}
                    </select>
                </div>
            )}
            
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Leave Type</label>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md text-white border-gray-600">
                    <option>Annual Leave</option>
                    <option>Sick Leave</option>
                    <option>Personal Leave</option>
                    <option>Public Holiday (In Lieu)</option>
                </select>

                {targetStaffBalances && (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className={`p-2 rounded border ${leaveType === 'Annual Leave' ? 'bg-amber-900/30 border-amber-600' : 'bg-gray-700 border-gray-600'}`}>
                            <span className="text-gray-400">Annual:</span> <span className="font-bold text-white">{targetStaffBalances.annual.remaining} / {targetStaffBalances.annual.total}</span>
                        </div>
                        <div className={`p-2 rounded border ${leaveType === 'Personal Leave' ? 'bg-green-900/30 border-green-600' : 'bg-gray-700 border-gray-600'}`}>
                            <span className="text-gray-400">Personal:</span> <span className="font-bold text-white">{targetStaffBalances.personal.remaining} / {targetStaffBalances.personal.total}</span>
                        </div>
                        <div className={`p-2 rounded border ${leaveType === 'Sick Leave' ? 'bg-red-900/30 border-red-600' : 'bg-gray-700 border-gray-600'}`}>
                            <span className="text-gray-400">Sick (Paid):</span> <span className="font-bold text-white">{targetStaffBalances.sick.remaining} / {targetStaffBalances.sick.total}</span>
                        </div>
                        <div className={`p-2 rounded border ${leaveType === 'Public Holiday (In Lieu)' ? 'bg-blue-900/30 border-blue-600' : 'bg-gray-700 border-gray-600'}`}>
                            <span className="text-gray-400">PH Credit:</span> <span className="font-bold text-white">{targetStaffBalances.ph.remaining}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} min={minStartDate} className="w-full p-2 bg-gray-700 rounded-md text-white border-gray-600" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || minStartDate} className="w-full p-2 bg-gray-700 rounded-md text-white border-gray-600" />
                </div>
            </div>
            <p className="text-sm text-gray-400 text-right">Total: <span className="font-bold text-white text-lg">{totalDays > 0 ? totalDays : 0}</span> Days</p>

            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Reason (Optional)</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows="3" className="w-full p-2 bg-gray-700 rounded-md text-white border-gray-600"></textarea>
            </div>
            
            {error && <p className="text-red-400 text-sm bg-red-900/20 p-2 rounded border border-red-800">{error}</p>}
            
            <div className="flex justify-end pt-4 space-x-4">
                <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white">Cancel</button>
                <button type="submit" disabled={isSaving} className="px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold">{isSaving ? 'Submitting...' : 'Submit Request'}</button>
            </div>
        </form>
    );
};