/* src/components/Attendance/EditAttendanceModal.jsx */

import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { X, Clock, Save, Coffee, Flame, AlertCircle, Loader2, Watch } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';

export default function EditAttendanceModal({ db, record, onClose }) {
    // --- STATE ---
    const [checkIn, setCheckIn] = useState('14:00');
    const [checkOut, setCheckOut] = useState('');
    
    // New State for Break Management
    const [breakMode, setBreakMode] = useState('auto'); // 'auto' | 'manual' | 'none'
    const [breakStart, setBreakStart] = useState('');
    const [breakEnd, setBreakEnd] = useState('');

    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [docId, setDocId] = useState(record?.id || null);

    // --- HELPER: SAFE DATE PARSING ---
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

    // --- EFFECT: FETCH FRESH DATA ---
    useEffect(() => {
        const fetchFreshData = async () => {
            setIsLoadingData(true);
            try {
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
                
                if (data.checkInTime) setCheckIn(parseTimeFromVal(data.checkInTime));
                if (data.checkOutTime) setCheckOut(parseTimeFromVal(data.checkOutTime));

                // --- DETECT BREAK MODE ---
                if (data.breakStart && data.breakEnd) {
                    setBreakMode('manual');
                    setBreakStart(parseTimeFromVal(data.breakStart));
                    setBreakEnd(parseTimeFromVal(data.breakEnd));
                } else if (data.includesBreak === false) {
                    setBreakMode('none');
                } else {
                    setBreakMode('auto');
                }

            } catch (error) {
                console.error("Failed to refresh attendance data:", error);
            } finally {
                setIsLoadingData(false);
            }
        };
        fetchFreshData();
    }, [record, db]);

    // --- ACTION: SAVE ---
    const handleSave = async () => {
        if (!checkIn) return alert("Check-in time is required");
        if (breakMode === 'manual' && (!breakStart || !breakEnd)) return alert("Both break start and end times are required for Manual mode.");

        setIsSaving(true);
        try {
            const dateStr = record.date || new Date().toISOString().split('T')[0];
            const baseDateObj = new Date(dateStr);

            // Construct Date Objects
            const makeDate = (timeStr, referenceDate) => {
                if (!timeStr) return null;
                const [h, m] = timeStr.split(':').map(Number);
                const d = new Date(baseDateObj);
                d.setHours(h, m, 0);
                // Handle Overnight: If time is earlier than CheckIn (or reference), assume next day
                if (referenceDate && d < referenceDate) d.setDate(d.getDate() + 1);
                return d;
            };

            const newCheckIn = makeDate(checkIn);
            const newCheckOut = makeDate(checkOut, newCheckIn); // Pass newCheckIn as reference to detect overnight

            let newBreakStart = null;
            let newBreakEnd = null;
            let finalIncludesBreak = true;

            if (breakMode === 'manual') {
                // Break usually happens after check-in
                newBreakStart = makeDate(breakStart, newCheckIn);
                newBreakEnd = makeDate(breakEnd, newBreakStart);
                finalIncludesBreak = true;
            } else if (breakMode === 'none') {
                finalIncludesBreak = false;
            } else {
                // Auto
                finalIncludesBreak = true;
            }

            const finalDocId = docId || `${record.staffId}_${dateStr}`;
            const recordRef = doc(db, "attendance", finalDocId);

            const payload = {
                staffId: record.staffId,
                staffName: record.staffName,
                date: dateStr,
                checkInTime: newCheckIn,
                checkOutTime: newCheckOut,
                breakStart: newBreakStart,
                breakEnd: newBreakEnd,
                includesBreak: finalIncludesBreak,
                updatedAt: serverTimestamp(),
                manuallyEdited: true
            };

            if (docId) await updateDoc(recordRef, payload);
            else await setDoc(recordRef, payload, { merge: true });

            onClose();
        } catch (error) {
            console.error("Error updating attendance:", error);
            alert("Failed to save.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6 p-1">
            {/* Header */}
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
                    {/* Shift Times */}
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

                    {/* Break Policy Selector */}
                    <div className="space-y-3 pt-2 border-t border-gray-800">
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1 block">Break Policy</label>
                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => setBreakMode('auto')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${breakMode === 'auto' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'}`}>
                                <Coffee className={`w-5 h-5 mb-1 ${breakMode === 'auto' ? 'text-indigo-400' : 'text-gray-500'}`} />
                                <span className="text-[10px] font-bold">Standard</span>
                                <span className="text-[9px] opacity-60">Auto -1h</span>
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

                        {/* Manual Break Inputs */}
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
                        
                        {breakMode === 'none' && (
                            <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 p-3 rounded-lg text-[10px] font-bold uppercase">
                                <AlertCircle className="w-4 h-4" /> <span>Calculation: Paid for full shift duration.</span>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gray-800">
                        <button onClick={onClose} className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-all">Cancel</button>
                        <button onClick={handleSave} disabled={isSaving} className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">
                            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            {isSaving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}