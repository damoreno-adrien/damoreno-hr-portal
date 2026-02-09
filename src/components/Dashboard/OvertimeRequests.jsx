import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, updateDoc, doc, limit, writeBatch } from 'firebase/firestore';
import { Clock, CheckCircle, XCircle, Loader2, AlertCircle, Coffee, History as HistoryIcon, Edit2, RotateCcw, Settings, Search, ListChecks } from 'lucide-react';
import { formatCustom, formatISODate } from '../../utils/dateUtils';

export default function OvertimeRequests({ db, companyConfig, onManualFix }) {
    const [requests, setRequests] = useState([]);
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    
    // Filter States
    const [filterType, setFilterType] = useState('all'); // 'all', 'day-off', 'scheduled'
    const [searchTerm, setSearchTerm] = useState("");

    // States for inline editing
    const [editingId, setEditingId] = useState(null);
    const [adjustedVal, setAdjustedVal] = useState("");

    const OT_THRESHOLD_MINUTES = parseInt(companyConfig?.overtimeThreshold || 15);
    const UNPAID_BREAK_MINUTES = 60; 

    useEffect(() => {
        fetchPotentialOvertime();
        fetchOTHistory();
    }, [db, OT_THRESHOLD_MINUTES]);

    const calculateScheduleDurationMinutes = (startTime, endTime) => {
        if (!startTime || !endTime) return 0;
        try {
            const [startH, startM] = startTime.split(':').map(Number);
            const [endH, endM] = endTime.split(':').map(Number);
            let minutes = (endH * 60 + endM) - (startH * 60 + startM);
            if (minutes < 0) minutes += 24 * 60; 
            return minutes;
        } catch (e) { return 0; }
    };

    const fetchOTHistory = async () => {
        if (!db) return;
        try {
            const q = query(
                collection(db, 'attendance'),
                where('otStatus', 'in', ['approved', 'rejected']),
                orderBy('date', 'desc'),
                limit(15)
            );
            const snap = await getDocs(q);
            setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) { console.error("Error fetching OT history:", err); }
    };

    const fetchPotentialOvertime = async () => {
        if (!db) return;
        setLoading(true);
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const dateStr = formatISODate(startOfMonth); 

        try {
            const attQuery = query(collection(db, 'attendance'), where('date', '>=', dateStr), orderBy('date', 'desc'));
            const attSnapshot = await getDocs(attQuery);
            const schedQuery = query(collection(db, 'schedules'), where('date', '>=', dateStr));
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
                    const checkIn = data.checkInTime.toDate();
                    const checkOut = data.checkOutTime.toDate();
                    let breakDurationMs = 0;
                    let usedAutoBreak = false;
                    let actualBreakMinutes = 0;

                    // --- 1. Calculate Actual Break & Work ---
                    if (data.breakStart && data.breakEnd) {
                        // Manual Break Recorded
                        breakDurationMs = data.breakEnd.toDate() - data.breakStart.toDate();
                        actualBreakMinutes = Math.floor(breakDurationMs / (1000 * 60));
                    } else {
                        // Auto-Break Logic
                        const rawShiftMinutes = (checkOut - checkIn) / (1000 * 60);
                        if (rawShiftMinutes > 300) { 
                            breakDurationMs = UNPAID_BREAK_MINUTES * 60 * 1000;
                            actualBreakMinutes = UNPAID_BREAK_MINUTES;
                            usedAutoBreak = true;
                        }
                    }

                    const totalDurationMs = (checkOut - checkIn) - breakDurationMs;
                    const workedMinutes = Math.floor(totalDurationMs / (1000 * 60));
                    
                    // --- 2. Calculate Scheduled Target ---
                    const schedule = scheduleMap[`${data.staffId}_${data.date}`];
                    let scheduledMinutes = 0;
                    let scheduledBreak = false;

                    if (schedule && schedule.startTime && schedule.endTime) {
                        const rawSchedMinutes = calculateScheduleDurationMinutes(schedule.startTime, schedule.endTime);
                        scheduledBreak = schedule.includesBreak !== false; // Check for Coffee Cup
                        
                        // Deduct break only if schedule has one
                        scheduledMinutes = rawSchedMinutes - (scheduledBreak ? UNPAID_BREAK_MINUTES : 0);
                    }

                    const otMinutes = workedMinutes - scheduledMinutes;
                    
                    // Filter Logic
                    if ((schedule && otMinutes >= OT_THRESHOLD_MINUTES) || (!schedule && otMinutes > 0)) {
                        otCandidates.push({ 
                            id: docSnap.id, 
                            ...data, 
                            otMinutes, 
                            scheduledMinutes, 
                            isDayOff: !schedule,
                            usedAutoBreak,
                            actualBreakMinutes,
                            scheduledBreak
                        });
                    }
                }
            });
            setRequests(otCandidates);
        } catch (error) { console.error("Error fetching OT requests:", error); } 
        finally { setLoading(false); }
    };

    const filteredRequests = requests.filter(req => {
        const matchesSearch = req.staffName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = 
            filterType === 'all' ? true :
            filterType === 'day-off' ? req.isDayOff :
            filterType === 'scheduled' ? !req.isDayOff : true;
        return matchesSearch && matchesType;
    });

    const handleBulkAction = async (decision) => {
        if (!window.confirm(`Are you sure you want to ${decision} ALL ${filteredRequests.length} filtered shifts?`)) return;
        
        setIsBulkProcessing(true);
        const batch = writeBatch(db);

        filteredRequests.forEach((req) => {
            const docRef = doc(db, 'attendance', req.id);
            batch.update(docRef, {
                otStatus: decision === 'approve' ? 'approved' : 'rejected',
                otApprovedMinutes: decision === 'approve' ? req.otMinutes : 0,
                otDecisionDate: new Date(),
                otIsProcessed: true,
                otSystemNote: `Bulk ${decision}ed by manager`
            });
        });

        try {
            await batch.commit();
            const processedIds = filteredRequests.map(r => r.id);
            setRequests(prev => prev.filter(r => !processedIds.includes(r.id)));
            fetchOTHistory();
        } catch (error) {
            console.error("Bulk action failed:", error);
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleDecision = async (item, decision) => {
        setProcessingId(item.id);
        const finalMinutes = editingId === item.id ? parseInt(adjustedVal) : item.otMinutes;
        try {
            const docRef = doc(db, 'attendance', item.id);
            await updateDoc(docRef, {
                otStatus: decision === 'approve' ? 'approved' : 'rejected',
                otApprovedMinutes: decision === 'approve' ? finalMinutes : 0,
                otDecisionDate: new Date(),
                otIsProcessed: true
            });
            setRequests(prev => prev.filter(r => r.id !== item.id));
            setEditingId(null);
            fetchOTHistory(); 
        } catch (error) { console.error("Error updating OT:", error); } 
        finally { setProcessingId(null); }
    };

    const handleRevert = async (item) => {
        if (!window.confirm(`Move ${item.staffName}'s shift back to pending?`)) return;
        setProcessingId(item.id);
        try {
            const docRef = doc(db, 'attendance', item.id);
            await updateDoc(docRef, { otStatus: 'pending', otApprovedMinutes: 0, otIsProcessed: false });
            fetchPotentialOvertime();
            fetchOTHistory();
        } catch (error) { console.error("Error reverting:", error); } 
        finally { setProcessingId(null); }
    };

    if (loading) return <div className="p-4 bg-gray-800 rounded-lg text-gray-400 text-sm animate-pulse">Analyzing attendance...</div>;

    return (
        <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg shadow-lg border border-indigo-500/30 overflow-hidden">
                <div className="p-4 border-b border-gray-700 bg-indigo-900/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-indigo-400" />
                        <h3 className="text-lg font-semibold text-white">Overtime Approvals</h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input type="text" placeholder="Search staff..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-gray-900 text-xs text-white pl-8 pr-3 py-1.5 rounded-md border border-gray-700 focus:border-indigo-500 outline-none w-32 md:w-40" />
                        </div>
                        <div className="flex bg-gray-900 rounded-md p-1 border border-gray-700">
                            {['all', 'day-off', 'scheduled'].map((t) => (
                                <button key={t} onClick={() => setFilterType(t)} className={`px-2 py-1 text-[10px] uppercase font-bold rounded transition-all ${filterType === t ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
                                    {t.replace('-', ' ')}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setShowHistory(!showHistory)} className="text-xs text-indigo-300 bg-indigo-900/40 px-3 py-1.5 rounded-md">
                            <HistoryIcon className="w-3 h-3 mr-1 inline" />
                            {showHistory ? "Hide History" : "Decisions"}
                        </button>
                    </div>
                </div>

                {filteredRequests.length > 1 && (
                    <div className="bg-indigo-900/10 px-4 py-2 border-b border-gray-700 flex items-center justify-between animate-fadeIn">
                        <div className="flex items-center gap-2 text-xs text-indigo-300">
                            <ListChecks className="w-4 h-4" />
                            <span>Bulk Action for <strong>{filteredRequests.length}</strong> filtered shifts</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleBulkAction('reject')} disabled={isBulkProcessing} className="text-[10px] uppercase font-bold text-gray-400 hover:text-red-400 px-2 py-1 border border-gray-700 rounded transition-colors disabled:opacity-50">Reject All</button>
                            <button onClick={() => handleBulkAction('approve')} disabled={isBulkProcessing} className="text-[10px] uppercase font-bold text-indigo-400 hover:text-white hover:bg-indigo-600 px-2 py-1 border border-indigo-900 rounded transition-all flex items-center gap-1 disabled:opacity-50">
                                {isBulkProcessing && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                Approve All
                            </button>
                        </div>
                    </div>
                )}

                <div className="divide-y divide-gray-700">
                    {filteredRequests.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">{requests.length === 0 ? "All overtime processed." : "No matches found."}</div>
                    ) : (
                        filteredRequests.map(req => (
                            <div key={req.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-750 transition-colors">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="text-white font-bold text-lg">{req.staffName}</p>
                                        <span className="text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded border border-gray-700">{formatCustom(req.checkInTime.toDate(), 'dd MMM')}</span>
                                        
                                        {/* Status Badges */}
                                        {req.isDayOff && <span className="text-[10px] bg-indigo-900/60 text-indigo-300 px-2 py-0.5 rounded border border-indigo-700">Day Off Work</span>}
                                        {req.usedAutoBreak && <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded border border-gray-600">1h Break Auto-Applied</span>}
                                        
                                        {/* SHORT BREAK WARNING: If scheduled for break but took < 45m */}
                                        {req.scheduledBreak && !req.usedAutoBreak && req.actualBreakMinutes < 45 && (
                                            <span className="text-[10px] bg-amber-900/40 text-amber-400 px-2 py-0.5 rounded border border-amber-800 flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" /> Short Break ({req.actualBreakMinutes}m)
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1">
                                        {editingId === req.id ? (
                                            <div className="flex items-center gap-2 bg-indigo-900/20 p-1 rounded border border-indigo-500">
                                                <input type="number" value={adjustedVal} onChange={(e) => setAdjustedVal(e.target.value)} className="bg-transparent text-white w-16 px-1 outline-none font-bold" autoFocus />
                                                <span className="text-xs text-indigo-300 mr-1">mins</span>
                                            </div>
                                        ) : (
                                            <p className="text-indigo-300 font-semibold flex items-center gap-1 text-sm">
                                                <AlertCircle className="w-3 h-3" /> Extra: {Math.floor(req.otMinutes / 60)}h {req.otMinutes % 60}m
                                                <button onClick={() => { setEditingId(req.id); setAdjustedVal(req.otMinutes); }} className="ml-1 text-gray-500 hover:text-white"><Edit2 className="w-3 h-3"/></button>
                                            </p>
                                        )}
                                        <span className="text-xs text-gray-500 font-mono">{formatCustom(req.checkInTime.toDate(), 'HH:mm')} - {formatCustom(req.checkOutTime.toDate(), 'HH:mm')}</span>
                                        <button onClick={() => onManualFix && onManualFix({ ...req, attendanceDocId: req.id })} className="p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-indigo-400 transition-colors"><Settings className="w-3.5 h-3.5" /></button>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleDecision(req, 'reject')} disabled={!!processingId} className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-md text-sm">Reject</button>
                                    <button onClick={() => handleDecision(req, 'approve')} disabled={!!processingId} className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-sm font-medium">Approve</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {showHistory && (
                <div className="bg-gray-900/50 rounded-lg border border-gray-700 p-4 animate-fadeIn">
                    <h4 className="text-sm font-bold text-gray-400 mb-3 flex items-center gap-2 uppercase tracking-wider"><HistoryIcon className="w-4 h-4" /> RECENT PERFORMANCE DECISIONS</h4>
                    <div className="space-y-2">
                        {history.map(item => (
                            <div key={item.id} className="flex justify-between items-center p-3 bg-gray-800/40 rounded border border-gray-700/50">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${item.otStatus === 'approved' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
                                    <div><p className="text-gray-200 font-medium text-sm">{item.staffName}</p><p className="text-[10px] text-gray-500 uppercase">{item.date}</p></div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right"><p className={`text-xs font-bold ${item.otStatus === 'approved' ? 'text-green-400' : 'text-red-400'}`}>{item.otStatus === 'approved' ? `+${item.otApprovedMinutes}m Approved` : 'Rejected'}</p></div>
                                    <button onClick={() => handleRevert(item)} disabled={!!processingId} className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-all">
                                        {processingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}