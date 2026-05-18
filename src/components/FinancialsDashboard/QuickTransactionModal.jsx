/* src/components/FinancialsDashboard/QuickTransactionModal.jsx */
import React, { useState } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { X, Zap, DollarSign, ArrowDownRight, ArrowUpRight, Landmark, Calculator, AlertTriangle } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';
import FeedbackModal from '../common/FeedbackModal';
import StaffSearchAutocomplete from '../common/StaffSearchAutocomplete';


export default function QuickTransactionModal({ isOpen, onClose, db, staffList, onSuccess }) {
    const [selectedStaffId, setSelectedStaffId] = useState('');
    const [txType, setTxType] = useState('advance'); // 'advance', 'loan', 'earning', 'deduction'
    
    // Champs de formulaire
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(dateUtils.formatISODate(new Date()));
    
    // Nouveaux champs spécifiques aux prêts
    const [calcMethod, setCalcMethod] = useState('amount'); 
    const [monthlyRepayment, setMonthlyRepayment] = useState('');
    const [durationMonths, setDurationMonths] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // --- NOUVEAU STATE POUR LA MODALE D'ERREUR ---
    const [feedbackModal, setFeedbackModal] = useState(null);

    const blockInvalidChars = (e) => {
        if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault();
    };

    // --- MATHÉMATIQUES POUR LES PRÊTS ---
    const tAmount = parseFloat(amount) || 0;
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

    // Récupération du salaire pour la règle des 30%
    const selectedStaffData = staffList.find(s => s.id === selectedStaffId);
    const staffBaseSalary = selectedStaffData?.jobHistory?.[0]?.baseSalary || 0;
    const maxAllowedRepayment = staffBaseSalary * 0.30;
    
    const isExceedingLimit = txType === 'loan' && staffBaseSalary > 0 && computedMonthly > maxAllowedRepayment;

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // --- MODIFIÉ: Remplacement des alert() ---
        if (!selectedStaffId) {
            setFeedbackModal({ type: 'error', title: 'Missing Information', message: "Please select a staff member." });
            return;
        }
        
        if (txType === 'loan') {
            if (computedMonthly <= 0 || computedMonthly > tAmount) {
                setFeedbackModal({ type: 'error', title: 'Invalid Input', message: "Invalid repayment amount." });
                return;
            }
        }

        setIsSubmitting(true);
        const parsedAmount = parseFloat(amount);
        const branchId = selectedStaffData?.branchId || 'global';
        const dateObj = dateUtils.parseISODateString(date);

        try {
            if (txType === 'advance') {
                await addDoc(collection(db, 'salary_advances'), {
                    staffId: selectedStaffId, branchId,
                    amount: parsedAmount,
                    status: 'approved', 
                    date: date,
                    payPeriodMonth: dateObj.getMonth() + 1,
                    payPeriodYear: dateObj.getFullYear(),
                    createdAt: Timestamp.now()
                });
            } 
            else if (txType === 'loan') {
                await addDoc(collection(db, 'loans'), {
                    staffId: selectedStaffId, branchId,
                    loanName: description || 'Quick Loan',
                    totalAmount: parsedAmount,
                    remainingBalance: parsedAmount,
                    monthlyRepayment: computedMonthly, 
                    startDate: date, 
                    status: 'active', 
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now()
                });
            } 
            else if (txType === 'earning' || txType === 'deduction') {
                await addDoc(collection(db, 'monthly_adjustments'), {
                    staffId: selectedStaffId, branchId,
                    type: txType === 'earning' ? 'Earning' : 'Deduction',
                    description: description,
                    amount: parsedAmount,
                    date: date,
                    payPeriodMonth: dateObj.getMonth() + 1,
                    payPeriodYear: dateObj.getFullYear(),
                    createdAt: Timestamp.now()
                });
            }

            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            console.error("Transaction error:", error);
            // --- MODIFIÉ: Remplacement du alert() ---
            setFeedbackModal({ type: 'error', title: 'Transaction Failed', message: "Failed to process transaction: " + error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const typeConfig = {
        advance: { icon: <ArrowDownRight className="w-4 h-4 mr-2"/>, color: 'text-amber-400 bg-amber-400/10 border-amber-400/50', label: 'Salary Advance' },
        loan: { icon: <Landmark className="w-4 h-4 mr-2"/>, color: 'text-blue-400 bg-blue-400/10 border-blue-400/50', label: 'Long-Term Loan' },
        earning: { icon: <ArrowUpRight className="w-4 h-4 mr-2"/>, color: 'text-green-400 bg-green-400/10 border-green-400/50', label: 'Bonus / Earning' },
        deduction: { icon: <ArrowDownRight className="w-4 h-4 mr-2"/>, color: 'text-red-400 bg-red-400/10 border-red-400/50', label: 'Deduction' },
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            {/* INJECTION DU FEEDBACK MODAL */}
            <FeedbackModal 
                isOpen={!!feedbackModal} 
                type={feedbackModal?.type} 
                title={feedbackModal?.title} 
                message={feedbackModal?.message} 
                onClose={() => setFeedbackModal(null)} 
            />

            <div className="bg-[#1e2330] rounded-xl shadow-2xl w-full max-w-2xl border border-gray-700">
                <div className="flex justify-between items-center p-6 border-b border-gray-700">
                    <h3 className="text-xl font-bold text-white flex items-center">
                        <Zap className="w-5 h-5 text-amber-400 mr-2" /> Quick Transaction
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="h-6 w-6" /></button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-300 mb-2">1. Select Staff Member</label>
                        <StaffSearchAutocomplete
                            staffList={staffList}
                            value={selectedStaffId}
                            onChange={setSelectedStaffId}
                            placeholder="Search and select staff..."
                        />
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-300 mb-2">2. Transaction Type</label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {Object.entries(typeConfig).map(([key, config]) => (
                                <button
                                    key={key} type="button"
                                    onClick={() => setTxType(key)}
                                    className={`flex items-center justify-center p-3 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all
                                        ${txType === key ? config.color : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}
                                    `}
                                >
                                    {config.icon} {config.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-gray-800/50 p-5 rounded-lg border border-gray-700 space-y-4 mb-8">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Amount (THB)</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><DollarSign className="h-4 w-4 text-gray-400" /></div>
                                    <input type="number" required min="1" onKeyDown={blockInvalidChars} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full pl-9 p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white font-bold" placeholder="0.00" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    {txType === 'loan' ? 'Start Date' : 'Effective Date'}
                                </label>
                                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white" />
                            </div>
                        </div>

                        {(txType === 'loan' || txType === 'earning' || txType === 'deduction') && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Description / Reason</label>
                                <input type="text" required value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white" placeholder={txType === 'loan' ? 'e.g. Motorbike downpayment' : 'Reason for adjustment'} />
                            </div>
                        )}

                        {txType === 'loan' && (
                            <div className="mt-4 pt-4 border-t border-gray-700">
                                <div className="flex items-center space-x-4 mb-2">
                                    <h4 className="text-sm font-medium text-gray-300 flex items-center"><Calculator className="w-4 h-4 mr-2"/> Repayment Calculation</h4>
                                </div>
                                
                                {staffBaseSalary > 0 && (
                                    <p className="text-xs text-gray-400 mb-2">
                                        Standard Policy (30% of base salary): <strong className="text-white">{maxAllowedRepayment.toLocaleString()} THB/mo</strong>
                                    </p>
                                )}

                                <div className="flex space-x-4 mb-3">
                                    <label className="flex items-center text-sm text-gray-400 cursor-pointer">
                                        <input type="radio" name="calcMethod" value="amount" checked={calcMethod === 'amount'} onChange={() => setCalcMethod('amount')} className="mr-2" /> Fixed Monthly Amount
                                    </label>
                                    <label className="flex items-center text-sm text-gray-400 cursor-pointer">
                                        <input type="radio" name="calcMethod" value="months" checked={calcMethod === 'months'} onChange={() => setCalcMethod('months')} className="mr-2" /> Duration in Months
                                    </label>
                                </div>

                                {calcMethod === 'amount' ? (
                                    <div>
                                        <input type="number" required min="1" step="1" max={amount || 999999} onKeyDown={blockInvalidChars} value={monthlyRepayment} onChange={(e) => setMonthlyRepayment(e.target.value)} className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white" placeholder="Amount to deduct per month" />
                                        {computedDuration > 0 && (
                                            <p className="text-xs text-amber-400 mt-2">
                                                Estimated duration: <strong>{computedDuration} months</strong>
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div>
                                        <input type="number" required min="1" step="1" onKeyDown={blockInvalidChars} value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white" placeholder="How many months to repay?" />
                                        {computedMonthly > 0 && (
                                            <p className="text-xs text-amber-400 mt-2">
                                                Calculated deduction: <strong>{computedMonthly.toLocaleString()} THB / month</strong>
                                            </p>
                                        )}
                                    </div>
                                )}

                                {isExceedingLimit && (
                                    <div className="flex items-start gap-2 p-2 bg-amber-900/30 border border-amber-800 rounded-md mt-3">
                                        <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                        <p className="text-xs text-amber-300 leading-tight">
                                            <strong>Warning:</strong> The calculated monthly repayment ({computedMonthly.toLocaleString()} THB) exceeds the standard 30% policy limit. As a Manager, you may still proceed.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-700">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors shadow-lg">
                            {isSubmitting ? 'Processing...' : 'Execute Transaction'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}