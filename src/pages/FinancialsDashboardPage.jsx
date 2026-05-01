/* src/pages/FinancialsDashboardPage.jsx */

import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { PayEstimateCard } from '../components/FinancialsDashboard/PayEstimateCard';
import { SideCards } from '../components/FinancialsDashboard/SideCards';
import Modal from '../components/common/Modal';
import PayslipDetailView from '../components/Payroll/PayslipDetailView';
import RequestLoanModal from '../components/FinancialsDashboard/RequestLoanModal'; // <-- NOUVEL IMPORT
import { calculateMonthlyStats } from '../utils/attendanceCalculator';
import * as dateUtils from '../utils/dateUtils';


const getStaffCurrentJob = (staff) => { /* ... (reste inchangé) ... */
    if (!staff) return null;
    if (staff.baseSalary) return staff;
    if (!staff.jobHistory || staff.jobHistory.length === 0) return null;
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB;
    })[0];
};

export default function FinancialsDashboardPage({ db, user, companyConfig }) {
    const [payEstimate, setPayEstimate] = useState(null);
    const [isLoadingEstimate, setIsLoadingEstimate] = useState(true);
    const [latestPayslipForModal, setLatestPayslipForModal] = useState(null);
    
    // CHANGEMENT ICI : On va stocker TOUS les prêts du staff
    const [staffLoans, setStaffLoans] = useState([]);
    
    // ÉTAT DE LA MODALE
    const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);

    // Fonction pour rafraichir les données après une demande
    const fetchFinancialData = async () => {
        setIsLoadingEstimate(true);
        try {
            const profileSnap = await getDoc(doc(db, 'staff_profiles', user.uid));
            if (!profileSnap.exists()) return;
            const rawProfile = { id: profileSnap.id, ...profileSnap.data() };
            const jobInfo = getStaffCurrentJob(rawProfile) || rawProfile;
            const baseSalary = parseFloat(jobInfo.baseSalary) || 0;
            const isBonusEligible = rawProfile.isAttendanceBonusEligible !== false;

            // --- CHANGEMENT ICI : On récupère TOUS les prêts sans filtrer sur isActive ---
            const loansQ = query(collection(db, 'loans'), where('staffId', '==', user.uid));
            const loansSnap = await getDocs(loansQ);
            const allLoans = loansSnap.docs.map(d => ({id: d.id, ...d.data()}));
            setStaffLoans(allLoans);

            // On filtre localement les prêts vraiment actifs pour le calcul de la paie
            // C'EST ICI LA RETROCOMPATIBILITÉ !
            const activeLoansToDeduct = allLoans.filter(l => l.status === 'active' || (l.status === undefined && l.isActive === true));

            // ... (Suite du fetch identique : payslipQ, advancesQ, stats) ...
            const payslipQ = query(collection(db, 'payslips'), where('staffId', '==', user.uid), orderBy('generatedAt', 'desc'), limit(1));
            const payslipSnap = await getDocs(payslipQ);
            const latestPayslip = !payslipSnap.empty ? payslipSnap.docs[0].data() : null;

            const now = new Date();
            const startOfMonthStr = dateUtils.formatISODate(dateUtils.startOfMonth(now));
            const endOfMonthStr = dateUtils.formatISODate(dateUtils.endOfMonth(now));
            
            const advancesQ = query(collection(db, 'salary_advances'), where('staffId', '==', user.uid), where('date', '>=', startOfMonthStr), where('date', '<=', endOfMonthStr));
            const advancesSnap = await getDocs(advancesQ);
            const monthAdvances = advancesSnap.docs.map(d => ({id: d.id, ...d.data()}));

            const payPeriod = { month: now.getMonth() + 1, year: now.getFullYear() };
            const stats = await calculateMonthlyStats(db, rawProfile, payPeriod, companyConfig, jobInfo);

            const dailyRate = baseSalary / 30;
            const hourlyRate = dailyRate / 8; 
            const minuteRate = hourlyRate / 60;
            const daysInMonth = dateUtils.getDaysInMonth(now);
            const currentDay = now.getDate();

            const baseSalaryEarned = (baseSalary / daysInMonth) * currentDay;
            const otPay = (stats.totalOtMinutes || 0) * minuteRate * 1.5;
            
            let targetBonusAmount = 0;
            if (isBonusEligible) {
                const currentStreak = rawProfile.bonusStreak || 0;
                const nextStreak = currentStreak + 1;
                if (nextStreak === 1) targetBonusAmount = companyConfig.attendanceBonus?.month1 || 400;
                else if (nextStreak === 2) targetBonusAmount = companyConfig.attendanceBonus?.month2 || 800;
                else targetBonusAmount = companyConfig.attendanceBonus?.month3 || 1200;
            }
            
            const actualBonusEarnings = (isBonusEligible && stats.didQualifyForBonus) ? targetBonusAmount : 0;
            const estimatedGross = baseSalaryEarned + otPay + actualBonusEarnings;

            let sso = 0, ssoAllowanceAmount = 0;
            if (rawProfile.isSsoRegistered !== false && estimatedGross > 0) {
                const ssoRate = (companyConfig.financialRules?.ssoRate || 5) / 100;
                const ssoMax = Number(companyConfig.financialRules?.ssoMaxContribution) || 875;
                sso = Math.min(Math.max(1650, estimatedGross) * ssoRate, ssoMax);
                ssoAllowanceAmount = sso;
            }

            const absenceDeduction = (stats.totalAbsencesCount || 0) * dailyRate;
            const lateDeduction = (stats.totalLateMinutes || 0) * minuteRate;
            
            // --- CHANGEMENT ICI : On utilise activeLoansToDeduct ---
            const loanDeduction = activeLoansToDeduct.reduce((sum, loan) => sum + (parseFloat(loan.monthlyRepayment) || parseFloat(loan.monthlyInstallment) || 0), 0);
            
            const advanceDeduction = monthAdvances.filter(a => a.status === 'approved' || a.status === 'paid').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

            const totalEarnings = estimatedGross + ssoAllowanceAmount;
            const totalDeductions = absenceDeduction + lateDeduction + sso + loanDeduction + advanceDeduction;
            const netPay = totalEarnings - totalDeductions;

            setPayEstimate({
                estimatedNetPay: netPay, baseSalaryEarned, overtimePay: otPay, ssoAllowance: ssoAllowanceAmount, 
                contractDetails: { payType: 'Monthly', baseSalary, standardHours: 8 },
                potentialBonus: { amount: targetBonusAmount, onTrack: isBonusEligible && stats.didQualifyForBonus },
                deductions: { absences: absenceDeduction, socialSecurity: sso, salaryAdvances: advanceDeduction, loanRepayment: loanDeduction },
                monthAdvances, latestPayslip, stats 
            });

        } catch (err) {
            console.error("Error calculating financials:", err);
        } finally {
            setIsLoadingEstimate(false);
        }
    };

    useEffect(() => {
        if (db && user && companyConfig) fetchFinancialData();
    }, [db, user, companyConfig]);

    const handleViewLatestPayslip = () => { /* ...inchangé... */
        if (payEstimate?.latestPayslip) {
            setLatestPayslipForModal({ 
                details: payEstimate.latestPayslip, 
                payPeriod: { month: payEstimate.latestPayslip.payPeriodMonth, year: payEstimate.latestPayslip.payPeriodYear } 
            });
        }
    };
    const closeModal = () => setLatestPayslipForModal(null);

    return (
        <div>
            {latestPayslipForModal && (
                 <Modal isOpen={true} onClose={closeModal} title={`Payslip Details`}>
                    <PayslipDetailView details={latestPayslipForModal.details} companyConfig={companyConfig} payPeriod={latestPayslipForModal.payPeriod} />
                </Modal>
            )}

            {/* MODALE DE DEMANDE DE PRÊT */}
            <RequestLoanModal 
                isOpen={isLoanModalOpen} 
                onClose={() => setIsLoanModalOpen(false)} 
                db={db} 
                user={user} 
                onSuccess={fetchFinancialData} 
                staffBaseSalary={payEstimate?.contractDetails?.baseSalary || 0} // <-- LE SALAIRE EST PASSÉ ICI !
            />

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">My Financials</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <PayEstimateCard payEstimate={payEstimate} isLoading={isLoadingEstimate} />
                </div>

                <SideCards
                    payEstimate={payEstimate}
                    isLoading={isLoadingEstimate}
                    onViewLatestPayslip={handleViewLatestPayslip}
                    loans={staffLoans} // On passe TOUS les prêts à SideCards
                    onOpenLoanModal={() => setIsLoanModalOpen(true)} // On passe la fonction pour ouvrir la modale
                />
            </div>
        </div>
    );
}