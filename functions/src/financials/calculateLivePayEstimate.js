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
        // --- BULLETPROOF QUERIES: Fetch by staffId only, filter by date/status in memory to prevent crashes ---
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
        
        let hourlyRate = 0;
        if (isMonthly) {
            const standardHours = Number(job.standardDayHours) || 9; 
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

        // --- IN-MEMORY FILTERING FOR ADVANCES ---
        const allMonthAdvances = [];
        advancesRes.docs.forEach(d => {
            const data = d.data();
            const advDate = data.date || data.requestDate; // Backward compatibility
            if (advDate >= startStr && advDate <= endStr) {
                allMonthAdvances.push({ id: d.id, ...data });
            }
        });

        // --- IN-MEMORY FILTERING FOR LOANS ---
        const activeLoansList = [];
        loansRes.docs.forEach(d => {
            const data = d.data();
            // Active if explicitly 'active' OR if it has a remaining balance > 0
            if (data.status === 'active' || (data.remainingBalance !== undefined && data.remainingBalance > 0)) {
                activeLoansList.push({ id: d.id, ...data });
            }
        });

        // Only deduct Approved/Paid advances from the net pay
        const advancesTotal = allMonthAdvances
            .filter(adv => adv.status === 'approved' || adv.status === 'paid')
            .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

        // Deduct loan monthly repayment
        const loansTotal = activeLoansList.reduce((sum, d) => sum + (Number(d.monthlyRepayment) || 0), 0);
        
        const estimatedGross = earnings + overtimePay; 
        
        // --- SMART SSO ---
        let ssoDeduction = 0;
        let ssoAllowance = 0;

        // Apply SSO if staff is registered and earned money
        if (staff.isSsoRegistered !== false && estimatedGross > 0) {
            const ssoRate = (config.financialRules?.ssoRate || 5) / 100;
            const ssoMax = Number(config.financialRules?.ssoMaxContribution) || 875; 
            ssoDeduction = Math.min(Math.max(1650, estimatedGross) * ssoRate, ssoMax);
            ssoAllowance = ssoDeduction; 
        }

        // --- BONUS LOGIC ---
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

        // Calculate Final Net (Allowance cancels out the Deduction)
        const estimatedNet = estimatedGross + potentialBonus + ssoAllowance - (absenceDeduction + advancesTotal + loansTotal + ssoDeduction);

        return {
            contractDetails: { payType: job.payType, baseSalary: baseSalary, hourlyRate: hourlyRate },
            baseSalaryEarned: Math.round(earnings),
            overtimePay: Math.round(overtimePay), 
            potentialBonus: { amount: potentialBonus, onTrack: bonusOnTrack },
            ssoAllowance: Math.round(ssoAllowance), 
            deductions: { 
                absences: Math.round(absenceDeduction), 
                socialSecurity: Math.round(ssoDeduction), 
                salaryAdvances: Math.round(advancesTotal), 
                loanRepayment: Math.round(loansTotal) 
            },
            estimatedNetPay: Math.max(0, Math.round(estimatedNet)),
            monthAdvances: allMonthAdvances, // Sending ALL requests (including pending) to the UI
            activeLoans: activeLoansList     // Sending ALL active loans to the UI
        };

    } catch (error) {
        console.error("Error calculating live pay:", error);
        throw new OnCallHttpsError("internal", error.message);
    }
});