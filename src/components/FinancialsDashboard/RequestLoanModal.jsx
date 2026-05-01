/* src/components/FinancialsDashboard/RequestLoanModal.jsx */
import React, { useState } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { X, Calculator, AlertTriangle } from 'lucide-react';
import FeedbackModal from '../common/FeedbackModal'; // <-- NOUVEL IMPORT

export default function RequestLoanModal({ isOpen, onClose, db, user, onSuccess, staffBaseSalary = 0 }) {
    const [loanName, setLoanName] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [calcMethod, setCalcMethod] = useState('amount'); 
    const [monthlyRepayment, setMonthlyRepayment] = useState('');
    const [durationMonths, setDurationMonths] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- NOUVEAU STATE POUR LA MODALE D'ERREUR ---
    const [feedbackModal, setFeedbackModal] = useState(null);

    // --- RÈGLE DES 30% ---
    const maxAllowedRepayment = staffBaseSalary * 0.30;

    const blockInvalidChars = (e) => {
        if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault();
    };

    // --- CALCULS MATHÉMATIQUES EN TEMPS RÉEL ---
    const tAmount = parseFloat(totalAmount) || 0;
    const mRepay = parseFloat(monthlyRepayment) || 0;
    const dMonths = parseInt(durationMonths, 10) || 0;

    let computedMonthly = 0;
    let computedDuration = 0;

    if (calcMethod === 'amount') {
        computedMonthly = mRepay;
        computedDuration = (tAmount > 0 && mRepay > 0) ? Math.ceil(tAmount / mRepay) : 0;
    } else {
        computedDuration = dMonths;
        computedMonthly = (tAmount > 0 && dMonths > 0) ? Math.ceil(tAmount / dMonths) : 0;
    }

    // GATEKEEPER STRICT (Bloque la soumission)
    const isExceedingLimit = staffBaseSalary > 0 && computedMonthly > maxAllowedRepayment;

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // --- MODIFIÉ: Remplacement des alert() ---
        if (isExceedingLimit) {
            setFeedbackModal({ type: 'error', title: 'Policy Restriction', message: "You cannot exceed the 30% limit." });
            return;
        }

        if (computedMonthly <= 0 || computedMonthly > tAmount) {
            setFeedbackModal({ type: 'error', title: 'Invalid Input', message: "Invalid repayment amount." });
            return;
        }

        setIsSubmitting(true);

        try {
            const loanData = {
                staffId: user.uid,
                loanName,
                totalAmount: tAmount,
                monthlyRepayment: computedMonthly,
                remainingBalance: tAmount,
                status: 'pending',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            };

            await addDoc(collection(db, 'loans'), loanData);
            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            console.error("Error submitting loan request: ", error);
            // --- MODIFIÉ: Remplacement du alert() ---
            setFeedbackModal({ type: 'error', title: 'Submission Failed', message: "Failed to submit request." });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            {/* INJECTION DU FEEDBACK MODAL */}
            <FeedbackModal 
                isOpen={!!feedbackModal} 
                type={feedbackModal?.type} 
                title={feedbackModal?.title} 
                message={feedbackModal?.message} 
                onClose={() => setFeedbackModal(null)} 
            />

            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700">
                <div className="flex justify-between items-center p-6 border-b border-gray-700">
                    <h3 className="text-xl font-bold text-white">Request a Loan</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="h-6 w-6" /></button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Reason / Description</label>
                        <input type="text" required value={loanName} onChange={(e) => setLoanName(e.target.value)} className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white" placeholder="e.g., Medical Emergency, Motorbike Repair..." />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Requested Amount (THB)</label>
                        <input type="number" required min="1" step="1" onKeyDown={blockInvalidChars} value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white font-bold text-lg" />
                    </div>

                    <div className="bg-gray-900 p-4 rounded-lg border border-gray-700 space-y-4">
                        <div className="flex items-center space-x-4 mb-2">
                            <h4 className="text-sm font-medium text-gray-300 flex items-center"><Calculator className="w-4 h-4 mr-2"/> Proposed Repayment Plan</h4>
                        </div>

                        {staffBaseSalary > 0 ? (
                            <p className="text-xs text-gray-400 mb-2">
                                Max allowed (30% of base salary): <strong className="text-white">{maxAllowedRepayment.toLocaleString()} THB/mo</strong>
                            </p>
                        ) : (
                            <p className="text-xs text-amber-400 mb-2 italic">
                                Note: HR limit will be applied during approval.
                            </p>
                        )}

                        <div className="flex space-x-4">
                            <label className="flex items-center text-sm text-gray-400 cursor-pointer">
                                <input type="radio" name="calcMethod" value="amount" checked={calcMethod === 'amount'} onChange={() => setCalcMethod('amount')} className="mr-2" />
                                Fixed Monthly Amount
                            </label>
                            <label className="flex items-center text-sm text-gray-400 cursor-pointer">
                                <input type="radio" name="calcMethod" value="months" checked={calcMethod === 'months'} onChange={() => setCalcMethod('months')} className="mr-2" />
                                Duration in Months
                            </label>
                        </div>

                        {calcMethod === 'amount' ? (
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">I can repay (THB/month)</label>
                                <input type="number" required min="1" step="1" max={totalAmount || 999999} onKeyDown={blockInvalidChars} value={monthlyRepayment} onChange={(e) => setMonthlyRepayment(e.target.value)} className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white" />
                                {computedDuration > 0 && (
                                    <p className="text-xs text-amber-400 mt-2">
                                        Estimated duration: <strong>{computedDuration} months</strong>
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">I want to repay over (Months)</label>
                                <input type="number" required min="1" step="1" onKeyDown={blockInvalidChars} value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white" />
                                {computedMonthly > 0 && (
                                    <p className="text-xs text-amber-400 mt-2">
                                        Proposed deduction: <strong>{computedMonthly.toLocaleString()} THB / month</strong>
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ALERTE ROUGE + BLOCAGE DE SOUMISSION POUR LE STAFF */}
                        {isExceedingLimit && (
                            <div className="flex items-start gap-2 p-2 bg-red-900/30 border border-red-800 rounded-md mt-3">
                                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-red-300 leading-tight">
                                    The proposed monthly repayment ({computedMonthly.toLocaleString()} THB) exceeds your 30% limit. You must lower the amount or extend the duration.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-700">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium">Cancel</button>
                        <button type="submit" disabled={isSubmitting || isExceedingLimit} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-lg font-medium transition-colors">
                            {isSubmitting ? 'Submitting...' : 'Submit Request'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}