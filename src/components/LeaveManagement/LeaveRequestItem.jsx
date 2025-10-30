// src/components/LeaveManagement/LeaveRequestItem.jsx
import React from 'react';
import * as dateUtils from '../../utils/dateUtils'; // Use new standard
import { BriefcaseIcon, TrashIcon } from '../Icons'; // Correct: Go up one level

// Reusable StatusBadge component
const StatusBadge = ({ status }) => {
    const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full";
    if (status === 'approved') return <span className={`${baseClasses} bg-green-600 text-green-100`}>Approved</span>;
    if (status === 'rejected') return <span className={`${baseClasses} bg-red-600 text-red-100`}>Rejected</span>;
    return <span className={`${baseClasses} bg-yellow-600 text-yellow-100`}>Pending</span>;
};

export const LeaveRequestItem = ({ req, onUpdateRequest, onDeleteRequest, onEditRequest, onMcStatusChange }) => {
    
    // --- MODIFICATION: Logic to show who created it ---
    let createdByString = '';
    if (req.createdByName) {
        // Only show if the creator is *different* from the staff member
        if (req.createdBy !== req.staffId) {
            createdByString = `(Created by ${req.createdByName})`;
        }
    }
    // --- END MODIFICATION ---

    return (
        <div className="p-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div className="flex-grow min-w-[200px]">
                    <p className="font-bold text-white">{req.displayStaffName}</p>
                    {/* --- MODIFIED: Display creator name --- */}
                    <p className="text-sm text-gray-400">
                        {req.leaveType} | Requested: {dateUtils.formatDisplayDate(req.requestedAt)}
                        {/* Show the creator string if it exists */}
                        {createdByString && <span className="italic ml-1 text-gray-500">{createdByString}</span>}
                    </p>
                    {/* --- END MODIFICATION --- */}
                </div>
                <div className="text-center">
                    <p className="text-sm text-gray-300">Dates:</p>
                    <p className="font-medium text-white">{dateUtils.formatDisplayDate(req.startDate)} to {dateUtils.formatDisplayDate(req.endDate)}</p>
                </div>
                <div className="text-center">
                    <p className="text-sm text-gray-300">Total Days:</p>
                    <p className="font-medium text-white">{req.totalDays}</p>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                    <StatusBadge status={req.status} />
                    <button onClick={() => onEditRequest(req)} className="p-2 rounded-lg bg-gray-600 hover:bg-gray-500" title="Edit Request"><BriefcaseIcon className="h-4 w-4"/></button>
                    <button onClick={() => onDeleteRequest(req.id)} className="p-2 rounded-lg bg-red-800 hover:bg-red-700" title="Delete Request"><TrashIcon className="h-4 w-4"/></button>
                    {req.status === 'pending' && (
                        <>
                            <button onClick={() => onUpdateRequest(req.id, 'rejected')} className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700">Reject</button>
                            <button onClick={() => onUpdateRequest(req.id, 'approved')} className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700">Approve</button>
                        </>
                    )}
                </div>
            </div>
            {req.reason && (<p className="mt-2 text-sm text-amber-300 bg-gray-700 p-2 rounded-md"><span className="font-semibold">Reason:</span> {req.reason}</p>)}
            {req.leaveType === 'Sick Leave' && req.totalDays >= 3 && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={!!req.mcReceived} 
                            onChange={() => onMcStatusChange(req.id, req.mcReceived)} 
                            className="w-4 h-4 rounded bg-gray-600 border-gray-500 text-amber-500 focus:ring-amber-500"
                        />
                        <span className="text-sm text-gray-300">Medical Certificate Received</span>
                    </label>
                </div>
            )}
        </div>
    );
};