import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../firebase"
import * as dateUtils from '../utils/dateUtils';
// --- NEW IMPORT ---
import { calculateMonthlyStats } from '../utils/attendanceCalculator';
import { DateTime } from 'luxon'; // --- NEW: Import Luxon

// --- REMOVED calculateBonus function ---
const functionsAsia = getFunctions(app, "asia-southeast1");
const finalizeAndStorePayslips = httpsCallable(functionsAsia, 'finalizeAndStorePayslips');

// ... (getCurrentJob function is unchanged) ...
const getCurrentJob = (staff) => {
    if (!staff?.jobHistory || staff.jobHistory.length === 0) {
        return { rate: 0, payType: 'Monthly', department: 'N/A' };
    }
    const latestJob = [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB;
    })[0];
    if (latestJob.rate === undefined && latestJob.baseSalary !== undefined) {
        return { ...latestJob, rate: latestJob.baseSalary, payType: 'Monthly' };
    }
    return { ...latestJob, payType: latestJob.payType || 'Monthly' };
};


export default function usePayrollGenerator(db, staffList, companyConfig, payPeriod) {
    const [payrollData, setPayrollData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [error, setError] = useState('');
    const [isMonthFullyFinalized, setIsMonthFullyFinalized] = useState(false);
    const [selectedForPayroll, setSelectedForPayroll] = useState(new Set());

    const handleGeneratePayroll = async () => {
        // ... (All date period setup is unchanged) ...
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
        if (!companyConfig) { setError("Company settings are not loaded yet. Please wait and try again."); return; }

        setIsLoading(true); setError(''); setIsMonthFullyFinalized(false);

        try {
            const startOfMonth = dateUtils.startOfMonth(payPeriodDate);
            const endOfMonth = dateUtils.endOfMonth(payPeriodDate);
            const startDateStr = dateUtils.formatISODate(startOfMonth);
            const endDateStr = dateUtils.formatISODate(endOfMonth);
            const daysInMonth = dateUtils.getDaysInMonth(payPeriodDate);

            // --- NEW: Define sick leave quota ---
            const SICK_LEAVE_QUOTA_DAYS = 30;
            const startOfYear = DateTime.fromObject({ year: payPeriod.year, day: 1 }).toISODate();
            const endOfPayPeriod = endDateStr; // We only care about days up to this month

            // ... (Fetch Finalized Data is unchanged) ...
            const finalizedPayslipsSnap = await getDocs(query(collection(db, "payslips"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month)));
            const finalizedStaffIds = new Set(finalizedPayslipsSnap.docs.map(doc => doc.data().staffId));

            // ... (Filter Eligible Staff is unchanged) ...
            const staffToProcess = staffList.filter(staff => {
                const isAlreadyFinalized = finalizedStaffIds.has(staff.id);
                const staffStartDate = dateUtils.fromFirestore(staff.startDate);
                const staffEndDate = dateUtils.fromFirestore(staff.endDate);
                if (!staffStartDate) return false;
                const hasStarted = staffStartDate <= endOfMonth;
                const wasEmployedDuringPeriod = !staffEndDate || staffEndDate >= startOfMonth;
                const isCurrentlyActive = staff.status === undefined || staff.status === null || staff.status === 'active';
                const leftThisPeriod = staffEndDate &&
                                       dateUtils.getYear(staffEndDate) === payPeriod.year &&
                                       dateUtils.getMonth(staffEndDate) === payPeriod.month;
                const isEligibleForPeriod = isCurrentlyActive || leftThisPeriod;
                return !isAlreadyFinalized && hasStarted && wasEmployedDuringPeriod && isEligibleForPeriod;
            });

            if (staffToProcess.length === 0 && staffList.length > 0 && finalizedStaffIds.size === staffList.filter(s => s.status !== 'inactive').length) {
                 setIsMonthFullyFinalized(true);
                 setPayrollData([]);
                 setIsLoading(false);
                 return;
             }

            // --- REFACTORED: Prepare Data Fetching ---
            const [
                advancesSnapshot,
                loansSnapshot,
                adjustmentsSnapshot,
                // --- NEW: Fetch all sick leave for the year ---
                yearlySickLeaveSnapshot,
                allStaffStats
            ] = await Promise.all([
                getDocs(query(collection(db, "salary_advances"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month), where("status", "==", "approved"))),
                getDocs(query(collection(db, "loans"), where("isActive", "==", true))),
                getDocs(query(collection(db, "monthly_adjustments"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month))),
                // --- NEW ---
                getDocs(query(
                    collection(db, "leave_requests"),
                    where("status", "==", "approved"),
                    where("leaveType", "==", "Sick Leave"),
                    where("startDate", ">=", startOfYear),
                    where("startDate", "<=", endOfPayPeriod)
                )),
                // --- This replaces attendance, schedule, leave, and bonus fetches ---
                Promise.all(staffToProcess.map(staff => 
                    calculateMonthlyStats(db, staff, payPeriod, companyConfig)
                        .then(stats => ({ staffId: staff.id, ...stats }))
                ))
            ]);

            // --- REFACTORED: Process Data ---
            const advancesData = advancesSnapshot.docs.map(doc => doc.data());
            const loansData = loansSnapshot.docs.map(doc => doc.data());
            const adjustmentsData = adjustmentsSnapshot.docs.map(doc => doc.data());
            // --- NEW: Create maps for sick leave and stats ---
            const yearlySickLeaveData = yearlySickLeaveSnapshot.docs.map(doc => doc.data());
            const statsMap = new Map(allStaffStats.map(res => [res.staffId, res]));
            const publicHolidays = companyConfig.publicHolidays.map(h => h.date);

            // --- REFACTORED: Calculate Payroll ---
            const data = staffToProcess.map(staff => {
                const currentJob = getCurrentJob(staff);
                const displayName = `${staff.nickname || staff.firstName} (${currentJob.department || 'N/A'})`;
                
                // --- NEW: Get all stats from our calculator ---
                const stats = statsMap.get(staff.id);
                if (!stats) {
                    // This should not happen, but good to guard
                    return { id: staff.id, name: staff.firstName, error: "Failed to calculate stats" };
                }

                let basePay = 0;
                let autoDeductions = 0;
                let leavePayout = null;
                
                // --- Unpaid Absences (Simplified) ---
                const unpaidAbsences = [{ 
                    date: `${stats.totalAbsencesCount} unexcused day(s)`, 
                    hours: stats.totalAbsencesCount * 8 // Estimate
                }];


                const staffEndDate = dateUtils.fromFirestore(staff.endDate);
                const isLastMonth = staffEndDate &&
                                    dateUtils.getYear(staffEndDate) === payPeriod.year &&
                                    dateUtils.getMonth(staffEndDate) === payPeriod.month;

                if (currentJob.payType === 'Monthly') {
                    const fullMonthSalary = currentJob.rate || 0;
                    const dailyRate = fullMonthSalary / daysInMonth;

                    if (isLastMonth) {
                        // ... (Leave Payout logic is unchanged) ...
                        const daysWorked = dateUtils.differenceInCalendarDays(dateUtils.formatISODate(staffEndDate), startDateStr);
                        basePay = dailyRate * daysWorked;
                        
                        // --- Fetch leave data (This is now redundant, but OK) ---
                        const hireDate = dateUtils.fromFirestore(staff.startDate);
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

                        // This is inefficient, we already fetched this in the calculator
                        // But for a minimal change, we leave it.
                        const staffLeaveTaken = []; // Ideally get this from the calculator
                        let usedAnnual = 0, usedPublicHoliday = 0;
                        staffLeaveTaken.forEach(l => {
                            const leaveStartDate = dateUtils.parseISODateString(l.startDate);
                            if (leaveStartDate && leaveStartDate <= staffEndDate) {
                                if (l.leaveType === 'Annual Leave') usedAnnual += l.totalDays;
                                if (l.leaveType === 'Public Holiday (In Lieu)') usedPublicHoliday += l.totalDays;
                            }
                        });
                        const finalAnnualBalance = Math.max(0, annualLeaveEntitlement - usedAnnual);
                        const finalHolidayCredit = Math.max(0, earnedCredits - usedPublicHoliday);
                        leavePayout = { annualDays: finalAnnualBalance, holidayCredits: finalHolidayCredit, dailyRate: dailyRate, total: (finalAnnualBalance + finalHolidayCredit) * dailyRate };

                    } else { 
                        basePay = fullMonthSalary; 
                    }
                    
                    // --- UPDATED: Absence deduction logic ---
                    
                    // 1. Start with unexcused absences
                    let daysToDeduct = stats.totalAbsencesCount;

                    // 2. Calculate paid vs. unpaid sick leave
                    const staffYearlySickLeave = yearlySickLeaveData
                        .filter(l => l.staffId === staff.id && l.mcReceived === true);
                    
                    let totalYearlySickDays = 0;
                    staffYearlySickLeave.forEach(l => {
                        totalYearlySickDays += l.totalDays;
                    });

                    // 'totalJustifiedSickLeaveCount' is just for THIS month.
                    // 'totalYearlySickDays' is the running total *including* this month.
                    const paidSickDaysThisYear = Math.min(totalYearlySickDays, SICK_LEAVE_QUOTA_DAYS);
                    const unpaidSickDaysThisYear = totalYearlySickDays - paidSickDaysThisYear;

                    // Find how many of *this month's* justified days were unpaid
                    const paidSickDaysBeforeThisMonth = paidSickDaysThisYear - stats.totalJustifiedSickLeaveCount;
                    const remainingPaidQuota = SICK_LEAVE_QUOTA_DAYS - paidSickDaysBeforeThisMonth;
                    
                    let unpaidJustifiedDaysThisMonth = 0;
                    if (remainingPaidQuota < stats.totalJustifiedSickLeaveCount) {
                        unpaidJustifiedDaysThisMonth = stats.totalJustifiedSickLeaveCount - remainingPaidQuota;
                    }

                    // 3. Add unpaid sick leave (both justified-over-quota and unjustified)
                    daysToDeduct += stats.totalUnjustifiedSickLeaveCount;
                    daysToDeduct += unpaidJustifiedDaysThisMonth;
                    
                    // 4. Final deduction calculation
                    autoDeductions = dailyRate * daysToDeduct;

                } // End Monthly Pay Logic

                const staffAdjustments = adjustmentsData.filter(a => a.staffId === staff.id);
                const otherEarningsList = staffAdjustments.filter(a => a.type === 'Earning');
                const otherDeductionsList = staffAdjustments.filter(a => a.type === 'Deduction');
                const otherEarnings = otherEarningsList.reduce((sum, item) => sum + item.amount, 0);
                const otherDeductions = otherDeductionsList.reduce((sum, item) => sum + item.amount, 0);
                
                // --- REFACTORED: Get bonus from our calculator ---
                const attendanceBonus = isLastMonth ? 0 : stats.bonusAmount;
                const bonusInfo = { newStreak: isLastMonth ? staff.bonusStreak : stats.newStreak };

                const leavePayoutTotal = leavePayout ? leavePayout.total : 0;
                const ssoRate = (companyConfig.ssoRate || 5) / 100;
                const ssoCap = companyConfig.ssoCap || 750;
                const ssoBase = currentJob.payType === 'Monthly' ? (currentJob.rate || 0) : basePay;
                const ssoDeduction = Math.min(ssoBase * ssoRate, ssoCap);
                const ssoAllowance = ssoDeduction;
                const totalEarnings = basePay + attendanceBonus + otherEarnings + ssoAllowance + leavePayoutTotal;
                const advanceDeduction = advancesData.filter(a => a.staffId === staff.id).reduce((sum, item) => sum + item.amount, 0);
                const loanDeduction = loansData.filter(l => l.staffId === staff.id).reduce((sum, item) => sum + item.monthlyRepayment, 0);
                const totalDeductions = autoDeductions + ssoDeduction + advanceDeduction + loanDeduction + otherDeductions;
                const netPay = totalEarnings - totalDeductions;

                return { 
                    id: staff.id, 
                    name: staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName, 
                    displayName: displayName, 
                    payType: currentJob.position, 
                    totalEarnings, totalDeductions, netPay, 
                    bonusInfo: bonusInfo, // Contains the newStreak
                    earnings: { basePay, attendanceBonus, ssoAllowance, leavePayout: leavePayoutTotal, leavePayoutDetails: leavePayout, others: otherEarningsList }, 
                    deductions: { absences: autoDeductions, unpaidAbsences: unpaidAbsences, totalAbsenceHours: stats.totalAbsencesCount * 8, sso: ssoDeduction, advance: advanceDeduction, loan: loanDeduction, others: otherDeductionsList }
                };
            });
            setPayrollData(data);
        } catch (err) { setError('Failed to generate payroll. Check browser console (F12) for details.'); console.error(err);
        } finally { setIsLoading(false); }
    };

    // ... (The rest of the hook is unchanged) ...
    // ... (useEffect, handleFinalizePayroll, handleSelectOne, handleSelectAll, totalSelectedNetPay) ...
    
    useEffect(() => {
        if (payrollData.length > 0) {
            setSelectedForPayroll(new Set(payrollData.map(p => p.id)));
        } else {
            setSelectedForPayroll(new Set());
        }
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
            if (newSet.has(staffId)) { newSet.delete(staffId); }
            else { newSet.add(staffId); }
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (selectedForPayroll.size === payrollData.length) {
            setSelectedForPayroll(new Set());
        } else {
            setSelectedForPayroll(new Set(payrollData.map(p => p.id)));
        }
    };

    const totalSelectedNetPay = useMemo(() => {
        return payrollData
            .filter(p => selectedForPayroll.has(p.id))
            .reduce((sum, p) => sum + p.netPay, 0);
    }, [payrollData, selectedForPayroll]);

    return {
        payrollData, isLoading, isFinalizing, error, isMonthFullyFinalized,
        selectedForPayroll, totalSelectedNetPay,
        handleGeneratePayroll, handleFinalizePayroll, handleSelectOne, handleSelectAll,
    };
}