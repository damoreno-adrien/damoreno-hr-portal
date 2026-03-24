import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, db } from "../../../firebase"; 
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, getDocs } from "firebase/firestore";
import { AlertTriangle, Clock, Loader2, CheckCircle, AlertOctagon, ShieldAlert, CheckSquare, Search, DollarSign } from 'lucide-react';
import { formatDisplayTime, formatDisplayDate, formatISODate, addDays } from '../../utils/dateUtils';

const functions = getFunctions(app, "asia-southeast1");
const autoFixShiftFunc = httpsCallable(functions, 'autoFixSingleShift');
const runUnifiedHRScanFunc = httpsCallable(functions, 'runUnifiedHRScan');

// ============================================================================
// COMPONENT 1: MISSING CHECK-OUTS (THE RAW DATA CLEANUP)
// ============================================================================
const MissingCheckoutItem = ({ alert, onManualFix }) => {
    const [isFixing, setIsFixing] = useState(false);
    const [error, setError] = useState(null);
    const [scheduledEndStr, setScheduledEndStr] = useState("23:00");
    const [isLoadingTime, setIsLoadingTime] = useState(true);

    const checkInTime = alert.checkInTime?.toDate();
    const formattedCheckIn = checkInTime ? formatDisplayTime(checkInTime) : 'Unknown';
    const displayEndTime = scheduledEndStr.replace(':', 'h');

    // Fetch the schedule for this specific item in the background
    useEffect(() => {
        const fetchScheduleTime = async () => {
            try {
                const schedQ = query(collection(db, "schedules"), where("staffId", "==", alert.staffId), where("date", "==", alert.date));
                const schedSnap = await getDocs(schedQ);
                if (!schedSnap.empty) {
                    setScheduledEndStr(schedSnap.docs[0].data().endTime || "23:00");
                }
            } catch (err) {
                console.error("Failed to fetch schedule for alert", err);
            } finally {
                setIsLoadingTime(false);
            }
        };
        fetchScheduleTime();
    }, [alert.staffId, alert.date]);

    const handleAutoFix = async () => {
        setIsFixing(true); 
        setError(null);
        try {
            await autoFixShiftFunc({ 
                attendanceDocId: alert.attendanceDocId, 
                alertId: "local_dummy_id", // Safely ignored by backend
                scheduledEndTime: scheduledEndStr
            });
            // No need to set isFixing(false) here because the component will instantly unmount!
        } catch (err) {
            setError(err.message || "Failed to fix.");
            setIsFixing(false);
        }
    };

    return (
        <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-800 rounded-lg gap-3 border-l-4 border-amber-500 transition-all hover:bg-gray-750">
            <div className="flex items-center gap-3">
                <div className="bg-amber-900/30 p-2 rounded-full"><Clock className="h-5 w-5 text-amber-400" /></div>
                <div>
                    <p className="text-sm text-white font-medium">{alert.staffName} missed check-out</p>
                    <p className="text-xs text-gray-400">{formatDisplayDate(alert.date)} • In at {formattedCheckIn}</p>
                </div>
            </div>
            <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                <button onClick={() => onManualFix({ ...alert, id: null })} disabled={isFixing} className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-indigo-600 hover:text-white text-gray-200 rounded-md transition-colors">Manual Fix</button>
                <button onClick={handleAutoFix} disabled={isFixing || isLoadingTime} className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-md flex items-center gap-1.5 transition-colors min-w-[120px] justify-center">
                    {isFixing || isLoadingTime ? <Loader2 className="h-3 w-3 animate-spin" /> : `Auto-Fix (${displayEndTime})`}
                </button>
            </div>
            {error && <p className="text-xs text-red-400 w-full text-center sm:text-left">{error}</p>}
        </li>
    );
};

// ============================================================================
// COMPONENT 2: HR ALERTS (LATENESS, ABSENCES, OVERTIME)
// ============================================================================
const HRAlertItem = ({ alert }) => {
    const [isProcessing, setIsProcessing] = useState(false);

    let icon, borderColor, bgColor, title, actionText, actionColor;
    
    if (alert.type === 'risk_absence') {
        icon = <AlertOctagon className="h-5 w-5 text-red-400" />;
        borderColor = "border-red-500"; bgColor = "bg-red-900/10";
        title = alert.message || "Unexcused Absence"; actionText = "Enforce Penalty"; actionColor = "bg-red-600 hover:bg-red-500";
    } else if (alert.type === 'risk_late') {
        icon = <ShieldAlert className="h-5 w-5 text-yellow-400" />;
        borderColor = "border-yellow-500"; bgColor = "bg-yellow-900/10";
        title = alert.message || `Late Check-in (${alert.minutesLate}m)`; actionText = "Enforce Penalty"; actionColor = "bg-red-600 hover:bg-red-500";
    } else if (alert.type === 'overtime_request') {
        icon = <DollarSign className="h-5 w-5 text-green-400" />;
        borderColor = "border-green-500"; bgColor = "bg-green-900/10";
        title = alert.message || `Overtime Pending (${alert.extraMinutes}m)`; actionText = "Approve OT"; actionColor = "bg-green-600 hover:bg-green-500";
    }

    const handleDismiss = async () => {
        setIsProcessing(true);
        try { await updateDoc(doc(db, "manager_alerts", alert.id), { status: 'dismissed' }); } 
        catch (err) { setIsProcessing(false); }
    };

    const handleEnforce = async () => {
        setIsProcessing(true);
        try {
            if (alert.type === 'overtime_request') {
                await updateDoc(doc(db, "manager_alerts", alert.id), { status: 'approved' });
            } else {
                await updateDoc(doc(db, "manager_alerts", alert.id), { status: 'enforced' });
            }
        } catch (err) { setIsProcessing(false); }
    };

    return (
        <li className={`bg-gray-800 rounded-lg border-l-4 ${borderColor} overflow-hidden transition-opacity`}>
            <div className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${bgColor}`}>{icon}</div>
                    <div>
                        <p className="text-sm text-white font-medium">{title}</p>
                        <p className="text-xs text-gray-400">{alert.staffName} • {formatDisplayDate(alert.date)}</p>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                    <button onClick={handleDismiss} disabled={isProcessing} className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-md transition-colors">
                        Dismiss
                    </button>
                    <button onClick={handleEnforce} disabled={isProcessing} className={`px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors ${actionColor}`}>
                        {isProcessing ? "Processing..." : actionText}
                    </button>
                </div>
            </div>
        </li>
    );
};

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================
export default function ManagerAlerts({ onManualFix }) {
    const [hrAlerts, setHrAlerts] = useState([]);
    const [missingCheckouts, setMissingCheckouts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const [isFixingAll, setIsFixingAll] = useState(false);

    // 1. Listen for Pending HR Actions (Lateness, Absences, OT)
    useEffect(() => {
        const q = query(collection(db, "manager_alerts"), where("status", "==", "pending"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const pendingAlerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setHrAlerts(pendingAlerts.filter(a => a.type !== 'missing_checkout'));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // 2. Synchronous Snapshot for Missing Check-outs (Instant Updates)
    useEffect(() => {
        const yesterday = addDays(new Date(), -1);
        const dayBefore = addDays(new Date(), -2);
        const datesToScan = [formatISODate(yesterday), formatISODate(dayBefore)];

        const q = query(collection(db, "attendance"), where("date", "in", datesToScan));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const missing = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.checkInTime && !data.checkOutTime) {
                    missing.push({
                        id: `local_missing_${docSnap.id}`, 
                        type: 'missing_checkout',
                        staffId: data.staffId,
                        staffName: data.staffName,
                        date: data.date,
                        attendanceDocId: docSnap.id,
                        checkInTime: data.checkInTime
                    });
                }
            });
            missing.sort((a, b) => b.date.localeCompare(a.date));
            setMissingCheckouts(missing);
        });
        return () => unsubscribe();
    }, []);

    const handleFixAll = async () => {
        if (!window.confirm(`Auto-fix ${missingCheckouts.length} missing check-outs to their scheduled end times?`)) return;
        setIsFixingAll(true);
        try {
            const promises = missingCheckouts.map(async (alert) => {
                // Fetch the specific schedule right before firing the function
                const schedQ = query(collection(db, "schedules"), where("staffId", "==", alert.staffId), where("date", "==", alert.date));
                const schedSnap = await getDocs(schedQ);
                const scheduledEndStr = !schedSnap.empty ? (schedSnap.docs[0].data().endTime || "23:00") : "23:00";
                
                return autoFixShiftFunc({ attendanceDocId: alert.attendanceDocId, alertId: "local_dummy_id", scheduledEndTime: scheduledEndStr });
            });
            await Promise.allSettled(promises);
        } catch (err) {
            console.error("Error running Fix All:", err);
        } finally {
            setIsFixingAll(false);
        }
    };

    const handleRunHRScan = async () => {
        if (missingCheckouts.length > 0) {
            alert("Please fix all missing check-outs before running the HR Scan to ensure accurate math.");
            return;
        }
        setIsScanning(true);
        try { 
            const result = await runUnifiedHRScanFunc({}); 
            alert(`Scan complete. Found ${result.data.alertsCreated} new HR items.`);
        } 
        catch (err) { console.error("HR Scan failed:", err); alert("Scan failed. Check console."); } 
        finally { setIsScanning(false); }
    };

    if (loading) return <div className="bg-gray-800 p-4 rounded-lg flex items-center text-gray-300"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading pending actions...</div>;
    
    if (missingCheckouts.length === 0 && hrAlerts.length === 0) return (
        <div className="bg-gray-800 p-6 rounded-lg text-center border border-gray-700 shadow-lg">
            <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <h3 className="text-white font-medium">All clear!</h3>
            <p className="text-sm text-gray-400 mb-4">No missing check-outs or pending HR approvals.</p>
            <button onClick={handleRunHRScan} disabled={isScanning} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center">
                {isScanning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                {isScanning ? "Scanning Database..." : "Run Unified HR Scan"}
            </button>
        </div>
    );

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* SECTION 1: RAW DATA CLEANUP */}
            {missingCheckouts.length > 0 && (
                <div className="space-y-3 bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Missing Check-outs ({missingCheckouts.length})
                        </h3>
                        {missingCheckouts.length > 1 && (
                            <button onClick={handleFixAll} disabled={isFixingAll} className="flex items-center justify-center gap-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
                                {isFixingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                                {isFixingAll ? "Fixing All..." : `Auto-Fix All (${missingCheckouts.length})`}
                            </button>
                        )}
                    </div>
                    <ul className="space-y-2">
                        {missingCheckouts.map(alert => <MissingCheckoutItem key={alert.id} alert={alert} onManualFix={onManualFix} />)}
                    </ul>
                </div>
            )}

            {/* SECTION 2: HR AUDIT & SCAN */}
            <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 border-b border-gray-700 pb-2">
                    <h3 className="text-lg font-bold text-white">HR & Disciplinary Actions</h3>
                    <button onClick={handleRunHRScan} disabled={isScanning || missingCheckouts.length > 0} className="flex items-center justify-center gap-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        {isScanning ? "Scanning..." : "Run Unified HR Scan"}
                    </button>
                </div>
                
                {hrAlerts.length > 0 ? (
                    <ul className="space-y-2">
                        {hrAlerts.map(alert => <HRAlertItem key={alert.id} alert={alert} />)}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500 italic">No HR actions pending. Click the scan button to audit yesterday's data.</p>
                )}
            </div>
        </div>
    );
}