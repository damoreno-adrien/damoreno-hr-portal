/* src/pages/FinancialsDashboardPage.jsx */

import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { PayEstimateCard } from '../components/FinancialsDashboard/PayEstimateCard';
import { SideCards } from '../components/FinancialsDashboard/SideCards';
import Modal from '../components/common/Modal';
import PayslipDetailView from '../components/Payroll/PayslipDetailView';
import { calculateMonthlyStats } from '../utils/attendanceCalculator';
import * as dateUtils from '../utils/dateUtils';

// Helper to find job details
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
    const [payEstimate, setPayEstimate] = useState(null);
    const [isLoadingEstimate, setIsLoadingEstimate] = useState(true);
    const [latestPayslipForModal, setLatestPayslipForModal] = useState(null);
    const [activeLoans, setActiveLoans] = useState([]);

    useEffect(() => {
        if (!db || !user || !companyConfig) return;

        const fetchData = async () => {
            setIsLoadingEstimate(true);
            try {
                // 1. Fetch Profile
                const profileSnap = await getDoc(doc(db, 'staff_profiles', user.uid));
                if (!profileSnap.exists()) {
                    setIsLoadingEstimate(false);
                    return;
                }
                const rawProfile = { id: profileSnap.id, ...profileSnap.data() };
                const jobInfo = getStaffCurrentJob(rawProfile) || rawProfile;
                const baseSalary = parseFloat(jobInfo.baseSalary) || 0;
                const isBonusEligible = rawProfile.isAttendanceBonusEligible === true;

                // 2. Fetch Active Loans (for SideCards)
                const loansQ = query(collection(db, 'loans'), where('staffId', '==', user.uid), where('status', '==', 'active'));
                const loansSnap = await getDocs(loansQ);
                const loans = loansSnap.docs.map(d => ({id: d.id, ...d.data()}));
                setActiveLoans(loans);

                // 3. Fetch Latest Payslip
                const payslipQ = query(
                    collection(db, 'payslips'), 
                    where('staffId', '==', user.uid), 
                    orderBy('generatedAt', 'desc'), 
                    limit(1)
                );
                const payslipSnap = await getDocs(payslipQ);
                const latestPayslip = !payslipSnap.empty ? payslipSnap.docs[0].data() : null;

                // 4. Fetch This Month's Advances
                const now = new Date();
                const startOfMonthStr = dateUtils.formatISODate(dateUtils.startOfMonth(now));
                const endOfMonthStr = dateUtils.formatISODate(dateUtils.endOfMonth(now));
                
                const advancesQ = query(
                    collection(db, 'salary_advances'), 
                    where('staffId', '==', user.uid), 
                    where('requestDate', '>=', startOfMonthStr),
                    where('requestDate', '<=', endOfMonthStr)
                );
                const advancesSnap = await getDocs(advancesQ);
                const monthAdvances = advancesSnap.docs.map(d => ({id: d.id, ...d.data()}));

                // 5. Calculate Live Stats
                const payPeriod = { month: now.getMonth() + 1, year: now.getFullYear() };
                const stats = await calculateMonthlyStats(db, rawProfile, payPeriod, companyConfig, jobInfo);

                // 6. Calculate Financials (Pro-rated "To Date")
                const dailyRate = baseSalary / 30;
                const hourlyRate = dailyRate / 8; 
                const minuteRate = hourlyRate / 60;
                const daysInMonth = dateUtils.getDaysInMonth(now);
                const currentDay = now.getDate();

                const baseSalaryEarned = (baseSalary / daysInMonth) * currentDay;
                const otPay = (stats.totalOtMinutes || 0) * minuteRate * 1.5;
                
                // --- FIX: Calculate CORRECT Step Bonus ---
                let targetBonusAmount = 0;
                if (isBonusEligible) {
                    const currentStreak = rawProfile.bonusStreak || 0;
                    const nextStreak = currentStreak + 1; // The streak they are fighting for THIS month

                    if (nextStreak === 1) targetBonusAmount = companyConfig.attendanceBonus?.month1 || 400;
                    else if (nextStreak === 2) targetBonusAmount = companyConfig.attendanceBonus?.month2 || 800;
                    else targetBonusAmount = companyConfig.attendanceBonus?.month3 || 1200;
                }
                
                // If they qualified, add it to earnings. If not, 0.
                // But we still pass 'targetBonusAmount' to the card so it can show "Lost: 800"
                const actualBonusEarnings = (isBonusEligible && stats.didQualifyForBonus) ? targetBonusAmount : 0;
                
                const absenceDeduction = (stats.totalAbsencesCount || 0) * dailyRate;
                const lateDeduction = (stats.totalLateMinutes || 0) * minuteRate;
                const sso = Math.min(baseSalary * 0.05, 750);
                const loanDeduction = loans.reduce((sum, loan) => sum + (parseFloat(loan.monthlyDeduction) || 0), 0);
                const advanceDeduction = monthAdvances
                    .filter(a => a.status === 'approved' || a.status === 'paid')
                    .reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

                const totalEarnings = baseSalaryEarned + otPay + actualBonusEarnings;
                const totalDeductions = absenceDeduction + lateDeduction + sso + loanDeduction + advanceDeduction;
                const netPay = totalEarnings - totalDeductions;

                // 7. Build Estimate Object
                const estimate = {
                    estimatedNetPay: netPay, 
                    baseSalaryEarned: baseSalaryEarned,
                    overtimePay: otPay,
                    ssoAllowance: 0, 
                    
                    contractDetails: {
                        payType: 'Monthly',
                        baseSalary: baseSalary,
                        standardHours: 8
                    },

                    potentialBonus: {
                        // Show the target amount (e.g., 400, 800, or 1200)
                        amount: targetBonusAmount,
                        // True = Green (Win), False = Red (Lost)
                        onTrack: isBonusEligible && stats.didQualifyForBonus
                    },

                    deductions: {
                        absences: absenceDeduction,
                        socialSecurity: sso,
                        salaryAdvances: advanceDeduction,
                        loanRepayment: loanDeduction
                    },

                    monthAdvances: monthAdvances,
                    latestPayslip: latestPayslip,
                    stats: stats 
                };

                setPayEstimate(estimate);

            } catch (err) {
                console.error("Error calculating financials:", err);
            } finally {
                setIsLoadingEstimate(false);
            }
        };

        fetchData();
    }, [db, user, companyConfig]);

    const handleViewLatestPayslip = () => {
        if (payEstimate?.latestPayslip) {
            setLatestPayslipForModal({ 
                details: payEstimate.latestPayslip, 
                payPeriod: { 
                    month: payEstimate.latestPayslip.payPeriodMonth, 
                    year: payEstimate.latestPayslip.payPeriodYear 
                } 
            });
        }
    };

    const closeModal = () => setLatestPayslipForModal(null);

    return (
        <div>
            {latestPayslipForModal && (
                 <Modal isOpen={true} onClose={closeModal} title={`Payslip Details`}>
                    <PayslipDetailView
                        details={latestPayslipForModal.details}
                        companyConfig={companyConfig}
                        payPeriod={latestPayslipForModal.payPeriod}
                    />
                </Modal>
            )}

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">My Financials</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <PayEstimateCard
                        payEstimate={payEstimate}
                        isLoading={isLoadingEstimate}
                    />
                </div>

                <SideCards
                    payEstimate={payEstimate}
                    isLoading={isLoadingEstimate}
                    onViewLatestPayslip={handleViewLatestPayslip}
                    loans={activeLoans} 
                />
            </div>
        </div>
    );
};