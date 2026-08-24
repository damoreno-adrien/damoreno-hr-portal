/* src/hooks/usePayrollHistory.js */
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Ajout des paramètres de filtrage : activeBranch, userRole, adminBranchIds
export default function usePayrollHistory(db, activeBranch, userRole, adminBranchIds = []) {
    const [history, setHistory] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);

    useEffect(() => {
        if (!db) return;
        setIsLoadingHistory(true);
        
        // On récupère toujours l'intégralité pour le tri par date de génération
        const q = query(collection(db, 'payslips'), orderBy('generatedAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allPayslips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // --- COUCHE DE SÉCURITÉ ET FILTRAGE PAR SUCCURSALE ---
            const filteredPayslips = allPayslips.filter(payslip => {
                if (activeBranch === 'global') {
                    if (userRole === 'super_admin') return true; // Seul le super admin voit TOUT
                    // Les autres (Admin, Manager, ou Staff avec dérogation) sont restreints à leurs branches
                    return adminBranchIds.includes(payslip.branchId); 
                } else if (activeBranch) {
                    // Filtrage strict sur la succursale sélectionnée dans la Sidebar
                    return payslip.branchId === activeBranch;
                }
                return true;
            });

            // On groupe les fiches de paie filtrées par période
            const grouped = filteredPayslips.reduce((acc, payslip) => {
                const key = `${payslip.payPeriodYear}-${payslip.payPeriodMonth}`;
                if (!acc[key]) {
                    acc[key] = {
                        id: key,
                        year: payslip.payPeriodYear,
                        month: payslip.payPeriodMonth,
                        monthName: months[payslip.payPeriodMonth - 1],
                        payslips: [],
                        totalAmount: 0,
                    };
                }
                acc[key].payslips.push(payslip);
                acc[key].totalAmount += (Number(payslip.netPay) || 0);
                return acc;
            }, {});

            const historyArray = Object.values(grouped).sort((a, b) => {
                if (a.year !== b.year) return b.year - a.year;
                return b.month - a.month;
            });
            
            setHistory(historyArray);
            setIsLoadingHistory(false);
        }, (error) => {
            console.error("Error fetching payroll history:", error);
            setIsLoadingHistory(false);
        });

        return () => unsubscribe();
    }, [db, activeBranch, userRole, adminBranchIds]); // Dépendances mises à jour

    return { history, isLoadingHistory };
}