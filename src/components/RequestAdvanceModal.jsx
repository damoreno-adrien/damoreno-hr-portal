import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import Modal from './Modal';

export default function RequestAdvanceModal({ isOpen, onClose, db, user, maxAdvance, onSuccess }) {
    const [amount, setAmount] = useState('');
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleAmountChange = (e) => {
        const value = e.target.value;
        if (value > maxAdvance) {
            setError(`Amount cannot exceed the maximum of ${maxAdvance.toLocaleString()} THB.`);
        } else {
            setError('');
        }
        setAmount(value);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const requestedAmount = Number(amount);
        if (!requestedAmount || requestedAmount <= 0) {
            setError("Please enter a valid amount.");
            return;
        }
        if (requestedAmount > maxAdvance) {
            setError(`Amount cannot exceed the maximum of ${maxAdvance.toLocaleString()} THB.`);
            return;
        }

        setIsSaving(true);
        setError('');

        try {
            const today = new Date();
            await addDoc(collection(db, 'salary_advances'), {
                staffId: user.uid,
                amount: requestedAmount,
                date: today.toISOString().split('T')[0],
                payPeriodMonth: today.getMonth() + 1,
                payPeriodYear: today.getFullYear(),
                status: 'pending', // All staff requests start as pending 
                requestedBy: 'staff',
                createdAt: serverTimestamp(),
            });

            // --- KEY CHANGE: Call the onSuccess function to trigger a refresh ---
            if (onSuccess) {
                onSuccess();
            }
            
            onClose();
        } catch (err) {
            console.error("Error submitting advance request:", err);
            setError("Could not submit request. Please try again later.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Request Salary Advance">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <p className="text-sm text-gray-400">You are eligible for an advance up to:</p>
                    <p className="text-3xl font-bold text-amber-400 mb-4">{maxAdvance.toLocaleString()} THB</p>
                    
                    <label htmlFor="amount" className="block text-sm font-medium text-gray-300">Requested Amount (THB)</label>
                    <input 
                        type="number" 
                        id="amount" 
                        value={amount} 
                        onChange={handleAmountChange}
                        className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md"
                        placeholder="Enter amount"
                        max={maxAdvance}
                        required
                    />
                </div>
                
                {error && <p className="text-red-400 text-sm">{error}</p>}

                <div className="flex justify-end pt-4 space-x-4">
                    <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-600">Cancel</button>
                    <button type="submit" disabled={isSaving || error} className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500">
                        {isSaving ? 'Submitting...' : 'Submit Request'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}