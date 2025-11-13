import React, { useState, useEffect } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { Trash2, Briefcase, Sun, Clock } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';

export default function ShiftModal({ isOpen, onClose, db, staffId, staffName, date, existingShift, existingAttendance, onSaveSuccess, onEditAttendance }) {
    const [mode, setMode] = useState('work');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (existingShift) {
            if (existingShift.type === 'off') {
                setMode('off');
                setStartTime('');
                setEndTime('');
            } else {
                setMode('work');
                setStartTime(existingShift.startTime || '14:00');
                setEndTime(existingShift.endTime || '23:00');
            }
            setNotes(existingShift.notes || '');
        } else {
            setMode('work');
            setStartTime('14:00');
            setEndTime('23:00');
            setNotes('');
        }
        setError('');
    }, [existingShift, isOpen]);

    const dateObject = dateUtils.fromFirestore(date);
    const dateString = dateUtils.formatISODate(dateObject); 
    const displayDate = dateUtils.formatDisplayDate(dateObject);

    const handleSave = async (e) => {
        e.preventDefault();
        setError('');

        // 1. Validation for Work Shift
        if (mode === 'work') {
            if (!startTime || !endTime) { setError("Start and End times are required for a work shift."); return; }
            if (startTime >= endTime) { setError("End time must be after start time."); return; }
        }

        // 2. 🛡️ SAFETY CHECK: Switching to "Day Off" with existing Attendance
        if (mode === 'off' && existingAttendance) {
            const confirmed = window.confirm(
                `WARNING: Attendance Data Exists!\n\nChanging this to a "Day Off" will PERMANENTLY DELETE the existing attendance record (Clock-in: ${dateUtils.formatCustom(existingAttendance.checkInTime?.toDate ? existingAttendance.checkInTime.toDate() : existingAttendance.checkInTime, 'HH:mm')}) for this day.\n\nAre you sure you want to proceed?`
            );
            
            if (!confirmed) {
                return; // Stop saving if user cancels
            }
        }

        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            const shiftDocId = `${staffId}_${dateString}`;
            const shiftRef = doc(db, 'schedules', shiftDocId);

            const shiftData = {
                staffId,
                staffName, 
                date: dateString,
                type: mode, 
                notes: notes || null,
                startTime: mode === 'work' ? startTime : null,
                endTime: mode === 'work' ? endTime : null,
            };

            // Create/Update schedule
            batch.set(shiftRef, shiftData, { merge: true });

            // If setting to "Day Off", delete attendance
            if (mode === 'off') {
                const attendanceDocId = `${staffId}_${dateString}`;
                const attendanceRef = doc(db, 'attendance', attendanceDocId);
                batch.delete(attendanceRef);
            }

            await batch.commit();
            onSaveSuccess();
            onClose();
        } catch (err) {
            console.error("Error saving shift:", err);
            setError("Failed to save. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        // This confirmation protects the "Delete" button
        if (!window.confirm(`Are you sure you want to delete this shift? \n\nWARNING: This will also delete any Attendance records for this day.`)) return;

        setIsDeleting(true);
        try {
            const batch = writeBatch(db);
            const shiftDocId = `${staffId}_${dateString}`;
            const attendanceDocId = `${staffId}_${dateString}`;

            const shiftRef = doc(db, 'schedules', shiftDocId);
            batch.delete(shiftRef);

            const attendanceRef = doc(db, 'attendance', attendanceDocId);
            batch.delete(attendanceRef);

            await batch.commit();
            onSaveSuccess();
            onClose();
        } catch (err) {
            console.error("Error deleting:", err);
            setError("Failed to delete.");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className={`fixed inset-0 z-50 overflow-y-auto ${isOpen ? 'block' : 'hidden'}`}>
            <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 transition-opacity" onClick={onClose}>
                    <div className="absolute inset-0 bg-gray-800 opacity-75"></div>
                </div>
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
                
                <div className="inline-block align-bottom bg-gray-900 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-gray-700">
                    <form onSubmit={handleSave}>
                        <div className="bg-gray-900 px-4 pt-5 pb-4 sm:p-6">
                            <h3 className="text-lg font-medium text-white mb-4 text-center">
                                Manage Shift: <span className="text-amber-400">{staffName}</span> <br/> 
                                <span className="text-sm text-gray-400">{displayDate}</span>
                            </h3>

                            <div className="flex space-x-4 mb-6 bg-gray-800 p-1 rounded-lg">
                                <button type="button" onClick={() => setMode('work')} className={`flex-1 flex items-center justify-center py-2 rounded-md text-sm font-medium transition-colors ${mode === 'work' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>
                                    <Briefcase className="w-4 h-4 mr-2" /> Work Shift
                                </button>
                                <button type="button" onClick={() => setMode('off')} className={`flex-1 flex items-center justify-center py-2 rounded-md text-sm font-medium transition-colors ${mode === 'off' ? 'bg-green-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>
                                    <Sun className="w-4 h-4 mr-2" /> Day Off
                                </button>
                            </div>

                            {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}

                            {mode === 'work' && (
                                <div className="grid grid-cols-2 gap-4 mb-4 animate-fadeIn">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300">Start</label>
                                        <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 block w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300">End</label>
                                        <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1 block w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white" />
                                    </div>
                                </div>
                            )}

                            {mode === 'off' && (
                                <div className="mb-4 p-3 bg-green-900/30 border border-green-700/50 rounded-md text-green-200 text-sm text-center animate-fadeIn">
                                    Setting this as a <strong>Day Off</strong>. <br/>
                                    {existingAttendance ? (
                                        <span className="text-red-400 font-bold">Warning: Existing attendance will be deleted!</span>
                                    ) : (
                                        "Any existing attendance for this day will be deleted."
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-300">Notes</label>
                                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows="2" className="mt-1 block w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white" placeholder="Optional notes..." />
                            </div>
                        </div>

                        <div className="bg-gray-800 px-4 py-3 sm:px-6 flex justify-between items-center">
                            <div className="flex items-center space-x-2">
                                {existingShift && (
                                    <button type="button" onClick={handleDelete} disabled={isSaving || isDeleting} className="text-red-400 hover:text-red-300 text-sm flex items-center p-2 rounded hover:bg-red-900/20">
                                        <Trash2 className="w-4 h-4 mr-1" /> Delete Shift
                                    </button>
                                )}
                                {mode === 'work' && (
                                    <button 
                                        type="button" 
                                        onClick={(e) => { e.preventDefault(); onEditAttendance(); }} 
                                        disabled={isSaving || isDeleting} 
                                        className="text-blue-400 hover:text-blue-300 text-sm flex items-center p-2 rounded hover:bg-blue-900/20"
                                    >
                                        <Clock className="w-4 h-4 mr-1" /> {existingAttendance ? 'Edit Times' : 'Add Clock-In'}
                                    </button>
                                )}
                            </div>
                            
                            <div className="flex space-x-3">
                                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500">Cancel</button>
                                <button type="submit" disabled={isSaving || isDeleting} className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700">
                                    {isSaving ? 'Saving...' : 'Save Plan'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}