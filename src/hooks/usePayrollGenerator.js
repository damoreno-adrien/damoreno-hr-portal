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

    // --- FIX 1: Robust PayType Normalization (Handle 'salary', 'Monthly', etc.) ---
    let type = latestJob.payType || 'Salary';
    const lowerType = type.toLowerCase().trim();
    if (lowerType === 'monthly' || lowerType === 'salary') {
        type = 'Salary';
    }

    return {
        ...latestJob,
        payType: type,
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
        const earliestAllowedDate = dateUtils.parseISODateString('2025-10-01');
        if (!payPeriodDate || payPeriodDate < earliestAllowedDate) {
            setError(`Cannot generate payroll for periods before October 2025.`);
            setPayrollData([]); setIsMonthFullyFinalized(false); return;
        }
        if (!companyConfig) { setError("Company settings are not loaded yet."); return; }
        if (!staffList || staffList.length === 0) { setError("Staff list is not loaded yet."); return; }

        setIsLoading(true); setError(''); setIsMonthFullyFinalized(false);

        try {
            // --- DATE BOUNDARIES ---
            const startOfMonth = dateUtils.startOfMonth(payPeriodDate);
            const endOfMonth = dateUtils.endOfMonth(payPeriodDate);
            const startDateStr = dateUtils.formatISODate(startOfMonth);
            const endDateStr = dateUtils.formatISODate(endOfMonth);
            const daysInMonth = dateUtils.getDaysInMonth(payPeriodDate);

            const finalizedPayslipsSnap = await getDocs(query(collection(db, "payslips"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month)));
            const finalizedStaffIds = new Set(finalizedPayslipsSnap.docs.map(doc => doc.data().staffId));

            // --- FILTER STAFF ---
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

            // --- 1. FETCH DATA ---
            const [advancesSnap, loansSnap, adjustmentsSnap, approvedOtSnap, allStaffStats] = await Promise.all([
                getDocs(query(collection(db, "salary_advances"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month), where("status", "==", "approved"))),
                getDocs(query(collection(db, "loans"), where("isActive", "==", true))),
                getDocs(query(collection(db, "monthly_adjustments"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month))),
                getDocs(query(collection(db, "attendance"), where("date", ">=", startDateStr), where("date", "<=", endDateStr), where("otStatus", "==", "approved"))),
                Promise.all(staffWithJobs.map(staff => calculateMonthlyStats(db, staff, payPeriod, companyConfig, staff.currentJob).then(stats => ({ staffId: staff.id, ...stats }))))
            ]);

            const advancesData = advancesSnap.docs.map(doc => doc.data());
            const loansData = loansSnap.docs.map(doc => doc.data());
            const adjustmentsData = adjustmentsSnap.docs.map(doc => doc.data());
            const approvedOtData = approvedOtSnap.docs.map(doc => doc.data());
            const statsMap = new Map(allStaffStats.map(res => [res.staffId, res]));
            const overtimeRateMultiplier = companyConfig.overtimeRate || 1.5;

            // --- 2. CALCULATE PAYROLL ---
            const data = staffWithJobs.map(staff => {
                const currentJob = staff.currentJob;
                const stats = statsMap.get(staff.id) || { totalAbsencesCount: 0, daysToDeduct: 0, totalActualMillis: 0 };
                const displayName = `${staff.nickname || staff.firstName} (${currentJob.department || 'N/A'})`;

                let basePay = 0;
                let autoDeductions = 0;
                let hourlyRateForOT = 0; 
                let leavePayout = null;

                const staffStartDate = dateUtils.fromFirestore(staff.startDate);
                const staffEndDate = dateUtils.fromFirestore(staff.endDate);

                // === 3. SALARY vs HOURLY LOGIC ===
                if (currentJob.payType === 'Salary') {
                    const salary = currentJob.baseSalary || 0;
                    const standardHours = currentJob.standardDayHours || 8;

                    // --- A. Pro-Rata Calculation ---
                    let effectiveStart = startOfMonth;
                    if (staffStartDate && staffStartDate > startOfMonth) effectiveStart = staffStartDate;

                    let effectiveEnd = endOfMonth;
                    if (staffEndDate && staffEndDate < endOfMonth) effectiveEnd = staffEndDate;

                    const isFullMonth = effectiveStart.getTime() === startOfMonth.getTime() && effectiveEnd.getTime() === endOfMonth.getTime();

                    if (isFullMonth) {
                        basePay = salary;
                    } else {
                        const daysActive = dateUtils.differenceInCalendarDays(
                            dateUtils.formatISODate(effectiveEnd), 
                            dateUtils.formatISODate(effectiveStart)
                        );
                        const dailyRateCalendar = salary / daysInMonth; 
                        basePay = dailyRateCalendar * daysActive;
                    }

                    // --- B. Leave Payout ---
                    const isLeavingThisMonth = staffEndDate && 
                                               dateUtils.getYear(staffEndDate) === payPeriod.year && 
                                               dateUtils.getMonth(staffEndDate) === payPeriod.month;
                                               
                    if (isLeavingThisMonth) {
                        const hireDate = staffStartDate;
                        const dailyRateCalendar = salary / daysInMonth;
                        
                        let annualLeaveEntitlement = 0;
                        if (hireDate) {
                            const yearsOfService = dateUtils.differenceInYears(staffEndDate, hireDate);
                            if (yearsOfService >= 1) { annualLeaveEntitlement = companyConfig.annualLeaveDays; }
                            else if (dateUtils.getYear(hireDate) === payPeriod.year) {
                                const monthsWorkedThisYear = dateUtils.getMonth(staffEndDate) - dateUtils.getMonth(hireDate) + 1;
                                annualLeaveEntitlement = Math.floor((companyConfig.annualLeaveDays / 12) * monthsWorkedThisYear);
                            }
                        }
                        const pastHolidays = companyConfig.publicHolidays.filter(h => {
                             const holidayDate = dateUtils.parseISODateString(h.date);
                             return holidayDate && holidayDate <= staffEndDate && dateUtils.getYear(holidayDate) === payPeriod.year;
                        });
                        const earnedCredits = Math.min(pastHolidays.length, companyConfig.publicHolidayCreditCap);
                        const usedAnnual = 0, usedPublicHoliday = 0; 
                        
                        const finalAnnualBalance = Math.max(0, annualLeaveEntitlement - usedAnnual);
                        const finalHolidayCredit = Math.max(0, earnedCredits - usedPublicHoliday);
                        
                        leavePayout = { 
                            annualDays: finalAnnualBalance, 
                            holidayCredits: finalHolidayCredit, 
                            dailyRate: dailyRateCalendar, 
                            total: (finalAnnualBalance + finalHolidayCredit) * dailyRateCalendar 
                        };
                    }

                    // --- C. Deductions ---
                    const dailyDeductionRate = salary / 30; // Rule of 30
                    
                    const sickLeaveCost = dailyDeductionRate * (stats.daysToDeduct || 0);
                    const absenceCost = dailyDeductionRate * (stats.totalAbsencesCount || 0);
                    
                    autoDeductions = sickLeaveCost + absenceCost;

                    // --- D. OT Rate (Rule of 30) ---
                    hourlyRateForOT = dailyDeductionRate / standardHours;

                } else {
                    // --- HOURLY STAFF ---
                    const rate = currentJob.hourlyRate || 0;
                    const totalHoursWorked = (stats.totalActualMillis / (1000 * 60 * 60));
                    basePay = totalHoursWorked * rate;
                    autoDeductions = 0;
                    hourlyRateForOT = rate; 
                }

                // --- 4. ADD OVERTIME ---
                const staffApprovedOT = approvedOtData.filter(ot => ot.staffId === staff.id);
                const totalOtMinutes = staffApprovedOT.reduce((sum, ot) => sum + (ot.otApprovedMinutes || 0), 0);
                const overtimePay = (totalOtMinutes / 60) * hourlyRateForOT * overtimeRateMultiplier;

                // --- 5. FINAL TOTALS ---
                const staffAdjustments = adjustmentsData.filter(a => a.staffId === staff.id);
                const otherEarnings = staffAdjustments.filter(a => a.type === 'Earning').reduce((sum, i) => sum + i.amount, 0);
                const otherDeductions = staffAdjustments.filter(a => a.type === 'Deduction').reduce((sum, i) => sum + i.amount, 0);
                
                const isLeavingThisMonth = staffEndDate && dateUtils.getYear(staffEndDate) === payPeriod.year && dateUtils.getMonth(staffEndDate) === payPeriod.month;
                const attendanceBonus = isLeavingThisMonth ? 0 : stats.bonusAmount;
                const bonusInfo = { newStreak: isLeavingThisMonth ? staff.bonusStreak : stats.newStreak };

                const leavePayoutTotal = leavePayout ? leavePayout.total : 0;
                
                // SSO Calculation
                const ssoRate = (companyConfig.ssoRate || 5) / 100;
                const ssoCap = companyConfig.ssoCap || 750;
                const preSsoEarnings = basePay + attendanceBonus + otherEarnings + leavePayoutTotal + overtimePay;
                const ssoBase = Math.max(1650, preSsoEarnings); 
                const ssoDeduction = Math.min(ssoBase * ssoRate, ssoCap);
                const ssoAllowance = ssoDeduction; 
                
                const totalEarnings = preSsoEarnings + ssoAllowance;
                
                const advanceDeduction = advancesData.filter(a => a.staffId === staff.id).reduce((sum, item) => sum + item.amount, 0);
                
                // --- NEW: Using Math.min to prevent overcharging on the final loan payment ---
                const loanDeduction = loansData.filter(l => l.staffId === staff.id).reduce((sum, item) => sum + Math.min(item.monthlyRepayment, item.remainingBalance), 0);
                
                const totalDeductions = autoDeductions + ssoDeduction + advanceDeduction + loanDeduction + otherDeductions;
                const netPay = totalEarnings - totalDeductions;

                return { 
                    id: staff.id, 
                    name: staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName, 
                    displayName,
                    position: currentJob.position, 
                    payType: currentJob.payType,
                    totalEarnings, totalDeductions, netPay, 
                    bonusInfo,
                    earnings: { 
                        basePay, 
                        overtimePay, 
                        attendanceBonus, 
                        ssoAllowance, 
                        leavePayout: leavePayoutTotal, 
                        leavePayoutDetails: leavePayout, 
                        others: staffAdjustments.filter(a => a.type === 'Earning') 
                    }, 
                    deductions: { 
                        absences: autoDeductions, 
                        unpaidAbsences: [
                            ...(stats.totalAbsencesCount > 0 ? [{ date: `${stats.totalAbsencesCount} Unexcused Days`, hours: stats.totalAbsencesCount * (currentJob.standardDayHours || 8), amount: (basePay/30 * stats.totalAbsencesCount) }] : []),
                            ...(stats.daysToDeduct > 0 ? [{ date: `${stats.daysToDeduct} Sick Leave Overage`, hours: stats.daysToDeduct * (currentJob.standardDayHours || 8), amount: (basePay/30 * stats.daysToDeduct) }] : [])
                        ],
                        totalAbsenceHours: (stats.totalAbsencesCount + stats.daysToDeduct) * (currentJob.standardDayHours || 8), 
                        sso: ssoDeduction, 
                        advance: advanceDeduction, 
                        loan: loanDeduction, 
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
            await finalizeAndStorePayslips({ payrollData: dataToFinalize, payPeriod });
            alert("Payroll finalized and payslips stored successfully!");
            handleGeneratePayroll();
        } catch (error) { console.error("Error finalizing payroll:", error); alert(`Failed to finalize payroll: ${error.message}`);
        } finally { setIsFinalizing(false); }
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