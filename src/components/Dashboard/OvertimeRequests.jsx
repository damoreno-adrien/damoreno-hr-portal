import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, updateDoc, doc } from 'firebase/firestore';
import { Clock, CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { formatCustom, formatISODate } from '../../utils/dateUtils';

export default function OvertimeRequests({ db }) {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);

    useEffect(() => {
        fetchPotentialOvertime();
    }, [db]);

    const fetchPotentialOvertime = async () => {
        if (!db) return;
        setLoading(true);
        
        const today = new Date();
        // --- LOGIC CHANGE: Start from the 1st of the current month ---
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const dateStr = formatISODate(startOfMonth); 

        // Query: Attendance from start of this month with a checkout time
        const q = query(
            collection(db, 'attendance'),
            where('date', '>=', dateStr),
            orderBy('date', 'desc')
        );

        try {
            const snapshot = await getDocs(q);
            const otCandidates = [];

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                
                // 1. Must be checked out
                // 2. OT must not be handled yet (otStatus should be undefined or 'pending')
                if (data.checkOutTime && (!data.otStatus || data.otStatus === 'pending')) {
                    
                    const checkIn = data.checkInTime.toDate();
                    const checkOut = data.checkOutTime.toDate();
                    const durationMs = checkOut - checkIn;
                    const hoursWorked = durationMs / (1000 * 60 * 60);

                    // --- THRESHOLD CONFIGURATION ---
                    // Currently set to 9 hours. 
                    // (Standard 9h shift. If they work 9.5h, it flags as OT).
                    const STANDARD_SHIFT_HOURS = 9; 
                    
                    if (hoursWorked > STANDARD_SHIFT_HOURS) {
                        const otMinutes = Math.round((hoursWorked - STANDARD_SHIFT_HOURS) * 60);
                        
                        // Only show if meaningful OT (e.g., > 15 mins) to avoid flagging 2 minutes late checkout
                        if (otMinutes >= 15) {
                            otCandidates.push({
                                id: docSnap.id,
                                ...data,
                                otMinutes
                            });
                        }
                    }
                }
            });
            setRequests(otCandidates);
        } catch (error) {
            console.error("Error fetching OT requests:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDecision = async (item, decision) => {
        setProcessingId(item.id);
        try {
            const docRef = doc(db, 'attendance', item.id);
            
            if (decision === 'approve') {
                await updateDoc(docRef, {
                    otStatus: 'approved',
                    otApprovedMinutes: item.otMinutes,
                    otApprovedAt: new Date()
                });
            } else {
                await updateDoc(docRef, {
                    otStatus: 'rejected',
                    otApprovedMinutes: 0,
                    otApprovedAt: new Date()
                });
            }

            // Remove from local list immediately after action
            setRequests(prev => prev.filter(r => r.id !== item.id));
        } catch (error) {
            console.error("Error updating OT:", error);
            alert("Failed to update overtime status.");
        } finally {
            setProcessingId(null);
        }
    };

    if (loading) return <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 text-gray-400 text-sm animate-pulse">Scanning for overtime...</div>;
    
    if (requests.length === 0) return null; // Hide component completely if no requests

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg border border-indigo-500/30 mb-6 overflow-hidden">
            <div className="p-4 border-b border-gray-700 bg-indigo-900/20 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Clock className="h-5 w-5 text-indigo-400" />
                        Overtime Approvals (This Month)
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                        Staff who worked over 9 hours.
                    </p>
                </div>
                <span className="bg-indigo-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    {requests.length} Pending
                </span>
            </div>
            <div className="divide-y divide-gray-700">
                {requests.map(req => (
                    <div key={req.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-750 transition-colors">
                        <div>
                            <div className="flex items-center gap-2">
                                <p className="text-white font-bold text-lg">{req.staffName}</p>
                                <span className="text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded border border-gray-700">
                                    {formatCustom(req.checkInTime.toDate(), 'dd MMM')}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                                <span>{formatCustom(req.checkInTime.toDate(), 'HH:mm')} - {formatCustom(req.checkOutTime.toDate(), 'HH:mm')}</span>
                                <span>•</span>
                                <span className="text-indigo-300 font-semibold flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    +{Math.floor(req.otMinutes / 60)}h {req.otMinutes % 60}m
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => handleDecision(req, 'reject')}
                                disabled={!!processingId}
                                className="px-4 py-2 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                <XCircle className="w-4 h-4" /> Reject
                            </button>
                            <button
                                onClick={() => handleDecision(req, 'approve')}
                                disabled={!!processingId}
                                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-900/20"
                            >
                                {processingId === req.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4" />}
                                Approve
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}