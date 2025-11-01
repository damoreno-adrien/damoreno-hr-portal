import React, { useState, useEffect } from 'react';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Trash2 } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils'; // Use new standard

export default function ShiftModal({ isOpen, onClose, db, staffId, staffName, date, existingShift, onSaveSuccess }) {
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState('');

    // Pre-fill form, reset on open/change
    useEffect(() => {
        if (existingShift) {
            setStartTime(existingShift.startTime || '');
            setEndTime(existingShift.endTime || '');
            setNotes(existingShift.notes || '');
        } else {
            // Sensible defaults for a new shift
            setStartTime('14:00'); 
            setEndTime('23:00');
            setNotes('');
        }
        setError(''); // Clear error when modal opens or shift changes
    }, [existingShift, isOpen]); // Rerun when modal opens or existingShift changes

    // Ensure date is consistently handled
    const dateObject = dateUtils.fromFirestore(date);
    const dateString = dateUtils.formatISODate(dateObject); // YYYY-MM-DD for saving/ID
    const displayDate = dateUtils.formatDisplayDate(dateObject); // DD/MM/YYYY for display

    const handleSave = async (e) => {
        e.preventDefault();
        setError('');

        if (!startTime || !endTime) {
            setError("Both start time and end time are required.");
            return;
        }
        if (startTime >= endTime) {
            setError("End time must be after start time.");
            return;
        }
        if (!staffId) { // Added safety check
             setError("Cannot save shift: Staff ID is missing.");
             console.error("ShiftModal: staffId prop is missing!");
             return;
        }


        setIsSaving(true);
        try {
            const shiftData = {
                staffId: staffId,
                // --- Use the staffName prop directly, ensure it's not null/undefined ---
                staffName: staffName && staffName !== 'N/A' && staffName !== 'Unknown Staff' ? staffName : null, // Store null if name is unknown/fallback
                date: dateString, // Save YYYY-MM-DD
                startTime: startTime,
                endTime: endTime,
                notes: notes || null,
                // --- **** THIS IS THE FIX **** ---
                // Add the 'type' field so the export function knows this is a work shift.
                type: "work", 
                // --- **** END OF FIX **** ---
            };

            // Use existing ID for updates, construct ID for new/upsert
            const docId = existingShift?.id || `${staffId}_${dateString}`;
            const shiftDocRef = doc(db, 'schedules', docId);

            if (existingShift) {
                await updateDoc(shiftDocRef, shiftData);
            } else {
                // Use setDoc merge to create or overwrite with the specific ID
                await setDoc(shiftDocRef, shiftData, { merge: true });
            }

            onSaveSuccess(); 
            onClose(); 
        } catch (err) {
            console.error("Error saving shift:", err);
            setError("Failed to save shift. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!existingShift || !existingShift.id) return; // Guard clause
        
        // Use user-friendly displayDate for confirmation
        // Use custom modal instead of window.confirm
        if (!confirm(`Are you sure you want to delete the shift for ${staffName} on ${displayDate}?`)) return;

        setIsDeleting(true);
        setError('');
        try {
            const shiftDocRef = doc(db, 'schedules', existingShift.id);
            await deleteDoc(shiftDocRef);
            onSaveSuccess(); 
            onClose(); 
        } catch (err) {
            console.error("Error deleting shift:", err);
            setError("Failed to delete shift. Please try again.");
        } finally {
            setIsDeleting(false);
        }
    };

    // Main Modal Return JSX
    return (
        <div className={`fixed inset-0 z-50 overflow-y-auto ${isOpen ? 'block' : 'hidden'}`}>
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                {/* Background overlay */}
                <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={onClose}>
                    <div className="absolute inset-0 bg-gray-800 opacity-75"></div>
                </div>

                {/* Modal panel */}
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div className="inline-block align-bottom bg-gray-900 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-gray-700">
                    <form onSubmit={handleSave}>
                        <div className="bg-gray-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <div className="sm:flex sm:items-start w-full">
                                <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                                    <h3 className="text-lg leading-6 font-medium text-white mb-4 border-b border-gray-700 pb-2">
                                        {/* Display name reliably using staffName prop */}
                                        {existingShift ? `Edit Shift for ${staffName}` : `Add Shift for ${staffName}`} on {displayDate}
                                    </h3>
                                    
                                    {error && <p className="text-red-400 text-sm mb-4 bg-red-900/30 p-3 rounded-md">{error}</p>}

                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label htmlFor="startTime" className="block text-sm font-medium text-gray-300">Start Time</label>
                                            <input
                                                type="time" id="startTime" value={startTime}
                                                onChange={(e) => setStartTime(e.target.value)} required
                                                className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm text-white"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="endTime" className="block text-sm font-medium text-gray-300">End Time</label>
                                            <input
                                                type="time" id="endTime" value={endTime}
                                                onChange={(e) => setEndTime(e.g.target.value)} required
                                                className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm text-white"
                                            />
                                        </div>
                                    </div>
                                     <div>
                                        <label htmlFor="notes" className="block text-sm font-medium text-gray-300">Notes (Optional)</label>
                                        <textarea
                                            id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows="2"
                                            className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm text-white"
                                            placeholder="e.g., Covering shift, Special event"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-800 px-4 py-3 sm:px-6 flex flex-row-reverse justify-between items-center">
                             <div className="flex space-x-2">
                                <button
                                    type="button" onClick={onClose} disabled={isSaving || isDeleting}
                                    className="px-4 py-2 bg-gray-600 text-base font-medium text-white rounded-md shadow-sm hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 focus:ring-offset-gray-900 disabled:opacity-50"
                                > Cancel </button>
                                <button
                                    type="submit" disabled={isSaving || isDeleting}
                                    className="px-4 py-2 bg-amber-600 text-base font-medium text-white rounded-md shadow-sm hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 focus:ring-offset-gray-900 disabled:opacity-50"
                                > {isSaving ? 'Saving...' : (existingShift ? 'Update Shift' : 'Add Shift')} </button>
                            </div>
                             {existingShift && (
                                <button
                                    type="button" onClick={handleDelete} disabled={isSaving || isDeleting}
                                    className="flex items-center px-4 py-2 bg-red-800 text-base font-medium text-white rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 focus:ring-offset-gray-900 disabled:opacity-50"
                                >
                                    {isDeleting ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>Deleting...</> : <><Trash2 className="h-4 w-4 mr-1"/> Delete</>}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
