import React, { useState, useEffect } from 'react';
import { doc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import Modal from './Modal';

export default function AdjustmentModal({ isOpen, onClose, db, staffId, existingAdjustment, payPeriod }) {
    const [formData, setFormData] = useState({
        type: 'Earning',
        description: '',
        amount: '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const isEditMode = Boolean(existingAdjustment);

    useEffect(() => {
        if (isEditMode) {
            setFormData({
                type: existingAdjustment.type || 'Earning',
                description: existingAdjustment.description || '',
                amount: existingAdjustment.amount || '',
            });
        } else {
            setFormData({
                type: 'Earning',
                description: '',
                amount: '',
            });
        }
    }, [existingAdjustment, isEditMode, isOpen]);

    const handleInputChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const { type, description, amount } = formData;

        if (!type || !description || !amount) {
            setError('Please fill in all fields.');
            return;
        }

        setIsSaving(true);
        setError('');

        const adjustmentData = {
            staffId,
            type,
            description,
            amount: Number(amount),
            payPeriodMonth: payPeriod.month,
            payPeriodYear: payPeriod.year,
        };

        try {
            if (isEditMode) {
                const adjDocRef = doc(db, 'monthly_adjustments', existingAdjustment.id);
                await updateDoc(adjDocRef, adjustmentData);
            } else {
                await addDoc(collection(db, 'monthly_adjustments'), { ...adjustmentData, createdAt: serverTimestamp() });
            }
            onClose();
        } catch (err) {
            console.error(err);
            setError('Failed to save the adjustment. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? 'Edit Adjustment' : 'Add Monthly Adjustment'}>
            <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="type" className="block text-sm font-medium text-gray-300">Type</label>
                        <select id="type" value={formData.type} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md">
                            <option value="Earning">Earning</option>
                            <option value="Deduction">Deduction</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="amount" className="block text-sm font-medium text-gray-300">Amount (THB)</label>
                        <input type="number" id="amount" value={formData.amount} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md" />
                    </div>
                </div>
                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-300">Description</label>
                    <input type="text" id="description" value={formData.description} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md" placeholder="e.g., Sales Commission" />
                </div>
                
                {error && <p className="text-red-400 text-sm">{error}</p>}
                
                <div className="flex justify-end pt-4 space-x-4">
                    <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-600">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500">
                        {isSaving ? 'Saving...' : 'Save Adjustment'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}