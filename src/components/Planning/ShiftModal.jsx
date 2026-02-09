/* src/components/Planning/ShiftModal.jsx */

import React, { useState } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { X, Clock, Save, Trash2, Coffee, Flame, Loader2 } from 'lucide-react';

export default function ShiftModal({ isOpen, onClose, db, data }) {
    const { staff, date, shift } = data;
    const [startTime, setStartTime] = useState(shift?.startTime || "14:00");
    const [endTime, setEndTime] = useState(shift?.endTime || "23:00");
    const [includesBreak, setIncludesBreak] = useState(shift?.includesBreak !== false);
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            // Document ID must be staffId_date to match our planning grid logic
            const shiftRef = doc(db, "schedules", `${staff.id}_${date}`);
            await setDoc(shiftRef, {
                staffId: staff.id,
                staffName: staff.nickname || staff.firstName,
                date: date,
                startTime,
                endTime,
                includesBreak,
                updatedAt: new Date()
            }, { merge: true });
            onClose();
        } catch (error) {
            console.error("Error saving shift:", error);
            alert("Failed to save shift");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`Are you sure you want to delete the shift for ${staff.nickname || staff.firstName} on ${date}?`)) return;
        
        setLoading(true);
        try {
            // Target the exact document ID used in the grid
            const shiftRef = doc(db, "schedules", `${staff.id}_${date}`);
            await deleteDoc(shiftRef);
            onClose();
        } catch (error) {
            console.error("Error deleting shift:", error);
            alert("Failed to delete shift. Check console for details.");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
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
                            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full bg-gray-900 text-white p-3 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none transition-all" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">End Time</label>
                            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full bg-gray-900 text-white p-3 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none transition-all" />
                        </div>
                    </div>

                    <button 
                        onClick={() => setIncludesBreak(!includesBreak)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${includesBreak ? 'bg-gray-900 border-gray-700' : 'bg-amber-500/5 border-amber-500/30'}`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${includesBreak ? 'bg-gray-800 text-gray-500' : 'bg-amber-500/20 text-amber-500'}`}>
                                {includesBreak ? <Coffee className="w-5 h-5" /> : <Flame className="w-5 h-5" />}
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-bold text-white">{includesBreak ? "Standard Break" : "Continuous Shift"}</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase">{includesBreak ? "1h Unpaid break" : "No time subtracted"}</p>
                            </div>
                        </div>
                        <div className={`w-10 h-6 rounded-full relative transition-colors ${includesBreak ? 'bg-gray-700' : 'bg-amber-500'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${includesBreak ? 'left-1' : 'left-5'}`}></div>
                        </div>
                    </button>

                    <div className="flex gap-3 pt-2">
                        {/* Only show delete if a shift actually exists in the DB */}
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
    );
}