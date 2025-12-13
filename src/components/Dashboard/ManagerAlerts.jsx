import React, { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, db } from "../../../firebase"; 
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc } from "firebase/firestore";
import { AlertTriangle, Clock, Loader2, CheckCircle, AlertOctagon, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDisplayTime, formatDisplayDate } from '../../utils/dateUtils';

const functions = getFunctions(app, "asia-southeast1");
const autoFixShiftFunc = httpsCallable(functions, 'autoFixSingleShift');
const runOperationalScanFunc = httpsCallable(functions, 'runOperationalScan');

const MissingCheckoutItem = ({ alert, onManualFix }) => {
    const [isFixing, setIsFixing] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const checkInTime = alert.checkInTime?.toDate();
    const formattedCheckIn = checkInTime ? formatDisplayTime(checkInTime) : 'Unknown';

    const handleAutoFix = async () => {
        setIsFixing(true); setError(null);
        try {
            const result = await autoFixShiftFunc({ attendanceDocId: alert.attendanceDocId, alertId: alert.id });
            setSuccess(result.data.result || "Shift fixed!");
        } catch (err) {
            console.error("Error auto-fixing:", err);
            setError(err.message || "Failed to fix.");
            setIsFixing(false);
        }
    };

    if (success) {
        return (
            <li className="flex items-center justify-between p-3 bg-green-900/50 rounded-lg border border-green-700/50">
                <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                    <p className="text-sm text-gray-300"><span className="font-semibold text-white">{alert.staffName}</span> fixed.</p>
                </div>
            </li>
        );
    }

    return (
        <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-800 rounded-lg gap-3 border-l-4 border-amber-500">
            <div className="flex items-center gap-3">
                <div className="bg-amber-900/30 p-2 rounded-full"><Clock className="h-5 w-5 text-amber-400" /></div>
                <div>
                    <p className="text-sm text-white font-medium">{alert.staffName} missed check-out</p>
                    <p className="text-xs text-gray-400">{alert.date} • Checked in at {formattedCheckIn}</p>
                </div>
            </div>
            <div className="flex items-center justify-end gap-2 flex-shrink-0 w-full sm:w-auto">
                <button onClick={() => onManualFix(alert)} disabled={isFixing} className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md disabled:opacity-50 transition-colors">Fix Manually</button>
                <button onClick={handleAutoFix} disabled={isFixing} className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-md disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                    {isFixing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Auto-Fix (23h00)"}
                </button>
            </div>
            {error && <p className="text-xs text-red-400 w-full text-center sm:text-left">{error}</p>}
        </li>
    );
};

const RiskAlertItem = ({ alert }) => {
    const [isAcknowledging, setIsAcknowledging] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false); // --- VISIBILITY TOGGLE ---

    const handleAcknowledge = async () => {
        if (!window.confirm("Dismiss this alert?")) return;
        setIsAcknowledging(true);
        try { await deleteDoc(doc(db, "manager_alerts", alert.id)); } 
        catch (err) { console.error(err); setIsAcknowledging(false); }
    };

    const isAbsence = alert.type === 'risk_absence';
    const icon = isAbsence ? <AlertOctagon className="h-5 w-5 text-red-400" /> : <ShieldAlert className="h-5 w-5 text-yellow-400" />;
    const borderColor = isAbsence ? "border-red-500" : "border-yellow-500";
    const bgColor = isAbsence ? "bg-red-900/10" : "bg-yellow-900/10";
    
    // Get list of incidents from the alert document
    const incidents = alert.details || [];

    return (
        <li className={`bg-gray-800 rounded-lg border-l-4 ${borderColor} overflow-hidden`}>
            <div className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${bgColor}`}>{icon}</div>
                    <div>
                        <p className="text-sm text-white font-medium">{alert.message || "Attention Required"}</p>
                        <p className="text-xs text-gray-400">{alert.staffName} • {alert.count} / {alert.limit} limit</p>
                    </div>
                </div>
                
                <div className="flex items-center justify-end gap-2 flex-shrink-0 w-full sm:w-auto">
                    {/* --- DROPDOWN BUTTON --- */}
                    {incidents.length > 0 && (
                        <button 
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-white rounded-md flex items-center gap-1 transition-colors"
                        >
                            {isExpanded ? "Hide" : "View"} Details
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                    )}
                    <button onClick={handleAcknowledge} disabled={isAcknowledging} className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-md disabled:opacity-50 transition-colors">
                        {isAcknowledging ? "Dismissing..." : "Acknowledge"}
                    </button>
                </div>
            </div>

            {/* --- DROPDOWN CONTENT --- */}
            {isExpanded && incidents.length > 0 && (
                <div className="bg-gray-900/50 px-4 py-3 border-t border-gray-700/50 text-sm">
                    <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Incident Log:</p>
                    <ul className="space-y-1">
                        {incidents.map((item, idx) => (
                            <li key={idx} className="flex justify-between text-gray-300 text-xs border-b border-gray-700/50 last:border-0 pb-1 last:pb-0">
                                <span>{item.date ? formatDisplayDate(item.date) : 'Unknown Date'}</span>
                                <span>
                                    {item.minutes ? <span className="text-yellow-400 font-mono">{item.minutes}m late ({item.time})</span> : ''}
                                    {item.shift ? <span className="text-red-400 font-mono">Shift: {item.shift}</span> : ''}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </li>
    );
};

export default function ManagerAlerts({ onManualFix }) {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const scanRan = useRef(false);

    useEffect(() => {
        const runScan = async () => {
            const lastRun = localStorage.getItem('lastOperationalScan');
            const now = Date.now();
            
            // --- CONFIGURABLE DELAY ---
            // Change 5 to 0 to disable the delay for testing
            if (lastRun && (now - parseInt(lastRun)) < 1 * 60 * 1000) { 
                return; 
            }
            // --------------------------

            if (scanRan.current) return;
            scanRan.current = true;

            try {
                await runOperationalScanFunc();
                localStorage.setItem('lastOperationalScan', now.toString());
            } catch (err) {
                console.error("Scan trigger failed:", err);
            }
        };
        runScan();
    }, []);

    useEffect(() => {
        const q = query(collection(db, "manager_alerts"), where("status", "==", "pending"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const pendingAlerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAlerts(pendingAlerts);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching manager alerts:", err);
            setError("Could not load alerts.");
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) return <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700"><p className="text-sm text-gray-300 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading pending actions...</p></div>;
    if (error) return <div className="p-4 text-red-400 text-sm bg-gray-800 rounded-lg border border-red-900">{error}</div>;
    if (alerts.length === 0) return null;

    return (
        <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />Attention Required ({alerts.length})</h3>
            </div>
            <ul className="space-y-3">
                {alerts.map(alert => {
                    if (alert.type === 'missing_checkout' || !alert.type) return <MissingCheckoutItem key={alert.id} alert={alert} onManualFix={onManualFix} />;
                    else if (alert.type.startsWith('risk_')) return <RiskAlertItem key={alert.id} alert={alert} />;
                    return null;
                })}
            </ul>
        </div>
    );
}