import React, { useState, useEffect } from 'react';
import { doc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import Modal from '../common/Modal';

export default function LoanModal({ isOpen, onClose, db, staffId, existingLoan }) {
    const [formData, setFormData] = useState({
        loanName: '',
        totalAmount: '',
        monthlyRepayment: '',
        startDate: new Date().toISOString().split('T')[0],
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const isEditMode = Boolean(existingLoan);

    useEffect(() => {
        if (isEditMode) {
            setFormData({
                loanName: existingLoan.loanName || '',
                totalAmount: existingLoan.totalAmount || '',
                monthlyRepayment: existingLoan.monthlyRepayment || '',
                startDate: existingLoan.startDate || new Date().toISOString().split('T')[0],
            });
        } else {
            // Reset form for adding new loan
            setFormData({
                loanName: '',
                totalAmount: '',
                monthlyRepayment: '',
                startDate: new Date().toISOString().split('T')[0],
            });
        }
    }, [existingLoan, isEditMode, isOpen]); // Rerun when modal opens or loan changes

    const handleInputChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const { loanName, totalAmount, monthlyRepayment, startDate } = formData;

        if (!loanName || !totalAmount || !monthlyRepayment || !startDate) {
            setError('Please fill in all fields.');
            return;
        }

        setIsSaving(true);
        setError('');

        const loanData = {
            staffId: staffId,
            loanName,
            totalAmount: Number(totalAmount),
            monthlyRepayment: Number(monthlyRepayment),
            startDate,
            remainingBalance: isEditMode ? existingLoan.remainingBalance : Number(totalAmount),
            isActive: true,
        };

        try {
            if (isEditMode) {
                const loanDocRef = doc(db, 'loans', existingLoan.id);
                // In edit mode, we don't reset remaining balance unless total amount changes.
                // For simplicity, we'll keep it as is, but a more complex app might recalculate it.
                await updateDoc(loanDocRef, { ...loanData, remainingBalance: existingLoan.remainingBalance });
            } else {
                await addDoc(collection(db, 'loans'), { ...loanData, createdAt: serverTimestamp() });
            }
            onClose();
        } catch (err) {
            console.error(err);
            setError('Failed to save the loan. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? 'Edit Loan' : 'Add New Loan'}>
            <form onSubmit={handleSave} className="space-y-4">
                <div>
                    <label htmlFor="loanName" className="block text-sm font-medium text-gray-300">Loan Name / Description</label>
                    <input type="text" id="loanName" value={formData.loanName} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md" placeholder="e.g., Motorbike Loan" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="totalAmount" className="block text-sm font-medium text-gray-300">Total Amount (THB)</label>
                        <input type="number" id="totalAmount" value={formData.totalAmount} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md" />
                    </div>
                     <div>
                        <label htmlFor="monthlyRepayment" className="block text-sm font-medium text-gray-300">Monthly Repayment (THB)</label>
                        <input type="number" id="monthlyRepayment" value={formData.monthlyRepayment} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md" />
                    </div>
                </div>
                <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-300">Start Date of Repayment</label>
                    <input type="date" id="startDate" value={formData.startDate} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md" />
                </div>
                
                {error && <p className="text-red-400 text-sm">{error}</p>}
                
                <div className="flex justify-end pt-4 space-x-4">
                    <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-600">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500">
                        {isSaving ? 'Saving...' : 'Save Loan'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}