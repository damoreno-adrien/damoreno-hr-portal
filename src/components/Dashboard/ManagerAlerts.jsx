import React, { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, db } from "../../../firebase"; 
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc } from "firebase/firestore";
import { AlertTriangle, Clock, Loader2, CheckCircle, AlertOctagon, ShieldAlert } from 'lucide-react';
import { formatDisplayTime } from '../../utils/dateUtils';

const functions = getFunctions(app, "asia-southeast1");
const autoFixShiftFunc = httpsCallable(functions, 'autoFixSingleShift');
// --- NEW: Import the scan function ---
const runOperationalScanFunc = httpsCallable(functions, 'runOperationalScan');

const MissingCheckoutItem = ({ alert, onManualFix }) => {
    const [isFixing, setIsFixing] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const checkInTime = alert.checkInTime?.toDate();
    const formattedCheckIn = checkInTime ? formatDisplayTime(checkInTime) : 'Unknown';

    const handleAutoFix = async () => {
        setIsFixing(true);
        setError(null);
        try {
            const result = await autoFixShiftFunc({ 
                attendanceDocId: alert.attendanceDocId, 
                alertId: alert.id 
            });
            setSuccess(result.data.result || "Shift fixed!");
        } catch (err) {
            console.error("Error auto-fixing shift:", err);
            setError(err.message || "Failed to fix shift.");
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
                    {isFixing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Auto-Fix (+9h)"}
                </button>
            </div>
            {error && <p className="text-xs text-red-400 w-full text-center sm:text-left">{error}</p>}
        </li>
    );
};

const RiskAlertItem = ({ alert }) => {
    const [isAcknowledging, setIsAcknowledging] = useState(false);
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

    return (
        <li className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-800 rounded-lg gap-3 border-l-4 ${borderColor}`}>
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${bgColor}`}>{icon}</div>
                <div>
                    <p className="text-sm text-white font-medium">{alert.message || "Attention Required"}</p>
                    <p className="text-xs text-gray-400">{alert.staffName} • {alert.count} / {alert.limit} limit</p>
                </div>
            </div>
            <div className="flex items-center justify-end gap-2 flex-shrink-0 w-full sm:w-auto">
                <button onClick={handleAcknowledge} disabled={isAcknowledging} className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-md disabled:opacity-50 transition-colors">
                    {isAcknowledging ? "Dismissing..." : "Acknowledge"}
                </button>
            </div>
        </li>
    );
};

export default function ManagerAlerts({ onManualFix }) {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const scanRan = useRef(false);

    // --- NEW: Trigger Scan on Mount ---
    useEffect(() => {
        const runScan = async () => {
            // Simple debounce: Don't run if we just ran it in this session < 5 mins ago
            const lastRun = localStorage.getItem('lastOperationalScan');
            const now = Date.now();
            if (lastRun && (now - parseInt(lastRun)) < 5 * 60 * 1000) {
                return; 
            }

            if (scanRan.current) return;
            scanRan.current = true;

            try {
                // console.log("Triggering operational scan...");
                await runOperationalScanFunc();
                localStorage.setItem('lastOperationalScan', now.toString());
            } catch (err) {
                console.error("Scan trigger failed:", err);
            }
        };
        runScan();
    }, []);
    // ----------------------------------

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
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Attention Required ({alerts.length})
                </h3>
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