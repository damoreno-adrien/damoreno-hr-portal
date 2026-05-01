/* src/hooks/useFinancials.js */
import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';

export default function useFinancials(db, staffList, activeBranch, adminBranchIds, userRole, payPeriod, staffFilterId) {
    const [globalAdvances, setGlobalAdvances] = useState([]);
    const [globalLoans, setGlobalLoans] = useState([]);
    const [globalAdjustments, setGlobalAdjustments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // --- NOUVEAU: État pour gérer la modale de confirmation ---
    const [confirmState, setConfirmState] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null
    });

    const getDisplayName = (staff) => staff?.nickname || staff?.firstName || staff?.fullName || 'Unknown';

    // 1. FETCH GLOBAL
    useEffect(() => {
        if (!db || !staffList || staffList.length === 0) return;
        setIsLoading(true);

        const filterTarget = (item) => {
            if (staffFilterId && item.staffId !== staffFilterId) return false;
            const staff = staffList.find(s => s.id === item.staffId);
            if (!staff || staff.status === 'inactive') return false;
            if (activeBranch === 'global') {
                if (userRole === 'admin') return adminBranchIds.includes(staff.branchId);
                return true;
            }
            return staff.branchId === activeBranch;
        };

        const hydrateData = (item) => {
            const staff = staffList.find(s => s.id === item.staffId);
            return { ...item, staff, staffName: getDisplayName(staff), branchId: staff?.branchId };
        };

        const unsubAdvances = onSnapshot(collection(db, 'salary_advances'), snap => {
            setGlobalAdvances(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(filterTarget).map(hydrateData));
            setIsLoading(false);
        });

        const unsubAdjustments = onSnapshot(collection(db, 'monthly_adjustments'), snap => {
            setGlobalAdjustments(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(filterTarget).map(hydrateData));
        });

        const unsubLoans = onSnapshot(collection(db, 'loans'), snap => {
            setGlobalLoans(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(filterTarget).map(hydrateData));
        });

        return () => { unsubAdvances(); unsubAdjustments(); unsubLoans(); };
    }, [db, activeBranch, adminBranchIds, userRole, staffList, staffFilterId]);

    // 2. SÉPARATION INTELLIGENTE
    const { pendingTransactions, monthlyTransactions } = useMemo(() => {
        const pendings = [];
        const monthlies = [];

        const selectedMonth = payPeriod.month;
        const selectedYear = payPeriod.year;
        const endOfSelectedMonth = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);

        const getCreatedDate = (item, fallback) => item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toISOString().split('T')[0] : fallback || new Date().toISOString().split('T')[0];

        globalAdvances.forEach(adv => {
            const item = { id: adv.id, category: 'advance', type: 'Salary Advance', staffName: adv.staffName, staff: adv.staff, date: getCreatedDate(adv, adv.date), amount: adv.amount, status: adv.status, raw: adv };
            if (adv.status === 'pending') pendings.push(item);
            else if (adv.payPeriodMonth === selectedMonth && adv.payPeriodYear === selectedYear) monthlies.push(item);
        });

        globalAdjustments.forEach(adj => {
            if (adj.payPeriodMonth === selectedMonth && adj.payPeriodYear === selectedYear) {
                monthlies.push({ id: adj.id, category: 'adjustment', type: `Adjustment (${adj.type})`, staffName: adj.staffName, staff: adj.staff, date: getCreatedDate(adj, adj.date || `${adj.payPeriodYear}-${String(adj.payPeriodMonth).padStart(2, '0')}-01`), amount: adj.amount, status: 'applied', raw: adj });
            }
        });

        globalLoans.forEach(loan => {
            const txDate = getCreatedDate(loan, loan.startDate);
            const status = loan.status === 'pending' ? 'pending' : (loan.status || ((loan.remainingBalance || 0) > 0 ? 'active' : 'paid_off'));
            
            const item = { id: loan.id, category: 'loan', type: 'Long-Term Loan', staffName: loan.staffName, staff: loan.staff, date: txDate, amount: loan.totalAmount, status: status, raw: loan };

            if (status === 'pending') {
                pendings.push(item);
            } else {
                const loanStartDate = new Date(txDate);
                if (loanStartDate <= endOfSelectedMonth) {
                    monthlies.push(item);
                }
            }
        });

        return { pendingTransactions: pendings, monthlyTransactions: monthlies };
    }, [globalAdvances, globalLoans, globalAdjustments, payPeriod]);

    // --- MODIFIÉ: Préparation de la modale au lieu de l'alerte native ---
    const deleteRecord = (collectionName, id) => {
        setConfirmState({
            isOpen: true,
            title: "Delete Record",
            message: "Are you sure you want to delete this transaction? This action cannot be undone.",
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, collectionName, id));
                } catch (error) {
                    console.error("Error deleting record:", error);
                } finally {
                    // Ferme la modale une fois l'action terminée
                    setConfirmState({ isOpen: false, title: '', message: '', onConfirm: null });
                }
            }
        });
    };

    const updateRecord = async (collectionName, id, data) => await updateDoc(doc(db, collectionName, id), data);

    // --- NOUVEAU: Fonction pour annuler (fermer la modale) ---
    const closeConfirm = () => setConfirmState({ isOpen: false, title: '', message: '', onConfirm: null });

    // On exporte confirmState et closeConfirm pour le composant visuel
    return { 
        pendingTransactions, monthlyTransactions, globalLoans, globalAdvances, isLoading, deleteRecord, updateRecord,
        confirmState, closeConfirm 
    };
}