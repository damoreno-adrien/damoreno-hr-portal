/* src/hooks/usePayrollGenerator.js */

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../firebase"
import * as dateUtils from '../utils/dateUtils';
import { calculateMonthlyStats } from '../utils/attendanceCalculator';
import { calculateStaffLeaveBalances } from '../utils/leaveCalculator';

const functionsAsia = getFunctions(app, "asia-southeast1");
const finalizeAndStorePayslips = httpsCallable(functionsAsia, 'finalizeAndStorePayslips');

const getCurrentJob = (staff) => {
    if (!staff?.jobHistory || staff.jobHistory.length === 0) {
        return { rate: 0, payType: 'Salary', department: 'N/A', baseSalary: 0, standardDayHours: 8 };
    }
    const latestJob = [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB;
    })[0];

    let type = latestJob.payType || 'Salary';
    const lowerType = type.toLowerCase().trim();
    if (lowerType === 'monthly' || lowerType === 'salary') type = 'Salary';

    return {
        ...latestJob, payType: type,
        baseSalary: Number(latestJob.baseSalary) || Number(latestJob.rate) || 0,
        hourlyRate: Number(latestJob.hourlyRate) || Number(latestJob.rate) || 0,
        standardDayHours: Number(latestJob.standardDayHours) || 8
    };
};

export default function usePayrollGenerator(db, staffList, companyConfig, payPeriod, activeBranch) {
    const [payrollData, setPayrollData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [error, setError] = useState('');
    const [isMonthFullyFinalized, setIsMonthFullyFinalized] = useState(false);
    const [selectedForPayroll, setSelectedForPayroll] = useState(new Set());

    const [pendingAdvancesCount, setPendingAdvancesCount] = useState(0);
    const [pendingLoansCount, setPendingLoansCount] = useState(0);

    // States pour gérer les modales depuis le composant parent
    const [feedbackModal, setFeedbackModal] = useState(null);
    const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });

    useEffect(() => {
        setPayrollData([]);
        setIsMonthFullyFinalized(false);
        setError('');
        setSelectedForPayroll(new Set());
        setPendingAdvancesCount(0);
        setPendingLoansCount(0);
        setFeedbackModal(null);
        setConfirmState({ isOpen: false });
    }, [activeBranch, payPeriod]);

    const handleGeneratePayroll = async () => {
        const now = new Date();
        const currentYear = dateUtils.getYear(now);
        const currentMonth = dateUtils.getMonth(now);
        const payPeriodDate = dateUtils.parseISODateString(`${payPeriod.year}-${String(payPeriod.month).padStart(2, '0')}-01`);

        if (payPeriod.year > currentYear || (payPeriod.year === currentYear && payPeriod.month > currentMonth)) {
            setError("Cannot generate payroll for a future period.");
            setPayrollData([]); setIsMonthFullyFinalized(false); return;
        }
        if (!companyConfig) { setError("Company settings are not loaded yet."); return; }
        if (!staffList || staffList.length === 0) { setError("Staff list is not loaded yet."); return; }

        setIsLoading(true); setError(''); setIsMonthFullyFinalized(false);

        try {
            const startOfMonth = dateUtils.startOfMonth(payPeriodDate);
            const endOfMonth = dateUtils.endOfMonth(payPeriodDate);
            const startDateStr = dateUtils.formatISODate(startOfMonth);
            const endDateStr = dateUtils.formatISODate(endOfMonth);

            const finalizedPayslipsSnap = await getDocs(query(collection(db, "payslips"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month)));
            const finalizedStaffIds = new Set(finalizedPayslipsSnap.docs.map(doc => doc.data().staffId));

            const staffToProcess = staffList.filter(staff => {
                const isAlreadyFinalized = finalizedStaffIds.has(staff.id);
                const staffStartDate = dateUtils.fromFirestore(staff.startDate);
                const staffEndDate = dateUtils.fromFirestore(staff.endDate);
                if (!staffStartDate) return false;
                const isActiveInPeriod = staffStartDate <= endOfMonth && (!staffEndDate || staffEndDate >= startOfMonth);
                return !isAlreadyFinalized && isActiveInPeriod;
            });

            if (staffToProcess.length === 0 && staffList.length > 0) {
                const eligibleStaffIds = new Set(staffList.filter(s => {
                    const sStart = dateUtils.fromFirestore(s.startDate);
                    const sEnd = dateUtils.fromFirestore(s.endDate);
                    if (!sStart) return false;
                    return sStart <= endOfMonth && (!sEnd || sEnd >= startOfMonth);
                }).map(s => s.id)
                );
                if ([...eligibleStaffIds].every(id => finalizedStaffIds.has(id)) && eligibleStaffIds.size > 0) {
                    setIsMonthFullyFinalized(true); setPayrollData([]); setIsLoading(false); return;
                }
            }

            const staffWithJobs = staffToProcess.map(staff => ({ ...staff, currentJob: getCurrentJob(staff) }));

            const [advancesSnap, loansSnap, adjustmentsSnap, approvedOtSnap, attendanceSnap, cashOutsSnap, allStaffStats, allApprovedLeaveSnap] = await Promise.all([
                getDocs(query(collection(db, "salary_advances"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month))),
                getDocs(collection(db, "loans")),
                getDocs(query(collection(db, "monthly_adjustments"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month))),
                getDocs(query(collection(db, "attendance"), where("date", ">=", startDateStr), where("date", "<=", endDateStr), where("otStatus", "==", "approved"))),
                getDocs(query(collection(db, "attendance"), where("date", ">=", startDateStr), where("date", "<=", endDateStr))),
                getDocs(query(collection(db, "leave_requests"), where("leaveType", "==", "Cash Out Holiday Credits"), where("status", "==", "approved"), where("startDate", ">=", startDateStr), where("startDate", "<=", endDateStr))),
                Promise.all(staffWithJobs.map(staff => calculateMonthlyStats(db, staff, payPeriod, companyConfig, staff.currentJob).then(stats => ({ staffId: staff.id, ...stats })))),
                getDocs(query(collection(db, "leave_requests"), where("status", "==", "approved")))
            ]);

            const advancesDataAll = advancesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const loansDataAll = loansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const adjustmentsData = adjustmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const approvedOtData = approvedOtSnap.docs.map(doc => doc.data());
            const attendanceData = attendanceSnap.docs.map(doc => doc.data());
            const cashOutsData = cashOutsSnap.docs.map(doc => doc.data());
            const allApprovedLeaveData = allApprovedLeaveSnap.docs.map(doc => doc.data());
            const statsMap = new Map(allStaffStats.map(res => [res.staffId, res]));
            const overtimeRateMultiplier = Number(companyConfig.overtimeRate) || 1.5;

            const approvedAdvances = advancesDataAll.filter(a => a.status === 'approved' || a.status === 'paid');
            const pendingAdvances = advancesDataAll.filter(a => a.status === 'pending');
            const pendingLoans = loansDataAll.filter(l => l.status === 'pending');

            const staffIdsInPayroll = new Set(staffToProcess.map(s => s.id));

            setPendingAdvancesCount(pendingAdvances.filter(a => staffIdsInPayroll.has(a.staffId)).length);
            setPendingLoansCount(pendingLoans.filter(l => staffIdsInPayroll.has(l.staffId)).length);

            const data = staffWithJobs.map(staff => {
                const currentJob = staff.currentJob;
                const stats = statsMap.get(staff.id) || { totalAbsencesCount: 0, daysToDeduct: 0, totalActualMillis: 0 };
                const displayName = `${staff.nickname || staff.firstName || 'Staff'} (${currentJob.department || 'N/A'})`;

                let basePay = 0; let autoDeductions = 0; let hourlyRateForOT = 0; let leavePayout = null;

                const staffStartDate = dateUtils.fromFirestore(staff.startDate);
                const staffEndDate = dateUtils.fromFirestore(staff.endDate);

                if (currentJob.payType === 'Salary') {
                    const salary = Number(currentJob.baseSalary) || 0;
                    const standardHours = Number(currentJob.standardDayHours) || 8;
                    const legalDailyRate = salary / 30;

                    let effectiveStart = startOfMonth;
                    if (staffStartDate && staffStartDate > startOfMonth) effectiveStart = staffStartDate;

                    let effectiveEnd = endOfMonth;
                    if (staffEndDate && staffEndDate < endOfMonth) effectiveEnd = staffEndDate;

                    const isFullMonth = dateUtils.formatISODate(effectiveStart) === dateUtils.formatISODate(startOfMonth) &&
                        dateUtils.formatISODate(effectiveEnd) === dateUtils.formatISODate(endOfMonth);

                    if (isFullMonth) {
                        basePay = salary;
                    } else {
                        const daysActive = dateUtils.differenceInCalendarDays(dateUtils.formatISODate(effectiveEnd), dateUtils.formatISODate(effectiveStart));
                        basePay = Math.min(salary, legalDailyRate * daysActive);
                    }

                    const isLeavingThisMonth = staffEndDate && dateUtils.getYear(staffEndDate) === payPeriod.year && dateUtils.getMonth(staffEndDate) === payPeriod.month;

                    if (isLeavingThisMonth) {
                        let annualDaysToPay = 0; let holidayCreditsToPay = 0;
                        if (staff.offboardingSettings) {
                            const staffLeaveReqs = allApprovedLeaveData.filter(r => r.staffId === staff.id);
                            const liveBalances = calculateStaffLeaveBalances(staff, staffLeaveReqs, companyConfig, staffEndDate);
                            if (liveBalances) {
                                if (staff.offboardingSettings.payoutAnnualLeave) annualDaysToPay = Number(liveBalances.annual.remaining) || 0;
                                if (staff.offboardingSettings.payoutPublicHolidays) holidayCreditsToPay = Number(liveBalances.ph.remaining) || 0;
                            }
                        }
                        leavePayout = { annualDays: annualDaysToPay, holidayCredits: holidayCreditsToPay, dailyRate: legalDailyRate, total: (annualDaysToPay + holidayCreditsToPay) * legalDailyRate };
                    }

                    autoDeductions = (legalDailyRate * (Number(stats.daysToDeduct) || 0)) + (legalDailyRate * (Number(stats.totalAbsencesCount) || 0));
                    hourlyRateForOT = legalDailyRate / standardHours;

                } else {
                    const rate = Number(currentJob.hourlyRate) || 0;
                    basePay = ((Number(stats.totalActualMillis) || 0) / (1000 * 60 * 60)) * rate;
                    autoDeductions = 0; hourlyRateForOT = rate;
                }

                const staffApprovedOT = approvedOtData.filter(ot => ot.staffId === staff.id);
                const totalOtMinutes = staffApprovedOT.reduce((sum, ot) => sum + (Number(ot.otApprovedMinutes) || 0), 0);
                const overtimePay = (totalOtMinutes / 60) * hourlyRateForOT * overtimeRateMultiplier;

                let holidayPayBonus = 0; let cashOutPay = 0;
                const staffProfileHolidayPolicy = staff.holidayPolicy || 'in_lieu';
                const dailyDeductionRate = currentJob.payType === 'Salary' ? (Number(currentJob.baseSalary) || 0) / 30 : (Number(currentJob.hourlyRate) || 0) * (Number(currentJob.standardDayHours) || 8);

                if (staffProfileHolidayPolicy === 'paid') {
                    const periodHolidays = (companyConfig.publicHolidays || []).filter(h => {
                        const hDate = dateUtils.parseISODateString(h.date);
                        return hDate && hDate >= startOfMonth && hDate <= endOfMonth;
                    }).map(h => h.date);

                    const staffAttendance = attendanceData.filter(a => a.staffId === staff.id);
                    const holidaysWorked = periodHolidays.filter(hDate => staffAttendance.some(a => a.date === hDate)).length;
                    if (holidaysWorked > 0) holidayPayBonus = holidaysWorked * dailyDeductionRate * (Number(companyConfig.holidayPayMultiplier) || 1.0);
                }

                const staffCashOuts = cashOutsData.filter(c => c.staffId === staff.id);
                const cashOutCredits = staffCashOuts.reduce((sum, c) => sum + (Number(c.totalDays) || 0), 0);
                if (cashOutCredits > 0) cashOutPay = cashOutCredits * dailyDeductionRate;

                const staffAdjustments = adjustmentsData.filter(a => a.staffId === staff.id);
                const safeOtherEarningsArray = staffAdjustments
                    .filter(a => a.type === 'Earning')
                    .map(a => ({ description: a.description || 'Adjustment', amount: Number(a.amount) || 0 }));

                if (cashOutPay > 0) safeOtherEarningsArray.push({ description: `Holiday Credits Cashed Out (${cashOutCredits})`, amount: cashOutPay });
                if (holidayPayBonus > 0) safeOtherEarningsArray.push({ description: 'Holiday Pay (Worked)', amount: holidayPayBonus });

                const otherEarningsTotal = safeOtherEarningsArray.reduce((sum, i) => sum + i.amount, 0);
                const otherDeductions = staffAdjustments.filter(a => a.type === 'Deduction').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

                const isLeavingThisMonth = staffEndDate && dateUtils.getYear(staffEndDate) === payPeriod.year && dateUtils.getMonth(staffEndDate) === payPeriod.month;
                const attendanceBonus = isLeavingThisMonth ? 0 : (Number(stats.bonusAmount) || 0);
                const bonusInfo = {
                    oldStreak: Number(staff.bonusStreak) || 0,
                    newStreak: isLeavingThisMonth ? (Number(staff.bonusStreak) || 0) : (Number(stats.newStreak) || 0)
                };
                const leavePayoutTotal = leavePayout ? Number(leavePayout.total) || 0 : 0;

                const safeBasePay = Number(basePay) || 0;
                const safeAttendanceBonus = Number(attendanceBonus) || 0;
                const safeOtherEarningsTotal = Number(otherEarningsTotal) || 0;
                const safeOvertimePay = Number(overtimePay) || 0;

                const preSsoEarnings = safeBasePay + safeAttendanceBonus + safeOtherEarningsTotal + leavePayoutTotal + safeOvertimePay;

                const ssoRate = (Number(companyConfig.ssoRate) || 5) / 100;
                const ssoCap = Number(companyConfig.ssoCap) || 750;
                const ssoDeduction = Math.min(Math.max(1650, preSsoEarnings) * ssoRate, ssoCap);
                const ssoAllowance = ssoDeduction;

                const totalEarnings = preSsoEarnings + ssoAllowance;
                const advanceDeduction = approvedAdvances.filter(a => a.staffId === staff.id).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

                const safeAutoDeductions = Number(autoDeductions) || 0;
                const safeSsoDeduction = Number(ssoDeduction) || 0;
                const safeAdvanceDeduction = Number(advanceDeduction) || 0;
                const safeOtherDeductions = Number(otherDeductions) || 0;

                const preLoanDeductions = safeAutoDeductions + safeSsoDeduction + safeAdvanceDeduction + safeOtherDeductions;
                const preLoanNetPay = totalEarnings - preLoanDeductions;

                const staffLoans = loansDataAll.filter(l => {
                    if (l.staffId !== staff.id) return false;
                    if (l.status !== 'active' && l.isActive !== true) return false;
                    if (Number(l.remainingBalance) <= 0) return false;
                    if (l.startDate) {
                        const loanStart = dateUtils.parseISODateString(l.startDate);
                        if (loanStart > endOfMonth) return false;
                    }
                    return true;
                });

                let availableForLoans = Math.max(0, preLoanNetPay);
                let loanDeduction = 0;
                const appliedLoans = [];

                for (const loan of staffLoans) {
                    const remaining = Number(loan.remainingBalance || 0);

                    const rawOverride = loan.nextInstallmentOverride;
                    const hasOverride = rawOverride !== undefined && rawOverride !== null && rawOverride !== '';
                    const overrideAmount = Number(rawOverride);

                    const standardRepayment = Number(loan.monthlyRepayment || loan.monthlyAmount || loan.monthlyPayment || 0);
                    const requestedRepayment = hasOverride ? Math.max(0, overrideAmount) : standardRepayment;

                    const maxRepayment = Math.min(requestedRepayment, remaining);
                    const actualDeduction = Math.max(0, Math.min(maxRepayment, availableForLoans));

                    if (actualDeduction > 0 || hasOverride) {
                        appliedLoans.push({
                            loanId: loan.id || 'unknown',
                            loanName: loan.loanName || 'Loan',
                            amountDeducted: Number(actualDeduction) || 0,
                            oldBalance: Number(remaining) || 0,
                            newBalance: Number(remaining - actualDeduction) || 0,
                            wasOverrideUsed: hasOverride,
                            originalOverrideAmount: hasOverride ? overrideAmount : null
                        });
                        loanDeduction += actualDeduction;
                        availableForLoans -= actualDeduction;
                    }
                }

                const safeLoanDeduction = Number(loanDeduction) || 0;
                const totalDeductions = preLoanDeductions + safeLoanDeduction;
                const netPay = totalEarnings - totalDeductions;

                const unpaidAbsArr = [];
                if (Number(stats.totalAbsencesCount) > 0) {
                    if (stats.unexcusedAbsenceDates && stats.unexcusedAbsenceDates.length > 0) {
                        // On crée une ligne pour chaque date exacte
                        stats.unexcusedAbsenceDates.forEach(d => {
                            unpaidAbsArr.push({
                                date: d,
                                hours: currentJob.standardDayHours || 8,
                                amount: ((currentJob.baseSalary || 0) / 30)
                            });
                        });
                    } else {
                        // Fallback de sécurité au cas où
                        unpaidAbsArr.push({
                            date: "Unexcused",
                            hours: stats.totalAbsencesCount * (currentJob.standardDayHours || 8),
                            amount: ((currentJob.baseSalary || 0) / 30) * stats.totalAbsencesCount
                        });
                    }
                }
                if (Number(stats.daysToDeduct) > 0) unpaidAbsArr.push({ date: `${stats.daysToDeduct} Sick Overage`, hours: stats.daysToDeduct * (currentJob.standardDayHours || 8), amount: ((currentJob.baseSalary || 0) / 30) * stats.daysToDeduct });

                return {
                    id: staff.id, name: staff.firstName ? `${staff.firstName} ${staff.lastName}` : (staff.fullName || 'Staff'), displayName,
                    position: currentJob.position || 'Staff', payType: currentJob.payType,
                    paymentMethod: staff.paymentMethod || 'bank_transfer',
                    bankAccount: staff.bankAccount || '-',
                    idNumber: staff.idNumber || '-',
                    idType: staff.idType || 'None',
                    totalEarnings, totalDeductions, netPay, bonusInfo, appliedLoans,
                    earnings: { basePay: safeBasePay, overtimePay: safeOvertimePay, attendanceBonus: safeAttendanceBonus, ssoAllowance, leavePayout: leavePayoutTotal, leavePayoutDetails: leavePayout, others: safeOtherEarningsArray },
                    deductions: {
                        absences: safeAutoDeductions,
                        unpaidAbsences: unpaidAbsArr,
                        totalAbsenceHours: (Number(stats.totalAbsencesCount) + Number(stats.daysToDeduct)) * (currentJob.standardDayHours || 8),
                        sso: safeSsoDeduction, advance: safeAdvanceDeduction, loan: safeLoanDeduction,
                        others: staffAdjustments.filter(a => a.type === 'Deduction').map(a => ({ description: a.description || 'Deduction', amount: Number(a.amount) || 0 }))
                    }
                };
            });
            setPayrollData(data);
        } catch (err) {
            setError('Failed to generate payroll. Check browser console (F12) for details.'); console.error(err);
        } finally { setIsLoading(false); }
    };

    useEffect(() => {
        if (payrollData.length > 0) { setSelectedForPayroll(new Set(payrollData.map(p => p.id))); }
        else { setSelectedForPayroll(new Set()); }
    }, [payrollData]);

    const handleFinalizePayroll = async () => {
        if (pendingAdvancesCount > 0) {
            setFeedbackModal({ type: 'error', title: 'Action Blocked', message: `There are ${pendingAdvancesCount} pending salary advances for this period. Please approve or reject them in the Financials section first.` });
            return;
        }

        const dataToFinalize = payrollData.filter(p => selectedForPayroll.has(p.id));
        if (dataToFinalize.length === 0) {
            setFeedbackModal({ type: 'error', title: 'Empty Selection', message: "Please select at least one employee to finalize." });
            return;
        }

        const payPeriodDate = dateUtils.parseISODateString(`${payPeriod.year}-${String(payPeriod.month).padStart(2, '0')}-01`);

        // Remplacement du window.confirm
        setConfirmState({
            isOpen: true,
            title: "Finalize Payroll",
            message: `Are you sure you want to finalize payroll for ${dataToFinalize.length} employee(s) for ${dateUtils.formatCustom(payPeriodDate, 'MMMM')} ${payPeriod.year}?`,
            isDestructive: false,
            confirmText: "Finalize Payroll",
            onConfirm: async () => {
                setConfirmState({ isOpen: false });
                setIsFinalizing(true);
                try {
                    const result = await finalizeAndStorePayslips({ payrollData: dataToFinalize, payPeriod });
                    if (result?.data?.error) throw new Error(result.data.error);
                    if (result?.data?.success === false) throw new Error(result.data.message || "Backend rejected payload");

                    setFeedbackModal({ type: 'success', title: 'Success!', message: "Payroll finalized and payslips stored successfully." });

                    setPayrollData(prev => prev.filter(p => !selectedForPayroll.has(p.id)));
                    setSelectedForPayroll(new Set());
                    setTimeout(() => { handleGeneratePayroll(); }, 1500);
                } catch (error) {
                    console.error("Error finalizing payroll:", error);
                    setFeedbackModal({ type: 'error', title: 'Finalization Failed', message: error.message });
                } finally {
                    setIsFinalizing(false);
                }
            },
            onCancel: () => setConfirmState({ isOpen: false })
        });
    };

    const handleSelectOne = (staffId) => {
        setSelectedForPayroll(prev => { const newSet = new Set(prev); newSet.has(staffId) ? newSet.delete(staffId) : newSet.add(staffId); return newSet; });
    };

    const handleSelectAll = () => {
        if (selectedForPayroll.size === payrollData.length) setSelectedForPayroll(new Set());
        else setSelectedForPayroll(new Set(payrollData.map(p => p.id)));
    };

    const totalSelectedNetPay = useMemo(() => {
        return payrollData.filter(p => selectedForPayroll.has(p.id)).reduce((sum, p) => sum + p.netPay, 0);
    }, [payrollData, selectedForPayroll]);

    return {
        payrollData, isLoading, isFinalizing, error, isMonthFullyFinalized,
        selectedForPayroll, totalSelectedNetPay, pendingAdvancesCount, pendingLoansCount,
        feedbackModal, setFeedbackModal, confirmState, setConfirmState, // <-- Exposé au parent
        handleGeneratePayroll, handleFinalizePayroll, handleSelectOne, handleSelectAll
    };
}