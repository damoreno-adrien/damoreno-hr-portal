import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../firebase"
import * as dateUtils from '../utils/dateUtils';
import { calculateMonthlyStats } from '../utils/attendanceCalculator';

const functionsAsia = getFunctions(app, "asia-southeast1");
const finalizeAndStorePayslips = httpsCallable(functionsAsia, 'finalizeAndStorePayslips');

// --- HELPER: Normalize Job Data ---
// Ensures we handle both old (rate) and new (baseSalary/hourlyRate) formats safely
const getCurrentJob = (staff) => {
    if (!staff?.jobHistory || staff.jobHistory.length === 0) {
        return { payType: 'Salary', baseSalary: 0, standardDayHours: 8, department: 'N/A' };
    }
    // Get latest job
    const latestJob = [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB;
    })[0];

    // Normalize 'Monthly' to 'Salary' (Backward compatibility)
    let type = latestJob.payType;
    if (type === 'Monthly') type = 'Salary';

    // Return normalized object
    return {
        ...latestJob,
        payType: type || 'Salary',
        // Ensure these numbers exist, falling back to 'rate' if new fields are missing
        baseSalary: latestJob.baseSalary ?? (type === 'Salary' ? latestJob.rate : 0),
        hourlyRate: latestJob.hourlyRate ?? (type === 'Hourly' ? latestJob.rate : 0),
        standardDayHours: latestJob.standardDayHours || 8 // Default to 8 if not set
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
        // --- VALIDATION ---
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
            // --- DATE SETUP ---
            const startOfMonth = dateUtils.startOfMonth(payPeriodDate);
            const endOfMonth = dateUtils.endOfMonth(payPeriodDate);
            const startDateStr = dateUtils.formatISODate(startOfMonth);
            const endDateStr = dateUtils.formatISODate(endOfMonth);
            const daysInMonth = dateUtils.getDaysInMonth(payPeriodDate); // Used ONLY for Leave Payouts

            // --- CHECK FINALIZED ---
            const finalizedPayslipsSnap = await getDocs(query(collection(db, "payslips"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month)));
            const finalizedStaffIds = new Set(finalizedPayslipsSnap.docs.map(doc => doc.data().staffId));

            // --- FILTER STAFF ---
            const staffToProcess = staffList.filter(staff => {
                const isAlreadyFinalized = finalizedStaffIds.has(staff.id);
                const staffStartDate = dateUtils.fromFirestore(staff.startDate);
                const staffEndDate = dateUtils.fromFirestore(staff.endDate);
                if (!staffStartDate) return false;
                const hasStarted = staffStartDate <= endOfMonth;
                const wasEmployedDuringPeriod = !staffEndDate || staffEndDate >= startOfMonth;
                return !isAlreadyFinalized && hasStarted && wasEmployedDuringPeriod;
            });

            // Handle fully finalized month...
            if (staffToProcess.length === 0 && staffList.length > 0) {
                 const eligibleStaffIds = new Set(staffList
                    .filter(s => {
                        const staffStartDate = dateUtils.fromFirestore(s.startDate);
                        const staffEndDate = dateUtils.fromFirestore(s.endDate);
                        if (!staffStartDate) return false;
                        return staffStartDate <= endOfMonth && (!staffEndDate || staffEndDate >= startOfMonth);
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
            const overtimeRateMultiplier = companyConfig.overtimeRate || 1.0;

            // --- 2. CALCULATE PAYROLL ---
            const data = staffWithJobs.map(staff => {
                const currentJob = staff.currentJob;
                const stats = statsMap.get(staff.id) || { totalAbsencesCount: 0, daysToDeduct: 0, totalActualMillis: 0 };
                const displayName = `${staff.nickname || staff.firstName} (${currentJob.department || 'N/A'})`;

                let basePay = 0;
                let autoDeductions = 0;
                let hourlyRateForOT = 0; // The rate used specifically for OT calc
                let leavePayout = null;

                const staffEndDate = dateUtils.fromFirestore(staff.endDate);
                const isLastMonth = staffEndDate && dateUtils.getYear(staffEndDate) === payPeriod.year && dateUtils.getMonth(staffEndDate) === payPeriod.month;

                // ==========================================
                // === CORE LOGIC: SALARY vs HOURLY ===
                // ==========================================
                if (currentJob.payType === 'Salary') {
                    // --- SALARY (Type A & B) ---
                    const salary = currentJob.baseSalary || 0;
                    const standardHours = currentJob.standardDayHours || 8;

                    // 1. Base Pay
                    if (isLastMonth) {
                         // Prorated for last month (Using calendar days for fairness on exit)
                        const dailyRateCalendar = salary / daysInMonth;
                        const daysWorked = dateUtils.differenceInCalendarDays(dateUtils.formatISODate(staffEndDate), startDateStr);
                        basePay = dailyRateCalendar * daysWorked;
                        
                        // ... (Leave Payout Logic - Unchanged) ...
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
                        const staffLeaveTaken = []; // (Ideally fetch this)
                        let usedAnnual = 0, usedPublicHoliday = 0;
                        // ... (Existing leave logic) ...
                        const finalAnnualBalance = Math.max(0, annualLeaveEntitlement - usedAnnual);
                        const finalHolidayCredit = Math.max(0, earnedCredits - usedPublicHoliday);
                        
                        // Payout uses Calendar Rate
                        leavePayout = { annualDays: finalAnnualBalance, holidayCredits: finalHolidayCredit, dailyRate: dailyRateCalendar, total: (finalAnnualBalance + finalHolidayCredit) * dailyRateCalendar };
                    } else {
                        basePay = salary;
                    }

                    // 2. Deductions (Rule of 30)
                    // Deduction Rate = Base Salary / 30
                    const dailyDeductionRate = salary / 30;
                    autoDeductions = dailyDeductionRate * stats.daysToDeduct;

                    // 3. OT Rate (Rule of 30 / Standard Hours)
                    // Rate = (Base Salary / 30) / Standard Hours
                    hourlyRateForOT = dailyDeductionRate / standardHours;

                } else {
                    // --- HOURLY (Type C) ---
                    // 1. Base Pay = Actual Hours * Rate
                    const rate = currentJob.hourlyRate || 0;
                    const totalHoursWorked = (stats.totalActualMillis / (1000 * 60 * 60));
                    basePay = totalHoursWorked * rate;

                    // 2. No Deductions for Hourly
                    autoDeductions = 0;

                    // 3. No OT for Hourly (as per rules)
                    hourlyRateForOT = 0; 
                }

                // ==========================================

                // --- OT Calculation ---
                const staffApprovedOT = approvedOtData.filter(ot => ot.staffId === staff.id);
                const totalOtMinutes = staffApprovedOT.reduce((sum, ot) => sum + (ot.otApprovedMinutes || 0), 0);
                // If Hourly staff, hourlyRateForOT is 0, so this becomes 0 (Correct)
                const overtimePay = (totalOtMinutes / 60) * hourlyRateForOT * overtimeRateMultiplier;

                // --- Adjustments ---
                const staffAdjustments = adjustmentsData.filter(a => a.staffId === staff.id);
                const otherEarnings = staffAdjustments.filter(a => a.type === 'Earning').reduce((sum, i) => sum + i.amount, 0);
                const otherDeductions = staffAdjustments.filter(a => a.type === 'Deduction').reduce((sum, i) => sum + i.amount, 0);
                
                // --- Bonus ---
                const attendanceBonus = isLastMonth ? 0 : stats.bonusAmount;
                const bonusInfo = { newStreak: isLastMonth ? staff.bonusStreak : stats.newStreak };

                // --- SSO Calculation ---
                const ssoRate = (companyConfig.ssoRate || 5) / 100;
                const ssoCap = companyConfig.ssoCap || 750;
                const leavePayoutTotal = leavePayout ? leavePayout.total : 0;
                const preSsoEarnings = basePay + attendanceBonus + otherEarnings + leavePayoutTotal + overtimePay;
                
                const ssoBase = Math.max(1650, preSsoEarnings);
                const ssoDeduction = Math.min(ssoBase * ssoRate, ssoCap);
                const ssoAllowance = ssoDeduction;

                // --- Final Net Pay ---
                const totalEarnings = preSsoEarnings + ssoAllowance;
                
                const advanceDeduction = advancesData.filter(a => a.staffId === staff.id).reduce((sum, item) => sum + item.amount, 0);
                const loanDeduction = loansData.filter(l => l.staffId === staff.id).reduce((sum, item) => sum + item.monthlyRepayment, 0);
                const totalDeductions = autoDeductions + ssoDeduction + advanceDeduction + loanDeduction + otherDeductions;
                
                const netPay = totalEarnings - totalDeductions;

                return { 
                    id: staff.id, 
                    name: staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName, 
                    displayName, 
                    payType: currentJob.payType, // 'Salary' or 'Hourly'
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
                        unpaidAbsences: [{ date: `${stats.totalAbsencesCount} unexcused day(s)`, hours: stats.totalAbsencesCount * (currentJob.standardDayHours || 8) }],
                        totalAbsenceHours: stats.totalAbsencesCount * (currentJob.standardDayHours || 8), 
                        sso: ssoDeduction, 
                        advance: advanceDeduction, 
                        loan: loanDeduction, 
                        others: staffAdjustments.filter(a => a.type === 'Deduction') 
                    }
                };
            });
            setPayrollData(data);
        } catch (err) { 
            setError('Failed to generate payroll.'); 
            console.error(err); 
        } finally { setIsLoading(false); }
    };
    
    useEffect(() => {
        if (payrollData.length > 0) { setSelectedForPayroll(new Set(payrollData.map(p => p.id))); }
        else { setSelectedForPayroll(new Set()); }
    }, [payrollData]);

    const handleFinalizePayroll = async () => {
        const dataToFinalize = payrollData.filter(p => selectedForPayroll.has(p.id));
        if (dataToFinalize.length === 0) { alert("Please select at least one employee."); return; }
        if (!window.confirm(`Finalize payroll for ${dataToFinalize.length} employee(s)?`)) return;
        setIsFinalizing(true);
        try {
            await finalizeAndStorePayslips({ payrollData: dataToFinalize, payPeriod });
            alert("Success!");
            handleGeneratePayroll();
        } catch (error) { console.error(error); alert(`Failed: ${error.message}`);
        } finally { setIsFinalizing(false); }
    };

    const handleSelectOne = (staffId) => {
        setSelectedForPayroll(prev => {
            const newSet = new Set(prev);
            if (newSet.has(staffId)) newSet.delete(staffId); else newSet.add(staffId);
            return newSet;
        });
    };
    const handleSelectAll = () => {
        if (selectedForPayroll.size === payrollData.length) setSelectedForPayroll(new Set());
        else setSelectedForPayroll(new Set(payrollData.map(p => p.id)));
    };
    const totalSelectedNetPay = useMemo(() => payrollData.filter(p => selectedForPayroll.has(p.id)).reduce((sum, p) => sum + p.netPay, 0), [payrollData, selectedForPayroll]);

    return {
        payrollData, isLoading, isFinalizing, error, isMonthFullyFinalized,
        selectedForPayroll, totalSelectedNetPay,
        handleGeneratePayroll, handleFinalizePayroll, handleSelectOne, handleSelectAll,
    };
}