/* src/components/Financials/LoanModal.jsx */
import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { X, Calculator, AlertTriangle, Zap } from 'lucide-react';
import FeedbackModal from '../common/FeedbackModal'; // <-- NOUVEL IMPORT

export default function LoanModal({ isOpen, onClose, db, staffId, existingLoan, staffList, userRole }) {
    const [loanName, setLoanName] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [startDate, setStartDate] = useState('');
    const [nextInstallmentOverride, setNextInstallmentOverride] = useState('');
    
    const [calcMethod, setCalcMethod] = useState('amount'); 
    const [monthlyRepayment, setMonthlyRepayment] = useState('');
    const [durationMonths, setDurationMonths] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // --- NOUVEAU STATE POUR LA MODALE D'ERREUR ---
    const [feedbackModal, setFeedbackModal] = useState(null);

    // --- CALCUL DE LA RÈGLE DES 30% ---
    const isAdmin = ['admin', 'super_admin', 'manager'].includes(userRole);
    const selectedStaffData = staffList?.find(s => s.id === staffId);
    const staffBaseSalary = selectedStaffData?.jobHistory?.[0]?.baseSalary || 0;
    const maxAllowedRepayment = staffBaseSalary * 0.30;

    useEffect(() => {
        if (existingLoan) {
            setLoanName(existingLoan.loanName || '');
            setTotalAmount(existingLoan.totalAmount || '');
            setMonthlyRepayment(existingLoan.monthlyRepayment || '');
            setCalcMethod('amount');
            setStartDate(existingLoan.startDate || '');
            setNextInstallmentOverride(existingLoan.nextInstallmentOverride || '');
        } else {
            setLoanName('');
            setTotalAmount('');
            setMonthlyRepayment('');
            setDurationMonths('');
            setCalcMethod('amount');
            setNextInstallmentOverride('');
            setStartDate(new Date().toISOString().split('T')[0]);
        }
    }, [existingLoan, isOpen]);

    const blockInvalidChars = (e) => {
        if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault();
    };

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

    const isExceedingLimit = staffBaseSalary > 0 && computedMonthly > maxAllowedRepayment;

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // --- MODIFIÉ: Remplacement des alert() par setFeedbackModal ---
        if (!staffId) { 
            setFeedbackModal({ type: 'error', title: 'Missing Information', message: "No staff member selected for this loan." }); 
            return; 
        }
        if (computedMonthly <= 0 || computedMonthly > tAmount) { 
            setFeedbackModal({ type: 'error', title: 'Invalid Input', message: "Invalid repayment amount. Please check your numbers." }); 
            return; 
        }

        setIsSubmitting(true);

        try {
            let branchId = existingLoan?.branchId || selectedStaffData?.branchId || 'unknown';
            const loanData = {
                staffId, 
                branchId, 
                loanName, 
                totalAmount: tAmount, 
                monthlyRepayment: computedMonthly, 
                remainingBalance: existingLoan ? existingLoan.remainingBalance : tAmount,
                startDate, 
                nextInstallmentOverride: Number(nextInstallmentOverride) || null,
                isActive: true, 
                updatedAt: Timestamp.now()
            };

            if (!existingLoan) {
                loanData.status = 'active';
            }

            if (existingLoan) await updateDoc(doc(db, 'loans', existingLoan.id), loanData);
            else { loanData.createdAt = Timestamp.now(); await addDoc(collection(db, 'loans'), loanData); }
            onClose();
        } catch (error) {
            console.error("Error saving loan: ", error); 
            // --- MODIFIÉ: Remplacement du alert() ---
            setFeedbackModal({ type: 'error', title: 'Save Failed', message: "Failed to save loan. Check console for details." });
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
                    <h3 className="text-xl font-bold text-white">{existingLoan ? 'Edit Loan' : 'Add New Loan'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X className="h-6 w-6" /></button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Loan Name / Description</label>
                        <input type="text" required value={loanName} onChange={(e) => setLoanName(e.target.value)} className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white" placeholder="e.g., Medical Emergency" />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Total Amount (THB)</label>
                        <input type="number" required min="1" step="1" onKeyDown={blockInvalidChars} value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white font-bold text-lg" />
                    </div>

                    <div className="bg-gray-900 p-4 rounded-lg border border-gray-700 space-y-4">
                        <div className="flex items-center space-x-4 mb-2">
                            <h4 className="text-sm font-medium text-gray-300 flex items-center"><Calculator className="w-4 h-4 mr-2"/> Repayment Calculation</h4>
                        </div>
                        
                        {staffBaseSalary > 0 && (
                            <p className="text-xs text-gray-400 mb-2">
                                Standard Policy (30% of base salary): <strong className="text-white">{maxAllowedRepayment.toLocaleString()} THB/mo</strong>
                            </p>
                        )}

                        <div className="flex space-x-4">
                            <label className="flex items-center text-sm text-gray-400 cursor-pointer">
                                <input type="radio" name="calcMethod" value="amount" checked={calcMethod === 'amount'} onChange={() => setCalcMethod('amount')} className="mr-2" /> Fixed Monthly Amount
                            </label>
                            <label className="flex items-center text-sm text-gray-400 cursor-pointer">
                                <input type="radio" name="calcMethod" value="months" checked={calcMethod === 'months'} onChange={() => setCalcMethod('months')} className="mr-2" /> Duration in Months
                            </label>
                        </div>

                        {calcMethod === 'amount' ? (
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Monthly Repayment (THB)</label>
                                <input type="number" required min="1" step="1" max={totalAmount || 999999} onKeyDown={blockInvalidChars} value={monthlyRepayment} onChange={(e) => setMonthlyRepayment(e.target.value)} className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white" placeholder="Amount to deduct per month" />
                                {computedDuration > 0 && (
                                    <p className="text-xs text-amber-400 mt-2">
                                        Estimated duration: <strong>{computedDuration} months</strong>
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Duration (Months)</label>
                                <input type="number" required min="1" step="1" onKeyDown={blockInvalidChars} value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white" placeholder="How many months to repay?" />
                                {computedMonthly > 0 && (
                                    <p className="text-xs text-amber-400 mt-2">
                                        Calculated deduction: <strong>{computedMonthly.toLocaleString()} THB / month</strong>
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl space-y-3 mt-4">
                            <div className="flex items-center gap-2 text-amber-500">
                                <Zap className="w-4 h-4" />
                                <label className="text-[10px] font-bold uppercase tracking-wider">Payroll Override (Optional)</label>
                            </div>
                            <p className="text-[10px] text-gray-400 leading-tight">
                                Set a specific amount to be deducted in the <b>next</b> payroll run only. 
                                Leave empty to use the standard monthly amount.
                            </p>
                            <input 
                                type="number"
                                value={nextInstallmentOverride}
                                onChange={e => setNextInstallmentOverride(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white font-bold outline-none focus:border-amber-500"
                                placeholder="Override amount for next month..."
                            />
                        </div>

                        {isExceedingLimit && (
                            <div className="flex items-start gap-2 p-2 bg-amber-900/30 border border-amber-800 rounded-md mt-3">
                                <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-300 leading-tight">
                                    <strong>Warning:</strong> The calculated monthly repayment ({computedMonthly.toLocaleString()} THB) exceeds the standard 30% policy limit. As a Manager, you may still proceed.
                                </p>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Start Date of Repayment</label>
                        <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-gray-300" />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-700">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-lg font-medium transition-colors">
                            {isSubmitting ? 'Saving...' : (existingLoan ? 'Save Changes' : 'Create Loan')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}