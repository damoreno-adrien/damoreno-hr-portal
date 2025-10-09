import React, { useState } from 'react';
import { doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';

export default function EditAttendanceModal({ db, record, onClose }) {
    const [formData, setFormData] = useState({
        checkIn: record.checkInTime ? new Date(record.checkInTime.seconds * 1000).toTimeString().substring(0, 5) : '',
        breakStart: record.breakStart ? new Date(record.breakStart.seconds * 1000).toTimeString().substring(0, 5) : '',
        breakEnd: record.breakEnd ? new Date(record.breakEnd.seconds * 1000).toTimeString().substring(0, 5) : '',
        checkOut: record.checkOutTime ? new Date(record.checkOutTime.seconds * 1000).toTimeString().substring(0, 5) : '',
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
            const docRef = doc(db, 'attendance', record.id);
            const datePart = record.date;

            // Function to convert HH:mm string to a Firestore Timestamp for a given date
            const toTimestamp = (timeString) => {
                if (!timeString) return null;
                const [hours, minutes] = timeString.split(':');
                const date = new Date(datePart);
                date.setHours(hours, minutes, 0, 0);
                return Timestamp.fromDate(date);
            };

            await updateDoc(docRef, {
                checkInTime: toTimestamp(formData.checkIn),
                breakStart: toTimestamp(formData.breakStart),
                breakEnd: toTimestamp(formData.breakEnd),
                checkOutTime: toTimestamp(formData.checkOut),
            });
            onClose();
        } catch (err) {
            setError('Failed to save changes. Please check the times and try again.');
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (window.confirm("Are you sure you want to permanently delete this attendance record? This action cannot be undone.")) {
            setIsSaving(true);
            try {
                const docRef = doc(db, 'attendance', record.id);
                await deleteDoc(docRef);
                onClose();
            } catch (err) {
                setError('Failed to delete the record.');
            } finally {
                setIsSaving(false);
            }
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
            <div className="flex justify-between items-center pt-4">
                <button onClick={handleDelete} disabled={isSaving} className="px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-sm text-white">Delete Record</button>
                <div className="space-x-4">
                    <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-600">Cancel</button>
                    <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 rounded-lg bg-amber-600">{isSaving ? 'Saving...' : 'Save Changes'}</button>
                </div>
            </div>
        </div>
    );
}