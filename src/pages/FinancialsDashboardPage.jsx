/* src/pages/FinancialsDashboardPage.jsx */

import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import usePermissions from '../hooks/usePermissions';
import { Shield } from 'lucide-react';
import { PayEstimateCard } from '../components/FinancialsDashboard/PayEstimateCard';
import { SideCards } from '../components/FinancialsDashboard/SideCards';
import Modal from '../components/common/Modal';
import PayslipDetailView from '../components/Payroll/PayslipDetailView';
import RequestLoanModal from '../components/FinancialsDashboard/RequestLoanModal';
import { calculateMonthlyStats } from '../utils/attendanceCalculator';
import * as dateUtils from '../utils/dateUtils';

const getStaffCurrentJob = (staff) => {
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
    const { loadingPermissions } = usePermissions(db, user?.role, user?.uid);

    const [payEstimate, setPayEstimate] = useState(null);
    const [isLoadingEstimate, setIsLoadingEstimate] = useState(true);
    const [latestPayslipForModal, setLatestPayslipForModal] = useState(null);
    const [staffLoans, setStaffLoans] = useState([]);
    const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);

    const fetchFinancialData = async () => {
        setIsLoadingEstimate(true);
        try {
            const profileSnap = await getDoc(doc(db, 'staff_profiles', user.uid));
            if (!profileSnap.exists()) return;
            
            const rawProfile = { id: profileSnap.id, ...profileSnap.data() };
            const jobInfo = getStaffCurrentJob(rawProfile) || rawProfile;
            const baseSalary = parseFloat(jobInfo.baseSalary) || 0;
            const isBonusEligible = rawProfile.isAttendanceBonusEligible !== false;

            const loansQ = query(collection(db, 'loans'), where('staffId', '==', user.uid));
            const loansSnap = await getDocs(loansQ);
            const allLoans = loansSnap.docs.map(d => ({id: d.id, ...d.data()}));
            setStaffLoans(allLoans);

            const activeLoansToDeduct = allLoans.filter(l => l.status === 'active' || (l.status === undefined && l.isActive === true));

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

            const branchOverrides = rawProfile.branchId && companyConfig.branchSettings ? companyConfig.branchSettings[rawProfile.branchId] : {};
            const resolvedConfig = { ...companyConfig, ...branchOverrides };

            const dailyRate = baseSalary / 30;
            const standardHours = Number(resolvedConfig.standardDayHours) || 8;
            const hourlyRate = dailyRate / standardHours; 
            const minuteRate = hourlyRate / 60;
            const daysInMonth = dateUtils.getDaysInMonth(now);
            const currentDay = now.getDate();

            const baseSalaryEarned = (baseSalary / daysInMonth) * currentDay;
            
            const overtimeRateMultiplier = Number(resolvedConfig.overtimeRate) || 1.5;
            const otPay = (stats.totalOtMinutes || 0) * minuteRate * overtimeRateMultiplier;
            
            let targetBonusAmount = 0;
            if (isBonusEligible && stats.isBonusActive) {
                const currentStreak = rawProfile.bonusStreak || 0;
                const bonusSettings = resolvedConfig.attendanceBonus || {};
                
                if (currentStreak === 1) targetBonusAmount = bonusSettings.month1 || 400;
                else if (currentStreak === 2) targetBonusAmount = bonusSettings.month2 || 800;
                else if (currentStreak >= 3) targetBonusAmount = bonusSettings.month3 || 1200;
                else targetBonusAmount = 0;
                
                let isFirstMonth = false;
                if (rawProfile.startDate) {
                    const jsDate = dateUtils.fromFirestore(rawProfile.startDate);
                    if (jsDate && jsDate.getFullYear() === now.getFullYear() && jsDate.getMonth() === now.getMonth()) {
                        isFirstMonth = true;
                    }
                }
                if (isFirstMonth) targetBonusAmount = 0;
            }
            
            const actualBonusEarnings = (isBonusEligible && stats.didQualifyForBonus) ? targetBonusAmount : 0;
            const estimatedGross = baseSalaryEarned + otPay + actualBonusEarnings;

            let sso = 0, ssoAllowanceAmount = 0;
            const isSsoActive = rawProfile.isSsoRegistered !== false;

            if (isSsoActive && baseSalary > 0) {
                const ssoRate = (Number(resolvedConfig.ssoRate) || 5) / 100;
                const ssoMax = Number(resolvedConfig.ssoCap) || 750;
                
                const ssoBasis = jobInfo.payType === 'Hourly' ? estimatedGross : baseSalary;
                sso = Math.min(Math.max(1650, ssoBasis) * ssoRate, ssoMax);
                
                if (rawProfile.receivesSsoAllowance !== false) {
                    ssoAllowanceAmount = sso;
                } else {
                    ssoAllowanceAmount = 0;
                }
            }

            const absenceDeduction = (stats.totalAbsencesCount || 0) * dailyRate;
            
            // CORRECTION: Seules les minutes approuvées impactent le Dashboard Staff
            const lateDeduction = (Number(stats.totalApprovedLateMinutes) || 0) * minuteRate;
            
            const loanDeduction = activeLoansToDeduct.reduce((sum, loan) => sum + (parseFloat(loan.monthlyRepayment) || parseFloat(loan.monthlyInstallment) || 0), 0);
            const advanceDeduction = monthAdvances.filter(a => a.status === 'approved' || a.status === 'paid').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

            const totalEarnings = estimatedGross + ssoAllowanceAmount;
            const totalDeductions = absenceDeduction + lateDeduction + sso + loanDeduction + advanceDeduction;
            const netPay = totalEarnings - totalDeductions;

            setPayEstimate({
                estimatedNetPay: netPay, baseSalaryEarned, overtimePay: otPay, ssoAllowance: ssoAllowanceAmount, 
                isSsoActive,
                contractDetails: { payType: 'Monthly', baseSalary, standardHours: standardHours },
                potentialBonus: { amount: targetBonusAmount, onTrack: isBonusEligible && stats.didQualifyForBonus && stats.isBonusActive },
                deductions: { absences: absenceDeduction, lateness: lateDeduction, socialSecurity: sso, salaryAdvances: advanceDeduction, loanRepayment: loanDeduction },
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

    const handleViewLatestPayslip = () => {
        if (payEstimate?.latestPayslip) {
            setLatestPayslipForModal({ 
                details: payEstimate.latestPayslip, 
                payPeriod: { month: payEstimate.latestPayslip.payPeriodMonth, year: payEstimate.latestPayslip.payPeriodYear } 
            });
        }
    };
    
    const closeModal = () => setLatestPayslipForModal(null);

    if (loadingPermissions) return (
        <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
        </div>
    );

    return (
        <div>
            {latestPayslipForModal && (
                 <Modal isOpen={true} onClose={closeModal} title="Historical Record">
                    <PayslipDetailView details={latestPayslipForModal.details} companyConfig={companyConfig} payPeriod={latestPayslipForModal.payPeriod} />
                </Modal>
            )}

            <RequestLoanModal 
                isOpen={isLoanModalOpen} 
                onClose={() => setIsLoanModalOpen(false)} 
                db={db} 
                user={user} 
                onSuccess={fetchFinancialData} 
                staffBaseSalary={payEstimate?.contractDetails?.baseSalary || 0} 
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
                    loans={staffLoans} 
                    onOpenLoanModal={() => setIsLoanModalOpen(true)} 
                />
            </div>
        </div>
    );
}