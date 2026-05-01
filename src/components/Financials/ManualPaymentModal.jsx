/* src/components/Financials/ManualPaymentModal.jsx */
import React, { useState } from 'react';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { X, Banknote, Loader2 } from 'lucide-react';
import FeedbackModal from '../common/FeedbackModal'; // <-- NOUVEL IMPORT

export default function ManualPaymentModal({ isOpen, onClose, loan, db }) {
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    
    // --- NOUVEAU STATE POUR LA MODALE D'ERREUR ---
    const [feedbackModal, setFeedbackModal] = useState(null);

    if (!isOpen || !loan) return null;

    const handlePayment = async () => {
        const payAmount = Number(amount);
        
        // --- MODIFIÉ: Remplacement des alert() ---
        if (!payAmount || payAmount <= 0) {
            setFeedbackModal({ type: 'error', title: 'Invalid Input', message: "Please enter a valid amount." });
            return;
        }
        if (payAmount > loan.remainingBalance) {
            setFeedbackModal({ type: 'error', title: 'Amount Exceeded', message: "Amount exceeds the remaining balance." });
            return;
        }

        setLoading(true);
        try {
            const batch = writeBatch(db);
            const loanRef = doc(db, "loans", loan.id);
            const newBalance = loan.remainingBalance - payAmount;

            // 1. Mise à jour du prêt
            batch.update(loanRef, {
                remainingBalance: newBalance,
                status: newBalance <= 0 ? 'paid_off' : 'active',
                updatedAt: serverTimestamp()
            });

            // 2. Création de la trace comptable (Historique pur, hors paie)
            const adjRef = doc(collection(db, "monthly_adjustments"));
            batch.set(adjRef, {
                staffId: loan.staffId,
                staffName: loan.staffName,
                amount: payAmount,
                type: 'Manual Repayment',
                category: 'loan_repayment',
                description: `Cash/Transfer Repayment for loan: ${loan.loanName || 'Long-Term Loan'}`,
                date: new Date().toISOString().split('T')[0],
                status: 'applied', // <-- Statut "applied" = Le générateur de paie l'ignorera
                payPeriodMonth: new Date().getMonth() + 1,
                payPeriodYear: new Date().getFullYear(),
                createdAt: serverTimestamp()
            });

            await batch.commit();
            onClose();
        } catch (e) {
            console.error(e);
            // --- MODIFIÉ: Remplacement du alert() ---
            setFeedbackModal({ type: 'error', title: 'Payment Failed', message: "Error recording payment. Check console for details." });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[60] p-4">
            {/* INJECTION DU FEEDBACK MODAL */}
            <FeedbackModal 
                isOpen={!!feedbackModal} 
                type={feedbackModal?.type} 
                title={feedbackModal?.title} 
                message={feedbackModal?.message} 
                onClose={() => setFeedbackModal(null)} 
            />

            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm border border-gray-700">
                <div className="flex justify-between items-center p-6 border-b border-gray-700">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Banknote className="text-green-500" /> Manual Payment
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <p className="text-xs text-gray-400 uppercase font-bold mb-1">Remaining Balance</p>
                        <p className="text-lg font-mono text-white">{loan.remainingBalance?.toLocaleString()} THB</p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Payment Amount</label>
                        <input 
                            type="number" 
                            value={amount} 
                            onChange={e => setAmount(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white font-bold outline-none focus:border-green-500"
                            placeholder="Ex: 5000"
                        />
                    </div>
                </div>
                <div className="p-4 bg-gray-900/50 flex justify-end gap-3 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white font-medium">Cancel</button>
                    <button 
                        onClick={handlePayment} 
                        disabled={loading}
                        className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-all flex items-center gap-2 shadow-lg"
                    >
                        {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Banknote className="w-4 h-4" />}
                        Record Payment
                    </button>
                </div>
            </div>
        </div>
    );
}