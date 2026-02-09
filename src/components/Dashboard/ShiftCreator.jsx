/* src/components/Dashboard/ShiftCreator.jsx */

import React, { useState, useEffect, useMemo } from 'react';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { Save, Clock, Info, Loader2, Coffee, Flame } from 'lucide-react';

export default function ShiftCreator({ db, staffList, onSuccess, initialStaffId, initialStartDate, initialEndDate }) {
    // --- SMART DEFAULTS ---
    const getNextWeekBounds = () => {
        const today = new Date();
        const day = today.getDay(); // 0=Sun, 1=Mon
        const distToMonday = (8 - day) % 7 || 7; 
        
        const nextMonday = new Date(today);
        nextMonday.setDate(today.getDate() + distToMonday);
        
        const nextSunday = new Date(nextMonday);
        nextSunday.setDate(nextMonday.getDate() + 6);

        return {
            start: nextMonday.toISOString().split('T')[0],
            end: nextSunday.toISOString().split('T')[0]
        };
    };

    const defaults = getNextWeekBounds();

    // Use Props if provided (from clicking Staff Name), otherwise use Smart Defaults
    const [selectedStaffId, setSelectedStaffId] = useState(initialStaffId || "");
    const [startDate, setStartDate] = useState(initialStartDate || defaults.start);
    const [endDate, setEndDate] = useState(initialEndDate || defaults.end);
    const [loading, setLoading] = useState(false);

    // --- FILTER INACTIVE STAFF ---
    const activeStaff = useMemo(() => {
        return staffList?.filter(s => s.status !== 'inactive') || [];
    }, [staffList]);

    const [weekPattern, setWeekPattern] = useState({
        0: { active: true, start: "14:00", end: "23:00", break: true }, // Sun
        1: { active: true, start: "14:00", end: "23:00", break: true }, // Mon
        2: { active: true, start: "14:00", end: "23:00", break: true }, // Tue
        3: { active: true, start: "14:00", end: "23:00", break: true }, // Wed
        4: { active: true, start: "14:00", end: "23:00", break: true }, // Thu
        5: { active: true, start: "14:00", end: "23:00", break: true }, // Fri
        6: { active: true, start: "14:00", end: "23:00", break: true }, // Sat
    });

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    // --- SMART DATE HANDLERS ---
    const handleStartDateChange = (e) => {
        const newStart = e.target.value;
        setStartDate(newStart);
        
        if (newStart) {
            const s = new Date(newStart);
            s.setDate(s.getDate() + 6);
            setEndDate(s.toISOString().split('T')[0]);
        }
    };

    const handlePatternChange = (dayIndex, field, value) => {
        let newPattern = { ...weekPattern[dayIndex], [field]: value };
        
        if (field === 'start' || field === 'end') {
            const [sh, sm] = (field === 'start' ? value : newPattern.start).split(':').map(Number);
            const [eh, em] = (field === 'end' ? value : newPattern.end).split(':').map(Number);
            let diff = (eh * 60 + em) - (sh * 60 + sm);
            if (diff < 0) diff += 1440;
            newPattern.break = diff >= 420; 
        }
        setWeekPattern(prev => ({ ...prev, [dayIndex]: newPattern }));
    };

    const generateShifts = async () => {
        if (!selectedStaffId || !startDate || !endDate) return alert("Please fill all fields");
        if (startDate > endDate) return alert("Start date cannot be after end date.");

        setLoading(true);
        const batch = writeBatch(db);
        const start = new Date(startDate);
        const end = new Date(endDate);
        const staff = activeStaff.find(s => s.id === selectedStaffId);
        
        let current = new Date(start);
        let count = 0;

        while (current <= end) {
            const dayIdx = current.getDay();
            const pattern = weekPattern[dayIdx];

            if (pattern.active) {
                const dateStr = current.toISOString().split('T')[0];
                const shiftRef = doc(db, "schedules", `${selectedStaffId}_${dateStr}`);

                batch.set(shiftRef, {
                    staffId: selectedStaffId,
                    staffName: staff.nickname || staff.firstName,
                    date: dateStr,
                    startTime: pattern.start,
                    endTime: pattern.end,
                    includesBreak: pattern.break, 
                    type: 'pattern_generated',
                    updatedAt: new Date()
                }, { merge: true });
                count++;
            }
            current.setDate(current.getDate() + 1);
        }

        try {
            await batch.commit();
            onSuccess();
        } catch (e) {
            console.error(e);
            alert("Error saving shifts");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-900/50 p-4 rounded-lg">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Staff Member</label>
                    <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)} className="bg-gray-800 text-white rounded p-2 border border-gray-700 outline-none">
                        <option value="">Select...</option>
                        {activeStaff.map(s => (
                            <option key={s.id} value={s.id}>
                                {s.nickname || s.firstName}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Start Date</label>
                    <input 
                        type="date" 
                        value={startDate} 
                        onChange={handleStartDateChange} 
                        className="bg-gray-800 text-white rounded p-2 border border-gray-700" 
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">End Date</label>
                    <input 
                        type="date" 
                        value={endDate} 
                        min={startDate} 
                        onChange={e => setEndDate(e.target.value)} 
                        className="bg-gray-800 text-white rounded p-2 border border-gray-700" 
                    />
                </div>
            </div>

            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-2 custom-scrollbar">
                {dayNames.map((day, idx) => (
                    <div key={day} className={`grid grid-cols-4 items-center gap-4 p-3 rounded-xl border transition-all ${weekPattern[idx].active ? 'bg-gray-750 border-gray-600' : 'bg-gray-900/20 border-gray-800 opacity-40'}`}>
                        <div className="flex items-center gap-2">
                            <input type="checkbox" checked={weekPattern[idx].active} onChange={e => handlePatternChange(idx, 'active', e.target.checked)} className="rounded bg-gray-900 border-gray-700 text-indigo-600" />
                            <span className="text-sm font-bold text-white">{day.substring(0,3)}</span>
                        </div>
                        <input type="time" value={weekPattern[idx].start} onChange={e => handlePatternChange(idx, 'start', e.target.value)} disabled={!weekPattern[idx].active} className="bg-gray-900 text-white text-xs p-2 rounded-lg border border-gray-700" />
                        <input type="time" value={weekPattern[idx].end} onChange={e => handlePatternChange(idx, 'end', e.target.value)} disabled={!weekPattern[idx].active} className="bg-gray-900 text-white text-xs p-2 rounded-lg border border-gray-700" />
                        <div className="flex items-center gap-2 justify-center">
                            <button 
                                onClick={() => handlePatternChange(idx, 'break', !weekPattern[idx].break)}
                                disabled={!weekPattern[idx].active}
                                className={`p-2 rounded-lg transition-colors ${weekPattern[idx].break ? 'bg-gray-900 text-gray-500' : 'bg-amber-500/10 text-amber-500'}`}
                                title={weekPattern[idx].break ? "1h Break Included" : "Continuous Shift (No Break)"}
                            >
                                {weekPattern[idx].break ? <Coffee className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <button onClick={generateShifts} disabled={loading || !selectedStaffId} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg active:scale-95">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Generate Planning
            </button>
        </div>
    );
}