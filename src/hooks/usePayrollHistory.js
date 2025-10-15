import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function usePayrollHistory(db) {
    const [history, setHistory] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);

    useEffect(() => {
        if (!db) return;
        setIsLoadingHistory(true);
        const q = query(collection(db, 'payslips'), orderBy('generatedAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const payslips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const grouped = payslips.reduce((acc, payslip) => {
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
                acc[key].totalAmount += payslip.netPay;
                return acc;
            }, {});

            const historyArray = Object.values(grouped).sort((a, b) => {
                if (a.year !== b.year) return b.year - a.year;
                return b.month - a.month;
            });
            
            setHistory(historyArray);
            setIsLoadingHistory(false);
        });

        return () => unsubscribe();
    }, [db]);

    return { history, isLoadingHistory };
}