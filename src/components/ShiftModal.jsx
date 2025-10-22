import React, { useState, useEffect } from 'react';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { TrashIcon } from './Icons'; // Assuming TrashIcon is in Icons.jsx
import { toLocalDateString } from '../utils/dateHelpers'; // Import helper

export default function ShiftModal({ isOpen, onClose, db, staffId, staffName, date, existingShift, onSaveSuccess }) {
    // State to manage form inputs
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [notes, setNotes] = useState(''); // Optional notes field
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState('');

    // Pre-fill form if editing an existing shift
    useEffect(() => {
        if (existingShift) {
            setStartTime(existingShift.startTime || '');
            setEndTime(existingShift.endTime || '');
            setNotes(existingShift.notes || '');
        } else {
            // Reset form for new shift
            setStartTime('');
            setEndTime('');
            setNotes('');
        }
        setError(''); // Clear error when modal opens or shift changes
    }, [existingShift, isOpen]); // Rerun when modal opens or existingShift changes


    // --- REMOVED: Redundant useEffect that looked up staff ---


    const handleSave = async (e) => {
        e.preventDefault();
        setError('');

        // Basic validation
        if (!startTime || !endTime) {
            setError("Both start time and end time are required.");
            return;
        }
        if (startTime >= endTime) {
            setError("End time must be after start time.");
            return;
        }

        setIsSaving(true);
        try {
            // Ensure date is a Date object before formatting
            const dateString = date instanceof Date ? toLocalDateString(date) : date; 
            
            const shiftData = {
                staffId: staffId,
                // --- Use the staffName prop directly ---
                staffName: staffName || 'Unknown Staff', // Use provided name or fallback
                date: dateString,
                startTime: startTime,
                endTime: endTime,
                notes: notes || null, // Store null if notes are empty
            };

            // Use the specific doc ID if editing, otherwise rely on upsert logic
            const docId = existingShift?.id || `${staffId}_${dateString}`; // Construct ID if new, use existing if editing
            const shiftDocRef = doc(db, 'schedules', docId);

            if (existingShift) {
                await updateDoc(shiftDocRef, shiftData);
            } else {
                // Use setDoc with merge: true for an "upsert" operation
                // This creates the doc if it doesn't exist, or overwrites if it does (using the constructed ID)
                await setDoc(shiftDocRef, shiftData, { merge: true }); 
            }

            onSaveSuccess(); // Trigger refetch on parent page
            onClose(); // Close modal
        } catch (err) {
            console.error("Error saving shift:", err);
            setError("Failed to save shift. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!existingShift || !existingShift.id) {
            // Should not happen if delete button is only shown for existing shifts
            console.error("No existing shift ID found for deletion.");
            return;
        }
        if (!window.confirm(`Are you sure you want to delete the shift for ${staffName} on ${date instanceof Date ? toLocalDateString(date) : date}?`)) {
            return;
        }

        setIsDeleting(true);
        setError('');
        try {
            const shiftDocRef = doc(db, 'schedules', existingShift.id);
            await deleteDoc(shiftDocRef);
            onSaveSuccess(); // Trigger refetch
            onClose(); // Close modal
        } catch (err) {
            console.error("Error deleting shift:", err);
            setError("Failed to delete shift. Please try again.");
        } finally {
            setIsDeleting(false);
        }
    };

    // Ensure date is formatted correctly for display in the title
    const displayDate = date instanceof Date ? toLocalDateString(date) : date;

    return (
        <div className={`fixed inset-0 z-50 overflow-y-auto ${isOpen ? 'block' : 'hidden'}`}>
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                {/* Background overlay */}
                <div className="fixed inset-0 transition-opacity" aria-hidden="true">
                    <div className="absolute inset-0 bg-gray-800 opacity-75"></div>
                </div>

                {/* Modal panel */}
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div className="inline-block align-bottom bg-gray-900 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-gray-700">
                    <form onSubmit={handleSave}>
                        <div className="bg-gray-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <div className="sm:flex sm:items-start">
                                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                    <h3 className="text-lg leading-6 font-medium text-white mb-4 border-b border-gray-700 pb-2">
                                        {existingShift ? `Edit Shift for ${staffName}` : `Add Shift for ${staffName}`} on {displayDate}
                                    </h3>
                                    
                                    {error && <p className="text-red-400 text-sm mb-4 bg-red-900/30 p-3 rounded-md">{error}</p>}

                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label htmlFor="startTime" className="block text-sm font-medium text-gray-300">Start Time</label>
                                            <input
                                                type="time"
                                                id="startTime"
                                                value={startTime}
                                                onChange={(e) => setStartTime(e.target.value)}
                                                required
                                                className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm text-white"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="endTime" className="block text-sm font-medium text-gray-300">End Time</label>
                                            <input
                                                type="time"
                                                id="endTime"
                                                value={endTime}
                                                onChange={(e) => setEndTime(e.target.value)}
                                                required
                                                className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm text-white"
                                            />
                                        </div>
                                    </div>
                                     <div>
                                        <label htmlFor="notes" className="block text-sm font-medium text-gray-300">Notes (Optional)</label>
                                        <textarea
                                            id="notes"
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            rows="2"
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
                                    type="button"
                                    onClick={onClose}
                                    disabled={isSaving || isDeleting}
                                    className="px-4 py-2 bg-gray-600 text-base font-medium text-white rounded-md shadow-sm hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 focus:ring-offset-gray-900 disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving || isDeleting}
                                    className="px-4 py-2 bg-amber-600 text-base font-medium text-white rounded-md shadow-sm hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 focus:ring-offset-gray-900 disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : (existingShift ? 'Update Shift' : 'Add Shift')}
                                </button>
                            </div>
                             {existingShift && (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={isSaving || isDeleting}
                                    className="flex items-center px-4 py-2 bg-red-800 text-base font-medium text-white rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 focus:ring-offset-gray-900 disabled:opacity-50"
                                >
                                    {isDeleting ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>Deleting...</> : <><TrashIcon className="h-4 w-4 mr-1"/> Delete</>}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}