/* src/components/LeaveManagement/LeaveRequestForm.jsx */

import React, { useState, useEffect, useMemo } from 'react';
import { addDoc, collection, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import * as dateUtils from '../../utils/dateUtils';
import { getDisplayName } from '../../utils/staffUtils'; 
import { calculateStaffLeaveBalances } from '../../utils/leaveCalculator';
import { AlertTriangle, Banknote } from 'lucide-react'; 

export default function LeaveRequestForm({ db, user, onClose, existingRequests = [], existingRequest = null, initialData = null, userRole, staffList = [], companyConfig, isModalOpen }) {
    const [leaveType, setLeaveType] = useState('Annual Leave');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [selectedStaffId, setSelectedStaffId] = useState('');
    const [cashOutDays, setCashOutDays] = useState(1);
    const [manualLeaveDays, setManualLeaveDays] = useState(0); 
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const isFullManager = ['admin', 'manager', 'super_admin'].includes(userRole);
    const isManagerCreating = ['manager', 'admin', 'super_admin', 'dept_manager'].includes(userRole) && !existingRequest;
    
    const targetStaffBalances = useMemo(() => {
        const targetId = isManagerCreating ? selectedStaffId : (existingRequest ? existingRequest.staffId : user.uid);
        if (!targetId || !companyConfig) return null;
        const staffProfile = staffList.find(s => s.id === targetId) || (user.uid === targetId ? user : null);
        return calculateStaffLeaveBalances(staffProfile, existingRequests, companyConfig);
    }, [selectedStaffId, user.uid, isManagerCreating, existingRequests, staffList, companyConfig, existingRequest]);

    useEffect(() => {
        if (existingRequest) {
            setLeaveType(existingRequest.leaveType);
            setStartDate(existingRequest.startDate);
            setEndDate(existingRequest.endDate);
            setReason(existingRequest.reason || '');
            setSelectedStaffId(existingRequest.staffId);
            if (existingRequest.leaveType === 'Cash Out Holiday Credits') setCashOutDays(existingRequest.totalDays);
            else setManualLeaveDays(existingRequest.totalDays);
        } else if (initialData) {
            setLeaveType('Annual Leave');
            setStartDate(initialData.startDate || '');
            setEndDate(initialData.endDate || '');
            setReason('');
            setSelectedStaffId(initialData.staffId || '');
            setManualLeaveDays(1);
        } else {
            setLeaveType('Annual Leave');
            setStartDate(''); setEndDate(''); setReason(''); setSelectedStaffId('');
            setCashOutDays(1); setManualLeaveDays(0);
        }
    }, [existingRequest, initialData, isModalOpen]);

    useEffect(() => {
        const start = dateUtils.parseISODateString(startDate);
        const end = dateUtils.parseISODateString(endDate);
        if (start && end && end < start) setEndDate(startDate);
        
        if (start && end && end >= start) {
            if (!existingRequest) {
                const diff = dateUtils.differenceInCalendarDays(endDate, startDate);
                setManualLeaveDays(diff);
            }
        } else {
            if (!existingRequest) setManualLeaveDays(0);
        }
    }, [startDate, endDate, existingRequest]);

    const totalDays = leaveType === 'Cash Out Holiday Credits' ? cashOutDays : manualLeaveDays;

    const handleCashOutChange = (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val)) val = 1;
        const maxAllowed = targetStaffBalances ? targetStaffBalances.ph.cashable : 1; 
        setCashOutDays(Math.min(Math.max(1, val), maxAllowed));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!leaveType || (isManagerCreating && !selectedStaffId)) { setError('Please fill in all required fields.'); return; }
        if (leaveType !== 'Cash Out Holiday Credits' && (!startDate || !endDate)) { setError('Please provide start and end dates.'); return; }
        if (leaveType === 'Cash Out Holiday Credits' && totalDays <= 0) { setError('You do not have any credits available to cash out.'); return; }

        const checkStaffId = isManagerCreating ? selectedStaffId : (existingRequest ? existingRequest.staffId : user.uid);

        if (targetStaffBalances) {
            let balance = 0; let label = '';
            if (leaveType === 'Annual Leave') { balance = targetStaffBalances.annual.remaining; label = 'Annual Leave'; }
            if (leaveType === 'Cash Out Holiday Credits') { balance = targetStaffBalances.ph.cashable; label = 'Cashable PH Credits'; }
            if (leaveType === 'Public Holiday (In Lieu)') { balance = targetStaffBalances.ph.remaining; label = 'PH Credits'; }
            if (leaveType === 'Personal Leave') { balance = targetStaffBalances.personal.remaining; label = 'Personal Leave'; }
            
            if (!isFullManager && leaveType !== 'Sick Leave' && totalDays > balance) {
                const subject = user.uid === checkStaffId ? 'You have' : 'They have';
                setError(`Insufficient ${label}. ${subject} ${balance} remaining, but requested ${totalDays}.`);
                return;
            }
        }

        const daysOverQuota = targetStaffBalances ? (targetStaffBalances.sick.used + totalDays) - targetStaffBalances.sick.total : 0;
        if (!isFullManager && leaveType === 'Sick Leave' && daysOverQuota > 0) {
            const subject = user.uid === checkStaffId ? 'your' : 'their';
            if (!window.confirm(`This request exceeds ${subject} 30-day paid sick leave quota. The ${daysOverQuota} days over the limit will be unpaid. Do you still want to submit?`)) return;
        }

        setIsSaving(true);
        const staffForRequest = staffList.find(s => s.id === checkStaffId) || { ...user, id: user.uid };
        const actualStartDate = leaveType === 'Cash Out Holiday Credits' ? dateUtils.formatISODate(new Date()) : startDate;
        const actualEndDate = leaveType === 'Cash Out Holiday Credits' ? dateUtils.formatISODate(new Date()) : endDate;

        const requestData = {
            staffId: checkStaffId, 
            staffName: getDisplayName(staffForRequest), 
            staffDepartment: staffForRequest.department || null,
            branchId: staffForRequest.branchId || null, 
            leaveType, 
            startDate: actualStartDate, 
            endDate: actualEndDate, 
            totalDays, 
            reason,
            status: existingRequest ? existingRequest.status : 'pending',
        };

        try {
            if (existingRequest) {
                await updateDoc(doc(db, 'leave_requests', existingRequest.id), { ...requestData, lastEditedBy: user.uid, lastEditedAt: serverTimestamp() });
            } else {
                let creatorName = 'Unknown';
                const creator = staffList.find(s => s.id === user.uid);
                if (creator) creatorName = getDisplayName(creator);
                
                const isAutoApproved = isManagerCreating && isFullManager;
                
                const payload = {
                    ...requestData, 
                    requestedAt: serverTimestamp(),
                    status: isAutoApproved ? 'approved' : 'pending',
                    isReadByStaff: isAutoApproved ? false : null,
                    createdBy: user.uid, 
                    createdByName: creatorName,
                };

                if (isAutoApproved) {
                    payload.statusSetBy = user.uid;
                    payload.statusSetByName = creatorName;
                    payload.statusDate = serverTimestamp();
                }

                await addDoc(collection(db, 'leave_requests'), payload);
            }
            onClose();
        } catch (err) { setError('Failed to submit.'); console.error(err); } 
        finally { setIsSaving(false); }
    };

    const minStartDate = userRole === 'manager' ? null : dateUtils.formatISODate(dateUtils.addDays(new Date(), 1));
    const calendarDays = (startDate && endDate) ? dateUtils.differenceInCalendarDays(endDate, startDate) : 0;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {isManagerCreating && (
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Select Staff Member</label>
                    <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md text-white border-gray-600 outline-none focus:border-indigo-500">
                        <option value="">-- Choose an employee --</option>
                        {staffList.filter(s => s.status !== 'inactive').map(staff => <option key={staff.id} value={staff.id}>{getDisplayName(staff)}</option>)}
                    </select>
                </div>
            )}
            
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Request Type</label>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md text-white border-gray-600 outline-none focus:border-indigo-500">
                    <option>Annual Leave</option>
                    <option>Sick Leave</option>
                    <option>Personal Leave</option>
                    {(!targetStaffBalances || targetStaffBalances.policy === 'in_lieu') && (
                        <>
                            <option>Public Holiday (In Lieu)</option>
                            <option>Cash Out Holiday Credits</option>
                        </>
                    )}
                </select>

                {targetStaffBalances && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className={`p-2 rounded border ${leaveType === 'Annual Leave' ? 'bg-amber-900/30 border-amber-600' : 'bg-gray-700 border-gray-600'}`}>
                            <span className="text-gray-400">Annual:</span> <span className="font-bold text-white ml-1">{targetStaffBalances.annual.remaining} / {targetStaffBalances.annual.total}</span>
                        </div>
                        <div className={`p-2 rounded border ${leaveType === 'Personal Leave' ? 'bg-green-900/30 border-green-600' : 'bg-gray-700 border-gray-600'}`}>
                            <span className="text-gray-400">Personal:</span> <span className="font-bold text-white ml-1">{targetStaffBalances.personal.remaining} / {targetStaffBalances.personal.total}</span>
                        </div>
                        <div className={`p-2 rounded border ${leaveType === 'Sick Leave' ? 'bg-red-900/30 border-red-600' : 'bg-gray-700 border-gray-600'}`}>
                            <span className="text-gray-400">Sick:</span> <span className="font-bold text-white ml-1">{targetStaffBalances.sick.remaining} / {targetStaffBalances.sick.total}</span>
                        </div>
                        
                        {/* --- NEW: Enriched PH Credit Display inside the form --- */}
                        {targetStaffBalances.policy === 'in_lieu' && (
                            <div className={`col-span-2 p-2.5 rounded border flex flex-col gap-2 ${(leaveType === 'Public Holiday (In Lieu)' || leaveType === 'Cash Out Holiday Credits') ? 'bg-blue-900/30 border-blue-600' : 'bg-gray-700 border-gray-600'}`}>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400 font-bold uppercase tracking-wider">PH Credits:</span> 
                                    <span className="font-bold text-white text-sm">{targetStaffBalances.ph.remaining} Total</span>
                                </div>
                                {targetStaffBalances.ph.breakdown && Object.keys(targetStaffBalances.ph.breakdown).length > 0 && (
                                    <div className="flex gap-2 flex-wrap">
                                        {Object.entries(targetStaffBalances.ph.breakdown).sort().map(([year, days]) => (
                                            <span key={year} className="bg-blue-800/40 text-blue-300 px-2 py-0.5 rounded border border-blue-700/50">
                                                {year}: {days} {days === 1 ? 'Day' : 'Days'}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {leaveType === 'Cash Out Holiday Credits' ? (
                <div className="bg-green-900/20 border border-green-700/50 p-4 rounded-lg">
                    <label className="flex items-center text-sm font-bold text-green-400 mb-2">
                        <Banknote className="w-4 h-4 mr-2" /> Number of credits to cash out:
                    </label>
                    <div className="flex items-center gap-3">
                        <input type="number" value={cashOutDays} onChange={handleCashOutChange} className="w-24 p-2 bg-gray-900 rounded-md text-white border border-gray-600 font-bold text-center outline-none focus:border-green-500" />
                        <span className="text-gray-400 text-sm">(Max cashable: {targetStaffBalances ? targetStaffBalances.ph.cashable : 0})</span>
                    </div>
                    {targetStaffBalances && targetStaffBalances.ph.remaining > targetStaffBalances.ph.cashable && (
                        <p className="text-[10px] text-amber-500 mt-2">* You have {targetStaffBalances.ph.remaining} total credits, but only {targetStaffBalances.ph.cashable} are within the cash-out window. The rest can only be used as days off.</p>
                    )}
                    <p className="text-xs text-gray-500 mt-3 italic">* Payout will be automatically calculated and added to your current month's payslip.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} min={minStartDate} className="w-full p-2 bg-gray-700 rounded-md text-white border border-gray-600 outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || minStartDate} className="w-full p-2 bg-gray-700 rounded-md text-white border border-gray-600 outline-none focus:border-indigo-500" />
                    </div>
                </div>
            )}
            
            {leaveType !== 'Cash Out Holiday Credits' && startDate && endDate && (
                <div className="bg-blue-900/20 border border-blue-800 p-4 rounded-lg mt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <p className="text-blue-400 font-bold text-sm">Calendar Duration: {calendarDays} Days</p>
                            {isFullManager ? (
                                <p className="text-xs text-gray-300 mt-1"><span className="font-bold text-amber-400">Manager Reminder:</span> Do not charge staff for their regular weekly days off.</p>
                            ) : (
                                <p className="text-[10px] text-gray-400 mt-1 italic">* Management will review and adjust the final deducted credits if your request spans across your regular days off.</p>
                            )}
                        </div>
                        <div className="flex-shrink-0">
                            <label className="block text-xs font-medium text-gray-300 mb-1">Credits to Deduct</label>
                            <input 
                                type="number" min="0" step="0.5" value={manualLeaveDays} onChange={(e) => setManualLeaveDays(Number(e.target.value))} disabled={!isFullManager}
                                className={`w-24 p-2 bg-gray-900 rounded-md text-white border outline-none text-center font-bold text-lg transition-colors ${isFullManager ? 'border-blue-500 focus:border-amber-500 cursor-text' : 'border-gray-700 opacity-60 cursor-not-allowed'}`}
                            />
                        </div>
                    </div>
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Notes (Optional)</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows="2" className="w-full p-2 bg-gray-700 rounded-md text-white border border-gray-600 outline-none focus:border-indigo-500"></textarea>
            </div>
            
            {error && <p className="text-red-400 text-sm bg-red-900/20 p-2 rounded border border-red-800">{error}</p>}
            
            <div className="flex justify-end pt-4 space-x-3">
                <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors">Cancel</button>
                <button type="submit" disabled={isSaving || (leaveType === 'Cash Out Holiday Credits' && totalDays <= 0) || (targetStaffBalances && leaveType === 'Cash Out Holiday Credits' && targetStaffBalances.ph.cashable === 0)} className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSaving ? 'Processing...' : 'Submit Request'}
                </button>
            </div>
        </form>
    );
};