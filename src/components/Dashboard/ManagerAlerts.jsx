/* src/components/Dashboard/ManagerAlerts.jsx */

import React, { useState, useEffect, useMemo } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, db } from "../../../firebase"; 
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, getDocs } from "firebase/firestore";
import { AlertTriangle, Clock, Loader2, CheckCircle, AlertOctagon, CheckSquare, Search, DollarSign } from 'lucide-react';
import { formatDisplayTime, formatDisplayDate, formatISODate, addDays } from '../../utils/dateUtils';
import { generateDocument } from '../../utils/documentGenerator'; // <-- IMPORT DU GÉNÉRATEUR DE DOCUMENTS

import FeedbackModal from '../common/FeedbackModal';
import ConfirmModal from '../common/ConfirmModal';

const functions = getFunctions(app, "asia-southeast1");
const autoFixShiftFunc = httpsCallable(functions, 'autoFixSingleShift');
const runUnifiedHRScanFunc = httpsCallable(functions, 'runUnifiedHRScan');

const MissingCheckoutItem = ({ alert, onManualFix }) => {
    // ... (Garder la fonction MissingCheckoutItem identique à ta version)
    const [isFixing, setIsFixing] = useState(false);
    const [error, setError] = useState(null);
    const [scheduledEndStr, setScheduledEndStr] = useState("23:00");
    const [isLoadingTime, setIsLoadingTime] = useState(true);

    const checkInTime = alert.checkInTime?.toDate();
    const formattedCheckIn = checkInTime ? formatDisplayTime(checkInTime) : 'Unknown';
    const displayEndTime = scheduledEndStr.replace(':', 'h');

    useEffect(() => {
        const fetchScheduleTime = async () => {
            try {
                const schedQ = query(collection(db, "schedules"), where("staffId", "==", alert.staffId), where("date", "==", alert.date));
                const schedSnap = await getDocs(schedQ);
                if (!schedSnap.empty) setScheduledEndStr(schedSnap.docs[0].data().endTime || "23:00");
            } catch (err) { console.error("Failed to fetch schedule for alert", err); } 
            finally { setIsLoadingTime(false); }
        };
        fetchScheduleTime();
    }, [alert.staffId, alert.date]);

    const handleAutoFix = async () => {
        setIsFixing(true); setError(null);
        try { await autoFixShiftFunc({ attendanceDocId: alert.attendanceDocId, alertId: "local_dummy_id", scheduledEndTime: scheduledEndStr }); } 
        catch (err) { setError(err.message || "Failed to fix."); setIsFixing(false); }
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

// --- MODIFIÉ : Injection de companyConfig et setFeedbackModal ---
const HRAlertItem = ({ alert, companyConfig, setFeedbackModal }) => {
    const [isProcessing, setIsProcessing] = useState(false);

    let icon, borderColor, bgColor, title, actionText, actionColor;
    
    // Prise en charge du nouveau type 'risk_disciplinary' et des anciens types pour rétrocompatibilité
    if (alert.type === 'risk_disciplinary' || alert.type === 'risk_absence' || alert.type === 'risk_late') {
        icon = <AlertOctagon className="h-5 w-5 text-red-400" />;
        borderColor = "border-red-500"; bgColor = "bg-red-900/10";
        title = alert.message || "Disciplinary Action Required"; 
        actionText = "Enforce & Generate Doc"; // <-- NOUVEAU TEXTE
        actionColor = "bg-red-600 hover:bg-red-500";
    } else if (alert.type === 'overtime_request') {
        icon = <DollarSign className="h-5 w-5 text-green-400" />;
        borderColor = "border-green-500"; bgColor = "bg-green-900/10";
        title = alert.message || `Overtime Pending (${alert.extraMinutes}m)`; 
        actionText = "Approve OT"; 
        actionColor = "bg-green-600 hover:bg-green-500";
    }

    const handleDismiss = async () => {
        setIsProcessing(true);
        try { await updateDoc(doc(db, "manager_alerts", alert.id), { status: 'dismissed' }); } 
        catch (err) { setIsProcessing(false); }
    };

    // --- LE CŒUR DE L'OPTION B : Le Workflow Automatisé ---
    const handleEnforce = async () => {
        setIsProcessing(true);
        try {
            if (alert.type === 'overtime_request') {
                await updateDoc(doc(db, "manager_alerts", alert.id), { status: 'approved' });
                setFeedbackModal({ type: 'success', title: 'OT Approved', message: 'Overtime has been added to payroll.' });
            } else {
                
                // 1. Découpage du Message (ex: "3rd Lateness - Recommend: 1-Day Suspension")
                let warningLevel = "Disciplinary Warning";
                let consequence = "Verbal Warning";
                
                if (alert.message && alert.message.includes(' - Recommend: ')) {
                    const parts = alert.message.split(' - Recommend: ');
                    warningLevel = parts[0];
                    consequence = parts[1];
                } else {
                    warningLevel = alert.message;
                }

                // 2. Formatage du Dossier Historique pour le champ {{REASON}}
                let incidentDetails = "Attendance violation.";
                let lastIncidentDate = formatDisplayDate(alert.date);

                if (alert.incidentHistory && alert.incidentHistory.length > 0) {
                    incidentDetails = alert.incidentHistory.map(inc => {
                        const dateStr = formatDisplayDate(inc.date);
                        if (inc.type === 'Late') return `- ${dateStr} : Late check-in (${inc.minutesLate} mins)`;
                        if (inc.type === 'Absence') return `- ${dateStr} : Unexcused Absence`;
                        return `- ${dateStr} : ${inc.type}`;
                    }).join('\n'); // Le saut de ligne sera interprété par docxtemplater
                    
                    const lastInc = alert.incidentHistory[alert.incidentHistory.length - 1];
                    if (lastInc) lastIncidentDate = formatDisplayDate(lastInc.date);
                }

                // 3. Préparation des données pour le Word
                const mockStaff = {
                    fullName: alert.staffName,
                    branchId: alert.branchId,
                    jobHistory: [{ position: alert.position || 'Staff', department: alert.department || 'General' }]
                };

                const extraData = {
                    WARNING_LEVEL: warningLevel,
                    CONSEQUENCE: consequence,
                    INCIDENT_DATE: lastIncidentDate,
                    REASON: incidentDetails
                };

                // 4. GÉNÉRATION DU DOCUMENT
                const docResult = await generateDocument('warning', mockStaff, companyConfig, extraData);
                
                if (!docResult.success) {
                    setFeedbackModal({ type: 'error', title: 'Generation Failed', message: `Could not generate Warning Notice: ${docResult.error}` });
                    setIsProcessing(false);
                    return; // ON STOPPE SI LE DOC ÉCHOUE (Sécurité)
                }

                // 5. ENFORCEMENT FIREBASE (Seulement si le document a été créé)
                await updateDoc(doc(db, "manager_alerts", alert.id), { status: 'enforced' });
                setFeedbackModal({ type: 'success', title: 'Penalty Enforced', message: 'Warning notice generated successfully and penalty applied.' });
            }
        } catch (err) { 
            console.error("Enforce error:", err);
            setFeedbackModal({ type: 'error', title: 'Error', message: 'Failed to enforce penalty.' });
        } finally { 
            setIsProcessing(false); 
        }
    };

    return (
        <li className={`bg-gray-800 rounded-lg border-l-4 ${borderColor} overflow-hidden transition-opacity`}>
            <div className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${bgColor}`}>{icon}</div>
                    <div>
                        <p className="text-sm text-white font-medium">{title}</p>
                        <p className="text-xs text-gray-400">{formatDisplayDate(alert.date)}</p>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                    <button onClick={handleDismiss} disabled={isProcessing} className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-md transition-colors">
                        Dismiss
                    </button>
                    <button onClick={handleEnforce} disabled={isProcessing} className={`flex items-center px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors ${actionColor}`}>
                        {isProcessing ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                        {isProcessing ? "Processing..." : actionText}
                    </button>
                </div>
            </div>
        </li>
    );
};

// --- MODIFIÉ : Ajout de la prop companyConfig ---
export default function ManagerAlerts({ onManualFix, activeBranch, branches = [], userRole, adminBranchIds = [], companyConfig }) {
    const [rawHrAlerts, setRawHrAlerts] = useState([]);
    const [rawMissingCheckouts, setRawMissingCheckouts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const [isFixingAll, setIsFixingAll] = useState(false);
    const [scanStart, setScanStart] = useState('');
    const [scanEnd, setScanEnd] = useState('');

    const [feedbackModal, setFeedbackModal] = useState(null);
    const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });

    useEffect(() => {
        const q = query(collection(db, "manager_alerts"), where("status", "==", "pending"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const pendingAlerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRawHrAlerts(pendingAlerts.filter(a => a.type !== 'missing_checkout'));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

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
                        id: `local_missing_${docSnap.id}`, type: 'missing_checkout', staffId: data.staffId, staffName: data.staffName,
                        date: data.date, attendanceDocId: docSnap.id, checkInTime: data.checkInTime, branchId: data.branchId || null 
                    });
                }
            });
            missing.sort((a, b) => b.date.localeCompare(a.date));
            setRawMissingCheckouts(missing);
        });
        return () => unsubscribe();
    }, []);

    // --- THE FILTER LAYER: Strict RBAC Enforcement ---
    const hrAlerts = useMemo(() => {
        if (userRole === 'super_admin') {
            return activeBranch === 'global' ? rawHrAlerts : rawHrAlerts.filter(a => a.branchId === activeBranch);
        }
        
        // POUR ADMIN ET MANAGER
        if (activeBranch === 'global') {
            return rawHrAlerts.filter(a => adminBranchIds.includes(a.branchId));
        }
        
        if (adminBranchIds.includes(activeBranch)) {
            return rawHrAlerts.filter(a => a.branchId === activeBranch);
        }
        
        return []; // ACCÈS REFUSÉ
    }, [rawHrAlerts, activeBranch, userRole, adminBranchIds]);

    const missingCheckouts = useMemo(() => {
        if (userRole === 'super_admin') {
            return activeBranch === 'global' ? rawMissingCheckouts : rawMissingCheckouts.filter(a => a.branchId === activeBranch);
        }
        
        if (activeBranch === 'global') {
            return rawMissingCheckouts.filter(a => adminBranchIds.includes(a.branchId));
        }
        
        if (adminBranchIds.includes(activeBranch)) {
            return rawMissingCheckouts.filter(a => a.branchId === activeBranch);
        }
        
        return []; // ACCÈS REFUSÉ
    }, [rawMissingCheckouts, activeBranch, userRole, adminBranchIds]);

    const handleFixAll = async () => {
        setConfirmState({
            isOpen: true, title: "Auto-Fix Check-outs",
            message: `Auto-fix ${missingCheckouts.length} missing check-outs to their scheduled end times?`,
            isDestructive: false, confirmText: "Fix All",
            onConfirm: async () => {
                setConfirmState({ isOpen: false });
                setIsFixingAll(true);
                try {
                    const promises = missingCheckouts.map(async (alert) => {
                        const schedQ = query(collection(db, "schedules"), where("staffId", "==", alert.staffId), where("date", "==", alert.date));
                        const schedSnap = await getDocs(schedQ);
                        const scheduledEndStr = !schedSnap.empty ? (schedSnap.docs[0].data().endTime || "23:00") : "23:00";
                        return autoFixShiftFunc({ attendanceDocId: alert.attendanceDocId, alertId: "local_dummy_id", scheduledEndTime: scheduledEndStr });
                    });
                    await Promise.allSettled(promises);
                } catch (err) { setFeedbackModal({ type: 'error', title: 'Action Failed', message: "Error running Fix All." }); } 
                finally { setIsFixingAll(false); }
            },
            onCancel: () => setConfirmState({ isOpen: false })
        });
    };

    const handleRunHRScan = async () => {
        if (missingCheckouts.length > 0) {
            setFeedbackModal({ type: 'error', title: 'Action Required', message: "Please fix all missing check-outs before running the HR Scan to ensure accurate math." });
            return;
        }
        setIsScanning(true);
        try { 
            const payload = {};
            if (scanStart) payload.startDate = scanStart;
            if (scanEnd) payload.endDate = scanEnd;

            const result = await runUnifiedHRScanFunc(payload); 
            setFeedbackModal({ type: 'success', title: 'Scan Complete', message: `Scanned ${result.data.daysScanned} day(s). Found ${result.data.alertsCreated} new HR items.` });
        } catch (err) { setFeedbackModal({ type: 'error', title: 'Scan Failed', message: "Scan failed. Check console." }); } 
        finally { setIsScanning(false); }
    };

    const groupedAlerts = hrAlerts.reduce((acc, alert) => {
        let nameDisplay = alert.staffName || 'Unknown Staff';
        const parts = [];
        if (alert.department && alert.department !== 'N/A') parts.push(alert.department);
        if (alert.position && alert.position !== 'N/A') parts.push(alert.position);
        if (activeBranch === 'global' && alert.branchId) {
            const bName = branches.find(b => b.id === alert.branchId)?.name || alert.branchId;
            parts.push(bName.replace('Da Moreno ', ''));
        }
        if (parts.length > 0) nameDisplay += ` (${parts.join(' - ')})`;

        if (!acc[nameDisplay]) acc[nameDisplay] = [];
        acc[nameDisplay].push(alert);
        return acc;
    }, {});

    return (
        <div className="relative">
            <FeedbackModal isOpen={!!feedbackModal} type={feedbackModal?.type} title={feedbackModal?.title} message={feedbackModal?.message} onClose={() => setFeedbackModal(null)} />
            <ConfirmModal isOpen={confirmState.isOpen} title={confirmState.title} message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} isDestructive={confirmState.isDestructive} confirmText={confirmState.confirmText || "Confirm"} />

            {loading ? (
                <div className="bg-gray-800 p-4 rounded-lg flex items-center text-gray-300">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading pending actions...
                </div>
            ) : missingCheckouts.length === 0 && hrAlerts.length === 0 ? (
                <div className="bg-gray-800 p-6 rounded-lg text-center border border-gray-700 shadow-lg flex flex-col items-center">
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <h3 className="text-white font-medium">All clear!</h3>
                    <p className="text-sm text-gray-400 mb-6">No missing check-outs or pending HR approvals.</p>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-2 bg-gray-900/50 p-2 rounded-lg border border-gray-700">
                        <input type="date" value={scanStart} onChange={e => setScanStart(e.target.value)} className="bg-gray-800 text-white rounded p-2 text-sm border border-gray-600 focus:border-indigo-500 outline-none w-full sm:w-auto [color-scheme:dark]" />
                        <span className="text-gray-400 text-sm font-medium">to</span>
                        <input type="date" value={scanEnd} onChange={e => setScanEnd(e.target.value)} className="bg-gray-800 text-white rounded p-2 text-sm border border-gray-600 focus:border-indigo-500 outline-none w-full sm:w-auto [color-scheme:dark]" />
                        <button onClick={handleRunHRScan} disabled={isScanning} className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors inline-flex justify-center items-center whitespace-nowrap">
                            {isScanning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                            {isScanning ? "Scanning..." : "Run Range Scan"}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-6 animate-fadeIn">
                    {missingCheckouts.length > 0 && (
                        <div className="space-y-3 bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                            {/* ... (Rendu des missing checkouts identique) ... */}
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
                                {missingCheckouts.map(alert => {
                                    let displayName = alert.staffName;
                                    if (activeBranch === 'global' && alert.branchId) {
                                        const bName = branches.find(b => b.id === alert.branchId)?.name || alert.branchId;
                                        displayName += ` (${bName.replace('Da Moreno ', '')})`;
                                    }
                                    return <MissingCheckoutItem key={alert.id} alert={{...alert, staffName: displayName}} onManualFix={onManualFix} />
                                })}
                            </ul>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-2 border-b border-gray-700 pb-4">
                            <h3 className="text-lg font-bold text-white">HR & Disciplinary Actions</h3>
                            <div className="flex flex-col sm:flex-row items-center gap-2 bg-gray-900/50 p-1.5 rounded-lg border border-gray-700 w-full xl:w-auto">
                                <input type="date" value={scanStart} onChange={e => setScanStart(e.target.value)} className="bg-gray-800 text-white rounded p-1.5 text-sm border border-gray-600 focus:border-indigo-500 outline-none w-full sm:w-auto [color-scheme:dark]" />
                                <span className="text-gray-400 text-sm font-medium">to</span>
                                <input type="date" value={scanEnd} onChange={e => setScanEnd(e.target.value)} className="bg-gray-800 text-white rounded p-1.5 text-sm border border-gray-600 focus:border-indigo-500 outline-none w-full sm:w-auto [color-scheme:dark]" />
                                <button onClick={handleRunHRScan} disabled={isScanning || missingCheckouts.length > 0} className="w-full sm:w-auto flex items-center justify-center gap-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                                    {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                    {isScanning ? "Scanning..." : "Run Scan"}
                                </button>
                            </div>
                        </div>
                        
                        {hrAlerts.length > 0 ? (
                            <div className="space-y-5 mt-4">
                                {Object.keys(groupedAlerts).sort().map(staffName => (
                                    <div key={staffName} className="bg-gray-900/40 rounded-xl border border-gray-700 overflow-hidden shadow-sm">
                                        <div className="bg-gray-800 px-4 py-2.5 border-b border-gray-700 flex justify-between items-center">
                                            <h4 className="font-bold text-gray-200">{staffName}</h4>
                                            <span className="text-xs font-bold bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-md border border-indigo-500/30">
                                                {groupedAlerts[staffName].length} Action{groupedAlerts[staffName].length > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <div className="p-3">
                                            <ul className="space-y-2">
                                                {groupedAlerts[staffName].map(alert => (
                                                    // MODIFIÉ : On passe la config et le setter de modal à chaque élément
                                                    <HRAlertItem key={alert.id} alert={alert} companyConfig={companyConfig} setFeedbackModal={setFeedbackModal} />
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 italic mt-4">No HR actions pending. Click the scan button to audit data.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}