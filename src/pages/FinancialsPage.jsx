import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { PlusIcon, PencilIcon, TrashIcon } from '../components/Icons';
import LoanModal from '../components/LoanModal';
import AdvanceModal from '../components/AdvanceModal';
import AdjustmentModal from '../components/AdjustmentModal';

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const years = [new Date().getFullYear() + 1, new Date().getFullYear(), new Date().getFullYear() - 1];

export default function FinancialsPage({ staffList, db }) {
    const [selectedStaffId, setSelectedStaffId] = useState('');
    const [payPeriod, setPayPeriod] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
    
    const [loans, setLoans] = useState([]);
    const [isLoadingLoans, setIsLoadingLoans] = useState(false);
    const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
    const [editingLoan, setEditingLoan] = useState(null);

    const [advances, setAdvances] = useState([]);
    const [isLoadingAdvances, setIsLoadingAdvances] = useState(false);
    const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
    const [editingAdvance, setEditingAdvance] = useState(null);

    const [adjustments, setAdjustments] = useState([]);
    const [isLoadingAdjustments, setIsLoadingAdjustments] = useState(false);
    const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
    const [editingAdjustment, setEditingAdjustment] = useState(null);

    // Fetch Loans (not dependent on pay period)
    useEffect(() => {
        if (selectedStaffId && db) {
            setIsLoadingLoans(true);
            const q = query(collection(db, 'loans'), where('staffId', '==', selectedStaffId));
            const unsubscribe = onSnapshot(q, (snap) => {
                setLoans(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setIsLoadingLoans(false);
            }, (err) => { console.error(err); setIsLoadingLoans(false); });
            return () => unsubscribe();
        } else { setLoans([]); }
    }, [selectedStaffId, db]);

    // Fetch Advances & Adjustments (dependent on pay period)
    useEffect(() => {
        if (selectedStaffId && db) {
            setIsLoadingAdvances(true);
            setIsLoadingAdjustments(true);
            
            const commonQueries = [
                where('staffId', '==', selectedStaffId),
                where('payPeriodMonth', '==', payPeriod.month),
                where('payPeriodYear', '==', payPeriod.year)
            ];

            const advancesQuery = query(collection(db, 'salary_advances'), ...commonQueries);
            const adjustmentsQuery = query(collection(db, 'monthly_adjustments'), ...commonQueries);

            const unsubAdvances = onSnapshot(advancesQuery, (snap) => {
                setAdvances(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setIsLoadingAdvances(false);
            }, (err) => { console.error(err); setIsLoadingAdvances(false); });
            
            const unsubAdjustments = onSnapshot(adjustmentsQuery, (snap) => {
                setAdjustments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setIsLoadingAdjustments(false);
            }, (err) => { console.error(err); setIsLoadingAdjustments(false); });

            return () => {
                unsubAdvances();
                unsubAdjustments();
            };
        } else {
            setAdvances([]);
            setAdjustments([]);
        }
    }, [selectedStaffId, db, payPeriod]);

    // Handlers
    const handleStaffChange = (e) => setSelectedStaffId(e.target.value);
    const handlePeriodChange = (e) => setPayPeriod(p => ({ ...p, [e.target.name]: Number(e.target.value) }));

    const handleOpenAddLoanModal = () => { setEditingLoan(null); setIsLoanModalOpen(true); };
    const handleOpenEditLoanModal = (loan) => { setEditingLoan(loan); setIsLoanModalOpen(true); };
    const handleDeleteLoan = async (id) => { if (window.confirm("Delete this loan record?")) await deleteDoc(doc(db, 'loans', id)); };

    const handleOpenAddAdvanceModal = () => { setEditingAdvance(null); setIsAdvanceModalOpen(true); };
    const handleOpenEditAdvanceModal = (adv) => { setEditingAdvance(adv); setIsAdvanceModalOpen(true); };
    const handleDeleteAdvance = async (id) => { if (window.confirm("Delete this advance record?")) await deleteDoc(doc(db, 'salary_advances', id)); };
    
    const handleOpenAddAdjustmentModal = () => { setEditingAdjustment(null); setIsAdjustmentModalOpen(true); };
    const handleOpenEditAdjustmentModal = (adj) => { setEditingAdjustment(adj); setIsAdjustmentModalOpen(true); };
    const handleDeleteAdjustment = async (id) => { if (window.confirm("Delete this adjustment record?")) await deleteDoc(doc(db, 'monthly_adjustments', id)); };
    
    const selectedStaffName = staffList.find(s => s.id === selectedStaffId)?.fullName;

    return (
        <div>
            <LoanModal isOpen={isLoanModalOpen} onClose={() => setIsLoanModalOpen(false)} db={db} staffId={selectedStaffId} existingLoan={editingLoan} />
            <AdvanceModal isOpen={isAdvanceModalOpen} onClose={() => setIsAdvanceModalOpen(false)} db={db} staffId={selectedStaffId} existingAdvance={editingAdvance} />
            <AdjustmentModal isOpen={isAdjustmentModalOpen} onClose={() => setIsAdjustmentModalOpen(false)} db={db} staffId={selectedStaffId} existingAdjustment={editingAdjustment} payPeriod={payPeriod} />

            <div className="flex flex-col md:flex-row justify-between md:items-end mb-8 gap-4">
                <h2 className="text-2xl md:text-3xl font-bold text-white flex-shrink-0">Financials Management</h2>
                <div className="flex flex-col sm:flex-row w-full md:w-auto gap-2">
                    <div className="flex-grow"><select name="month" value={payPeriod.month} onChange={handlePeriodChange} className="w-full p-2 bg-gray-700 rounded-md text-white">{months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
                    <div className="flex-grow"><select name="year" value={payPeriod.year} onChange={handlePeriodChange} className="w-full p-2 bg-gray-700 rounded-md text-white">{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
                    <div className="flex-grow"><select value={selectedStaffId} onChange={handleStaffChange} className="w-full p-2 bg-gray-700 rounded-md text-white"><option value="">-- Select Staff --</option>{staffList.sort((a, b) => a.fullName.localeCompare(b.fullName)).map(s => (<option key={s.id} value={s.id}>{s.fullName}</option>))}</select></div>
                </div>
            </div>

            {selectedStaffId ? (
                <div className="space-y-10">
                    <section>
                        <div className="flex justify-between items-center mb-4"><h3 className="text-xl font-semibold text-white">Long-Term Loans</h3><button onClick={handleOpenAddLoanModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><PlusIcon className="h-5 w-5 mr-2" />Add Loan</button></div>
                        <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto"><table className="min-w-full"><thead className="bg-gray-700"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Name</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Total</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Monthly</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Remaining</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Start Date</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-gray-700">{isLoadingLoans ? (<tr><td colSpan="6" className="text-center py-10 text-gray-500">Loading...</td></tr>) : loans.length === 0 ? (<tr><td colSpan="6" className="text-center py-10 text-gray-500">No active loans.</td></tr>) : (loans.map(loan => (<tr key={loan.id} className="hover:bg-gray-700"><td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{loan.loanName}</td><td className="px-6 py-4 text-sm text-gray-300">{loan.totalAmount.toLocaleString()}</td><td className="px-6 py-4 text-sm text-gray-300">{loan.monthlyRepayment.toLocaleString()}</td><td className="px-6 py-4 text-sm font-semibold text-amber-400">{loan.remainingBalance.toLocaleString()}</td><td className="px-6 py-4 text-sm text-gray-300">{loan.startDate}</td><td className="px-6 py-4 text-sm text-right"><button onClick={() => handleOpenEditLoanModal(loan)} className="text-blue-400 hover:text-blue-300 mr-4"><PencilIcon className="h-5 w-5"/></button><button onClick={() => handleDeleteLoan(loan.id)} className="text-red-400 hover:text-red-300"><TrashIcon className="h-5 w-5"/></button></td></tr>)))}</tbody></table></div>
                    </section>
                    <section>
                        <div className="flex justify-between items-center mb-4"><h3 className="text-xl font-semibold text-white">Salary Advances</h3><button onClick={handleOpenAddAdvanceModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><PlusIcon className="h-5 w-5 mr-2" />Add Advance</button></div>
                        <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto"><table className="min-w-full"><thead className="bg-gray-700"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Amount</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-gray-700">{isLoadingAdvances ? (<tr><td colSpan="3" className="text-center py-10 text-gray-500">Loading...</td></tr>) : advances.length === 0 ? (<tr><td colSpan="3" className="text-center py-10 text-gray-500">No advances for this period.</td></tr>) : (advances.map(adv => (<tr key={adv.id} className="hover:bg-gray-700"><td className="px-6 py-4 text-sm text-gray-300">{adv.date}</td><td className="px-6 py-4 text-sm font-semibold text-amber-400">{adv.amount.toLocaleString()}</td><td className="px-6 py-4 text-sm text-right"><button onClick={() => handleOpenEditAdvanceModal(adv)} className="text-blue-400 hover:text-blue-300 mr-4"><PencilIcon className="h-5 w-5"/></button><button onClick={() => handleDeleteAdvance(adv.id)} className="text-red-400 hover:text-red-300"><TrashIcon className="h-5 w-5"/></button></td></tr>)))}</tbody></table></div>
                    </section>
                    <section>
                         <div className="flex justify-between items-center mb-4"><h3 className="text-xl font-semibold text-white">Other Monthly Adjustments</h3><button onClick={handleOpenAddAdjustmentModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><PlusIcon className="h-5 w-5 mr-2" />Add Adjustment</button></div>
                         <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto"><table className="min-w-full"><thead className="bg-gray-700"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Description</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Amount</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-gray-700">{isLoadingAdjustments ? (<tr><td colSpan="4" className="text-center py-10 text-gray-500">Loading...</td></tr>) : adjustments.length === 0 ? (<tr><td colSpan="4" className="text-center py-10 text-gray-500">No adjustments for this period.</td></tr>) : (adjustments.map(adj => (<tr key={adj.id} className="hover:bg-gray-700"><td className={`px-6 py-4 text-sm font-semibold ${adj.type === 'Earning' ? 'text-green-400' : 'text-red-400'}`}>{adj.type}</td><td className="px-6 py-4 text-sm text-gray-300">{adj.description}</td><td className="px-6 py-4 text-sm font-semibold text-amber-400">{adj.amount.toLocaleString()}</td><td className="px-6 py-4 text-sm text-right"><button onClick={() => handleOpenEditAdjustmentModal(adj)} className="text-blue-400 hover:text-blue-300 mr-4"><PencilIcon className="h-5 w-5"/></button><button onClick={() => handleDeleteAdjustment(adj.id)} className="text-red-400 hover:text-red-300"><TrashIcon className="h-5 w-5"/></button></td></tr>)))}</tbody></table></div>
                    </section>
                </div>
            ) : (
                <div className="text-center py-20 bg-gray-800 rounded-lg"><p className="text-gray-400">Please select a pay period and staff member to begin.</p></div>
            )}
        </div>
    );
}