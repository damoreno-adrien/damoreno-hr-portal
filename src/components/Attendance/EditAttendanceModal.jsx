/* src/components/Attendance/EditAttendanceModal.jsx */

import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, updateDoc, setDoc, deleteDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { X, Clock, Save, Coffee, Flame, AlertCircle, Loader2, Watch, Trash2, ShieldAlert } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';
import { calculateAttendanceStatus } from '../../utils/statusUtils';

import FeedbackModal from '../common/FeedbackModal';
import ConfirmModal from '../common/ConfirmModal';

export default function EditAttendanceModal({ db, record, onClose }) {
    const [checkIn, setCheckIn] = useState('');
    const [checkOut, setCheckOut] = useState('');
    
    const [breakMode, setBreakMode] = useState('auto'); 
    const [breakStart, setBreakStart] = useState('');
    const [breakEnd, setBreakEnd] = useState('');

    const [otHours, setOtHours] = useState('');
    const [otMins, setOtMins] = useState('');

    const [lateHours, setLateHours] = useState('');
    const [lateMins, setLateMins] = useState('');

    const [scheduledShift, setScheduledShift] = useState(null);
    const [companyConfig, setCompanyConfig] = useState(null);
    const [staffBranchId, setStaffBranchId] = useState(null);

    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [docId, setDocId] = useState(record?.id || null);

    const [feedbackModal, setFeedbackModal] = useState(null);
    const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });

    const parseTimeFromVal = (val) => {
        if (!val) return '';
        try {
            const dateObj = val.toDate ? val.toDate() : (new Date(val));
            if (isNaN(dateObj.getTime())) return '';
            const hours = dateObj.getHours().toString().padStart(2, '0');
            const minutes = dateObj.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        } catch (e) { return ''; }
    };

    useEffect(() => {
        const fetchFreshData = async () => {
            setIsLoadingData(true);
            try {
                // Fetch Company Config
                const configSnap = await getDoc(doc(db, "settings", "company_config"));
                if (configSnap.exists()) setCompanyConfig(configSnap.data());

                let data = record;
                let foundId = record.id;

                if (foundId) {
                    const docSnap = await getDoc(doc(db, "attendance", foundId));
                    if (docSnap.exists()) data = docSnap.data();
                } else if (record.staffId && record.date) {
                    const q = query(collection(db, "attendance"), where("staffId", "==", record.staffId), where("date", "==", record.date));
                    const querySnap = await getDocs(q);
                    if (!querySnap.empty) {
                        const d = querySnap.docs[0];
                        data = d.data();
                        foundId = d.id;
                    }
                }

                setDocId(foundId);
                
                if (record.staffId) {
                    const staffDoc = await getDoc(doc(db, "staff_profiles", record.staffId));
                    if (staffDoc.exists()) setStaffBranchId(staffDoc.data().branchId || null);

                    const schedQ = query(collection(db, "schedules"), where("staffId", "==", record.staffId), where("date", "==", record.date));
                    const schedSnap = await getDocs(schedQ);
                    if (!schedSnap.empty) setScheduledShift(schedSnap.docs[0].data());
                }
                
                if (data.checkInTime) setCheckIn(parseTimeFromVal(data.checkInTime));
                if (data.checkOutTime) setCheckOut(parseTimeFromVal(data.checkOutTime));

                if (data.breakStart || data.breakEnd) {
                    setBreakMode('manual');
                    if (data.breakStart) setBreakStart(parseTimeFromVal(data.breakStart));
                    if (data.breakEnd) setBreakEnd(parseTimeFromVal(data.breakEnd));
                } else if (data.includesBreak === false) {
                    setBreakMode('none');
                } else {
                    setBreakMode('auto');
                }

                if (data.otApprovedMinutes > 0) {
                    setOtHours(Math.floor(data.otApprovedMinutes / 60).toString());
                    setOtMins((data.otApprovedMinutes % 60).toString());
                }
                if (data.lateApprovedMinutes > 0) {
                    setLateHours(Math.floor(data.lateApprovedMinutes / 60).toString());
                    setLateMins((data.lateApprovedMinutes % 60).toString());
                }

            } catch (error) {
                console.error("Failed to refresh data:", error);
            } finally {
                setIsLoadingData(false);
            }
        };
        fetchFreshData();
    }, [record, db]);

    const resolvedConfig = useMemo(() => {
        if (!companyConfig) return null;
        const overrides = companyConfig.branchSettings?.[staffBranchId] || {};
        return { ...companyConfig, ...overrides };
    }, [companyConfig, staffBranchId]);

    const liveCalculations = useMemo(() => {
        if (!scheduledShift) return { ot: 0, late: 0 };
        
        const dateStr = record.date || new Date().toISOString().split('T')[0];
        const baseDateObj = new Date(dateStr);

        const makeMockDate = (timeStr, referenceDate) => {
            if (!timeStr) return null;
            const [h, m] = timeStr.split(':').map(Number);
            const d = new Date(baseDateObj);
            d.setHours(h, m, 0, 0);
            if (referenceDate && d < referenceDate) d.setDate(d.getDate() + 1);
            return d;
        };

        const mockCheckIn = makeMockDate(checkIn);
        const mockCheckOut = makeMockDate(checkOut, mockCheckIn);
        
        if (!mockCheckIn) return { ot: 0, late: 0 };

        let mockBreakStart = null;
        let mockBreakEnd = null;
        let includesBreak = true;

        if (breakMode === 'manual') {
            mockBreakStart = makeMockDate(breakStart, mockCheckIn);
            mockBreakEnd = makeMockDate(breakEnd, mockBreakStart);
        } else if (breakMode === 'none') {
            includesBreak = false;
        }

        const mockAttendance = {
            checkInTime: mockCheckIn,
            checkOutTime: mockCheckOut,
            breakStart: mockBreakStart,
            breakEnd: mockBreakEnd,
            includesBreak: includesBreak
        };

        // NOW WE PASS RESOLVED CONFIG!
        const statusResult = calculateAttendanceStatus(scheduledShift, mockAttendance, null, dateStr, resolvedConfig);
        return {
            ot: statusResult.suggestedOtMinutes || 0,
            late: statusResult.suggestedLateMinutes || 0
        };
    }, [checkIn, checkOut, breakMode, breakStart, breakEnd, scheduledShift, record.date, resolvedConfig]);

    const handleAutoFill = () => {
        if (scheduledShift) {
            if (scheduledShift.startTime) setCheckIn(scheduledShift.startTime);
            if (scheduledShift.endTime) setCheckOut(scheduledShift.endTime);
            setBreakMode('auto');
        }
    };

    const handleSave = async () => {
        if (breakMode === 'manual' && checkIn && (!breakStart || !breakEnd)) {
            setFeedbackModal({ type: 'error', title: 'Missing Information', message: "Both break start and end times are required for Manual mode." });
            return;
        }

        setIsSaving(true);
        try {
            const dateStr = record.date || new Date().toISOString().split('T')[0];
            const baseDateObj = new Date(dateStr);

            const makeDate = (timeStr, referenceDate) => {
                if (!timeStr) return null;
                const [h, m] = timeStr.split(':').map(Number);
                const d = new Date(baseDateObj);
                d.setHours(h, m, 0);
                if (referenceDate && d < referenceDate) d.setDate(d.getDate() + 1);
                return d;
            };

            const newCheckIn = checkIn ? makeDate(checkIn) : null;
            const newCheckOut = (checkIn && checkOut) ? makeDate(checkOut, newCheckIn) : null; 

            let newBreakStart = null;
            let newBreakEnd = null;
            let finalIncludesBreak = true;

            if (breakMode === 'manual' && checkIn) {
                newBreakStart = makeDate(breakStart, newCheckIn);
                newBreakEnd = makeDate(breakEnd, newBreakStart);
                finalIncludesBreak = true;
            } else if (breakMode === 'none') {
                finalIncludesBreak = false;
            }

            const finalDocId = docId || `${record.staffId}_${dateStr}`;
            const recordRef = doc(db, "attendance", finalDocId);

            const payload = {
                staffId: record.staffId,
                staffName: record.staffName,
                date: dateStr,
                includesBreak: finalIncludesBreak,
                branchId: staffBranchId, 
                updatedAt: serverTimestamp(),
                manuallyEdited: true
            };

            if (newCheckIn) payload.checkInTime = newCheckIn;
            if (newCheckOut) payload.checkOutTime = newCheckOut;
            if (newBreakStart) payload.breakStart = newBreakStart;
            if (newBreakEnd) payload.breakEnd = newBreakEnd;

            const totalOtMinutes = (parseInt(otHours) || 0) * 60 + (parseInt(otMins) || 0);
            payload.otApprovedMinutes = totalOtMinutes;

            const totalLateMinutes = (parseInt(lateHours) || 0) * 60 + (parseInt(lateMins) || 0);
            payload.lateApprovedMinutes = totalLateMinutes;

            await setDoc(recordRef, payload, { merge: true });
            onClose();
        } catch (error) {
            console.error("Error updating attendance:", error);
            setFeedbackModal({ type: 'error', title: 'Save Failed', message: "Failed to save attendance record." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!docId) return;
        setConfirmState({
            isOpen: true,
            title: "Delete Attendance Record",
            message: "CRITICAL WARNING: Are you sure you want to permanently delete this attendance record?",
            isDestructive: true,
            confirmText: "Delete Record",
            onConfirm: async () => {
                setConfirmState({ isOpen: false });
                setIsDeleting(true);
                try {
                    await deleteDoc(doc(db, "attendance", docId));
                    onClose();
                } catch (error) {
                    console.error("Error deleting attendance:", error);
                    setFeedbackModal({ type: 'error', title: 'Delete Failed', message: "Failed to delete record." });
                    setIsDeleting(false);
                }
            },
            onCancel: () => setConfirmState({ isOpen: false })
        });
    };

    const autoBreakMins = resolvedConfig?.breakDurationMinutes !== undefined ? parseInt(resolvedConfig.breakDurationMinutes) : 60;

    return (
        <>
            <FeedbackModal isOpen={!!feedbackModal} type={feedbackModal?.type} title={feedbackModal?.title} message={feedbackModal?.message} onClose={() => setFeedbackModal(null)} />
            <ConfirmModal isOpen={confirmState.isOpen} title={confirmState.title} message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} isDestructive={confirmState.isDestructive} confirmText={confirmState.confirmText || "Confirm"} />

            <div className="space-y-6 p-1">
                <div className="flex items-center gap-4 bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                    <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-400 font-black">
                        {record.staffName?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <h4 className="text-white font-bold">{record.staffName}</h4>
                        <p className="text-xs text-gray-500 uppercase font-medium">{record.date}</p>
                    </div>
                </div>

                {isLoadingData ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 text-indigo-500 animate-spin" /></div>
                ) : (
                    <>
                        {scheduledShift && scheduledShift.type === 'work' && (
                            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-3 flex justify-between items-center -mb-2">
                                <div>
                                    <p className="text-[10px] font-black text-indigo-400 uppercase">Planned Shift</p>
                                    <p className="text-sm text-gray-200 font-bold">{scheduledShift.startTime} - {scheduledShift.endTime}</p>
                                </div>
                                <button onClick={handleAutoFill} className="text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md transition-colors shadow">
                                    Use Planned
                                </button>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Clock In</label>
                                <div className="relative">
                                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-full bg-gray-800 text-white pl-10 p-3 rounded-xl border border-gray-700 outline-none focus:border-indigo-500 transition-all" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Clock Out</label>
                                <div className="relative">
                                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full bg-gray-800 text-white pl-10 p-3 rounded-xl border border-gray-700 outline-none focus:border-indigo-500 transition-all" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 pt-2 border-t border-gray-800">
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-1 block">Break Policy</label>
                            <div className="grid grid-cols-3 gap-2">
                                <button onClick={() => setBreakMode('auto')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${breakMode === 'auto' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'}`}>
                                    <Coffee className={`w-5 h-5 mb-1 ${breakMode === 'auto' ? 'text-indigo-400' : 'text-gray-500'}`} />
                                    <span className="text-[10px] font-bold">Standard</span>
                                    <span className="text-[9px] opacity-60">Auto -{autoBreakMins}m</span>
                                </button>
                                <button onClick={() => setBreakMode('manual')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${breakMode === 'manual' ? 'bg-amber-600/20 border-amber-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'}`}>
                                    <Clock className={`w-5 h-5 mb-1 ${breakMode === 'manual' ? 'text-amber-400' : 'text-gray-500'}`} />
                                    <span className="text-[10px] font-bold">Manual</span>
                                    <span className="text-[9px] opacity-60">Set Times</span>
                                </button>
                                <button onClick={() => setBreakMode('none')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${breakMode === 'none' ? 'bg-red-600/20 border-red-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'}`}>
                                    <Flame className={`w-5 h-5 mb-1 ${breakMode === 'none' ? 'text-red-400' : 'text-gray-500'}`} />
                                    <span className="text-[10px] font-bold">Continuous</span>
                                    <span className="text-[9px] opacity-60">No Break</span>
                                </button>
                            </div>

                            {breakMode === 'manual' && (
                                <div className="grid grid-cols-2 gap-4 bg-gray-800/50 p-3 rounded-lg border border-gray-700 animate-fadeIn">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-400 uppercase">Break Start</label>
                                        <input type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} className="w-full bg-gray-900 text-white p-2 rounded-lg border border-gray-600 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-400 uppercase">Break End</label>
                                        <input type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} className="w-full bg-gray-900 text-white p-2 rounded-lg border border-gray-600 text-sm" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* MANAGER OVERRIDES */}
                        <div className="space-y-3 pt-4 border-t border-gray-800">
                            <label className="text-[10px] font-black text-indigo-400 uppercase ml-1 flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3" /> Manager Overrides (Payroll Impact)
                            </label>

                            {/* ROW: OVERTIME */}
                            <div className="bg-green-900/10 p-3 rounded-lg border border-green-900/30 flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-green-400">Paid Overtime</p>
                                    <p className="text-[10px] text-gray-500">
                                        Suggested by system: <span className="font-bold text-gray-300">{Math.floor(liveCalculations.ot / 60)}h {liveCalculations.ot % 60}m</span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <input 
                                        type="number" value={otHours} onChange={(e) => setOtHours(e.target.value)} 
                                        placeholder="0" className="w-14 bg-gray-900 text-white p-2 rounded-lg border border-gray-600 text-center text-sm focus:border-green-500 outline-none" min="0" 
                                    />
                                    <span className="text-xs text-gray-500 font-bold">h</span>
                                    <input 
                                        type="number" value={otMins} onChange={(e) => setOtMins(e.target.value)} 
                                        placeholder="0" className="w-14 bg-gray-900 text-white p-2 rounded-lg border border-gray-600 text-center text-sm focus:border-green-500 outline-none" min="0" max="59"
                                    />
                                    <span className="text-xs text-gray-500 font-bold">m</span>
                                </div>
                            </div>

                            {/* ROW: LATENESS */}
                            <div className="bg-orange-900/10 p-3 rounded-lg border border-orange-900/30 flex items-center justify-between mt-2">
                                <div>
                                    <p className="text-sm font-bold text-orange-400">Lateness Penalty</p>
                                    <p className="text-[10px] text-gray-500">
                                        Suggested by system: <span className="font-bold text-gray-300">{Math.floor(liveCalculations.late / 60)}h {liveCalculations.late % 60}m</span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <input 
                                        type="number" value={lateHours} onChange={(e) => setLateHours(e.target.value)} 
                                        placeholder="0" className="w-14 bg-gray-900 text-white p-2 rounded-lg border border-gray-600 text-center text-sm focus:border-orange-500 outline-none" min="0" 
                                    />
                                    <span className="text-xs text-gray-500 font-bold">h</span>
                                    <input 
                                        type="number" value={lateMins} onChange={(e) => setLateMins(e.target.value)} 
                                        placeholder="0" className="w-14 bg-gray-900 text-white p-2 rounded-lg border border-gray-600 text-center text-sm focus:border-orange-500 outline-none" min="0" max="59"
                                    />
                                    <span className="text-xs text-gray-500 font-bold">m</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4 border-t border-gray-800">
                            {docId && (
                                <button 
                                    onClick={handleDelete} disabled={isSaving || isDeleting} 
                                    className="px-4 py-3 bg-red-900/30 hover:bg-red-900/50 text-red-500 font-bold rounded-xl transition-all border border-red-900/50 flex items-center justify-center disabled:opacity-50"
                                    title="Delete Record"
                                >
                                    {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                                </button>
                            )}
                            
                            <button onClick={onClose} disabled={isSaving || isDeleting} className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-all disabled:opacity-50">Cancel</button>
                            
                            <button onClick={handleSave} disabled={isSaving || isDeleting} className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                {isSaving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}