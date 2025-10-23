import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import * as dateUtils from '../utils/dateUtils'; // Use new standard

// Use standard date utils for safe sorting
const getCurrentJob = (staff) => {
    if (!staff?.jobHistory || staff.jobHistory.length === 0) {
        return { rate: 0, payType: 'Monthly', department: 'N/A' };
    }
    const latestJob = [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB;
    })[0];

    // Handle legacy 'baseSalary' field if 'rate' is missing
    if (latestJob.rate === undefined && latestJob.baseSalary !== undefined) {
        return { ...latestJob, rate: latestJob.baseSalary, payType: 'Monthly' };
    }
    // Ensure payType exists, default to Monthly if missing
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
        // --- Date Period Setup ---
        const now = new Date();
        const currentYear = dateUtils.getYear(now);
        const currentMonth = dateUtils.getMonth(now); // 1-indexed

        // Use a date object representing the pay period for easier checks
        const payPeriodDate = dateUtils.parseISODateString(`${payPeriod.year}-${String(payPeriod.month).padStart(2, '0')}-01`);

        // Check for future pay period
        if (payPeriod.year > currentYear || (payPeriod.year === currentYear && payPeriod.month > currentMonth)) {
            setError("Cannot generate payroll for a future period.");
            setPayrollData([]); setIsMonthFullyFinalized(false); return;
        }

        // Check for periods before October 2025
        const earliestAllowedDate = dateUtils.parseISODateString('2025-10-01');
        if (!payPeriodDate || payPeriodDate < earliestAllowedDate) {
            setError(`Cannot generate payroll for periods before October 2025.`);
            setPayrollData([]); setIsMonthFullyFinalized(false); return;
        }

        if (!companyConfig) { setError("Company settings are not loaded yet. Please wait and try again."); return; }

        setIsLoading(true); setError(''); setIsMonthFullyFinalized(false);

        try {
            // --- Standardized Date Range ---
            const startOfMonth = dateUtils.startOfMonth(payPeriodDate);
            const endOfMonth = dateUtils.endOfMonth(payPeriodDate);
            const startDateStr = dateUtils.formatISODate(startOfMonth);
            const endDateStr = dateUtils.formatISODate(endOfMonth);
            const daysInMonth = dateUtils.getDaysInMonth(payPeriodDate);

            // --- Fetch Finalized Data ---
            const finalizedPayslipsSnap = await getDocs(query(collection(db, "payslips"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month)));
            const finalizedStaffIds = new Set(finalizedPayslipsSnap.docs.map(doc => doc.data().staffId));

            // --- Filter Eligible Staff ---
            const staffToProcess = staffList.filter(staff => {
                const isAlreadyFinalized = finalizedStaffIds.has(staff.id);
                const staffStartDate = dateUtils.fromFirestore(staff.startDate);
                const staffEndDate = dateUtils.fromFirestore(staff.endDate); // Can be null

                if (!staffStartDate) return false; // Must have a start date

                const hasStarted = staffStartDate <= endOfMonth;
                const wasEmployedDuringPeriod = !staffEndDate || staffEndDate >= startOfMonth;

                // Status checks: undefined, null, or 'active' means currently employed
                const isCurrentlyActive = staff.status === undefined || staff.status === null || staff.status === 'active';
                // Check if they left *within* this specific pay period
                const leftThisPeriod = staffEndDate &&
                                       dateUtils.getYear(staffEndDate) === payPeriod.year &&
                                       dateUtils.getMonth(staffEndDate) === payPeriod.month;

                // Eligible if they are currently active OR if they left during this exact month
                const isEligibleForPeriod = isCurrentlyActive || leftThisPeriod;

                return !isAlreadyFinalized && hasStarted && wasEmployedDuringPeriod && isEligibleForPeriod;
            });


            if (staffToProcess.length === 0 && staffList.length > 0 && finalizedStaffIds.size === staffList.filter(s => s.status !== 'inactive').length) {
                 setIsMonthFullyFinalized(true); // Set flag if all active staff are finalized
                 setPayrollData([]);
                 setIsLoading(false);
                 return;
             }

            // --- Prepare Data Fetching ---
            const functions = getFunctions();
            const calculateBonus = httpsCallable(functions, 'calculateBonus');

            const [
                attendanceSnapshot, scheduleSnapshot, allLeaveSnapshot, advancesSnapshot,
                loansSnapshot, adjustmentsSnapshot, bonusResults
            ] = await Promise.all([
                getDocs(query(collection(db, "attendance"), where("date", ">=", startDateStr), where("date", "<=", endDateStr))),
                getDocs(query(collection(db, "schedules"), where("date", ">=", startDateStr), where("date", "<=", endDateStr))),
                getDocs(query(collection(db, "leave_requests"), where("status", "==", "approved"), where("endDate", ">=", startDateStr))), // Fetch potentially relevant leaves
                getDocs(query(collection(db, "salary_advances"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month), where("status", "==", "approved"))),
                getDocs(query(collection(db, "loans"), where("isActive", "==", true))),
                getDocs(query(collection(db, "monthly_adjustments"), where("payPeriodYear", "==", payPeriod.year), where("payPeriodMonth", "==", payPeriod.month))),
                Promise.all(staffToProcess.map(staff => calculateBonus({ staffId: staff.id, payPeriod: { year: payPeriod.year, month: payPeriod.month } }).then(result => ({ staffId: staff.id, ...result.data })).catch(err => ({ staffId: staff.id, bonusAmount: 0, newStreak: 0 }))))
            ]);

            // --- Process Data ---
            const attendanceData = new Map(attendanceSnapshot.docs.map(doc => [`${doc.data().staffId}_${doc.data().date}`, doc.data()]));
            const scheduleData = scheduleSnapshot.docs.map(doc => doc.data());
            // Filter leaves relevant to this month *after* fetching
            const allLeaveData = allLeaveSnapshot.docs.map(doc => doc.data()).filter(l => l.startDate <= endDateStr);
            const advancesData = advancesSnapshot.docs.map(doc => doc.data());
            const loansData = loansSnapshot.docs.map(doc => doc.data());
            const adjustmentsData = adjustmentsSnapshot.docs.map(doc => doc.data());
            const bonusMap = new Map(bonusResults.map(res => [res.staffId, res]));
            const publicHolidays = companyConfig.publicHolidays.map(h => h.date); // Assumes yyyy-MM-dd

            // --- Calculate Payroll ---
            const data = staffToProcess.map(staff => {
                const currentJob = getCurrentJob(staff);
                const displayName = `${staff.nickname || staff.firstName} (${currentJob.department || 'N/A'})`;
                let basePay = 0;
                let autoDeductions = 0;
                let leavePayout = null;
                let unpaidAbsences = [];
                let totalAbsenceHours = 0;

                const staffEndDate = dateUtils.fromFirestore(staff.endDate); // Use parsed date
                const isLastMonth = staffEndDate &&
                                    dateUtils.getYear(staffEndDate) === payPeriod.year &&
                                    dateUtils.getMonth(staffEndDate) === payPeriod.month;

                if (currentJob.payType === 'Monthly') {
                    const fullMonthSalary = currentJob.rate || 0;
                    const dailyRate = fullMonthSalary / daysInMonth;

                    if (isLastMonth) {
                        const daysWorked = dateUtils.differenceInCalendarDays(dateUtils.formatISODate(staffEndDate), startDateStr);
                        basePay = dailyRate * daysWorked;

                        // Calculate leave payout
                        const hireDate = dateUtils.fromFirestore(staff.startDate);
                        let annualLeaveEntitlement = 0;
                        if (hireDate) {
                            const yearsOfService = dateUtils.differenceInYears(staffEndDate, hireDate);
                            if (yearsOfService >= 1) {
                                annualLeaveEntitlement = companyConfig.annualLeaveDays;
                            } else if (dateUtils.getYear(hireDate) === payPeriod.year) {
                                // Prorate based on months worked *in the current year* up to end date
                                const monthsWorkedThisYear = dateUtils.getMonth(staffEndDate) - dateUtils.getMonth(hireDate) + 1;
                                annualLeaveEntitlement = Math.floor((companyConfig.annualLeaveDays / 12) * monthsWorkedThisYear);
                            }
                        }

                        // Use standard date comparisons for holiday credits
                        const pastHolidays = companyConfig.publicHolidays.filter(h => {
                             const holidayDate = dateUtils.parseISODateString(h.date);
                             return holidayDate && holidayDate <= staffEndDate && dateUtils.getYear(holidayDate) === payPeriod.year;
                        });
                        const earnedCredits = Math.min(pastHolidays.length, companyConfig.publicHolidayCreditCap);

                        const staffLeaveTaken = allLeaveData.filter(l => l.staffId === staff.id);
                        let usedAnnual = 0, usedPublicHoliday = 0;
                        staffLeaveTaken.forEach(l => {
                            const leaveStartDate = dateUtils.parseISODateString(l.startDate);
                            // Only count leave taken up to their end date
                            if (leaveStartDate && leaveStartDate <= staffEndDate) {
                                if (l.leaveType === 'Annual Leave') usedAnnual += l.totalDays;
                                if (l.leaveType === 'Public Holiday (In Lieu)') usedPublicHoliday += l.totalDays;
                            }
                        });

                        const finalAnnualBalance = Math.max(0, annualLeaveEntitlement - usedAnnual);
                        const finalHolidayCredit = Math.max(0, earnedCredits - usedPublicHoliday);

                        leavePayout = {
                            annualDays: finalAnnualBalance,
                            holidayCredits: finalHolidayCredit,
                            dailyRate: dailyRate,
                            total: (finalAnnualBalance + finalHolidayCredit) * dailyRate
                        };

                    } else {
                        basePay = fullMonthSalary; // Full salary for active months
                    }

                    // Calculate absence deductions using standard utils
                    const monthLeave = allLeaveData.filter(l => l.staffId === staff.id && l.startDate <= endDateStr && l.endDate >= startDateStr);
                    const staffSchedules = scheduleData.filter(s => s.staffId === staff.id);

                    staffSchedules.forEach(schedule => {
                        const scheduleDate = dateUtils.parseISODateString(schedule.date);
                        if (!scheduleDate || (isLastMonth && scheduleDate > staffEndDate)) return;

                        const wasOnLeave = monthLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
                        const didAttend = attendanceData.has(`${staff.id}_${schedule.date}`);

                        if (!didAttend && !wasOnLeave && !publicHolidays.includes(schedule.date)) {
                            let durationHours = 0;
                            if (schedule.startTime && schedule.endTime) {
                                // Calculate duration using standard utils
                                const start = dateUtils.fromFirestore(`${schedule.date}T${schedule.startTime}`);
                                const end = dateUtils.fromFirestore(`${schedule.date}T${schedule.endTime}`);
                                const durationMillis = dateUtils.differenceInMilliseconds(end, start);
                                durationHours = durationMillis / (1000 * 60 * 60);

                                if (durationHours > 5) { durationHours -= 1; } // Subtract break
                                durationHours = Math.max(0, durationHours);
                                totalAbsenceHours += durationHours;
                            }
                            unpaidAbsences.push({ date: schedule.date, hours: durationHours });
                        }
                    });
                    // Recalculate based on hours only if config allows hourly deductions for monthly staff
                    // Otherwise, stick to daily rate deduction
                    // For now, assuming daily rate deduction based on previous logic:
                    autoDeductions = dailyRate * unpaidAbsences.length;
                    // If hourly: autoDeductions = (fullMonthSalary / (avgHoursPerDay * daysInMonth)) * totalAbsenceHours;

                } // End Monthly Pay Logic

                // --- Other Earning/Deductions (No date logic here) ---
                const staffAdjustments = adjustmentsData.filter(a => a.staffId === staff.id);
                const otherEarningsList = staffAdjustments.filter(a => a.type === 'Earning');
                const otherDeductionsList = staffAdjustments.filter(a => a.type === 'Deduction');
                const otherEarnings = otherEarningsList.reduce((sum, item) => sum + item.amount, 0);
                const otherDeductions = otherDeductionsList.reduce((sum, item) => sum + item.amount, 0);

                const bonusInfo = bonusMap.get(staff.id) || { bonusAmount: 0, newStreak: 0 };
                const attendanceBonus = isLastMonth ? 0 : bonusInfo.bonusAmount;
                const leavePayoutTotal = leavePayout ? leavePayout.total : 0;

                // --- SSO Calculation (No date logic) ---
                const ssoRate = (companyConfig.ssoRate || 5) / 100;
                const ssoCap = companyConfig.ssoCap || 750;
                const ssoBase = currentJob.payType === 'Monthly' ? (currentJob.rate || 0) : basePay; // Use calculated base for hourly? Needs clarification. Assume monthly rate for now.
                const ssoDeduction = Math.min(ssoBase * ssoRate, ssoCap);
                const ssoAllowance = ssoDeduction;

                // --- Totals ---
                const totalEarnings = basePay + attendanceBonus + otherEarnings + ssoAllowance + leavePayoutTotal;
                const advanceDeduction = advancesData.filter(a => a.staffId === staff.id).reduce((sum, item) => sum + item.amount, 0);
                const loanDeduction = loansData.filter(l => l.staffId === staff.id).reduce((sum, item) => sum + item.monthlyRepayment, 0);
                const totalDeductions = autoDeductions + ssoDeduction + advanceDeduction + loanDeduction + otherDeductions;
                const netPay = totalEarnings - totalDeductions;

                return {
                    id: staff.id,
                    name: staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName,
                    displayName: displayName,
                    payType: currentJob.position, // Display position as 'payType' in UI? Check component usage
                    totalEarnings, totalDeductions, netPay,
                    bonusInfo: { newStreak: isLastMonth ? staff.bonusStreak : bonusInfo.newStreak }, // Keep existing streak if leaving
                    earnings: { basePay, attendanceBonus, ssoAllowance, leavePayout: leavePayoutTotal, leavePayoutDetails: leavePayout, others: otherEarningsList },
                    deductions: { absences: autoDeductions, unpaidAbsences: unpaidAbsences, totalAbsenceHours: totalAbsenceHours, sso: ssoDeduction, advance: advanceDeduction, loan: loanDeduction, others: otherDeductionsList }
                };
            });
            setPayrollData(data);
        } catch (err) { setError('Failed to generate payroll. Check browser console (F12) for details.'); console.error(err);
        } finally { setIsLoading(false); }
    };

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

        // Use standard date formatting for month name
        const payPeriodDate = dateUtils.parseISODateString(`${payPeriod.year}-${String(payPeriod.month).padStart(2, '0')}-01`);
        const monthName = dateUtils.formatCustom(payPeriodDate, 'MMMM');

        if (!window.confirm(`Are you sure you want to finalize payroll for ${dataToFinalize.length} employee(s) for ${monthName} ${payPeriod.year}?`)) { return; }

        setIsFinalizing(true);
        try {
            const functions = getFunctions();
            const finalizeAndStorePayslips = httpsCallable(functions, 'finalizeAndStorePayslips');
            await finalizeAndStorePayslips({ payrollData: dataToFinalize, payPeriod });
            alert("Payroll finalized and payslips stored successfully!");
            handleGeneratePayroll(); // Re-generate to update the list
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