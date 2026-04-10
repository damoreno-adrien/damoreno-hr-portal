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
    console.log("Running Unified HR Scan (Date Range Upgrade)...");

    try {
        const now = DateTime.now().setZone(timeZone);
        
        const startDateStr = request.data.startDate || now.minus({ days: 1 }).toISODate();
        const endDateStr = request.data.endDate || startDateStr; 
        
        const targetDates = [];
        let currDate = DateTime.fromISO(startDateStr, { zone: timeZone });
        const endDate = DateTime.fromISO(endDateStr, { zone: timeZone });
        
        while (currDate <= endDate) {
            targetDates.push(currDate.toISODate());
            currDate = currDate.plus({ days: 1 });
        }

        const startTargetObj = DateTime.fromISO(startDateStr, { zone: timeZone });
        const globalThreeMonthsAgoStr = startTargetObj.minus({ months: 3 }).toISODate();

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
        let staleAlertsDeleted = 0;

        const [schedulesSnap, attendanceSnap, leaveSnap, staffSnap] = await Promise.all([
            db.collection("schedules").where("date", ">=", globalThreeMonthsAgoStr).where("date", "<=", endDateStr).get(),
            db.collection("attendance").where("date", ">=", globalThreeMonthsAgoStr).where("date", "<=", endDateStr).get(),
            db.collection("leave_requests").where("status", "==", "approved").get(),
            db.collection("staff_profiles").get()
        ]);

        const attendanceMap = new Map();
        attendanceSnap.docs.forEach(doc => {
            const data = doc.data();
            attendanceMap.set(`${data.staffId}_${data.date}`, { id: doc.id, ...data });
        });

        // --- NEW: Added branchId to the staff map ---
        const staffProfilesMap = new Map();
        staffSnap.docs.forEach(doc => {
            const data = doc.data();
            let dept = '';
            let pos = '';
            if (data.jobHistory && data.jobHistory.length > 0) {
                const currentJob = [...data.jobHistory].sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0))[0];
                dept = currentJob.department || '';
                pos = currentJob.position || currentJob.title || '';
            }
            staffProfilesMap.set(doc.id, { department: dept, position: pos, branchId: data.branchId || null });
        });

        for (const targetDateStr of targetDates) {
            
            const staleAlertsSnap = await db.collection("manager_alerts")
                .where("date", "==", targetDateStr)
                .where("status", "==", "pending")
                .get();

            staleAlertsSnap.docs.forEach(docSnap => {
                batch.delete(docSnap.ref);
                staleAlertsDeleted++;
            });

            const targetDateObj = DateTime.fromISO(targetDateStr, { zone: timeZone });
            const startOfMonthStr = targetDateObj.startOf('month').toISODate();
            const threeMonthsAgoStr = targetDateObj.minus({ months: 3 }).toISODate();
            const oneMonthAgoStr = targetDateObj.minus({ months: 1 }).toISODate();

            const staffStats = {};

            for (const schedDoc of schedulesSnap.docs) {
                const shift = schedDoc.data();
                const staffId = shift.staffId;
                const shiftDate = shift.date;
                
                if (shiftDate > targetDateStr) continue;
                if (shiftDate < threeMonthsAgoStr) continue;
                
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
                        const profile = staffProfilesMap.get(staffId) || {};
                        const alertRef = db.collection("manager_alerts").doc();
                        batch.set(alertRef, { 
                            type: "risk_absence", 
                            status: "pending", 
                            staffId: staffId, 
                            staffName: shift.staffName, 
                            department: profile.department || null,
                            position: profile.position || null,
                            branchId: profile.branchId || null, // <-- Branch DNA injection
                            date: targetDateStr, 
                            createdAt: Timestamp.now(), message: "Unexcused Absence (Bonus Forfeited)" 
                        });
                        alertsCreated++;
                    }
                }

                if (attendance && attendance.checkInTime && shift.startTime) {
                    const checkInDate = attendance.checkInTime.toDate();
                    const scheduledStart = DateTime.fromISO(`${shiftDate}T${shift.startTime}`, { zone: timeZone });
                    const actualStart = DateTime.fromJSDate(checkInDate).setZone(timeZone);
                    
                    const lateDiffMins = actualStart.diff(scheduledStart, 'minutes').minutes;
                    
                    if (lateDiffMins > 0) {
                        if (shiftDate >= startOfMonthStr) {
                            staffStats[staffId].bonusMinsThisMonth += lateDiffMins;
                            staffStats[staffId].bonusIncidentsThisMonth += 1;
                        }

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

                if (shiftDate === targetDateStr && attendance && attendance.checkOutTime && attendance.checkInTime && shift.endTime && shift.startTime) {
                    if (attendance.otStatus !== "approved") {
                        const safeStartTime = shift.startTime.padStart(5, '0');
                        const safeEndTime = shift.endTime.padStart(5, '0');

                        const scheduledStart = DateTime.fromISO(`${shiftDate}T${safeStartTime}`, { zone: timeZone });
                        let scheduledEnd = DateTime.fromISO(`${targetDateStr}T${safeEndTime}`, { zone: timeZone });
                        
                        if (scheduledEnd < scheduledStart) {
                            scheduledEnd = scheduledEnd.plus({ days: 1 });
                        }

                        const actualStart = DateTime.fromJSDate(attendance.checkInTime.toDate()).setZone(timeZone);
                        const actualEnd = DateTime.fromJSDate(attendance.checkOutTime.toDate()).setZone(timeZone);
                        
                        if (actualEnd.isValid && scheduledEnd.isValid && actualStart.isValid) {
                            let totalExtraMins = 0;

                            if (actualEnd > scheduledEnd) {
                                totalExtraMins += actualEnd.diff(scheduledEnd, 'minutes').minutes;
                            }
                            
                            const otThreshold = Number(hrRules.minOTMins) || 30;
                            
                            if (totalExtraMins >= otThreshold) {
                                const profile = staffProfilesMap.get(staffId) || {};
                                const alertRef = db.collection("manager_alerts").doc();
                                batch.set(alertRef, { 
                                    type: "overtime_request", 
                                    status: "pending", 
                                    staffId: staffId, 
                                    staffName: shift.staffName, 
                                    department: profile.department || null,
                                    position: profile.position || null,
                                    branchId: profile.branchId || null, // <-- Branch DNA injection
                                    date: targetDateStr, 
                                    extraMinutes: Math.round(totalExtraMins), 
                                    multiplier: hrRules.otMultiplier, 
                                    attendanceDocId: attendance.id, 
                                    createdAt: Timestamp.now(), 
                                    message: `Pending OT Approval (${Math.round(totalExtraMins)} mins)` 
                                });
                                alertsCreated++;
                            }
                        }
                    }
                }
            } // End of SchedDoc loop

            for (const [staffId, stats] of Object.entries(staffStats)) {
                if (stats.anyLateToday) {
                    const lostBonus = (stats.bonusIncidentsThisMonth > hrRules.maxLateIncidents || stats.bonusMinsThisMonth > hrRules.maxLateMins);
                    
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

                        const profile = staffProfilesMap.get(staffId) || {}; 
                        const alertRef = db.collection("manager_alerts").doc();
                        batch.set(alertRef, { 
                            type: "risk_late", 
                            status: "pending", 
                            staffId: staffId, 
                            staffName: stats.name,
                            department: profile.department || null,
                            position: profile.position || null, 
                            branchId: profile.branchId || null, // <-- Branch DNA injection
                            date: targetDateStr, 
                            minutesLate: Math.round(stats.lateMinsToday), 
                            attendanceDocId: stats.todayAttendanceId, 
                            createdAt: Timestamp.now(), 
                            message: `${severityTitle} - ${recommendedAction}` 
                        });
                        alertsCreated++;
                    }
                }
            }
        } // END OF RANGE LOOP

        if (alertsCreated > 0 || staleAlertsDeleted > 0) await batch.commit();
        return { success: true, alertsCreated: alertsCreated, daysScanned: targetDates.length };

    } catch (error) { throw new HttpsError("internal", error.message); }
});