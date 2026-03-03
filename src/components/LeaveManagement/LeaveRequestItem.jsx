import React, { useMemo } from 'react';
import * as dateUtils from '../../utils/dateUtils'; 
import { calculateStaffLeaveBalances } from '../../utils/leaveCalculator';
import { Briefcase, Trash2, AlertTriangle, Users, Banknote } from 'lucide-react';

const StatusBadge = ({ status }) => {
    const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full";
    if (status === 'approved') return <span className={`${baseClasses} bg-green-600 text-green-100`}>Approved</span>;
    if (status === 'rejected') return <span className={`${baseClasses} bg-red-600 text-red-100`}>Rejected</span>;
    return <span className={`${baseClasses} bg-yellow-600 text-yellow-100`}>Pending</span>;
};

export const LeaveRequestItem = ({ req, onUpdateRequest, onDeleteRequest, onEditRequest, onMcStatusChange, allRequests, companyConfig, staffList }) => {
    
    // 1. Conflict Detection Logic (Ignores Cash Outs)
    const conflicts = useMemo(() => {
        if (!allRequests || req.status !== 'pending' || req.leaveType === 'Cash Out Holiday Credits') return [];
        
        const thisStart = dateUtils.parseISODateString(req.startDate);
        const thisEnd = dateUtils.parseISODateString(req.endDate);
        
        return allRequests.filter(other => {
            if (other.id === req.id) return false; 
            if (other.status !== 'approved') return false; 
            if (other.staffId === req.staffId) return false; 
            if (other.leaveType === 'Cash Out Holiday Credits') return false; 

            if (req.staffDepartment && other.staffDepartment && req.staffDepartment !== other.staffDepartment) {
                return false; 
            }

            const otherStart = dateUtils.parseISODateString(other.startDate);
            const otherEnd = dateUtils.parseISODateString(other.endDate);
            return thisStart <= otherEnd && thisEnd >= otherStart;
        });
    }, [req, allRequests]);

    // 2. Balance Calculation Logic (Using Single Source of Truth)
    const balanceContext = useMemo(() => {
        if (!companyConfig || !allRequests || !staffList) return null;
        
        const staff = staffList.find(s => s.id === req.staffId);
        if (!staff) return null;

        // --- FIX: Only calculate against ALREADY APPROVED requests! ---
        // This prevents pending items in the queue from falsely triggering the warning.
        const approvedRequests = allRequests.filter(r => r.status === 'approved');
        const balances = calculateStaffLeaveBalances(staff, approvedRequests, companyConfig);
        if (!balances) return null;

        let limitType = 'Yearly';
        let used = 0;
        let total = 0;
        let remaining = 0;

        if (req.leaveType === 'Annual Leave') {
            used = balances.annual.used; total = balances.annual.total; remaining = balances.annual.remaining;
        } else if (req.leaveType === 'Sick Leave') {
            used = balances.sick.used; total = balances.sick.total; remaining = balances.sick.remaining;
        } else if (req.leaveType === 'Personal Leave') {
            used = balances.personal.used; total = balances.personal.total; remaining = balances.personal.remaining;
        } else if (req.leaveType === 'Public Holiday (In Lieu)') {
            limitType = 'Lifetime';
            used = balances.ph.used; total = balances.ph.total; remaining = balances.ph.remaining;
        } else if (req.leaveType === 'Cash Out Holiday Credits') {
            limitType = 'Cashable Window';
            used = balances.ph.used; total = balances.ph.total; remaining = balances.ph.cashable;
        } else {
            return null;
        }

        return { limitType, used, total, remaining };
    }, [req, allRequests, companyConfig, staffList]);

    let createdByString = '';
    if (req.createdByName && req.createdBy !== req.staffId) {
        createdByString = `(Created by ${req.createdByName})`;
    }

    return (
        <div className="p-4 relative">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div className="flex-grow min-w-[200px]">
                    <div className="flex items-center gap-2">
                        <p className="font-bold text-white text-lg">{req.displayStaffName}</p>
                        {req.staffDepartment && <span className="text-xs bg-gray-700 px-2 py-0.5 rounded text-gray-300">{req.staffDepartment}</span>}
                    </div>
                    <p className="text-sm text-gray-400 mt-1">
                        <span className="text-amber-400 font-semibold">{req.leaveType}</span> • Requested: {dateUtils.formatDisplayDate(req.requestedAt)}
                    </p>
                    {createdByString && <p className="text-xs italic text-gray-500">{createdByString}</p>}
                </div>

                {req.leaveType === 'Cash Out Holiday Credits' ? (
                    <div className="text-center bg-green-900/30 p-3 rounded-lg border border-green-700 flex flex-col items-center justify-center min-w-[140px]">
                        <Banknote className="w-5 h-5 text-green-500 mb-1" />
                        <p className="font-bold text-green-400 text-lg leading-none">{req.totalDays} Credits</p>
                        <p className="text-[10px] text-green-500/70 uppercase font-bold tracking-wider mt-1">Payout Request</p>
                    </div>
                ) : (
                    <div className="text-center bg-gray-900/50 p-2 rounded-lg border border-gray-700 min-w-[140px]">
                        <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Duration</p>
                        <p className="font-bold text-white leading-tight">{dateUtils.formatDisplayDate(req.startDate)}</p>
                        {req.startDate !== req.endDate && <p className="font-bold text-white leading-tight">to {dateUtils.formatDisplayDate(req.endDate)}</p>}
                        <p className="text-sm text-gray-400 mt-1">{req.totalDays} Days</p>
                    </div>
                )}

                <div className="flex items-center space-x-2 flex-shrink-0">
                    <StatusBadge status={req.status} />
                    <button onClick={() => onEditRequest(req)} className="p-2 rounded-lg bg-gray-600 hover:bg-gray-500" title="Edit Request"><Briefcase className="h-4 w-4"/></button>
                    <button onClick={() => onDeleteRequest(req.id)} className="p-2 rounded-lg bg-red-900/50 hover:bg-red-800 text-red-200" title="Delete Request"><Trash2 className="h-4 w-4"/></button>
                    
                    {req.status === 'pending' && (
                        <div className="flex gap-2 ml-4 pl-4 border-l border-gray-600">
                            <button onClick={() => onUpdateRequest(req.id, 'rejected')} className="px-4 py-2 text-sm font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white">Reject</button>
                            <button onClick={() => onUpdateRequest(req.id, 'approved')} className="px-4 py-2 text-sm font-bold rounded-lg bg-green-600 hover:bg-green-700 text-white">Approve</button>
                        </div>
                    )}
                </div>
            </div>

            {conflicts.length > 0 && (
                <div className="mt-3 p-3 bg-red-900/20 border border-red-800 rounded-lg flex items-start gap-3">
                    <Users className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-red-300">Staffing Conflict Warning</p>
                        <p className="text-xs text-gray-400">The following staff are also off during this period:</p>
                        <ul className="mt-1 space-y-1">
                            {conflicts.map(c => (
                                <li key={c.id} className="text-xs text-red-200 flex items-center gap-2">
                                    <span>• <strong>{c.displayStaffName}</strong> ({c.leaveType})</span>
                                    <span className="opacity-75">{dateUtils.formatDisplayDate(c.startDate)} - {dateUtils.formatDisplayDate(c.endDate)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* --- UPGRADED: Dynamic Warning UI using Single Source of Truth --- */}
            {req.status === 'pending' && balanceContext && (
                <div className="mt-2 text-xs flex items-center gap-2 text-gray-400 bg-gray-700/30 p-2 rounded inline-block">
                    <span className="font-semibold text-gray-300">{balanceContext.limitType} Balance Check:</span>
                    
                    {req.leaveType === 'Cash Out Holiday Credits' || req.leaveType === 'Public Holiday (In Lieu)' ? (
                        <span>{balanceContext.remaining} Credits Available</span>
                    ) : (
                        <span>Used {balanceContext.used} of {balanceContext.total} days</span>
                    )}
                    
                    {req.totalDays > balanceContext.remaining && (
                        <span className="text-red-400 font-bold ml-1">
                            (Exceeds balance by {req.totalDays - balanceContext.remaining})
                        </span>
                    )}
                </div>
            )}

            {req.reason && (<p className="mt-3 text-sm text-gray-300 bg-gray-700/50 p-3 rounded-md border-l-4 border-amber-500"><span className="font-semibold text-amber-500 block text-xs uppercase mb-1">Reason provided</span>{req.reason}</p>)}
            
            {req.leaveType === 'Sick Leave' && (
                <div className="mt-3 pt-3 border-t border-gray-700 space-y-3">
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" checked={!!req.mcReceived} onChange={() => onMcStatusChange(req.id, req.mcReceived)} className="w-4 h-4 rounded bg-gray-600 border-gray-500 text-amber-500 focus:ring-amber-500" />
                        <span className="text-sm text-gray-300">Medical Certificate Received</span>
                    </label>
                    {req.totalDays >= 3 && !req.mcReceived && (
                        <div className="flex items-start gap-2 p-2 bg-yellow-900/50 border border-yellow-700 rounded-md">
                            <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-yellow-300">This leave is {req.totalDays} days. A medical certificate may be required.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};