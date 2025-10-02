import React, { useState } from 'react';
import { doc, updateDoc, addDoc, collection, deleteDoc } from 'firebase/firestore';

export default function ShiftModal({ db, staffMember, date, existingShift, onClose }) {
    const [startTime, setStartTime] = useState(existingShift ? existingShift.startTime : '14:00');
    const [endTime, setEndTime] = useState(existingShift ? existingShift.endTime : '23:00');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const formattedDate = date.toISOString().split('T')[0];

    const handleSave = async () => {
        if (!startTime || !endTime) {
            setError("Please set both a start and end time.");
            return;
        }
        setIsSaving(true);
        setError('');

        const shiftData = {
            staffId: staffMember.id,
            staffName: staffMember.fullName,
            date: formattedDate,
            startTime,
            endTime,
        };

        try {
            if (existingShift) {
                const shiftDocRef = doc(db, "schedules", existingShift.id);
                await updateDoc(shiftDocRef, shiftData);
            } else {
                await addDoc(collection(db, "schedules"), shiftData);
            }
            onClose();
        } catch (err) {
            setError("Failed to save the shift.");
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDelete = async () => {
        if (!existingShift || !window.confirm("Are you sure you want to remove this shift?")) return;
        setIsSaving(true);
         try {
            const shiftDocRef = doc(db, "schedules", existingShift.id);
            await deleteDoc(shiftDocRef);
            onClose();
        } catch (err) {
             alert("Failed to delete shift.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div><p>Scheduling for <span className="font-bold text-amber-400">{staffMember.fullName}</span> on <span className="font-bold text-amber-400">{new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span></p></div>
            <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-300 mb-1">Start Time</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-3 py-2 bg-gray-700 rounded-md" /></div>
                <div><label className="block text-sm font-medium text-gray-300 mb-1">End Time</label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full px-3 py-2 bg-gray-700 rounded-md" /></div>
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <div className="flex justify-between items-center pt-4 border-t border-gray-700 mt-4">
                 <div>{existingShift && (<button onClick={handleDelete} disabled={isSaving} className="px-6 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white">{isSaving ? '...' : 'Remove Shift'}</button>)}</div>
                <div className="flex space-x-4">
                    <button onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-600">Cancel</button>
                    <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white">{isSaving ? 'Saving...' : 'Save Shift'}</button>
                </div>
            </div>
        </div>
    );
};

