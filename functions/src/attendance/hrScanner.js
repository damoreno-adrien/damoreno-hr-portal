const { onCall, HttpsError } = require("firebase-functions/v2/https"); 
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const admin = require("firebase-admin");

if (admin.apps.length === 0) {
    admin.initializeApp();
}

let DateTime;
try {
    const luxon = require('luxon');
    DateTime = luxon.DateTime;
} catch(e) {
    console.error("hrScanner: FAILED to require luxon:", e);
}

const db = getFirestore();
const timeZone = "Asia/Bangkok";

// ============================================================================
// THE UNIFIED HR SCAN (BONUS & 3-MONTH DISCIPLINARY AGGREGATOR)
// ============================================================================
exports.runUnifiedHRScan = onCall({ region: "asia-southeast1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required");
    console.log("Running Unified HR Scan with 3-Month Lookback...");

    try {
        const now = DateTime.now().setZone(timeZone);
        // By default, it scans yesterday's completed data, but can accept a specific date
        const targetDateStr = request.data.targetDate || now.minus({ days: 1 }).toISODate();
        
        // Date boundaries for calculations
        const targetDateObj = DateTime.fromISO(targetDateStr, { zone: timeZone });
        const startOfMonthStr = targetDateObj.startOf('month').toISODate();
        const threeMonthsAgoStr = targetDateObj.minus({ months: 3 }).toISODate();
        const oneMonthAgoStr = targetDateObj.minus({ months: 1 }).toISODate();

        // 1. Pull Dynamic Rules from Company Settings
        const configSnap = await db.collection("settings").doc("company_config").get();
        const config = configSnap.data() || {};
        
        const hrRules = {
            maxLateMins: config.attendanceBonusRules?.maxLateMinutesAllowed || 15,
            maxLateIncidents: config.attendanceBonusRules?.maxLateIncidentsAllowed || 3,
            maxAbsences: config.attendanceBonusRules?.maxAbsencesAllowed || 0,
            minOTMins: config.overtimeRules?.minimumMinutesForOT || 30,
            otMultiplier: config.overtimeRules?.defaultOTMultiplier || 1,
            gracePeriodMins: 5 // Built-in human leeway before a minute is considered "late"
        };

        const batch = db.batch();
        let alertsCreated = 0;

        // 2. Gather 3 Months of Data (For legal strike lookbacks)
        const [schedulesSnap, attendanceSnap, leaveSnap] = await Promise.all([
            db.collection("schedules").where("date", ">=", threeMonthsAgoStr).where("date", "<=", targetDateStr).get(),
            db.collection("attendance").where("date", ">=", threeMonthsAgoStr).where("date", "<=", targetDateStr).get(),
            db.collection("leave_requests").where("status", "==", "approved").get()
        ]);

        const attendanceMap = new Map();
        attendanceSnap.docs.forEach(doc => {
            const data = doc.data();
            attendanceMap.set(`${data.staffId}_${data.date}`, { id: doc.id, ...data });
        });

        // 3. Tally Stats per Staff Member
        const staffStats = {};

        for (const schedDoc of schedulesSnap.docs) {
            const shift = schedDoc.data();
            const staffId = shift.staffId;
            const shiftDate = shift.date;
            
            if (!staffStats[staffId]) {
                staffStats[staffId] = { 
                    name: shift.staffName, 
                    bonusIncidentsThisMonth: 0, 
                    bonusMinsThisMonth: 0,
                    strikesLast1Month: 0,
                    strikesLast3Months: 0,
                    lateToday: false,
                    lateMinsToday: 0,
                    todayAttendanceId: null
                };
            }

            const attendance = attendanceMap.get(`${staffId}_${shiftDate}`);
            
            // --- FILTER A: ABSENCE CHECK (Target Date Only) ---
            if (shiftDate === targetDateStr) {
                const hasLeave = leaveSnap.docs.some(lDoc => {
                    const l = lDoc.data();
                    return l.staffId === staffId && l.startDate <= targetDateStr && l.endDate >= targetDateStr;
                });

                if (!attendance && !hasLeave) {
                    const alertRef = db.collection("manager_alerts").doc();
                    batch.set(alertRef, {
                        type: "risk_absence",
                        status: "pending",
                        staffId: staffId,
                        staffName: shift.staffName,
                        date: targetDateStr,
                        createdAt: Timestamp.now(),
                        message: "Unexcused Absence (Bonus Forfeited)"
                    });
                    alertsCreated++;
                }
            }

            // --- FILTER B: LATENESS CALCULATION ---
            if (attendance && attendance.checkInTime && shift.startTime) {
                const checkInDate = attendance.checkInTime.toDate();
                const scheduledStart = DateTime.fromISO(`${shiftDate}T${shift.startTime}`, { zone: timeZone });
                const actualStart = DateTime.fromJSDate(checkInDate).setZone(timeZone);
                
                const lateDiffMins = actualStart.diff(scheduledStart, 'minutes').minutes;
                
                // If they exceeded the human grace period
                if (lateDiffMins > hrRules.gracePeriodMins) {
                    // Track for Legal Disciplinary Strikes
                    if (shiftDate >= threeMonthsAgoStr) staffStats[staffId].strikesLast3Months += 1;
                    if (shiftDate >= oneMonthAgoStr) staffStats[staffId].strikesLast1Month += 1;
                    
                    // Track for Current Month Bonus Eligibility
                    if (shiftDate >= startOfMonthStr) {
                        staffStats[staffId].bonusMinsThisMonth += lateDiffMins;
                        staffStats[staffId].bonusIncidentsThisMonth += 1;
                    }

                    // Flag if this lateness happened ON the target date we are scanning
                    if (shiftDate === targetDateStr) {
                        staffStats[staffId].lateToday = true;
                        staffStats[staffId].lateMinsToday = lateDiffMins;
                        staffStats[staffId].todayAttendanceId = attendance.id;
                    }
                }
            }

            // --- FILTER C: OVERTIME CHECK (Target Date Only) ---
            if (shiftDate === targetDateStr && attendance && attendance.checkOutTime && shift.endTime) {
                const checkOutDate = attendance.checkOutTime.toDate();
                const scheduledEnd = DateTime.fromISO(`${targetDateStr}T${shift.endTime}`, { zone: timeZone });
                const actualEnd = DateTime.fromJSDate(checkOutDate).setZone(timeZone);
                const extraMins = actualEnd.diff(scheduledEnd, 'minutes').minutes;
                
                if (extraMins >= hrRules.minOTMins) {
                    const alertRef = db.collection("manager_alerts").doc();
                    batch.set(alertRef, {
                        type: "overtime_request",
                        status: "pending",
                        staffId: staffId,
                        staffName: shift.staffName,
                        date: targetDateStr,
                        extraMinutes: Math.round(extraMins),
                        multiplier: hrRules.otMultiplier,
                        attendanceDocId: attendance.id,
                        createdAt: Timestamp.now(),
                        message: `Pending OT Approval (${Math.round(extraMins)} mins)`
                    });
                    alertsCreated++;
                }
            }
        }

        // 4. Generate Alerts based on Target Date Action & Historical Stats
        for (const [staffId, stats] of Object.entries(staffStats)) {
            
            // Only generate a disciplinary/bonus alert if they were actually late on the target date.
            if (stats.lateToday) {
                
                // Track 1: Did they just lose their bonus based on App Settings?
                const lostBonus = (stats.bonusIncidentsThisMonth > hrRules.maxLateIncidents || stats.bonusMinsThisMonth > hrRules.maxLateMins);
                
                // Track 2: Determine Legal Disciplinary Level based on Contract Annex B
                let severityTitle = "Late Check-in";
                let recommendedAction = "Warning";
                
                if (stats.strikesLast3Months >= 3) {
                    severityTitle = "3rd Lateness (Last 90 Days)";
                    recommendedAction = "Recommend: 1-Day Suspension";
                } else if (stats.strikesLast1Month >= 2) {
                    severityTitle = "2nd Lateness (Last 30 Days)";
                    recommendedAction = "Recommend: Written Warning";
                } else {
                    severityTitle = "1st Lateness";
                    recommendedAction = "Recommend: Verbal Warning";
                }

                if (lostBonus) recommendedAction += " & Revoke Bonus";

                const alertRef = db.collection("manager_alerts").doc();
                batch.set(alertRef, {
                    type: "risk_late",
                    status: "pending",
                    staffId: staffId,
                    staffName: stats.name,
                    date: targetDateStr,
                    minutesLate: Math.round(stats.lateMinsToday),
                    attendanceDocId: stats.todayAttendanceId,
                    createdAt: Timestamp.now(),
                    message: `${severityTitle} - ${recommendedAction}`
                });
                alertsCreated++;
            }
        }

        if (alertsCreated > 0) await batch.commit();
        return { success: true, alertsCreated: alertsCreated };

    } catch (error) {
        console.error("Error during Unified HR Scan:", error);
        throw new HttpsError("internal", error.message);
    }
});