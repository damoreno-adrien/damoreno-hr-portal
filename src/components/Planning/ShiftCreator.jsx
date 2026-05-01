/* src/components/Planning/ShiftCreator.jsx */

import React, { useState, useEffect, useMemo } from 'react';
import { collection, writeBatch, doc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Save, Loader2, Coffee, Flame, Fingerprint, Calendar, Copy } from 'lucide-react';

// --- IMPORT DE LA MODALE ---
import FeedbackModal from '../common/FeedbackModal';

export default function ShiftCreator({ db, staffList, userRole, existingWeekData, onSuccess, initialStaffId, initialStartDate, initialEndDate, activeBranch, branches = [] }) {
    const isManager = ['admin', 'manager', 'super_admin'].includes(userRole);

    const getNextWeekBounds = () => {
        const today = new Date();
        const day = today.getDay();
        const distToMonday = (8 - day) % 7 || 7;
        const nextMonday = new Date(today); nextMonday.setDate(today.getDate() + distToMonday);
        const nextSunday = new Date(nextMonday); nextSunday.setDate(nextMonday.getDate() + 6);
        return { start: nextMonday.toISOString().split('T')[0], end: nextSunday.toISOString().split('T')[0] };
    };

    const defaults = getNextWeekBounds();

    const [selectedStaffId, setSelectedStaffId] = useState(initialStaffId || "");
    const [startDate, setStartDate] = useState(initialStartDate || defaults.start);
    const [endDate, setEndDate] = useState(initialEndDate || defaults.end);
    const [loading, setLoading] = useState(false);

    // --- QUICK FILL STATE ---
    const [globalStart, setGlobalStart] = useState("14:00");
    const [globalEnd, setGlobalEnd] = useState("23:00");
    const [isAllSelected, setIsAllSelected] = useState(false);

    const defaultDay = { selected: false, schedActive: false, attActive: false, start: "14:00", end: "23:00", break: true, attStart: "14:00", attEnd: "23:00" };
    const [weekPattern, setWeekPattern] = useState({ 0: { ...defaultDay }, 1: { ...defaultDay }, 2: { ...defaultDay }, 3: { ...defaultDay }, 4: { ...defaultDay }, 5: { ...defaultDay }, 6: { ...defaultDay } });

    // --- STATE POUR LA MODALE DE FEEDBACK ---
    const [feedbackModal, setFeedbackModal] = useState(null);

    // --- FIX : ORDRE D'AFFICHAGE LUNDI -> DIMANCHE ---
    // On force l'ordre d'affichage tout en conservant l'index JS natif (0 = Dimanche) pour la BDD
    const daysOrder = [
        { name: "Monday", idx: 1 },
        { name: "Tuesday", idx: 2 },
        { name: "Wednesday", idx: 3 },
        { name: "Thursday", idx: 4 },
        { name: "Friday", idx: 5 },
        { name: "Saturday", idx: 6 },
        { name: "Sunday", idx: 0 }
    ];

    useEffect(() => {
        const fetchExistingData = async () => {
            if (!selectedStaffId || !startDate || !endDate) return;

            try {
                const schedulesQuery = query(collection(db, 'schedules'), where('staffId', '==', selectedStaffId), where('date', '>=', startDate), where('date', '<=', endDate));
                const attendanceQuery = query(collection(db, 'attendance'), where('staffId', '==', selectedStaffId), where('date', '>=', startDate), where('date', '<=', endDate));

                const [schedulesSnap, attendanceSnap] = await Promise.all([getDocs(schedulesQuery), getDocs(attendanceQuery)]);

                const newPattern = { 0: { ...defaultDay }, 1: { ...defaultDay }, 2: { ...defaultDay }, 3: { ...defaultDay }, 4: { ...defaultDay }, 5: { ...defaultDay }, 6: { ...defaultDay } };

                const sortedSchedDocs = schedulesSnap.docs.sort((a, b) => a.data().date.localeCompare(b.data().date));
                const sortedAttDocs = attendanceSnap.docs.sort((a, b) => a.data().date.localeCompare(b.data().date));

                const hydratedSchedDays = new Set();
                sortedSchedDocs.forEach(doc => {
                    const data = doc.data();
                    const dayIdx = new Date(data.date).getDay();
                    if (hydratedSchedDays.has(dayIdx)) return;
                    hydratedSchedDays.add(dayIdx);

                    newPattern[dayIdx].selected = true;
                    newPattern[dayIdx].schedActive = true;
                    newPattern[dayIdx].start = data.startTime || "14:00";
                    newPattern[dayIdx].end = data.endTime || "23:00";
                    newPattern[dayIdx].break = data.includesBreak ?? true;
                });

                const hydratedAttDays = new Set();
                sortedAttDocs.forEach(doc => {
                    const data = doc.data();
                    const dayIdx = new Date(data.date).getDay();
                    if (hydratedAttDays.has(dayIdx)) return;
                    hydratedAttDays.add(dayIdx);

                    newPattern[dayIdx].selected = true;
                    newPattern[dayIdx].attActive = true;

                    try {
                        if (data.checkInTime) newPattern[dayIdx].attStart = (data.checkInTime.toDate ? data.checkInTime.toDate() : new Date(data.checkInTime)).toTimeString().substring(0, 5);
                        if (data.checkOutTime) newPattern[dayIdx].attEnd = (data.checkOutTime.toDate ? data.checkOutTime.toDate() : new Date(data.checkOutTime)).toTimeString().substring(0, 5);
                    } catch (e) { }
                });

                setWeekPattern(newPattern);
            } catch (err) { console.error("Error fetching range data:", err); }
        };

        fetchExistingData();
    }, [selectedStaffId, startDate, endDate, db]);

    useEffect(() => {
        setIsAllSelected(Object.values(weekPattern).every(d => d.selected));
    }, [weekPattern]);

    const activeStaff = useMemo(() => {
        let filtered = staffList?.filter(s => s.status !== 'inactive') || [];
        if (activeBranch && activeBranch !== 'global') filtered = filtered.filter(s => s.branchId === activeBranch);
        return filtered;
    }, [staffList, activeBranch]);

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

        if (field === 'schedActive' || field === 'attActive') {
            if (value === true) newPattern.selected = true;
        }

        if (field === 'start' || field === 'end') {
            const [sh, sm] = (field === 'start' ? value : newPattern.start).split(':').map(Number);
            const [eh, em] = (field === 'end' ? value : newPattern.end).split(':').map(Number);
            let diff = (eh * 60 + em) - (sh * 60 + sm);
            if (diff < 0) diff += 1440;
            newPattern.break = diff >= 420;
        }

        setWeekPattern(prev => ({ ...prev, [dayIndex]: newPattern }));
    };

    const toggleSelectAll = (e) => {
        const checked = e.target.checked;
        setIsAllSelected(checked);
        setWeekPattern(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(k => next[k].selected = checked);
            return next;
        });
    };

    const applyGlobalSchedule = () => {
        setWeekPattern(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(idx => {
                if (updated[idx].selected) {
                    updated[idx].schedActive = true;
                    updated[idx].start = globalStart;
                    updated[idx].end = globalEnd;

                    const [sh, sm] = globalStart.split(':').map(Number);
                    const [eh, em] = globalEnd.split(':').map(Number);
                    let diff = (eh * 60 + em) - (sh * 60 + sm);
                    if (diff < 0) diff += 1440;
                    updated[idx].break = diff >= 420;
                }
            });
            return updated;
        });
    };

    const applyGlobalAttendance = () => {
        setWeekPattern(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(idx => {
                if (updated[idx].selected) {
                    updated[idx].attActive = true;
                    updated[idx].attStart = globalStart;
                    updated[idx].attEnd = globalEnd;
                }
            });
            return updated;
        });
    };

    const generateShifts = async () => {
        // --- MODIFIÉ : Remplacement du alert() ---
        if (!selectedStaffId) {
            setFeedbackModal({ type: 'error', title: 'Missing Selection', message: "Please select a Staff Member first!" });
            return;
        }

        setLoading(true);

        try {
            const batch = writeBatch(db);
            const staff = activeStaff.find(s => s.id === selectedStaffId);

            const oldSchedulesQuery = query(collection(db, "schedules"), where("staffId", "==", selectedStaffId), where("date", ">=", startDate), where("date", "<=", endDate));
            const oldSchedulesSnap = await getDocs(oldSchedulesQuery);
            const existingSchedDocs = {}; oldSchedulesSnap.forEach(d => { existingSchedDocs[d.data().date] = d.ref; });

            const oldAttQuery = query(collection(db, "attendance"), where("staffId", "==", selectedStaffId), where("date", ">=", startDate), where("date", "<=", endDate));
            const oldAttSnap = await getDocs(oldAttQuery);
            const existingAttDocs = {}; oldAttSnap.forEach(d => { existingAttDocs[d.data().date] = d.ref; });

            let current = new Date(startDate);
            const end = new Date(endDate);

            while (current <= end) {
                const dateStr = current.toISOString().split('T')[0];
                const pattern = weekPattern[current.getDay()];

                if (pattern.selected) {
                    if (pattern.schedActive) {
                        const shiftRef = doc(db, "schedules", `${selectedStaffId}_${dateStr}`);
                        batch.set(shiftRef, {
                            staffId: selectedStaffId, staffName: staff.nickname || staff.firstName,
                            date: dateStr, startTime: pattern.start, endTime: pattern.end,
                            includesBreak: pattern.break,
                            type: 'work',               // <-- On standardise la nature
                            source: 'bulk_generator',   // <-- On ajoute la provenance
                            branchId: staff.branchId || null, updatedAt: new Date()
                        });
                    } else if (existingSchedDocs[dateStr]) {
                        batch.delete(existingSchedDocs[dateStr]);
                    }

                    if (isManager) {
                        if (pattern.attActive) {
                            const attRef = doc(db, "attendance", `${selectedStaffId}_${dateStr}`);
                            const checkIn = new Date(`${dateStr}T${pattern.attStart}:00`);
                            const checkOut = new Date(`${dateStr}T${pattern.attEnd}:00`);
                            batch.set(attRef, {
                                staffId: selectedStaffId, staffName: staff.nickname || staff.firstName,
                                date: dateStr, branchId: staff.branchId || null,
                                checkInTime: Timestamp.fromDate(checkIn), checkOutTime: Timestamp.fromDate(checkOut),
                                status: 'completed', source: 'bulk_generator'
                            });
                        } else if (existingAttDocs[dateStr]) {
                            batch.delete(existingAttDocs[dateStr]);
                        }
                    }
                } else {
                    if (existingSchedDocs[dateStr]) batch.delete(existingSchedDocs[dateStr]);
                    if (existingAttDocs[dateStr]) batch.delete(existingAttDocs[dateStr]);
                }
                current.setDate(current.getDate() + 1);
            }

            await batch.commit();
            onSuccess();
        } catch (e) {
            console.error(e);
            // --- MODIFIÉ : Remplacement du alert() ---
            setFeedbackModal({ type: 'error', title: 'Save Failed', message: "Error saving shifts: " + e.message });
        }
        finally { setLoading(false); }
    };

    return (
        <div className="space-y-6 relative">
            {/* INJECTION DU FEEDBACK MODAL */}
            <FeedbackModal
                isOpen={!!feedbackModal}
                type={feedbackModal?.type}
                title={feedbackModal?.title}
                message={feedbackModal?.message}
                onClose={() => setFeedbackModal(null)}
            />

            {/* Header: Staff & Dates */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Staff Member</label>
                    <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)} className="bg-gray-800 text-white rounded p-2 border border-gray-700 outline-none focus:border-indigo-500 transition-colors">
                        <option value="">Select...</option>
                        {activeStaff.map(s => <option key={s.id} value={s.id}>{s.nickname || s.firstName}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Start Date</label>
                    <input type="date" value={startDate} onChange={handleStartDateChange} className="bg-gray-800 text-white rounded p-2 border border-gray-700 outline-none focus:border-indigo-500 transition-colors [color-scheme:dark]" />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">End Date</label>
                    <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} className="bg-gray-800 text-white rounded p-2 border border-gray-700 outline-none focus:border-indigo-500 transition-colors [color-scheme:dark]" />
                </div>
            </div>

            {/* QUICK FILL BAR */}
            <div className="bg-indigo-900/20 border border-indigo-500/30 p-3 rounded-lg flex flex-col xl:flex-row items-center justify-between gap-4 shadow-inner">
                <div className="flex items-center gap-4 w-full xl:w-auto border-b xl:border-b-0 border-indigo-500/30 pb-3 xl:pb-0">
                    <label className="flex items-center gap-2 cursor-pointer bg-indigo-900/40 px-3 py-1.5 rounded-lg border border-indigo-500/50 hover:bg-indigo-500/30 transition-colors">
                        <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} className="rounded bg-gray-900 border-indigo-400 text-indigo-500 w-4 h-4 cursor-pointer" />
                        <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider">Select All</span>
                    </label>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                    <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider hidden md:inline"><Copy className="w-4 h-4 inline mr-1" /> Auto-Fill</span>
                    <input type="time" value={globalStart} onChange={e => setGlobalStart(e.target.value)} className="bg-gray-900 text-white text-xs p-1.5 rounded border border-gray-700 focus:border-indigo-500 outline-none [color-scheme:dark]" />
                    <span className="text-gray-500">-</span>
                    <input type="time" value={globalEnd} onChange={e => setGlobalEnd(e.target.value)} className="bg-gray-900 text-white text-xs p-1.5 rounded border border-gray-700 focus:border-indigo-500 outline-none [color-scheme:dark]" />

                    <button onClick={applyGlobalSchedule} className="flex-1 md:flex-none text-xs font-bold bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center">
                        <Calendar className="w-3 h-3 mr-2" /> Fill Schedules
                    </button>
                    {isManager && (
                        <button onClick={applyGlobalAttendance} className="flex-1 md:flex-none text-xs font-bold bg-green-900/30 hover:bg-green-900/50 border border-green-700 text-green-400 px-3 py-2 rounded-lg transition-colors flex items-center justify-center">
                            <Fingerprint className="w-3 h-3 mr-2" /> Fill Attendances
                        </button>
                    )}
                </div>
            </div>

            {/* PATTERN LIST */}
            <div className="max-h-[45vh] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {daysOrder.map(({ name: day, idx }) => (
                    <div key={day} className={`grid grid-cols-[100px_1fr] gap-4 p-3 rounded-xl border transition-all ${weekPattern[idx].selected ? 'bg-gray-800 border-gray-600 shadow-lg' : 'bg-gray-900/40 border-gray-800'}`}>

                        <div className="flex items-start gap-2 pt-1.5">
                            <input type="checkbox" checked={weekPattern[idx].selected} onChange={e => handlePatternChange(idx, 'selected', e.target.checked)} className="rounded bg-gray-900 border-gray-700 text-indigo-600 w-4 h-4 cursor-pointer focus:ring-indigo-500" />
                            <span className={`text-sm font-bold ${weekPattern[idx].selected ? 'text-white' : 'text-gray-500'}`}>{day.substring(0, 3)}</span>
                        </div>

                        <div className={`flex flex-col gap-3 transition-opacity ${weekPattern[idx].selected ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>

                            {/* Schedule Row */}
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 cursor-pointer w-24">
                                    <input type="checkbox" checked={weekPattern[idx].schedActive} onChange={e => handlePatternChange(idx, 'schedActive', e.target.checked)} className="rounded bg-gray-900 border-gray-600 text-indigo-500 w-3.5 h-3.5 focus:ring-indigo-500" />
                                    <span className="text-xs font-bold text-gray-300">Schedule</span>
                                </label>
                                <div className={`flex items-center gap-2 ${!weekPattern[idx].schedActive && 'opacity-50 pointer-events-none'}`}>
                                    <input type="time" value={weekPattern[idx].start} onChange={e => handlePatternChange(idx, 'start', e.target.value)} className="bg-gray-900 text-white text-xs p-1.5 rounded-lg border border-gray-700 focus:border-indigo-500 outline-none [color-scheme:dark]" />
                                    <span className="text-gray-600">-</span>
                                    <input type="time" value={weekPattern[idx].end} onChange={e => handlePatternChange(idx, 'end', e.target.value)} className="bg-gray-900 text-white text-xs p-1.5 rounded-lg border border-gray-700 focus:border-indigo-500 outline-none [color-scheme:dark]" />
                                    <button onClick={() => handlePatternChange(idx, 'break', !weekPattern[idx].break)} className={`ml-2 p-1.5 rounded transition-colors ${weekPattern[idx].break ? 'text-gray-500 bg-gray-900 hover:bg-gray-700' : 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'}`} title={weekPattern[idx].break ? "1h Break Included" : "Continuous Shift (No Break)"}>
                                        {weekPattern[idx].break ? <Coffee className="w-3.5 h-3.5" /> : <Flame className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>

                            {/* Attendance Row */}
                            {isManager && (
                                <div className="flex items-center gap-3 pt-3 border-t border-gray-700/50">
                                    <label className="flex items-center gap-2 cursor-pointer w-24">
                                        <input type="checkbox" checked={weekPattern[idx].attActive} onChange={e => handlePatternChange(idx, 'attActive', e.target.checked)} className="rounded bg-gray-900 border-gray-600 text-green-500 w-3.5 h-3.5 focus:ring-green-500" />
                                        <span className="text-xs font-bold text-green-500">Actuals</span>
                                    </label>
                                    <div className={`flex items-center gap-2 ${!weekPattern[idx].attActive && 'opacity-50 pointer-events-none'}`}>
                                        <input type="time" value={weekPattern[idx].attStart} onChange={e => handlePatternChange(idx, 'attStart', e.target.value)} className="bg-gray-900 text-green-400 font-mono text-xs p-1.5 rounded-lg border border-green-900/50 focus:border-green-500 outline-none [color-scheme:dark]" />
                                        <span className="text-gray-600">-</span>
                                        <input type="time" value={weekPattern[idx].attEnd} onChange={e => handlePatternChange(idx, 'attEnd', e.target.value)} className="bg-gray-900 text-green-400 font-mono text-xs p-1.5 rounded-lg border border-green-900/50 focus:border-green-500 outline-none [color-scheme:dark]" />
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                ))}
            </div>

            <button onClick={generateShifts} disabled={loading || !selectedStaffId} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg active:scale-95">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Changes
            </button>
        </div>
    );
}