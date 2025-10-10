import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { PlusIcon, PencilIcon, TrashIcon } from '../components/Icons';
import LoanModal from '../components/LoanModal';

export default function FinancialsPage({ staffList, db }) {
    const [selectedStaffId, setSelectedStaffId] = useState('');
    
    // State for Loans
    const [loans, setLoans] = useState([]);
    const [isLoadingLoans, setIsLoadingLoans] = useState(false);
    const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
    const [editingLoan, setEditingLoan] = useState(null);

    // TODO: We will replace these with real data from Firestore later.
    const advances = [];
    const adjustments = [];

    // Fetch Loans when a staff member is selected
    useEffect(() => {
        if (selectedStaffId && db) {
            setIsLoadingLoans(true);
            const loansQuery = query(collection(db, 'loans'), where('staffId', '==', selectedStaffId));
            
            const unsubscribe = onSnapshot(loansQuery, (querySnapshot) => {
                const loansData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setLoans(loansData);
                setIsLoadingLoans(false);
            }, (error) => {
                console.error("Error fetching loans:", error);
                setIsLoadingLoans(false);
            });

            return () => unsubscribe(); // Cleanup listener on component unmount or staff change
        } else {
            setLoans([]); // Clear loans if no staff is selected
        }
    }, [selectedStaffId, db]);


    const handleStaffChange = (e) => {
        setSelectedStaffId(e.target.value);
    };

    const handleOpenAddLoanModal = () => {
        setEditingLoan(null);
        setIsLoanModalOpen(true);
    };

    const handleOpenEditLoanModal = (loan) => {
        setEditingLoan(loan);
        setIsLoanModalOpen(true);
    };

    const handleDeleteLoan = async (loanId) => {
        if (window.confirm("Are you sure you want to permanently delete this loan record?")) {
            try {
                await deleteDoc(doc(db, 'loans', loanId));
            } catch (error) {
                console.error("Error deleting loan:", error);
                alert("Failed to delete loan. Please try again.");
            }
        }
    };
    
    // Placeholder functions for future implementation
    const handleAddAdvance = () => alert("Add Advance modal will open here.");
    const handleAddAdjustment = () => alert("Add Adjustment modal will open here.");

    const selectedStaffName = staffList.find(s => s.id === selectedStaffId)?.fullName;

    return (
        <div>
            <LoanModal 
                isOpen={isLoanModalOpen}
                onClose={() => setIsLoanModalOpen(false)}
                db={db}
                staffId={selectedStaffId}
                existingLoan={editingLoan}
            />

            <div className="flex flex-col md:flex-row justify-between md:items-center mb-8 gap-4">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Financials Management</h2>
                <div className="w-full md:w-72">
                    <label htmlFor="staff-select" className="sr-only">Select Staff</label>
                    <select
                        id="staff-select"
                        value={selectedStaffId}
                        onChange={handleStaffChange}
                        className="w-full p-2 bg-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                        <option value="">-- Select a Staff Member --</option>
                        {staffList.sort((a, b) => a.fullName.localeCompare(b.fullName)).map(staff => (
                            <option key={staff.id} value={staff.id}>{staff.fullName}</option>
                        ))}
                    </select>
                </div>
            </div>

            {selectedStaffId ? (
                <div className="space-y-10">
                    {/* Section for Long-Term Loans */}
                    <section>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-white">Long-Term Loans</h3>
                            <button onClick={handleOpenAddLoanModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
                                <PlusIcon className="h-5 w-5 mr-2" />
                                Add Loan
                            </button>
                        </div>
                        <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-gray-700">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Loan Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Total Amount</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Monthly Repayment</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Remaining</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Start Date</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {isLoadingLoans ? (
                                        <tr><td colSpan="6" className="text-center py-10 text-gray-500">Loading loans...</td></tr>
                                    ) : loans.length === 0 ? (
                                        <tr><td colSpan="6" className="text-center py-10 text-gray-500">No active loans for {selectedStaffName}.</td></tr>
                                    ) : (
                                        loans.map(loan => (
                                            <tr key={loan.id} className="hover:bg-gray-700">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{loan.loanName}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{loan.totalAmount.toLocaleString()}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{loan.monthlyRepayment.toLocaleString()}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-amber-400">{loan.remainingBalance.toLocaleString()}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{loan.startDate}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                                    <button onClick={() => handleOpenEditLoanModal(loan)} className="text-blue-400 hover:text-blue-300 mr-4"><PencilIcon className="h-5 w-5"/></button>
                                                    <button onClick={() => handleDeleteLoan(loan.id)} className="text-red-400 hover:text-red-300"><TrashIcon className="h-5 w-5"/></button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Section for Salary Advances (Placeholder) */}
                    <section>
                         <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-white">Salary Advances</h3>
                            <button onClick={handleAddAdvance} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
                                <PlusIcon className="h-5 w-5 mr-2" />
                                Add Advance
                            </button>
                        </div>
                        <div className="bg-gray-800 rounded-lg shadow-lg p-4 min-h-[100px] flex items-center justify-center">
                            <p className="text-gray-500">No salary advances this period for {selectedStaffName}.</p>
                        </div>
                    </section>

                    {/* Section for Other Monthly Adjustments (Placeholder) */}
                    <section>
                         <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-white">Other Monthly Adjustments</h3>
                            <button onClick={handleAddAdjustment} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
                                <PlusIcon className="h-5 w-5 mr-2" />
                                Add Adjustment
                            </button>
                        </div>
                        <div className="bg-gray-800 rounded-lg shadow-lg p-4 min-h-[100px] flex items-center justify-center">
                            <p className="text-gray-500">No earnings or deductions this period for {selectedStaffName}.</p>
                        </div>
                    </section>
                </div>
            ) : (
                <div className="text-center py-20 bg-gray-800 rounded-lg">
                    <p className="text-gray-400">Please select a staff member to view and manage their financial records.</p>
                </div>
            )}
        </div>
    );
}