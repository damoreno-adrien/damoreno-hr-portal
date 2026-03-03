/* src/hooks/usePayrollGenerator.js */

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../firebase"
import * as dateUtils from '../utils/dateUtils';
import { calculateMonthlyStats } from '../utils/attendanceCalculator';

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
        baseSalary: latestJob.baseSalary ?? (type === 'Salary' ? latestJob.rate : 0),
        hourlyRate: latestJob.hourlyRate ?? (type === 'Hourly' ? latestJob.rate : 0),
        standardDayHours: latestJob.standardDayHours || 8
    };
};

export default function usePayrollGenerator(db, staffList, companyConfig, payPeriod) {
    const [payrollData, setPayrollData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [error, setError] = useState('');
    const [isMonthFullyFinalized, setIsMonthFullyFinalized] = useState(false);
    const [selectedForPayroll, setSelectedForPayroll] = useState(new Set());

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
            const daysInMonth = dateUtils.getDaysInMonth(payPeriodDate);

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

            const [advancesSnap, loansSnap, adjustmentsSnap, approvedOtSnap, attendanceSnap, cashOutsSnap, allStaffStats] = await Promise.all([
                getDocs(query(collection(db, "salary_advances"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month), where("status", "==", "approved"))),
                
                // --- FIX 1: Removed strict isActive boolean query. Fetch all loans and filter safely in memory ---
                getDocs(collection(db, "loans")), 
                
                getDocs(query(collection(db, "monthly_adjustments"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month))),
                getDocs(query(collection(db, "attendance"), where("date", ">=", startDateStr), where("date", "<=", endDateStr), where("otStatus", "==", "approved"))),
                getDocs(query(collection(db, "attendance"), where("date", ">=", startDateStr), where("date", "<=", endDateStr))),
                getDocs(query(collection(db, "leave_requests"), where("leaveType", "==", "Cash Out Holiday Credits"), where("status", "==", "approved"), where("startDate", ">=", startDateStr), where("startDate", "<=", endDateStr))),
                Promise.all(staffWithJobs.map(staff => calculateMonthlyStats(db, staff, payPeriod, companyConfig, staff.currentJob).then(stats => ({ staffId: staff.id, ...stats }))))
            ]);

            const advancesData = advancesSnap.docs.map(doc => doc.data());
            const loansData = loansSnap.docs.map(doc => doc.data());
            const adjustmentsData = adjustmentsSnap.docs.map(doc => doc.data());
            const approvedOtData = approvedOtSnap.docs.map(doc => doc.data());
            const attendanceData = attendanceSnap.docs.map(doc => doc.data());
            const cashOutsData = cashOutsSnap.docs.map(doc => doc.data());
            const statsMap = new Map(allStaffStats.map(res => [res.staffId, res]));
            const overtimeRateMultiplier = companyConfig.overtimeRate || 1.5;

            const data = staffWithJobs.map(staff => {
                const currentJob = staff.currentJob;
                const stats = statsMap.get(staff.id) || { totalAbsencesCount: 0, daysToDeduct: 0, totalActualMillis: 0 };
                const displayName = `${staff.nickname || staff.firstName} (${currentJob.department || 'N/A'})`;

                let basePay = 0; let autoDeductions = 0; let hourlyRateForOT = 0; let leavePayout = null;

                const staffStartDate = dateUtils.fromFirestore(staff.startDate);
                const staffEndDate = dateUtils.fromFirestore(staff.endDate);

                if (currentJob.payType === 'Salary') {
                    const salary = currentJob.baseSalary || 0;
                    const standardHours = currentJob.standardDayHours || 8;

                    let effectiveStart = startOfMonth;
                    if (staffStartDate && staffStartDate > startOfMonth) effectiveStart = staffStartDate;

                    let effectiveEnd = endOfMonth;
                    if (staffEndDate && staffEndDate < endOfMonth) effectiveEnd = staffEndDate;

                    const isFullMonth = effectiveStart.getTime() === startOfMonth.getTime() && effectiveEnd.getTime() === endOfMonth.getTime();

                    if (isFullMonth) { basePay = salary; } 
                    else {
                        const daysActive = dateUtils.differenceInCalendarDays(dateUtils.formatISODate(effectiveEnd), dateUtils.formatISODate(effectiveStart));
                        const dailyRateCalendar = salary / daysInMonth; 
                        basePay = dailyRateCalendar * daysActive;
                    }

                    const isLeavingThisMonth = staffEndDate && dateUtils.getYear(staffEndDate) === payPeriod.year && dateUtils.getMonth(staffEndDate) === payPeriod.month;
                                               
                    if (isLeavingThisMonth) {
                        const dailyRateCalendar = salary / daysInMonth;
                        let annualDaysToPay = 0; let holidayCreditsToPay = 0;

                        if (staff.offboardingSettings) {
                            if (staff.offboardingSettings.payoutAnnualLeave) annualDaysToPay = staff.offboardingSettings.finalBalances?.annual || 0;
                            if (staff.offboardingSettings.payoutPublicHolidays) holidayCreditsToPay = staff.offboardingSettings.finalBalances?.ph || 0;
                        }
                        
                        leavePayout = { annualDays: annualDaysToPay, holidayCredits: holidayCreditsToPay, dailyRate: dailyRateCalendar, total: (annualDaysToPay + holidayCreditsToPay) * dailyRateCalendar };
                    }

                    const dailyDeductionRate = salary / 30;
                    autoDeductions = (dailyDeductionRate * (stats.daysToDeduct || 0)) + (dailyDeductionRate * (stats.totalAbsencesCount || 0));
                    hourlyRateForOT = dailyDeductionRate / standardHours;

                } else {
                    const rate = currentJob.hourlyRate || 0;
                    basePay = (stats.totalActualMillis / (1000 * 60 * 60)) * rate;
                    autoDeductions = 0; hourlyRateForOT = rate; 
                }

                const staffApprovedOT = approvedOtData.filter(ot => ot.staffId === staff.id);
                const totalOtMinutes = staffApprovedOT.reduce((sum, ot) => sum + (ot.otApprovedMinutes || 0), 0);
                const overtimePay = (totalOtMinutes / 60) * hourlyRateForOT * overtimeRateMultiplier;

                // Holiday Bonus & Cash Outs
                let holidayPayBonus = 0; let cashOutPay = 0;
                const staffProfileHolidayPolicy = staff.holidayPolicy || 'in_lieu';
                const dailyDeductionRate = currentJob.payType === 'Salary' ? (currentJob.baseSalary || 0) / 30 : (currentJob.hourlyRate || 0) * (currentJob.standardDayHours || 8);

                // Auto-Pay for worked holidays
                if (staffProfileHolidayPolicy === 'paid') {
                    const periodHolidays = (companyConfig.publicHolidays || []).filter(h => {
                         const hDate = dateUtils.parseISODateString(h.date);
                         return hDate && hDate >= startOfMonth && hDate <= endOfMonth;
                    }).map(h => h.date);

                    const staffAttendance = attendanceData.filter(a => a.staffId === staff.id);
                    const holidaysWorked = periodHolidays.filter(hDate => staffAttendance.some(a => a.date === hDate)).length;

                    if (holidaysWorked > 0) {
                        const multiplier = companyConfig.holidayPayMultiplier ?? 1.0;
                        holidayPayBonus = holidaysWorked * dailyDeductionRate * multiplier;
                    }
                }

                // Process requested Cash Outs
                const staffCashOuts = cashOutsData.filter(c => c.staffId === staff.id);
                const cashOutCredits = staffCashOuts.reduce((sum, c) => sum + (c.totalDays || 0), 0);

                if (cashOutCredits > 0) {
                    cashOutPay = cashOutCredits * dailyDeductionRate;
                }

                // Compile Other Earnings array cleanly
                const staffAdjustments = adjustmentsData.filter(a => a.staffId === staff.id);
                
                const safeOtherEarningsArray = staffAdjustments
                    .filter(a => a.type === 'Earning')
                    .map(a => ({ description: a.description, amount: a.amount }));
                
                if (cashOutPay > 0) {
                    safeOtherEarningsArray.push({ description: `Holiday Credits Cashed Out (${cashOutCredits})`, amount: cashOutPay });
                }
                if (holidayPayBonus > 0) {
                    safeOtherEarningsArray.push({ description: 'Holiday Pay (Worked)', amount: holidayPayBonus });
                }

                const otherEarningsTotal = safeOtherEarningsArray.reduce((sum, i) => sum + i.amount, 0);
                const otherDeductions = staffAdjustments.filter(a => a.type === 'Deduction').reduce((sum, i) => sum + i.amount, 0);
                
                const isLeavingThisMonth = staffEndDate && dateUtils.getYear(staffEndDate) === payPeriod.year && dateUtils.getMonth(staffEndDate) === payPeriod.month;
                const attendanceBonus = isLeavingThisMonth ? 0 : stats.bonusAmount;
                const bonusInfo = { newStreak: isLeavingThisMonth ? (staff.bonusStreak || 0) : (stats.newStreak || 0) };
                const leavePayoutTotal = leavePayout ? leavePayout.total : 0;
                
                const preSsoEarnings = basePay + attendanceBonus + otherEarningsTotal + leavePayoutTotal + overtimePay;
                
                const ssoRate = (companyConfig.ssoRate || 5) / 100;
                const ssoCap = companyConfig.ssoCap || 750;
                const ssoBase = Math.max(1650, preSsoEarnings); 
                const ssoDeduction = Math.min(ssoBase * ssoRate, ssoCap);
                const ssoAllowance = ssoDeduction; 
                
                const totalEarnings = preSsoEarnings + ssoAllowance;
                const advanceDeduction = advancesData.filter(a => a.staffId === staff.id).reduce((sum, item) => sum + item.amount, 0);
                
                // --- FIX 2: Robust Memory Filtering & Safe Number Parsing for Loans ---
                const loanDeduction = loansData
                    .filter(l => l.staffId === staff.id && Number(l.remainingBalance) > 0)
                    .reduce((sum, item) => {
                        const monthly = Number(item.monthlyRepayment || item.monthlyAmount || item.monthlyPayment || 0);
                        const remaining = Number(item.remainingBalance || 0);
                        return sum + Math.min(monthly, remaining);
                    }, 0);
                
                const totalDeductions = autoDeductions + ssoDeduction + advanceDeduction + loanDeduction + otherDeductions;
                const netPay = totalEarnings - totalDeductions;

                return { 
                    id: staff.id, name: staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName, displayName,
                    position: currentJob.position, payType: currentJob.payType,
                    totalEarnings, totalDeductions, netPay, bonusInfo,
                    earnings: { 
                        basePay, overtimePay, attendanceBonus, ssoAllowance, 
                        leavePayout: leavePayoutTotal, 
                        leavePayoutDetails: leavePayout, 
                        others: safeOtherEarningsArray 
                    }, 
                    deductions: { 
                        absences: autoDeductions, 
                        unpaidAbsences: [
                            ...(stats.totalAbsencesCount > 0 ? [{ date: `${stats.totalAbsencesCount} Unexcused Days`, hours: stats.totalAbsencesCount * (currentJob.standardDayHours || 8), amount: (basePay/30 * stats.totalAbsencesCount) }] : []),
                            ...(stats.daysToDeduct > 0 ? [{ date: `${stats.daysToDeduct} Sick Leave Overage`, hours: stats.daysToDeduct * (currentJob.standardDayHours || 8), amount: (basePay/30 * stats.daysToDeduct) }] : [])
                        ],
                        totalAbsenceHours: (stats.totalAbsencesCount + stats.daysToDeduct) * (currentJob.standardDayHours || 8), 
                        sso: ssoDeduction, advance: advanceDeduction, loan: loanDeduction, 
                        others: staffAdjustments.filter(a => a.type === 'Deduction') 
                    }
                };
            });
            setPayrollData(data);
        } catch (err) { setError('Failed to generate payroll. Check browser console (F12) for details.'); console.error(err);
        } finally { setIsLoading(false); }
    };
    
    useEffect(() => {
        if (payrollData.length > 0) { setSelectedForPayroll(new Set(payrollData.map(p => p.id))); } 
        else { setSelectedForPayroll(new Set()); }
    }, [payrollData]);

    const handleFinalizePayroll = async () => {
        const dataToFinalize = payrollData.filter(p => selectedForPayroll.has(p.id));
        if (dataToFinalize.length === 0) { alert("Please select at least one employee to finalize."); return; }
        const payPeriodDate = dateUtils.parseISODateString(`${payPeriod.year}-${String(payPeriod.month).padStart(2, '0')}-01`);
        const monthName = dateUtils.formatCustom(payPeriodDate, 'MMMM');
        if (!window.confirm(`Are you sure you want to finalize payroll for ${dataToFinalize.length} employee(s) for ${monthName} ${payPeriod.year}?`)) { return; }
        setIsFinalizing(true);
        try {
            const result = await finalizeAndStorePayslips({ payrollData: dataToFinalize, payPeriod });
            
            if (result?.data?.error) { throw new Error(result.data.error); }
            if (result?.data?.success === false) { throw new Error(result.data.message || "Backend rejected payload"); }

            alert("Payroll finalized and payslips stored successfully!");
            
            setPayrollData(prev => prev.filter(p => !selectedForPayroll.has(p.id)));
            setSelectedForPayroll(new Set());

            setTimeout(() => { handleGeneratePayroll(); }, 1500);

        } catch (error) { 
            console.error("Error finalizing payroll:", error); 
            alert(`Failed to finalize payroll: ${error.message}`); 
        } finally { 
            setIsFinalizing(false); 
        }
    };

    const handleSelectOne = (staffId) => {
        setSelectedForPayroll(prev => {
            const newSet = new Set(prev);
            if (newSet.has(staffId)) { newSet.delete(staffId); } else { newSet.add(staffId); }
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (selectedForPayroll.size === payrollData.length) { setSelectedForPayroll(new Set()); } 
        else { setSelectedForPayroll(new Set(payrollData.map(p => p.id))); }
    };

    const totalSelectedNetPay = useMemo(() => {
        return payrollData.filter(p => selectedForPayroll.has(p.id)).reduce((sum, p) => sum + p.netPay, 0);
    }, [payrollData, selectedForPayroll]);

    return {
        payrollData, isLoading, isFinalizing, error, isMonthFullyFinalized,
        selectedForPayroll, totalSelectedNetPay,
        handleGeneratePayroll, handleFinalizePayroll, handleSelectOne, handleSelectAll,
    };
}