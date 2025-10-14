import React, { useState, useEffect } from 'react';
import { doc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import Modal from './Modal';

export default function AdvanceModal({ isOpen, onClose, db, staffId, existingAdvance }) {
    const [formData, setFormData] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const isEditMode = Boolean(existingAdvance);

    useEffect(() => {
        if (isEditMode) {
            setFormData({
                amount: existingAdvance.amount || '',
                date: existingAdvance.date || new Date().toISOString().split('T')[0],
            });
        } else {
            setFormData({
                amount: '',
                date: new Date().toISOString().split('T')[0],
            });
        }
    }, [existingAdvance, isEditMode, isOpen]);

    const handleInputChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const { amount, date } = formData;

        if (!amount || !date) {
            setError('Please fill in all fields.');
            return;
        }

        setIsSaving(true);
        setError('');

        const selectedDate = new Date(date);
        const payPeriodMonth = selectedDate.getMonth() + 1;
        const payPeriodYear = selectedDate.getFullYear();

        const advanceData = {
            staffId: staffId,
            amount: Number(amount),
            date,
            payPeriodMonth,
            payPeriodYear,
            isRepaid: false,
        };

        try {
            if (isEditMode) {
                const advanceDocRef = doc(db, 'salary_advances', existingAdvance.id);
                await updateDoc(advanceDocRef, advanceData);
            } else {
                // --- KEY CHANGE: Added status and requestedBy for new advances ---
                await addDoc(collection(db, 'salary_advances'), { 
                    ...advanceData, 
                    status: 'approved',
                    requestedBy: 'manager',
                    createdAt: serverTimestamp() 
                });
            }
            onClose();
        } catch (err) {
            console.error(err);
            setError('Failed to save the salary advance. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? 'Edit Salary Advance' : 'Add Salary Advance'}>
            <form onSubmit={handleSave} className="space-y-4">
                <div>
                    <label htmlFor="amount" className="block text-sm font-medium text-gray-300">Amount (THB)</label>
                    <input type="number" id="amount" value={formData.amount} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md" />
                </div>
                <div>
                    <label htmlFor="date" className="block text-sm font-medium text-gray-300">Date of Advance</label>
                    <input type="date" id="date" value={formData.date} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md" />
                </div>
                
                {error && <p className="text-red-400 text-sm">{error}</p>}
                
                <div className="flex justify-end pt-4 space-x-4">
                    <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-600">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500">
                        {isSaving ? 'Saving...' : 'Save Advance'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}