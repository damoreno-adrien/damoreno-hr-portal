/* functions/src/financials/calculateLivePayEstimate.js */

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

if (admin.apps.length === 0) admin.initializeApp();

let DateTime;
try {
    const luxon = require('luxon');
    DateTime = luxon.DateTime;
} catch(e) { console.error("Luxon failed"); }

const db = getFirestore();
const timeZone = "Asia/Bangkok";

const getCurrentJob = (staffProfile) => {
    const jobHistory = staffProfile.jobHistory || [];
    if (jobHistory.length === 0) return null;
    return [...jobHistory].sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
};

exports.calculateLivePayEstimateHandler = onCall({ region: "asia-southeast1" }, async (request) => {
    if (!DateTime) throw new OnCallHttpsError("internal", "Luxon dependency not loaded.");
    if (!request.auth) throw new OnCallHttpsError("unauthenticated", "User must be logged in.");

    const staffId = request.auth.uid;
    const nowZoned = DateTime.now().setZone(timeZone);
    const startOfMonth = nowZoned.startOf('month');
    const endOfMonth = nowZoned.endOf('month');
    
    const startStr = startOfMonth.toISODate();
    const endStr = endOfMonth.toISODate();

    try {
        const [staffProfileRes, configRes, attendanceRes, leaveRes, schedulesRes, advancesRes, loansRes] = await Promise.all([
            db.collection("staff_profiles").doc(staffId).get(),
            db.collection("settings").doc("company_config").get(),
            db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startStr).where("date", "<=", endStr).get(),
            db.collection("leave_requests").where("staffId", "==", staffId).where("status", "==", "approved").get(),
            db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startStr).where("date", "<=", endStr).get(),
            db.collection("salary_advances").where("staffId", "==", staffId).get(), 
            db.collection("loans").where("staffId", "==", staffId).get()             
        ]);

        if (!staffProfileRes.exists) throw new OnCallHttpsError("not-found", "Staff profile not found.");

        const staff = staffProfileRes.data();
        const config = configRes.data() || {};
        const job = getCurrentJob(staff);
        if (!job) throw new OnCallHttpsError("failed-precondition", "No job history found.");

        const payType = (job.payType || '').trim().toLowerCase();
        const isMonthly = (payType === 'salary' || payType === 'monthly');
        const baseSalary = Number(job.baseSalary) || 0;
        const standardHours = Number(job.standardDayHours) || 9; 
        
        let hourlyRate = 0;
        if (isMonthly) {
            hourlyRate = (baseSalary / 30) / standardHours;
        } else {
            hourlyRate = Number(job.hourlyRate) || 0;
        }

        const attendanceMap = {}; 
        attendanceRes.docs.forEach(doc => { const d = doc.data(); attendanceMap[d.date] = d; });

        const approvedLeaveDates = new Set();
        leaveRes.docs.forEach(doc => {
            const data = doc.data();
            if (data.endDate >= startStr && data.startDate <= endStr) {
                let curr = DateTime.fromISO(data.startDate);
                const end = DateTime.fromISO(data.endDate);
                while (curr <= end) { approvedLeaveDates.add(curr.toISODate()); curr = curr.plus({ days: 1 }); }
            }
        });

        let earnings = 0;
        let absenceDeduction = 0;
        let absenceHours = 0;
        let workedMinutes = 0;

        if (isMonthly) {
            const daysPassed = Math.max(0, nowZoned.day); 
            earnings = (baseSalary / 30) * daysPassed;

            schedulesRes.docs.forEach(doc => {
                const shift = doc.data();
                if (shift.date >= nowZoned.toISODate()) return; 

                const isAbsent = shift.startTime && !attendanceMap[shift.date] && !approvedLeaveDates.has(shift.date);
                const isRecordedAbsent = attendanceMap[shift.date] && (attendanceMap[shift.date].status === 'absent' || attendanceMap[shift.date].status === 'no-show');

                if (isAbsent || isRecordedAbsent) {
                    const start = DateTime.fromISO(`${shift.date}T${shift.startTime}`);
                    const end = DateTime.fromISO(`${shift.date}T${shift.endTime}`);
                    let shiftHours = end.diff(start, 'hours').hours;
                    if (shiftHours < 0) shiftHours += 24; 

                    const breakHours = (shift.includesBreak !== false && shiftHours >= 6) ? 1 : 0;
                    const netMissedHours = Math.max(0, shiftHours - breakHours);

                    absenceHours += netMissedHours;
                    absenceDeduction += (netMissedHours * hourlyRate);
                }
            });
        } else {
            Object.values(attendanceMap).forEach(d => {
                if (d.checkInTime && d.checkOutTime) {
                    const duration = (d.checkOutTime.toDate() - d.checkInTime.toDate()) / 60000;
                    const includesBreak = d.includesBreak !== false;
                    let breakMins = (includesBreak && duration >= 420) ? 60 : 0;
                    workedMinutes += Math.max(0, duration - breakMins);
                }
            });
            earnings = (workedMinutes / 60) * hourlyRate;
        }

        const overtimePay = ((staff.approvedOTMinutes || 0) / 60) * hourlyRate * 1.5;

        // --- LIVE OFFBOARDING LEAVE PAYOUT CALCULATION (Eliminates the Loophole) ---
        let offboardingPayout = 0;
        let offboardingDetails = null;

        if (staff.offboardingSettings && staff.endDate) {
            const endDateDT = DateTime.fromISO(staff.endDate);
            const startDT = DateTime.fromISO(startStr);
            const endDT = DateTime.fromISO(endStr);
            
            // Only calculate the payout if their final day falls within the current payroll month
            if (endDateDT >= startDT && endDateDT <= endDT) {
                
                // 1. Re-calculate live usage directly from the database
                const targetDate = new Date(staff.endDate);
                targetDate.setHours(23, 59, 59, 999);
                
                let usedAnnual = 0;
                let usedPhDaysOff = 0;
                let usedPhCashOuts = 0;
                
                leaveRes.docs.forEach(doc => {
                    const req = doc.data();
                    const reqDate = new Date(req.startDate);
                    if (reqDate.getFullYear() === targetDate.getFullYear()) {
                        if (req.leaveType === 'Annual Leave') usedAnnual += req.totalDays;
                    }
                    if (req.leaveType === 'Public Holiday (In Lieu)') usedPhDaysOff += req.totalDays;
                    if (req.leaveType === 'Cash Out Holiday Credits') usedPhCashOuts += req.totalDays;
                });

                // 2. Calculate true quotas based on exact seniority
                const hireDate = new Date(staff.startDate);
                const monthsOfService = (targetDate.getFullYear() - hireDate.getFullYear()) * 12 + (targetDate.getMonth() - hireDate.getMonth());
                
                let annualQuota = 0;
                if (monthsOfService >= 12) annualQuota = Number(config.annualLeaveDays) || 0;
                else if (monthsOfService > 0) annualQuota = Math.floor((Number(config.annualLeaveDays) / 12) * monthsOfService);
                
                const remainingAnnual = Math.max(0, annualQuota - usedAnnual);

                const allPassedHolidays = (config.publicHolidays || []).filter(h => {
                    const d = new Date(h.date);
                    return d && d <= targetDate && d >= hireDate;
                });
                const holidaysByYear = {};
                allPassedHolidays.forEach(h => {
                    const y = new Date(h.date).getFullYear();
                    if (!holidaysByYear[y]) holidaysByYear[y] = [];
                    holidaysByYear[y].push(h);
                });
                let cappedPastHolidays = [];
                Object.keys(holidaysByYear).sort().forEach(year => {
                    const sorted = holidaysByYear[year].sort((a,b) => new Date(a.date) - new Date(b.date));
                    cappedPastHolidays.push(...sorted.slice(0, 13));
                });
                const remainingAfterDaysOff = cappedPastHolidays.slice(usedPhDaysOff);
                const maxCap = config.maxHolidayBalance ?? config.publicHolidayCreditCap ?? 15;
                const bankedHolidays = remainingAfterDaysOff.slice(-maxCap);
                const remainingPh = Math.max(0, bankedHolidays.length - usedPhCashOuts);

                // 3. Compute final cash value based on precise daily rate
                const dailyRate = isMonthly ? (baseSalary / 30) : (hourlyRate * standardHours);
                let payoutAmount = 0;
                
                if (staff.offboardingSettings.payoutAnnualLeave) {
                    payoutAmount += (remainingAnnual * dailyRate);
                }
                if (staff.offboardingSettings.payoutPublicHolidays) {
                    payoutAmount += (remainingPh * dailyRate);
                }
                
                offboardingPayout = Math.round(payoutAmount);
                if (offboardingPayout > 0) {
                    offboardingDetails = {
                        annualDaysPaid: staff.offboardingSettings.payoutAnnualLeave ? remainingAnnual : 0,
                        phCreditsPaid: staff.offboardingSettings.payoutPublicHolidays ? remainingPh : 0,
                        dailyRate: Math.round(dailyRate),
                        totalAmount: offboardingPayout
                    };
                }
            }
        }
        // --- END OF OFFBOARDING LOGIC ---

        const advancesTotal = advancesRes.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(adv => (adv.date >= startStr && adv.date <= endStr) && (adv.status === 'approved' || adv.status === 'paid'))
            .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

        const loansTotal = loansRes.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(d => d.status === 'active' || (d.remainingBalance !== undefined && d.remainingBalance > 0))
            .reduce((sum, d) => sum + (Number(d.monthlyRepayment) || 0), 0);
        
        // Add the offboarding payout directly to their gross earnings!
        const estimatedGross = earnings + overtimePay + offboardingPayout; 
        
        let ssoDeduction = 0;
        let ssoAllowance = 0;

        if (staff.isSsoRegistered !== false && estimatedGross > 0) {
            const ssoRate = (config.financialRules?.ssoRate || 5) / 100;
            const ssoMax = Number(config.financialRules?.ssoMaxContribution) || 875; 
            ssoDeduction = Math.min(Math.max(1650, estimatedGross) * ssoRate, ssoMax);
            ssoAllowance = ssoDeduction; 
        }

        const totalLates = Object.values(attendanceMap).filter(d => d.status === 'Late').length;
        const bonusConfig = config.attendanceBonus || {};
        const bonusOnTrack = totalLates <= (bonusConfig.allowedLates || 3) && absenceHours === 0;
        
        let potentialBonus = 0;
        if (bonusOnTrack && staff.isAttendanceBonusEligible !== false) {
            const nextStreak = (staff.bonusStreak || 0) + 1;
            if (nextStreak === 1) potentialBonus = bonusConfig.month1 || 400;
            else if (nextStreak === 2) potentialBonus = bonusConfig.month2 || 800;
            else potentialBonus = bonusConfig.month3 || 1200;
        }

        const estimatedNet = estimatedGross + potentialBonus + ssoAllowance - (absenceDeduction + advancesTotal + loansTotal + ssoDeduction);

        return {
            contractDetails: { payType: job.payType, baseSalary: baseSalary, hourlyRate: hourlyRate },
            baseSalaryEarned: Math.round(earnings),
            overtimePay: Math.round(overtimePay), 
            offboardingPayout: offboardingDetails, // <-- We send this to the UI so you can show it on the Payslip!
            potentialBonus: { amount: potentialBonus, onTrack: bonusOnTrack },
            ssoAllowance: Math.round(ssoAllowance), 
            deductions: { 
                absences: Math.round(absenceDeduction), 
                socialSecurity: Math.round(ssoDeduction), 
                salaryAdvances: Math.round(advancesTotal), 
                loanRepayment: Math.round(loansTotal) 
            },
            estimatedNetPay: Math.max(0, Math.round(estimatedNet)),
            monthAdvances: advancesRes.docs.map(d => ({ id: d.id, ...d.data() })).filter(adv => adv.date >= startStr && adv.date <= endStr),
            activeLoans: loansRes.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.status === 'active' || (d.remainingBalance !== undefined && d.remainingBalance > 0))
        };

    } catch (error) {
        console.error("Error calculating live pay:", error);
        throw new OnCallHttpsError("internal", error.message);
    }
});