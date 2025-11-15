import React, { useState, useEffect, useMemo } from 'react';
// 1. Import 'doc'
import { collection, query, where, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Plus, Pencil, Trash2, CheckCircle, XCircle, Download, ArrowUp, ArrowDown } from 'lucide-react';
import LoanModal from '../components/Financials/LoanModal';
import AdvanceModal from '../components/SalaryAdvance/AdvanceModal';
import AdjustmentModal from '../components/Payroll/AdjustmentModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const years = [new Date().getFullYear() + 1, new Date().getFullYear(), new Date().getFullYear() - 1];

const StatusBadge = ({ status }) => {
    // ... (No change)
    const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full";
    const statusMap = {
        pending: "bg-yellow-500/20 text-yellow-300",
        approved: "bg-green-500/20 text-green-300",
        rejected: "bg-red-500/20 text-red-300",
        paid: "bg-blue-500/20 text-blue-300",
    };
    return <span className={`${baseClasses} ${statusMap[status] || 'bg-gray-500/20 text-gray-300'}`}>{status}</span>;
};

export default function FinancialsPage({ staffList, db }) {
    const [selectedStaffId, setSelectedStaffId] = useState('');
    const [payPeriod, setPayPeriod] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
    const [showArchived, setShowArchived] = useState(false); 

    const [pendingAdvances, setPendingAdvances] = useState([]);
    const [isLoadingPending, setIsLoadingPending] = useState(true);

    const [sortConfig, setSortConfig] = useState({ key: 'staffName', direction: 'asc' });

    // 2. Add state for Company Config
    const [companyConfig, setCompanyConfig] = useState(null);

    // ... (Rest of state definitions are unchanged)
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

    const getDisplayName = (staff) => staff?.nickname || staff?.firstName || staff?.fullName || 'Unknown';

    // 3. Fetch Company Config
    useEffect(() => {
        if (!db) return;
        const configRef = doc(db, 'settings', 'company_config');
        const unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                setCompanyConfig(docSnap.data());
            } else {
                console.error("Company config not found!");
            }
        });
        return () => unsubscribeConfig();
    }, [db]);

    // 4. Update Pending Advances listener to include eligibility calculation
    useEffect(() => {
        if (!db || !companyConfig) {
             // Don't run until config is loaded
            return;
        }
        
        setIsLoadingPending(true);
        const q = query(collection(db, 'salary_advances'), where('status', '==', 'pending'));
        
        const unsubscribe = onSnapshot(q, (snap) => {
            const eligibilityPercent = companyConfig.advanceEligibilityPercentage || 50; // Default 50%

            const pendingList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const hydratedList = pendingList
                .map(req => {
                    const staffMember = staffList.find(s => s.id === req.staffId);
                    if (!staffMember) return null; // Staff not found

                    // --- NEW CALCULATION ---
                    // Assumes salary is stored in jobHistory[0].rate
                    const salary = staffMember.jobHistory?.[0]?.rate || 0;
                    const maxEligible = (salary * eligibilityPercent) / 100;
                    // -----------------------

                    return { 
                        ...req, 
                        staff: staffMember,
                        staffName: getDisplayName(staffMember),
                        maxEligible: maxEligible
                    };
                })
                .filter(req => req && req.staff.status !== 'inactive'); // Filter out nulls/inactive

            setPendingAdvances(hydratedList);
            setIsLoadingPending(false);
        }, (err) => { console.error(err); setIsLoadingPending(false); });
        
        // This listener now depends on db, staffList, AND companyConfig
        return () => unsubscribe();
    }, [db, staffList, companyConfig]);

    useEffect(() => {
        if (selectedStaffId && db) {
            setIsLoadingLoans(true);
            setIsLoadingAdvances(true);
            setIsLoadingAdjustments(true);
            const loansQuery = query(collection(db, 'loans'), where('staffId', '==', selectedStaffId));
            const unsubLoans = onSnapshot(loansQuery, (snap) => { setLoans(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); setIsLoadingLoans(false); }, (err) => { console.error(err); setIsLoadingLoans(false); });
            const commonQueries = [where('staffId', '==', selectedStaffId), where('payPeriodMonth', '==', payPeriod.month), where('payPeriodYear', '==', payPeriod.year)];
            const advancesQuery = query(collection(db, 'salary_advances'), ...commonQueries);
            const unsubAdvances = onSnapshot(advancesQuery, (snap) => { setAdvances(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); setIsLoadingAdvances(false); }, (err) => { console.error(err); setIsLoadingAdvances(false); });
            const adjustmentsQuery = query(collection(db, 'monthly_adjustments'), ...commonQueries);
            const unsubAdjustments = onSnapshot(adjustmentsQuery, (snap) => { setAdjustments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); setIsLoadingAdjustments(false); }, (err) => { console.error(err); setIsLoadingAdjustments(false); });
            return () => { unsubLoans(); unsubAdvances(); unsubAdjustments(); };
        } else {
            setLoans([]); setAdvances([]); setAdjustments([]);
        }
    }, [selectedStaffId, db, payPeriod]);

    // 5. Update sort hook to handle 'maxEligible'
    const sortedPendingAdvances = useMemo(() => {
        let sortableItems = [...pendingAdvances];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                // Handle different data types
                if (sortConfig.key === 'amount' || sortConfig.key === 'maxEligible') { // <-- Added maxEligible
                    aValue = a[sortConfig.key] || 0;
                    bValue = b[sortConfig.key] || 0;
                } else if (sortConfig.key === 'date') {
                    aValue = new Date(a.date);
                    bValue = new Date(b.date);
                } else {
                    aValue = ('' + aValue).toLowerCase();
                    bValue = ('' + bValue).toLowerCase();
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [pendingAdvances, sortConfig]);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handlePeriodChange = (e) => setPayPeriod(p => ({ ...p, [e.target.name]: Number(e.target.value) }));
    const handleStaffChange = (e) => setSelectedStaffId(e.target.value);
    const handleOpenAddLoanModal = () => { setEditingLoan(null); setIsLoanModalOpen(true); };
    const handleOpenEditLoanModal = (loan) => { setEditingLoan(loan); setIsLoanModalOpen(true); };
    const handleDeleteLoan = async (id) => { if (window.confirm("Delete this loan record?")) await deleteDoc(doc(db, 'loans', id)); };
    const handleOpenAddAdvanceModal = () => { setEditingAdvance(null); setIsAdvanceModalOpen(true); };
    const handleOpenEditAdvanceModal = (adv) => { setEditingAdvance(adv); setIsAdvanceModalOpen(true); };
    const handleDeleteAdvance = async (id) => { if (window.confirm("Delete this advance record?")) await deleteDoc(doc(db, 'salary_advances', id)); };
    const handleApproveAdvance = async (id) => { await updateDoc(doc(db, 'salary_advances', id), { status: 'approved', isReadByStaff: false }); };
    const handleRejectAdvance = async (id) => { const reason = window.prompt("Reason for rejecting?"); if (reason) { await updateDoc(doc(db, 'salary_advances', id), { status: 'rejected', rejectionReason: reason, isReadByStaff: false }); } };
    const handleOpenAddAdjustmentModal = () => { setEditingAdjustment(null); setIsAdjustmentModalOpen(true); };
    const handleOpenEditAdjustmentModal = (adj) => { setEditingAdjustment(adj); setIsAdjustmentModalOpen(true); };
    const handleDeleteAdjustment = async (id) => { if (window.confirm("Delete this adjustment record?")) await deleteDoc(doc(db, 'monthly_adjustments', id)); };

    // 6. Update PDF Export Function
    const handleExportPendingAdvances = () => {
        if (pendingAdvances.length === 0) {
            alert("No pending advances to export.");
            return;
        }

        const doc = new jsPDF();
        const today = new Date().toLocaleDateString('en-GB');
        const totalAmount = pendingAdvances.reduce((sum, req) => sum + req.amount, 0);
        
        doc.setFontSize(18);
        doc.text("Da Moreno At Town", 14, 22);
        doc.setFontSize(12);
        doc.text("Pending Salary Advances", 14, 30);
        doc.setFontSize(10);
        doc.text(`As of: ${today}`, 14, 36);

        const sortedForPDF = [...pendingAdvances].sort((a, b) =>
            a.staffName.localeCompare(b.staffName)
        );

        // --- PDF Table Header ---
        const head = [['Staff Name', 'Request Date', 'Amount (THB)', 'Max Eligible (THB)']];
        
        // --- PDF Table Body ---
        const body = sortedForPDF.map(req => [
            req.staffName,
            req.date, 
            req.amount.toLocaleString('en-US'),
            req.maxEligible.toLocaleString('en-US')
        ]);
        
        autoTable(doc, {
            startY: 45,
            head: head,
            body: body,
            // --- PDF Table Footer Update ---
            foot: [['Total Pending', '', totalAmount.toLocaleString('en-US'), '']],
            headStyles: { fillColor: [30, 41, 59] }, 
            footStyles: { fontWeight: 'bold', fillColor: [241, 245, 249], textColor: 0 },
            theme: 'striped',
        });

        doc.save(`pending_advances_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const selectedStaffName = getDisplayName(staffList.find(s => s.id === selectedStaffId));

    const staffForDropdown = useMemo(() => {
        const sortedList = [...staffList].sort((a, b) => {
            const nameA = getDisplayName(a);
            const nameB = getDisplayName(b);
            return nameA.localeCompare(nameB);
        });
        if (showArchived) return sortedList;
        return sortedList.filter(s => s.status !== 'inactive');
    }, [staffList, showArchived]);

    const SortableHeader = ({ children, sortKey }) => {
        const isSorted = sortConfig.key === sortKey;
        const Icon = isSorted ? (sortConfig.direction === 'asc' ? ArrowUp : ArrowDown) : null;
        return (
            <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase cursor-pointer hover:bg-gray-600"
                onClick={() => handleSort(sortKey)}
            >
                <div className="flex items-center">
                    <span>{children}</span>
                    {Icon && <Icon className="w-4 h-4 ml-1" />}
                </div>
            </th>
        );
    };

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
                    <div className="flex-grow">
                        <select value={selectedStaffId} onChange={handleStaffChange} className="w-full p-2 bg-gray-700 rounded-md text-white">
                            <option value="">-- Select Staff --</option>
                            {staffForDropdown.map(s => (<option key={s.id} value={s.id}>{getDisplayName(s)}</option>))}
                        </select>
                    </div>
                    <div className="flex items-center flex-shrink-0 pl-2">
                        <input id="showArchived" type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-amber-600 focus:ring-amber-500"/>
                        <label htmlFor="showArchived" className="ml-2 text-sm text-gray-300">Show Archived</label>
                    </div>
                </div>
            </div>

            <section className="mb-10">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-white">Pending Salary Advance Requests</h3>
                    <button
                        onClick={handleExportPendingAdvances}
                        disabled={isLoadingPending || pendingAdvances.length === 0}
                        className="flex items-center bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg text-sm disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                    >
                        <Download className="h-4 w-4 mr-2" />
                        Download PDF
                    </button>
                </div>
                
                <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="bg-gray-700">
                            <tr>
                                {/* 7. Update table headers */}
                                <SortableHeader sortKey="staffName">Staff Name</SortableHeader>
                                <SortableHeader sortKey="date">Date</SortableHeader>
                                <SortableHeader sortKey="amount">Amount</SortableHeader>
                                <SortableHeader sortKey="maxEligible">Max Eligible</SortableHeader>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {/* 8. Update table body */}
                            {isLoadingPending ? (<tr><td colSpan="5" className="text-center py-10 text-gray-500">Loading...</td></tr>) : sortedPendingAdvances.length === 0 ? (<tr><td colSpan="5" className="text-center py-10 text-gray-500">No pending requests.</td></tr>) : (sortedPendingAdvances.map(req => (<tr key={req.id}><td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{req.staffName}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{req.date}</td><td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-amber-400">{req.amount.toLocaleString()}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{req.maxEligible.toLocaleString()} THB</td><td className="px-6 py-4 whitespace-nowrap text-sm text-right space-x-2"><button onClick={() => handleApproveAdvance(req.id)} className="p-2 bg-green-600 rounded-full hover:bg-green-500" title="Approve"><CheckCircle className="h-5 w-5"/></button><button onClick={() => handleRejectAdvance(req.id)} className="p-2 bg-red-600 rounded-full hover:bg-red-500" title="Reject"><XCircle className="h-5 w-5"/></button></td></tr>)))}
                        </tbody>
                    </table>
                </div>
            </section>

            {selectedStaffId ? (
                <div className="space-y-10">
                    <section>
                        <div className="flex justify-between items-center mb-4"><h3 className="text-xl font-semibold text-white">Long-Term Loans</h3><button onClick={handleOpenAddLoanModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><Plus className="h-5 w-5 mr-2" />Add Loan</button></div>
                        <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto"><table className="min-w-full"><thead className="bg-gray-700"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Name</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Total</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Monthly</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Remaining</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Start Date</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-gray-700">{isLoadingLoans ? (<tr><td colSpan="6" className="text-center py-10 text-gray-500">Loading...</td></tr>) : loans.length === 0 ? (<tr><td colSpan="6" className="text-center py-10 text-gray-500">No active loans.</td></tr>) : (loans.map(loan => (<tr key={loan.id} className="hover:bg-gray-700"><td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{loan.loanName}</td><td className="px-6 py-4 text-sm text-gray-300">{loan.totalAmount.toLocaleString()}</td><td className="px-6 py-4 text-sm text-gray-300">{loan.monthlyRepayment.toLocaleString()}</td><td className="px-6 py-4 text-sm font-semibold text-amber-400">{loan.remainingBalance.toLocaleString()}</td><td className="px-6 py-4 text-sm text-gray-300">{loan.startDate}</td><td className="px-6 py-4 text-sm text-right"><button onClick={() => handleOpenEditLoanModal(loan)} className="text-blue-400 hover:text-blue-300 mr-4"><Pencil className="h-5 w-5"/></button><button onClick={() => handleDeleteLoan(loan.id)} className="text-red-400 hover:text-red-300"><Trash2 className="h-5 w-5"/></button></td></tr>)))}</tbody></table></div>
                    </section>
                    <section>
                        <div className="flex justify-between items-center mb-4"><h3 className="text-xl font-semibold text-white">Salary Advances History</h3><button onClick={handleOpenAddAdvanceModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><Plus className="h-5 w-5 mr-2" />Add Advance</button></div>
                        <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto"><table className="min-w-full"><thead className="bg-gray-700"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Amount</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-gray-700">{isLoadingAdvances ? (<tr><td colSpan="4" className="text-center py-10 text-gray-500">Loading...</td></tr>) : advances.length === 0 ? (<tr><td colSpan="4" className="text-center py-10 text-gray-500">No advances for this period.</td></tr>) : (advances.map(adv => (<tr key={adv.id} className="hover:bg-gray-700"><td className="px-6 py-4 text-sm text-gray-300">{adv.date}</td><td className="px-6 py-4 text-sm font-semibold text-amber-400">{adv.amount.toLocaleString()}</td><td className="px-6 py-4 text-sm"><StatusBadge status={adv.status} /></td><td className="px-6 py-4 text-sm text-right"><button onClick={() => handleOpenEditAdvanceModal(adv)} className="text-blue-400 hover:text-blue-300 mr-4"><Pencil className="h-5 w-5"/></button><button onClick={() => handleDeleteAdvance(adv.id)} className="text-red-400 hover:text-red-300"><Trash2 className="h-5 w-5"/></button></td></tr>)))}</tbody></table></div>
                    </section>
                    <section>
                         <div className="flex justify-between items-center mb-4"><h3 className="text-xl font-semibold text-white">Other Monthly Adjustments</h3><button onClick={handleOpenAddAdjustmentModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><Plus className="h-5 w-5 mr-2" />Add Adjustment</button></div>
                         <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto"><table className="min-w-full"><thead className="bg-gray-700"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Description</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Amount</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-gray-700">{isLoadingAdjustments ? (<tr><td colSpan="4" className="text-center py-10 text-gray-500">Loading...</td></tr>) : adjustments.length === 0 ? (<tr><td colSpan="4" className="text-center py-10 text-gray-500">No adjustments for this period.</td></tr>) : (adjustments.map(adj => (<tr key={adj.id} className="hover:bg-gray-700"><td className={`px-6 py-4 text-sm font-semibold ${adj.type === 'Earning' ? 'text-green-400' : 'text-red-400'}`}>{adj.type}</td><td className="px-6 py-4 text-sm text-gray-300">{adj.description}</td><td className="px-6 py-4 text-sm font-semibold text-amber-400">{adj.amount.toLocaleString()}</td><td className="px-6 py-4 text-sm text-right"><button onClick={() => handleOpenEditAdjustmentModal(adj)} className="text-blue-400 hover:text-blue-300 mr-4"><Pencil className="h-5 w-5"/></button><button onClick={() => handleDeleteAdjustment(adj.id)} className="text-red-400 hover:text-red-300"><Trash2 className="h-5 w-5"/></button></td></tr>)))}</tbody></table></div>
                    </section>
                </div>
            ) : (
                <div className="text-center py-10"><p className="text-gray-400">Please select a staff member to view their detailed financial records.</p></div>
            )}
        </div>
    );
}