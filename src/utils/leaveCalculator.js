/* src/utils/leaveCalculator.js */
import * as dateUtils from './dateUtils';
import { parseHireDate } from './staffUtils';

export const calculateStaffLeaveBalances = (staff, existingRequests = [], companyConfig, targetDate = new Date()) => {
    if (!staff || !companyConfig) return null;

    const currentYear = targetDate.getFullYear();
    const today = new Date(targetDate);
    today.setHours(23, 59, 59, 999);
    
    const hireDate = parseHireDate(staff.startDate);
    const monthsOfService = (today.getFullYear() - hireDate.getFullYear()) * 12 + (today.getMonth() - hireDate.getMonth());
    
    let availableAnnualQuota = 0;
    let accruedAnnual = 0;

    if (monthsOfService >= 12) { 
        availableAnnualQuota = Number(companyConfig.annualLeaveDays) || 0; 
        accruedAnnual = availableAnnualQuota;
    } else if (monthsOfService > 0) {
        accruedAnnual = Math.floor((Number(companyConfig.annualLeaveDays) / 12) * monthsOfService);
        availableAnnualQuota = 0; 
    }

    const sickQuota = Number(companyConfig.paidSickDays) || 30;
    const personalQuota = Number(companyConfig.paidPersonalDays) || 0;
    
    // 1. Fetch all holidays that have passed since hire date
    const allPassedHolidays = (companyConfig.publicHolidays || [])
        .filter(h => {
            const d = dateUtils.parseISODateString(h.date);
            return d && d <= today && d >= hireDate; 
        });

    // 2. Group them by Year
    const holidaysByYear = {};
    allPassedHolidays.forEach(h => {
        const hYear = dateUtils.parseISODateString(h.date).getFullYear();
        if (!holidaysByYear[hYear]) holidaysByYear[hYear] = [];
        holidaysByYear[hYear].push(h);
    });

    // 3. Apply the 13-Day Max Cap per year (Your Logic)
    let cappedPastHolidays = [];
    Object.keys(holidaysByYear).sort().forEach(year => {
        // Sort the holidays chronologically within that year
        const yearHolidays = holidaysByYear[year].sort((a, b) => dateUtils.parseISODateString(a.date) - dateUtils.parseISODateString(b.date));
        
        // Take a maximum of 13 holidays from this year
        cappedPastHolidays.push(...yearHolidays.slice(0, 13));
    });

    // --- FIX: Split the trackers for Days Off vs Cash Outs ---
    let used = { annual: 0, sick: 0, personal: 0, phDaysOff: 0, phCashOuts: 0 };
    
    existingRequests.forEach(req => {
        if (req.staffId !== staff.id || req.status === 'rejected') return; 
        
        const reqDate = dateUtils.parseISODateString(req.startDate);
        const isCurrentYear = reqDate && reqDate.getFullYear() === currentYear;

        // Split PH consumption
        if (req.leaveType === 'Public Holiday (In Lieu)') used.phDaysOff += req.totalDays;
        if (req.leaveType === 'Cash Out Holiday Credits') used.phCashOuts += req.totalDays;

        if (isCurrentYear) {
            if (req.leaveType === 'Annual Leave') used.annual += req.totalDays;
            if (req.leaveType === 'Sick Leave') used.sick += req.totalDays;
            if (req.leaveType === 'Personal Leave') used.personal += req.totalDays;
        }
    });

    // 1. Remove Days Off from the oldest banked holidays (Standard FIFO)
    const remainingAfterDaysOff = cappedPastHolidays.slice(used.phDaysOff);
    
    // 2. Apply Max Cap
    const maxCap = companyConfig.maxHolidayBalance ?? companyConfig.publicHolidayCreditCap ?? 15;
    const bankedHolidays = remainingAfterDaysOff.slice(-maxCap);

// 3. Find how many banked holidays are within the cash-out window
    const cashOutWindowDays = companyConfig.cashOutWindowDays ?? 60;
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - cashOutWindowDays);
    cutoffDate.setHours(0, 0, 0, 0);

    const cashableHolidays = bankedHolidays.filter(h => {
        const hDate = dateUtils.parseISODateString(h.date);
        return hDate >= cutoffDate;
    });

    // --- NEW: Create a year-by-year breakdown of the REMAINING credits ---
    const phBreakdown = {};
    const availableHolidays = bankedHolidays.slice(used.phCashOuts || 0); // Only look at what's left!

    availableHolidays.forEach(holiday => {
        const hDate = dateUtils.parseISODateString(holiday.date);
        if (hDate) {
            const year = hDate.getFullYear();
            phBreakdown[year] = (phBreakdown[year] || 0) + 1;
        }
    });

    // --- FIX 4: Deduct Cash Outs directly from the Cashable pool ---
    const finalCashable = Math.max(0, cashableHolidays.length - used.phCashOuts);
    const finalPhRemaining = Math.max(0, bankedHolidays.length - used.phCashOuts);
    const totalPhUsed = used.phDaysOff + used.phCashOuts;

    return {
        policy: staff.holidayPolicy || 'in_lieu',
        annual: { total: availableAnnualQuota, used: used.annual, remaining: Math.max(0, availableAnnualQuota - used.annual), accrued: accruedAnnual, isLocked: monthsOfService < 12 },
        sick: { total: sickQuota, used: used.sick, remaining: Math.max(0, sickQuota - used.sick) },
        personal: { total: personalQuota, used: used.personal, remaining: Math.max(0, personalQuota - used.personal) },
        // --- ADDED the breakdown object below ---
        ph: { total: maxCap, used: totalPhUsed, remaining: finalPhRemaining, cashable: finalCashable, breakdown: phBreakdown } 
    };
};