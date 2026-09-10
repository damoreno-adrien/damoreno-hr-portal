/* src/components/Planning/ShiftModal.jsx */

import React, { useState, useEffect } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { X, Clock, Save, Trash2, Coffee, Flame, Loader2 } from 'lucide-react';

import FeedbackModal from '../common/FeedbackModal';
import ConfirmModal from '../common/ConfirmModal';

export default function ShiftModal({ isOpen, onClose, db, data, companyConfig }) {
    const { staff, date, shift } = data || {};
    const [startTime, setStartTime] = useState(shift?.startTime || "14:00");
    const [endTime, setEndTime] = useState(shift?.endTime || "23:00");
    
    // --- NOUVEAU : Gestion numérique de la pause ---
    const [breakMinutes, setBreakMinutes] = useState(60); 
    const [loading, setLoading] = useState(false);

    const [feedbackModal, setFeedbackModal] = useState(null);
    const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });

    // Initialisation intelligente de la pause
    useEffect(() => {
        if (!isOpen || !data) return;

        // 1. Si le shift existe déjà, on prend sa valeur
        if (shift?.breakMinutes !== undefined) {
            setBreakMinutes(shift.breakMinutes);
        } 
        // 2. Rétrocompatibilité (anciens shifts avec juste true/false)
        else if (shift?.includesBreak === false) {
            setBreakMinutes(0);
        } 
        // 3. Nouveau shift : on cherche la valeur par défaut de la branche
        else {
            const branchOverrides = companyConfig?.branchSettings?.[staff?.branchId] || {};
            const defaultBreak = branchOverrides.breakDurationMinutes !== undefined 
                ? parseInt(branchOverrides.breakDurationMinutes) 
                : (companyConfig?.breakDurationMinutes !== undefined ? parseInt(companyConfig.breakDurationMinutes) : 60);
            
            setBreakMinutes(defaultBreak);
        }
    }, [isOpen, data, shift, companyConfig, staff]);

    if (!isOpen || !data) return null;

    const handleSave = async () => {
        setLoading(true);
        try {
            const shiftRef = doc(db, "schedules", `${staff.id}_${date}`);
            const finalBreakMins = parseInt(breakMinutes) || 0;

            await setDoc(shiftRef, {
                staffId: staff.id,
                staffName: staff.nickname || staff.firstName,
                date: date,
                startTime,
                endTime,
                breakMinutes: finalBreakMins,                  // <-- Nouvelle donnée précise
                includesBreak: finalBreakMins > 0,             // <-- Rétrocompatibilité maintenue
                type: "work",        
                source: "manual",    
                branchId: staff.branchId || null,
                updatedAt: new Date()
            }, { merge: true });

            onClose();
        } catch (error) {
            console.error("Error saving shift:", error);
            setFeedbackModal({ type: 'error', title: 'Save Failed', message: "Failed to save shift." });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        setConfirmState({
            isOpen: true,
            title: "Delete Shift",
            message: `Are you sure you want to delete the shift for ${staff.nickname || staff.firstName} on ${date}?`,
            isDestructive: true,
            confirmText: "Delete",
            onConfirm: async () => {
                setConfirmState({ isOpen: false });
                setLoading(true);
                try {
                    const shiftRef = doc(db, "schedules", `${staff.id}_${date}`);
                    await deleteDoc(shiftRef);
                    onClose();
                } catch (error) {
                    console.error("Error deleting shift:", error);
                    setFeedbackModal({ type: 'error', title: 'Delete Failed', message: "Failed to delete shift. Check console for details." });
                } finally {
                    setLoading(false);
                }
            },
            onCancel: () => setConfirmState({ isOpen: false })
        });
    };

    return (
        <>
            <FeedbackModal isOpen={!!feedbackModal} type={feedbackModal?.type} title={feedbackModal?.title} message={feedbackModal?.message} onClose={() => setFeedbackModal(null)} />
            <ConfirmModal isOpen={confirmState.isOpen} title={confirmState.title} message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={confirmState.onCancel} isDestructive={confirmState.isDestructive} confirmText={confirmState.confirmText} />

            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                    <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                        <div>
                            <h3 className="text-white font-black">{staff.nickname || staff.firstName}</h3>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{date}</p>
                        </div>
                        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X /></button>
                    </div>

                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Start Time</label>
                                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full bg-gray-900 text-white p-3 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none transition-all [color-scheme:dark]" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">End Time</label>
                                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full bg-gray-900 text-white p-3 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none transition-all [color-scheme:dark]" />
                            </div>
                        </div>

                        {/* NOUVELLE UI POUR LA PAUSE NUMÉRIQUE */}
                        <div className={`p-4 rounded-xl border transition-all ${breakMinutes > 0 ? 'bg-gray-900 border-gray-700' : 'bg-amber-500/5 border-amber-500/30'}`}>
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${breakMinutes > 0 ? 'bg-gray-800 text-gray-500' : 'bg-amber-500/20 text-amber-500'}`}>
                                        {breakMinutes > 0 ? <Coffee className="w-5 h-5" /> : <Flame className="w-5 h-5" />}
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-white">{breakMinutes > 0 ? "Unpaid Break" : "Continuous Shift"}</p>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">{breakMinutes > 0 ? "Time subtracted" : "No break taken"}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="number" 
                                        value={breakMinutes} 
                                        onChange={(e) => setBreakMinutes(e.target.value)}
                                        min="0"
                                        step="5"
                                        className="w-16 bg-gray-800 text-white p-2 rounded-lg border border-gray-600 text-center font-bold focus:border-indigo-500 outline-none" 
                                    />
                                    <span className="text-xs text-gray-500 font-bold">mins</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            {shift && (
                                <button
                                    onClick={handleDelete}
                                    disabled={loading}
                                    className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all border border-red-500/20 disabled:opacity-50"
                                    title="Delete Shift"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                                </button>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                            >
                                {loading && !shift ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                {loading ? "Processing..." : "Save Shift"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}