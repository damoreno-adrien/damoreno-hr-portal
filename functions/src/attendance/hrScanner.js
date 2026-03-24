const { onCall, HttpsError } = require("firebase-functions/v2/https"); 
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const admin = require("firebase-admin");

if (admin.apps.length === 0) { admin.initializeApp(); }

let DateTime;
try {
    const luxon = require('luxon');
    DateTime = luxon.DateTime;
} catch(e) { console.error("hrScanner: FAILED to require luxon:", e); }

const db = getFirestore();
const timeZone = "Asia/Bangkok";

exports.runUnifiedHRScan = onCall({ region: "asia-southeast1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required");
    console.log("Running Unified HR Scan (Option 3 Hybrid + Reality Sync)...");

    try {
        const now = DateTime.now().setZone(timeZone);
        const targetDateStr = request.data.targetDate || now.minus({ days: 1 }).toISODate();
        
        const targetDateObj = DateTime.fromISO(targetDateStr, { zone: timeZone });
        const startOfMonthStr = targetDateObj.startOf('month').toISODate();
        const threeMonthsAgoStr = targetDateObj.minus({ months: 3 }).toISODate();
        const oneMonthAgoStr = targetDateObj.minus({ months: 1 }).toISODate();

        const configSnap = await db.collection("settings").doc("company_config").get();
        const config = configSnap.data() || {};
        
        const hrRules = {
            maxLateMins: config.attendanceBonus?.maxLateMinutesAllowed ?? 30,
            maxLateIncidents: config.attendanceBonus?.allowedLates ?? 3,
            maxAbsences: config.attendanceBonus?.allowedAbsences ?? 0,
            gracePeriodMins: config.attendanceBonus?.gracePeriodMinutes ?? 5,
            minOTMins: config.overtimeThreshold ?? 30, 
            otMultiplier: config.overtimeRate ?? 1, 
        };

        const discRules = config.disciplinaryRules || {};
        const tier1 = { name: discRules.tier1?.name || "Verbal Warning", strikes: discRules.tier1?.strikes || 1 };
        const tier2 = { name: discRules.tier2?.name || "Written Warning", strikes: discRules.tier2?.strikes || 2 };
        const tier3 = { name: discRules.tier3?.name || "1-Day Suspension", strikes: discRules.tier3?.strikes || 3 };

        const batch = db.batch();
        let alertsCreated = 0;

        // ====================================================================
        // REALITY SYNC: Delete all existing PENDING alerts for this target date
        // ====================================================================
        const staleAlertsSnap = await db.collection("manager_alerts")
            .where("date", "==", targetDateStr)
            .where("status", "==", "pending")
            .get();

        staleAlertsSnap.docs.forEach(docSnap => {
            batch.delete(docSnap.ref); // Vaporize the old tickets
        });

        // Gather 3 Months of Data
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

        const staffStats = {};

        for (const schedDoc of schedulesSnap.docs) {
            const shift = schedDoc.data();
            const staffId = shift.staffId;
            const shiftDate = shift.date;
            
            if (!staffStats[staffId]) {
                staffStats[staffId] = { 
                    name: shift.staffName, 
                    bonusIncidentsThisMonth: 0, bonusMinsThisMonth: 0,
                    strikesLast1Month: 0, strikesLast3Months: 0,
                    strikeToday: false, anyLateToday: false, lateMinsToday: 0, todayAttendanceId: null
                };
            }

            const attendance = attendanceMap.get(`${staffId}_${shiftDate}`);
            
            if (shiftDate === targetDateStr) {
                const hasLeave = leaveSnap.docs.some(lDoc => {
                    const l = lDoc.data();
                    return l.staffId === staffId && l.startDate <= targetDateStr && l.endDate >= targetDateStr;
                });

                if (!attendance && !hasLeave) {
                    const alertRef = db.collection("manager_alerts").doc();
                    batch.set(alertRef, { type: "risk_absence", status: "pending", staffId: staffId, staffName: shift.staffName, date: targetDateStr, createdAt: Timestamp.now(), message: "Unexcused Absence (Bonus Forfeited)" });
                    alertsCreated++;
                }
            }

            if (attendance && attendance.checkInTime && shift.startTime) {
                const checkInDate = attendance.checkInTime.toDate();
                const scheduledStart = DateTime.fromISO(`${shiftDate}T${shift.startTime}`, { zone: timeZone });
                const actualStart = DateTime.fromJSDate(checkInDate).setZone(timeZone);
                
                const lateDiffMins = actualStart.diff(scheduledStart, 'minutes').minutes;
                
                // ====================================================================
                // OPTION 3 (HYBRID): Every minute counts for Bonus, but Grace Period protects Strikes
                // ====================================================================
                if (lateDiffMins > 0) {
                    
                    // 1. Add to Monthly Bonus Bank (NO GRACE PERIOD HERE)
                    if (shiftDate >= startOfMonthStr) {
                        staffStats[staffId].bonusMinsThisMonth += lateDiffMins;
                        staffStats[staffId].bonusIncidentsThisMonth += 1;
                    }

                    // 2. Add to Disciplinary Strikes (GRACE PERIOD APPLIES HERE)
                    if (lateDiffMins > hrRules.gracePeriodMins) {
                        if (shiftDate >= threeMonthsAgoStr) staffStats[staffId].strikesLast3Months += 1;
                        if (shiftDate >= oneMonthAgoStr) staffStats[staffId].strikesLast1Month += 1;
                        
                        if (shiftDate === targetDateStr) staffStats[staffId].strikeToday = true;
                    }

                    if (shiftDate === targetDateStr) {
                        staffStats[staffId].anyLateToday = true;
                        staffStats[staffId].lateMinsToday = lateDiffMins;
                        staffStats[staffId].todayAttendanceId = attendance.id;
                    }
                }
            }

            if (shiftDate === targetDateStr && attendance && attendance.checkOutTime && shift.endTime) {
                const checkOutDate = attendance.checkOutTime.toDate();
                const scheduledEnd = DateTime.fromISO(`${targetDateStr}T${shift.endTime}`, { zone: timeZone });
                const actualEnd = DateTime.fromJSDate(checkOutDate).setZone(timeZone);
                const extraMins = actualEnd.diff(scheduledEnd, 'minutes').minutes;
                
                if (extraMins >= hrRules.minOTMins) {
                    const alertRef = db.collection("manager_alerts").doc();
                    batch.set(alertRef, { type: "overtime_request", status: "pending", staffId: staffId, staffName: shift.staffName, date: targetDateStr, extraMinutes: Math.round(extraMins), multiplier: hrRules.otMultiplier, attendanceDocId: attendance.id, createdAt: Timestamp.now(), message: `Pending OT Approval (${Math.round(extraMins)} mins)` });
                    alertsCreated++;
                }
            }
        }

        for (const [staffId, stats] of Object.entries(staffStats)) {
            if (stats.anyLateToday) {
                const lostBonus = (stats.bonusIncidentsThisMonth > hrRules.maxLateIncidents || stats.bonusMinsThisMonth > hrRules.maxLateMins);
                
                // Only alert the manager if they actually crossed a line (Strike or Lost Bonus)
                if (stats.strikeToday || lostBonus) {
                    let severityTitle = "Late Check-in";
                    let recommendedAction = "Warning";
                    
                    if (stats.strikesLast3Months >= tier3.strikes) {
                        severityTitle = `${stats.strikesLast3Months}rd Lateness (Last 90 Days)`;
                        recommendedAction = `Recommend: ${tier3.name}`;
                    } else if (stats.strikesLast1Month >= tier2.strikes) {
                        severityTitle = `${stats.strikesLast1Month}nd Lateness (Last 30 Days)`;
                        recommendedAction = `Recommend: ${tier2.name}`;
                    } else if (stats.strikesLast1Month >= tier1.strikes) {
                        severityTitle = `${stats.strikesLast1Month}st Lateness`;
                        recommendedAction = `Recommend: ${tier1.name}`;
                    } else if (lostBonus && !stats.strikeToday) {
                        severityTitle = `Micro-Lateness Accumulation`;
                        recommendedAction = `Under Grace Period, but Bonus Bank Reached`;
                    }

                    if (lostBonus) recommendedAction += " & Revoke Bonus";

                    const alertRef = db.collection("manager_alerts").doc();
                    batch.set(alertRef, { type: "risk_late", status: "pending", staffId: staffId, staffName: stats.name, date: targetDateStr, minutesLate: Math.round(stats.lateMinsToday), attendanceDocId: stats.todayAttendanceId, createdAt: Timestamp.now(), message: `${severityTitle} - ${recommendedAction}` });
                    alertsCreated++;
                }
            }
        }

        if (alertsCreated > 0) await batch.commit();
        return { success: true, alertsCreated: alertsCreated };

    } catch (error) { throw new HttpsError("internal", error.message); }
});