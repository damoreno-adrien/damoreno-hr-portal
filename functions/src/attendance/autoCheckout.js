const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
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
    console.error("autoCheckout: FAILED to require luxon:", e);
}

const db = getFirestore();
const timeZone = "Asia/Bangkok";

const performOperationalScan = async () => {
    console.log("Running Operational Scan (Shared Logic)...");

    if (!DateTime) {
        console.error("CRITICAL: Luxon library not loaded!");
        return { success: false, error: "Luxon missing" };
    }

    try {
        const now = DateTime.now().setZone(timeZone);
        const yesterdayStr = now.minus({ days: 1 }).toISODate();
        const startOfMonthStr = now.startOf('month').toISODate();
        const todayStr = now.toISODate();

        const [configSnap, activeStaffSnap] = await Promise.all([
            db.collection("settings").doc("company_config").get(),
            db.collection("staff_profiles").where("status", "!=", "inactive").get()
        ]);

        const config = configSnap.data() || {};
        const bonusRules = config.attendanceBonus || {};
        const batch = db.batch();
        let alertsCount = 0;

        // 1. SCAN FOR MISSING CHECKOUTS
        const openShiftsSnap = await db.collection("attendance")
            .where("checkOutTime", "==", null)
            .where("date", "<", todayStr) 
            .get();

        openShiftsSnap.forEach(doc => {
            const data = doc.data();
            if (data.date >= todayStr) return;

            const alertRef = db.collection("manager_alerts").doc(`missing_out_${doc.id}`);
            batch.set(alertRef, {
                type: "missing_checkout",
                status: "pending",
                attendanceDocId: doc.id,
                date: data.date,
                staffId: data.staffId,
                staffName: data.staffName || "Unknown",
                checkInTime: data.checkInTime,
                createdAt: Timestamp.now(),
                message: "Staff forgot to check out."
            });
            alertsCount++;
        });

        // 2. RISK ANALYSIS
        for (const staffDoc of activeStaffSnap.docs) {
            const staff = staffDoc.data();
            const staffId = staff.uid;

            const [attSnap, schedSnap] = await Promise.all([
                db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startOfMonthStr).where("date", "<=", yesterdayStr).get(),
                db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startOfMonthStr).where("date", "<=", yesterdayStr).get()
            ]);

            let lateCount = 0;
            let totalLateMinutes = 0;
            let absenceCount = 0;
            
            // --- NEW: Arrays to store details ---
            const lateIncidents = [];
            const absenceIncidents = [];
            // ------------------------------------
            
            const attendanceMap = new Map();
            attSnap.forEach(d => attendanceMap.set(d.data().date, d.data()));

            schedSnap.forEach(sDoc => {
                const sched = sDoc.data();
                if (sched.type !== 'work') return;

                const att = attendanceMap.get(sched.date);
                if (!att) {
                    absenceCount++;
                    // Track Absence Detail
                    absenceIncidents.push({ date: sched.date, shift: `${sched.startTime}-${sched.endTime}` });
                } else if (att.checkInTime && sched.startTime) {
                    try {
                        const checkIn = DateTime.fromJSDate(att.checkInTime.toDate()).setZone(timeZone);
                        const scheduled = DateTime.fromISO(`${sched.date}T${sched.startTime}`, { zone: timeZone });
                        
                        if (checkIn > scheduled) {
                            lateCount++;
                            const diffMs = checkIn.diff(scheduled).toMillis();
                            const mins = Math.floor(diffMs / 60000);
                            totalLateMinutes += mins;
                            // Track Late Detail
                            lateIncidents.push({ date: sched.date, minutes: mins, time: checkIn.toFormat('HH:mm') });
                        }
                    } catch(e) { console.error("Date parse error", e); }
                }
            });

            const maxLates = bonusRules.allowedLates || 3;
            const maxAbsences = bonusRules.allowedAbsences || 0;
            const maxLateMinutesAllowed = bonusRules.maxLateMinutesAllowed || 30;

            // A. Late Count Warning
            if (lateCount >= maxLates) {
                const alertId = `risk_late_${staffId}_${now.month}_${now.year}`;
                const alertRef = db.collection("manager_alerts").doc(alertId);
                const existingAlert = await alertRef.get();
                
                if (!existingAlert.exists || existingAlert.data().count !== lateCount) {
                     batch.set(alertRef, {
                        type: "risk_late",
                        status: "pending",
                        staffId: staffId,
                        staffName: staff.nickname || staff.firstName,
                        date: todayStr,
                        count: lateCount,
                        limit: maxLates,
                        details: lateIncidents, // <-- Save Details
                        createdAt: Timestamp.now(),
                        message: `High Risk: ${lateCount} Lateness incidents this month (Limit: ${maxLates})`
                    });
                    alertsCount++;
                }
            }

            // B. Late Minutes Warning
            if (totalLateMinutes > maxLateMinutesAllowed) {
                const alertId = `risk_late_min_${staffId}_${now.month}_${now.year}`;
                const alertRef = db.collection("manager_alerts").doc(alertId);
                const existingAlert = await alertRef.get();
                
                if (!existingAlert.exists || existingAlert.data().count !== totalLateMinutes) {
                     batch.set(alertRef, {
                        type: "risk_late",
                        status: "pending",
                        staffId: staffId,
                        staffName: staff.nickname || staff.firstName,
                        date: todayStr,
                        count: totalLateMinutes,
                        limit: maxLateMinutesAllowed,
                        details: lateIncidents, // <-- Save Details
                        createdAt: Timestamp.now(),
                        message: `High Risk: ${totalLateMinutes} total minutes late this month (Limit: ${maxLateMinutesAllowed})`
                    });
                    alertsCount++;
                }
            }

            // C. Absence Warning
            if (absenceCount > maxAbsences) {
                const alertId = `risk_absent_${staffId}_${now.month}_${now.year}`;
                const alertRef = db.collection("manager_alerts").doc(alertId);
                const existingAlert = await alertRef.get();

                if (!existingAlert.exists || existingAlert.data().count !== absenceCount) {
                    batch.set(alertRef, {
                        type: "risk_absence",
                        status: "pending",
                        staffId: staffId,
                        staffName: staff.nickname || staff.firstName,
                        date: todayStr,
                        count: absenceCount,
                        limit: maxAbsences,
                        details: absenceIncidents, // <-- Save Details
                        createdAt: Timestamp.now(),
                        message: `High Risk: ${absenceCount} Absences this month (Limit: ${maxAbsences})`
                    });
                    alertsCount++;
                }
            }
        }

        if (alertsCount > 0) {
            await batch.commit();
        }
        return { success: true, alertsCreated: alertsCount };

    } catch (error) {
        console.error("Error during operational scan:", error);
        return { success: false, error: error.message };
    }
};

exports.createMissingCheckoutAlerts = onSchedule({ 
    region: "asia-southeast1",
    schedule: "every day 05:00",
    timeZone: timeZone,
}, async (event) => {
    await performOperationalScan();
});

exports.runOperationalScan = onCall({ region: "asia-southeast1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required");
    const result = await performOperationalScan();
    if (!result.success) {
        throw new HttpsError("internal", result.error);
    }
    return { result: `Scan complete. ${result.alertsCreated} alerts processed.` };
});