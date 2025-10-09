import React, { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from '../components/Modal';

const getCurrentJob = (staff) => {
    if (!staff?.jobHistory || staff.jobHistory.length === 0) {
        return { rate: 0, payType: 'Monthly' };
    }
    const latestJob = staff.jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
    if (latestJob.rate === undefined && latestJob.baseSalary !== undefined) {
        return { ...latestJob, rate: latestJob.baseSalary, payType: 'Monthly' };
    }
    return latestJob;
};

const calculateHours = (start, end) => {
    if (!start?.toDate || !end?.toDate) return 0;
    const diffMillis = end.toDate() - start.toDate();
    return diffMillis / (1000 * 60 * 60);
};

export default function PayrollPage({ db, staffList, companyConfig }) {
    const [payPeriod, setPayPeriod] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
    const [payrollData, setPayrollData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedStaffDetails, setSelectedStaffDetails] = useState(null);

    const handleGeneratePayroll = async () => {
        if (!companyConfig) {
            setError("Company settings are not loaded yet. Please wait a moment and try again.");
            return;
        }
        setIsLoading(true);
        setError('');
        
        try {
            // ... (Data fetching logic is the same as before)

            // --- UPDATED: Call the bonus function for each staff member ---
            const functions = getFunctions();
            const calculateBonus = httpsCallable(functions, 'calculateAndApplyBonus');
            
            const bonusPromises = staffList.map(staff => 
                calculateBonus({ staffId: staff.id, payPeriod })
                    .then(result => ({ staffId: staff.id, bonusAmount: result.data.bonusAmount }))
                    .catch(err => {
                        console.error(`Bonus calculation failed for ${staff.fullName}:`, err);
                        return { staffId: staff.id, bonusAmount: 0 }; // Default to 0 on error
                    })
            );
            const bonusResults = await Promise.all(bonusPromises);
            const bonusMap = new Map(bonusResults.map(res => [res.staffId, res.bonusAmount]));
            
            // ... (Main payroll calculation logic remains the same)

            const data = staffList.map(staff => {
                // ... (The entire inside of this map function is the same as before)
                
                // --- NEW: Apply the fetched bonus ---
                const bonus = bonusMap.get(staff.id) || 0;

                return {
                    // ... (all other returned properties)
                    adjustments: bonus,
                    notes: bonus > 0 ? `Attendance Bonus (Streak)` : '',
                    // ... (all other returned properties)
                };
            });
            setPayrollData(data);
        } catch (err) {
            // ... (Error handling remains the same)
        } finally {
            setIsLoading(false);
        }
    };

    // ... (The rest of the component remains exactly the same)
};