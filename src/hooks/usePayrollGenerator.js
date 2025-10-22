import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { toLocalDateString } from '../utils/dateHelpers';

const getCurrentJob = (staff) => { if (!staff?.jobHistory || staff.jobHistory.length === 0) { return { rate: 0, payType: 'Monthly', department: 'N/A' }; } const latestJob = staff.jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0]; if (latestJob.rate === undefined && latestJob.baseSalary !== undefined) { return { ...latestJob, rate: latestJob.baseSalary, payType: 'Monthly' }; } return latestJob; };
const calculateHours = (start, end) => { if (!start?.toDate || !end?.toDate) return 0; const diffMillis = end.toDate() - start.toDate(); return diffMillis / (1000 * 60 * 60); };

export default function usePayrollGenerator(db, staffList, companyConfig, payPeriod) {
    const [payrollData, setPayrollData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [error, setError] = useState('');
    const [isMonthFullyFinalized, setIsMonthFullyFinalized] = useState(false);
    const [selectedForPayroll, setSelectedForPayroll] = useState(new Set());

    const handleGeneratePayroll = async () => {
        // Check for future pay period
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 1-indexed

        if (payPeriod.year > currentYear || (payPeriod.year === currentYear && payPeriod.month > currentMonth)) {
            setError("Cannot generate payroll for a future period.");
            setPayrollData([]);
            setIsMonthFullyFinalized(false);
            return;
        }

        // Check for periods before October 2025
        const earliestAllowedYear = 2025;
        const earliestAllowedMonth = 10; // October (1-indexed)

        if (payPeriod.year < earliestAllowedYear || (payPeriod.year === earliestAllowedYear && payPeriod.month < earliestAllowedMonth)) {
            setError(`Cannot generate payroll for periods before October 2025.`);
            setPayrollData([]);
            setIsMonthFullyFinalized(false);
            return;
        }


        if (!companyConfig) { setError("Company settings are not loaded yet. Please wait and try again."); return; }
        setIsLoading(true);
        setError('');
        setIsMonthFullyFinalized(false);

        try {
            const year = payPeriod.year;
            const month = payPeriod.month - 1; // JS months are 0-indexed
            const startDate = new Date(Date.UTC(year, month, 1));
            const endDate = new Date(Date.UTC(year, month + 1, 0));
            const startDateStr = toLocalDateString(startDate);
            const endDateStr = toLocalDateString(endDate);

            const finalizedPayslipsSnap = await getDocs(query(collection(db, "payslips"), where("payPeriodYear", "==", year), where("payPeriodMonth", "==", month + 1)));
            const finalizedStaffIds = new Set(finalizedPayslipsSnap.docs.map(doc => doc.data().staffId));

            // --- REVERTED eligibility filter ---
            const staffToProcess = staffList.filter(staff => {
                const isAlreadyFinalized = finalizedStaffIds.has(staff.id);
                const staffStartDate = new Date(staff.startDate);
                const staffEndDate = staff.endDate ? new Date(staff.endDate) : null;

                const hasStarted = staffStartDate <= endDate;
                const wasEmployedDuringPeriod = !staffEndDate || staffEndDate >= startDate;

                // Check for undefined, null, OR explicit 'active' status
                const isCurrentlyActive = staff.status === undefined || staff.status === null || staff.status === 'active';
                const leftThisPeriod = staffEndDate &&
                                       staffEndDate.getFullYear() === year &&
                                       staffEndDate.getMonth() === month;

                const isEligibleForPeriod = isCurrentlyActive || leftThisPeriod;

                return !isAlreadyFinalized && hasStarted && isEligibleForPeriod;
            });
            // --- END REVERT ---

            if (staffToProcess.length === 0 && staffList.length > 0) {
                setPayrollData([]);
                setIsMonthFullyFinalized(true); // Set flag if all eligible staff are finalized
                setIsLoading(false);
                return;
            }

            const daysInMonth = endDate.getUTCDate(); // Use getUTCDate for correct day count

            const functions = getFunctions();
            const calculateBonus = httpsCallable(functions, 'calculateBonus');

            // Fetch all necessary data in parallel
            const [
                attendanceSnapshot, scheduleSnapshot, allLeaveSnapshot, advancesSnapshot,
                loansSnapshot, adjustmentsSnapshot, bonusResults
            ] = await Promise.all([
                getDocs(query(collection(db, "attendance"), where("date", ">=", startDateStr), where("date", "<=", endDateStr))),
                getDocs(query(collection(db, "schedules"), where("date", ">=", startDateStr), where("date", "<=", endDateStr))),
                getDocs(query(collection(db, "leave_requests"), where("status", "==", "approved"))),
                getDocs(query(collection(db, "salary_advances"), where("payPeriodYear", "==", year), where("payPeriodMonth", "==", month + 1), where("status", "==", "approved"))),
                getDocs(query(collection(db, "loans"), where("isActive", "==", true))),
                getDocs(query(collection(db, "monthly_adjustments"), where("payPeriodYear", "==", year), where("payPeriodMonth", "==", month + 1))),
                Promise.all(staffToProcess.map(staff => calculateBonus({ staffId: staff.id, payPeriod: { year, month: month + 1 } }).then(result => ({ staffId: staff.id, ...result.data })).catch(err => ({ staffId: staff.id, bonusAmount: 0, newStreak: 0 }))))
            ]);

            // Process fetched data into usable formats
            const attendanceData = new Map(attendanceSnapshot.docs.map(doc => [`${doc.data().staffId}_${doc.data().date}`, doc.data()]));
            const scheduleData = scheduleSnapshot.docs.map(doc => doc.data());
            const allLeaveData = allLeaveSnapshot.docs.map(doc => doc.data());
            const advancesData = advancesSnapshot.docs.map(doc => doc.data());
            const loansData = loansSnapshot.docs.map(doc => doc.data());
            const adjustmentsData = adjustmentsSnapshot.docs.map(doc => doc.data());
            const bonusMap = new Map(bonusResults.map(res => [res.staffId, res]));
            const publicHolidays = companyConfig.publicHolidays.map(h => h.date);

            // Calculate payroll for each eligible staff member
            const data = staffToProcess.map(staff => {
                const currentJob = getCurrentJob(staff);
                const displayName = `${staff.nickname || staff.firstName} (${currentJob.department || 'N/A'})`;
                let basePay = 0;
                let autoDeductions = 0;
                let leavePayout = null;
                let unpaidAbsences = [];
                let totalAbsenceHours = 0;

                const staffEndDate = staff.endDate ? new Date(staff.endDate + 'T00:00:00') : null; // Add time to avoid timezone issues
                const isLastMonth = staffEndDate && staffEndDate.getFullYear() === year && staffEndDate.getMonth() === month;

                if (currentJob.payType === 'Monthly') {
                    const fullMonthSalary = currentJob.rate || 0;
                    const dailyRate = fullMonthSalary / daysInMonth;

                    // Handle proration and leave payout for the final month
                    if (isLastMonth) {
                        const daysWorked = staffEndDate.getUTCDate(); // Use UTC date
                        basePay = dailyRate * daysWorked;

                        // Calculate leave payout
                        const hireDate = new Date(staff.startDate);
                        const yearsOfService = (staffEndDate - hireDate) / (1000 * 60 * 60 * 24 * 365);
                        let annualLeaveEntitlement = 0;
                        if (yearsOfService >= 1) { annualLeaveEntitlement = companyConfig.annualLeaveDays; }
                        else if (hireDate.getFullYear() === year) { const monthsWorked = staffEndDate.getMonth() - hireDate.getMonth() + 1; annualLeaveEntitlement = Math.floor((companyConfig.annualLeaveDays / 12) * monthsWorked); }

                        const pastHolidays = companyConfig.publicHolidays.filter(h => new Date(h.date) <= staffEndDate && new Date(h.date).getFullYear() === year);
                        const earnedCredits = Math.min(pastHolidays.length, companyConfig.publicHolidayCreditCap);

                        const staffLeaveTaken = allLeaveData.filter(l => l.staffId === staff.id);
                        let usedAnnual = 0, usedPublicHoliday = 0;
                        staffLeaveTaken.forEach(l => {
                            if (new Date(l.startDate) <= staffEndDate) {
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

                    // Calculate absence deductions
                    const monthLeave = allLeaveData.filter(l => l.staffId === staff.id && new Date(l.startDate) <= endDate && new Date(l.endDate) >= startDate);
                    const staffSchedules = scheduleData.filter(s => s.staffId === staff.id);
                    staffSchedules.forEach(schedule => {
                        const scheduleDate = new Date(schedule.date + 'T00:00:00'); // Add time part
                        if (isLastMonth && scheduleDate > staffEndDate) return; // Skip days after leaving

                        const wasOnLeave = monthLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
                        const didAttend = attendanceData.has(`${staff.id}_${schedule.date}`);
                        if (!didAttend && !wasOnLeave && !publicHolidays.includes(schedule.date)) {

                            let durationHours = 0;
                            if (schedule.startTime && schedule.endTime) {
                                const start = new Date(`1970-01-01T${schedule.startTime}:00`);
                                const end = new Date(`1970-01-01T${schedule.endTime}:00`);
                                durationHours = (end - start) / (1000 * 60 * 60);
                                if (durationHours > 5) { durationHours -= 1; } // Subtract break time
                                durationHours = durationHours > 0 ? durationHours : 0;
                                totalAbsenceHours += durationHours;
                            }
                            unpaidAbsences.push({ date: schedule.date, hours: durationHours });
                        }
                    });
                    autoDeductions = dailyRate * unpaidAbsences.length;
                }

                // Calculate other earnings and deductions
                const staffAdjustments = adjustmentsData.filter(a => a.staffId === staff.id);
                const otherEarningsList = staffAdjustments.filter(a => a.type === 'Earning');
                const otherDeductionsList = staffAdjustments.filter(a => a.type === 'Deduction');
                const otherEarnings = otherEarningsList.reduce((sum, item) => sum + item.amount, 0);
                const otherDeductions = otherDeductionsList.reduce((sum, item) => sum + item.amount, 0);

                // Calculate bonus and leave payout total
                const bonusInfo = bonusMap.get(staff.id) || { bonusAmount: 0, newStreak: 0 };
                const attendanceBonus = isLastMonth ? 0 : bonusInfo.bonusAmount; // No bonus in the final month
                const leavePayoutTotal = leavePayout ? leavePayout.total : 0;

                // Calculate SSO (based on full salary, not prorated)
                const ssoRate = (companyConfig.ssoRate || 5) / 100;
                const ssoCap = companyConfig.ssoCap || 750;
                const ssoDeduction = Math.min((currentJob.rate || 0) * ssoRate, ssoCap);
                const ssoAllowance = ssoDeduction; // Allowance equals deduction

                // Calculate totals
                const totalEarnings = basePay + attendanceBonus + otherEarnings + ssoAllowance + leavePayoutTotal;

                const advanceDeduction = advancesData.filter(a => a.staffId === staff.id).reduce((sum, item) => sum + item.amount, 0);
                const loanDeduction = loansData.filter(l => l.staffId === staff.id).reduce((sum, item) => sum + item.monthlyRepayment, 0);

                const totalDeductions = autoDeductions + ssoDeduction + advanceDeduction + loanDeduction + otherDeductions;
                const netPay = totalEarnings - totalDeductions;

                // Return the final payslip object structure
                return {
                    id: staff.id,
                    name: staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName,
                    displayName: displayName,
                    payType: currentJob.position,
                    totalEarnings,
                    totalDeductions,
                    netPay,
                    bonusInfo: { newStreak: isLastMonth ? staff.bonusStreak : bonusInfo.newStreak },
                    earnings: {
                        basePay,
                        attendanceBonus,
                        ssoAllowance,
                        leavePayout: leavePayoutTotal,
                        leavePayoutDetails: leavePayout,
                        others: otherEarningsList
                    },
                    deductions: {
                        absences: autoDeductions,
                        unpaidAbsences: unpaidAbsences,
                        totalAbsenceHours: totalAbsenceHours,
                        sso: ssoDeduction,
                        advance: advanceDeduction,
                        loan: loanDeduction,
                        others: otherDeductionsList
                    }
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
        const monthName = new Date(payPeriod.year, payPeriod.month - 1).toLocaleString('default', { month: 'long' });
        if (!window.confirm(`Are you sure you want to finalize payroll for ${dataToFinalize.length} employee(s) for ${monthName} ${payPeriod.year}?`)) { return; }

        setIsFinalizing(true);
        try {
            const functions = getFunctions();
            const finalizeAndStorePayslips = httpsCallable(functions, 'finalizeAndStorePayslips');
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