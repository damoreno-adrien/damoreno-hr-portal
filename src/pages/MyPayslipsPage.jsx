import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import Modal from '../components/Modal';
import PayslipDetailView from '../components/PayslipDetailView'; // New Import
import * as dateUtils from '../utils/dateUtils'; // Use new standard

const formatCurrency = (num) => num ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function MyPayslipsPage({ db, user, companyConfig }) {
    const [payslips, setPayslips] =useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPayslip, setSelectedPayslip] = useState(null);

    useEffect(() => {
        if (!db || !user) return;

        const q = query(
            collection(db, 'payslips'), 
            where('staffId', '==', user.uid),
            orderBy('generatedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const payslipData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPayslips(payslipData);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching payslips: ", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [db, user]);

    return (
        <div>
            {selectedPayslip && (
                <Modal isOpen={true} onClose={() => setSelectedPayslip(null)} title={`Payslip for ${months[selectedPayslip.payPeriodMonth - 1]} ${selectedPayslip.payPeriodYear}`}>
                    <PayslipDetailView details={selectedPayslip} companyConfig={companyConfig} payPeriod={{ month: selectedPayslip.payPeriodMonth, year: selectedPayslip.payPeriodYear }} />
                </Modal>
            )}

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">My Payslips</h2>
            
            <div className="bg-gray-800 rounded-lg shadow-lg">
                <div className="divide-y divide-gray-700">
                    {isLoading ? (
                        <p className="text-center py-10 text-gray-400">Loading payslip history...</p>
                    ) : payslips.length > 0 ? (
                        payslips.map(payslip => (
                            <button key={payslip.id} onClick={() => setSelectedPayslip(payslip)} className="w-full text-left p-4 flex justify-between items-center hover:bg-gray-700 transition-colors">
                                <div>
                                    <p className="font-bold text-white">{months[payslip.payPeriodMonth - 1]} {payslip.payPeriodYear}</p>
                                    <p className="text-sm text-gray-400">Generated on: {dateUtils.formatDisplayDate(payslip.generatedAt)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-gray-300">Net Pay</p>
                                    <p className="font-semibold text-amber-400">{formatCurrency(payslip.netPay)} THB</p>
                                </div>
                            </button>
                        ))
                    ) : (
                        <p className="text-center py-10 text-gray-400">No payslip history found.</p>
                    )}
                </div>
            </div>
        </div>
    );
}