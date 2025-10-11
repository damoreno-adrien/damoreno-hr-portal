import React, { useState } from 'react';
import { doc, updateDoc, deleteDoc, setDoc, Timestamp } from 'firebase/firestore';

export default function EditAttendanceModal({ db, record, onClose }) {
    const isCreating = !record.fullRecord;
    
    const [formData, setFormData] = useState({
        checkIn: record.fullRecord?.checkInTime ? new Date(record.fullRecord.checkInTime.seconds * 1000).toTimeString().substring(0, 5) : '',
        breakStart: record.fullRecord?.breakStart ? new Date(record.fullRecord.breakStart.seconds * 1000).toTimeString().substring(0, 5) : '',
        breakEnd: record.fullRecord?.breakEnd ? new Date(record.fullRecord.breakEnd.seconds * 1000).toTimeString().substring(0, 5) : '',
        checkOut: record.fullRecord?.checkOutTime ? new Date(record.fullRecord.checkOutTime.seconds * 1000).toTimeString().substring(0, 5) : '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const handleInputChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError('');
        try {
            const datePart = record.date;
            const toTimestamp = (timeString) => {
                if (!timeString) return null;
                const [hours, minutes] = timeString.split(':');
                const date = new Date(datePart); // Use date directly
                date.setHours(hours, minutes, 0, 0);
                return Timestamp.fromDate(date);
            };

            const dataToSave = {
                checkInTime: toTimestamp(formData.checkIn),
                breakStart: toTimestamp(formData.breakStart),
                breakEnd: toTimestamp(formData.breakEnd),
                checkOutTime: toTimestamp(formData.checkOut),
            };

            if (isCreating) {
                const newDocId = `${record.staffId}_${record.date}`;
                const docRef = doc(db, 'attendance', newDocId);
                await setDoc(docRef, {
                    ...dataToSave,
                    staffId: record.staffId,
                    staffName: record.staffName,
                    date: record.date,
                });
            } else {
                const docRef = doc(db, 'attendance', record.id);
                await updateDoc(docRef, dataToSave);
            }
            onClose();
        } catch (err) {
            setError('Failed to save changes. Please check the times and try again.');
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (window.confirm("Are you sure you want to permanently delete this attendance record?")) {
            setIsSaving(true);
            try {
                const docRef = doc(db, 'attendance', record.id);
                await deleteDoc(docRef);
                onClose();
            } catch (err) { setError('Failed to delete the record.');
            } finally { setIsSaving(false); }
        }
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-400">Editing record for <span className="font-bold text-white">{record.staffName}</span> on <span className="font-bold text-white">{record.date}</span>.</p>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="checkIn" className="block text-sm font-medium text-gray-300 mb-1">Check-In Time</label>
                    <input type="time" id="checkIn" value={formData.checkIn} onChange={handleInputChange} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
                 <div>
                    <label htmlFor="checkOut" className="block text-sm font-medium text-gray-300 mb-1">Check-Out Time</label>
                    <input type="time" id="checkOut" value={formData.checkOut} onChange={handleInputChange} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
                 <div>
                    <label htmlFor="breakStart" className="block text-sm font-medium text-gray-300 mb-1">Break Start Time</label>
                    <input type="time" id="breakStart" value={formData.breakStart} onChange={handleInputChange} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
                 <div>
                    <label htmlFor="breakEnd" className="block text-sm font-medium text-gray-300 mb-1">Break End Time</label>
                    <input type="time" id="breakEnd" value={formData.breakEnd} onChange={handleInputChange} className="w-full p-2 bg-gray-700 rounded-md" />
                </div>
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            
            {/* --- UPDATED BUTTON LAYOUT --- */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center pt-4 mt-4 border-t border-gray-600">
                <div>
                    {!isCreating && (
                        <button onClick={handleDelete} disabled={isSaving} className="w-full sm:w-auto mt-2 sm:mt-0 px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-sm text-white">Delete Record</button>
                    )}
                </div>
                <div className="flex w-full sm:w-auto justify-end space-x-4">
                    <button type="button" onClick={onClose} className="flex-grow sm:flex-grow-0 px-6 py-2 rounded-lg bg-gray-600">Cancel</button>
                    <button onClick={handleSave} disabled={isSaving} className="flex-grow sm:flex-grow-0 px-6 py-2 rounded-lg bg-amber-600">{isSaving ? 'Saving...' : 'Save'}</button>
                </div>
            </div>
        </div>
    );
}