import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, updateDoc, doc } from 'firebase/firestore';
import { Clock, CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { formatCustom, formatISODate } from '../../utils/dateUtils';

export default function OvertimeRequests({ db, companyConfig }) {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);

    // Configuration
    const OT_THRESHOLD_MINUTES = parseInt(companyConfig?.overtimeThreshold || 30);
    // REMOVED standard shift hours, we'll compare to schedule or 0

    useEffect(() => {
        fetchPotentialOvertime();
    }, [db, OT_THRESHOLD_MINUTES]);

    const calculateScheduleDurationMinutes = (startTime, endTime) => {
        if (!startTime || !endTime) return 0;
        try {
            const [startH, startM] = startTime.split(':').map(Number);
            const [endH, endM] = endTime.split(':').map(Number);
            let minutes = (endH * 60 + endM) - (startH * 60 + startM);
            if (minutes < 0) minutes += 24 * 60; // Handle crossing midnight
            return minutes;
        } catch (e) {
            return 0;
        }
    };

    const fetchPotentialOvertime = async () => {
        if (!db) return;
        setLoading(true);
        
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const dateStr = formatISODate(startOfMonth); 

        try {
            // 1. Fetch Attendance
            const attQuery = query(
                collection(db, 'attendance'),
                where('date', '>=', dateStr),
                orderBy('date', 'desc')
            );
            const attSnapshot = await getDocs(attQuery);

            // 2. Fetch Schedules
            const schedQuery = query(
                collection(db, 'schedules'),
                where('date', '>=', dateStr)
            );
            const schedSnapshot = await getDocs(schedQuery);
            
            const scheduleMap = {};
            schedSnapshot.forEach(doc => {
                const d = doc.data();
                scheduleMap[`${d.staffId}_${d.date}`] = d;
            });

            const otCandidates = [];

            attSnapshot.forEach(docSnap => {
                const data = docSnap.data();
                
                if (data.checkOutTime && (!data.otStatus || data.otStatus === 'pending')) {
                    
                    // A. Calculate Actual Worked Minutes
                    const checkIn = data.checkInTime.toDate();
                    const checkOut = data.checkOutTime.toDate();
                    
                    let breakDurationMs = 0;
                    if (data.breakStart && data.breakEnd) {
                        breakDurationMs = data.breakEnd.toDate() - data.breakStart.toDate();
                    }

                    const totalDurationMs = (checkOut - checkIn) - breakDurationMs;
                    const workedMinutes = Math.floor(totalDurationMs / (1000 * 60));

                    // B. Calculate Scheduled Minutes
                    const schedule = scheduleMap[`${data.staffId}_${data.date}`];
                    let scheduledMinutes;

                    if (schedule && schedule.startTime && schedule.endTime) {
                        // Case 1: Has a specific work schedule
                        scheduledMinutes = calculateScheduleDurationMinutes(schedule.startTime, schedule.endTime);
                    } else {
                        // --- THIS IS THE FIX ---
                        // Case 2: No schedule found (Day Off, or just not scheduled)
                        // All time worked is potential overtime.
                        scheduledMinutes = 0; 
                    }

                    // C. Calculate Overtime
                    const otMinutes = workedMinutes - scheduledMinutes;
                    
                    // D. Check Threshold
                    // If they worked on a day off, OT_THRESHOLD_MINUTES acts as the minimum
                    // (e.g., must work at least 30 mins to be flagged)
                    if (otMinutes >= OT_THRESHOLD_MINUTES) {
                        otCandidates.push({
                            id: docSnap.id,
                            ...data,
                            otMinutes,
                            scheduledMinutes, 
                            workedMinutes     
                        });
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
        // ... (no change in this function)
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
            setRequests(prev => prev.filter(r => r.id !== item.id));
        } catch (error) {
            console.error("Error updating OT:", error);
            alert("Failed to update overtime status.");
        } finally {
            setProcessingId(null);
        }
    };

    if (loading) return <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 text-gray-400 text-sm animate-pulse">Scanning for overtime...</div>;
    
    if (requests.length === 0) return null;

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg border border-indigo-500/30 mb-6 overflow-hidden">
            <div className="p-4 border-b border-gray-700 bg-indigo-900/20 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Clock className="h-5 w-5 text-indigo-400" />
                        Overtime Approvals (This Month)
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                        Flagging shifts exceeding scheduled time by {OT_THRESHOLD_MINUTES} mins (or any work on a day off).
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
                                    {req.scheduledMinutes === 0 ? "Work on Day Off" : "Overtime"} (+{Math.floor(req.otMinutes / 60)}h {req.otMinutes % 60}m)
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