/* functions/src/attendance/hrScanner.js */

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

// Fonction pour générer 1st, 2nd, 3rd, 4th, etc.
function getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

exports.runUnifiedHRScan = onCall({ region: "asia-southeast1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required");
    
    // RBAC
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists) throw new HttpsError("unauthenticated", "User access record not found");
    
    const callerRole = callerDoc.data().role || 'staff';
    const allowedRoles = ['manager', 'admin', 'super_admin'];
    if (!allowedRoles.includes(callerRole)) {
        throw new HttpsError("permission-denied", "Access denied.");
    }

    const callerStaffDoc = await db.collection("staff_profiles").doc(request.auth.uid).get();
    const branchId = callerStaffDoc.exists ? (callerStaffDoc.data().branchId || 'global') : 'global';

    console.log(`Running Smart HR Scan - Caller: ${request.auth.uid}`);

    try {
        const now = DateTime.now().setZone(timeZone);
        const todayStr = now.toISODate();
        
        // On définit la fenêtre d'analyse : Les 90 derniers jours jusqu'à la date de fin demandée
        const endDateStr = request.data.endDate || todayStr; 
        const endTargetObj = DateTime.fromISO(endDateStr, { zone: timeZone });
        const ninetyDaysAgoStr = endTargetObj.minus({ days: 90 }).toISODate();
        const thirtyDaysAgoStr = endTargetObj.minus({ days: 30 }).toISODate();
        const startOfMonthStr = endTargetObj.startOf('month').toISODate();

        const configSnap = await db.collection("settings").doc("company_config").get();
        const rawConfig = configSnap.data() || {};
        const branchOverrides = rawConfig.branchSettings?.[branchId] || {};
        const config = { ...rawConfig, ...branchOverrides };
        
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

        // 1. AUTO-NETTOYAGE : On supprime toutes les alertes Pending de cette branche
        const staleAlertsSnap = await db.collection("manager_alerts")
            .where("status", "==", "pending")
            .get();

        staleAlertsSnap.docs.forEach(docSnap => {
            const alertData = docSnap.data();
            if (branchId === 'global' || alertData.branchId === branchId) {
                batch.delete(docSnap.ref);
                staleAlertsDeleted++;
            }
        });

        // 2. RECUPERATION DES DONNEES (Fenêtre de 90 jours)
        const [schedulesSnap, attendanceSnap, leaveSnap, staffSnap] = await Promise.all([
            db.collection("schedules").where("date", ">=", ninetyDaysAgoStr).where("date", "<=", endDateStr).get(),
            db.collection("attendance").where("date", ">=", ninetyDaysAgoStr).where("date", "<=", endDateStr).get(),
            db.collection("leave_requests").where("status", "==", "approved").get(),
            db.collection("staff_profiles").get()
        ]);

        const attendanceMap = new Map();
        attendanceSnap.docs.forEach(doc => {
            const data = doc.data();
            attendanceMap.set(`${data.staffId}_${data.date}`, { id: doc.id, ...data });
        });

        const staffProfilesMap = new Map();
        staffSnap.docs.forEach(doc => {
            const data = doc.data();
            let dept = ''; let pos = '';
            if (data.jobHistory && data.jobHistory.length > 0) {
                const currentJob = [...data.jobHistory].sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0))[0];
                dept = currentJob.department || '';
                pos = currentJob.position || currentJob.title || '';
            }
            // On sauvegarde aussi lastDisciplinaryAction pour savoir ce qui est déjà puni
            staffProfilesMap.set(doc.id, { 
                department: dept, position: pos, branchId: data.branchId || null, 
                lastActionDate: data.lastDisciplinaryAction || "1970-01-01" 
            });
        });

        const staffStats = {};

        // 3. ANALYSE ET AGRÉGATION
        for (const schedDoc of schedulesSnap.docs) {
            const shift = schedDoc.data();
            const staffId = shift.staffId;
            const shiftDate = shift.date;
            
            if (!staffStats[staffId]) {
                staffStats[staffId] = { 
                    name: shift.staffName, 
                    profile: staffProfilesMap.get(staffId) || {},
                    incidents: [], 
                    otRequests: [],
                    bonusMinsThisMonth: 0, 
                    bonusIncidentsThisMonth: 0
                };
            }

            const stats = staffStats[staffId];
            const isPunished = shiftDate <= stats.profile.lastActionDate; // Vrai si déjà sanctionné dans le passé
            const attendance = attendanceMap.get(`${staffId}_${shiftDate}`);
            
            const hasLeave = leaveSnap.docs.some(lDoc => {
                const l = lDoc.data();
                return l.staffId === staffId && l.startDate <= shiftDate && l.endDate >= shiftDate;
            });

            // A. Détection Absence (Uniquement pour les dates passées ou aujourd'hui)
            if (!attendance && !hasLeave && shiftDate <= todayStr) {
                stats.incidents.push({ date: shiftDate, type: "Absence", minutesLate: 0, isPunished: isPunished });
            }

            // B. Détection Retard
            if (attendance && attendance.checkInTime && shift.startTime) {
                const scheduledStart = DateTime.fromISO(`${shiftDate}T${shift.startTime}`, { zone: timeZone });
                const actualStart = DateTime.fromJSDate(attendance.checkInTime.toDate()).setZone(timeZone);
                const lateDiffMins = actualStart.diff(scheduledStart, 'minutes').minutes;
                
                if (lateDiffMins > hrRules.gracePeriodMins) {
                    stats.incidents.push({ date: shiftDate, type: "Late", minutesLate: Math.round(lateDiffMins), isPunished: isPunished, attendanceId: attendance.id });
                }
                
                if (lateDiffMins > 0 && shiftDate >= startOfMonthStr) {
                    stats.bonusMinsThisMonth += lateDiffMins;
                    stats.bonusIncidentsThisMonth += 1;
                }
            }

            // C. Détection Overtime
            if (attendance && attendance.checkOutTime && attendance.checkInTime && shift.endTime && attendance.otStatus !== "approved") {
                const safeStartTime = shift.startTime.padStart(5, '0');
                const safeEndTime = shift.endTime.padStart(5, '0');
                const scheduledStart = DateTime.fromISO(`${shiftDate}T${safeStartTime}`, { zone: timeZone });
                let scheduledEnd = DateTime.fromISO(`${shiftDate}T${safeEndTime}`, { zone: timeZone });
                
                if (scheduledEnd < scheduledStart) scheduledEnd = scheduledEnd.plus({ days: 1 });

                const actualEnd = DateTime.fromJSDate(attendance.checkOutTime.toDate()).setZone(timeZone);
                
                if (actualEnd.isValid && scheduledEnd.isValid && actualEnd > scheduledEnd) {
                    const totalExtraMins = actualEnd.diff(scheduledEnd, 'minutes').minutes;
                    if (totalExtraMins >= hrRules.minOTMins) {
                        stats.otRequests.push({ date: shiftDate, minutes: Math.round(totalExtraMins), attendanceId: attendance.id });
                    }
                }
            }
        }

        // 4. GENERATION DES ALERTES
        for (const [staffId, stats] of Object.entries(staffStats)) {
            const profile = stats.profile;
            const unpunishedIncidents = stats.incidents.filter(i => !i.isPunished);
            
            // Le bonus est-il cassé ce mois-ci, et n'a-t-il pas encore été puni ce mois-ci ?
            const bonusAlreadyRevoked = profile.lastActionDate >= startOfMonthStr;
            const lostBonus = (stats.bonusIncidentsThisMonth > hrRules.maxLateIncidents || stats.bonusMinsThisMonth > hrRules.maxLateMins);

            // Création de l'Alerte Disciplinaire (Dossier Unique)
            if (unpunishedIncidents.length > 0 || (lostBonus && !bonusAlreadyRevoked)) {
                
                const strikes90 = stats.incidents.length;
                const strikes30 = stats.incidents.filter(i => i.date >= thirtyDaysAgoStr).length;

                let severityTitle = "Attendance Violation";
                let recommendedAction = "Warning";

                if (strikes90 >= tier3.strikes) {
                    severityTitle = `${getOrdinal(strikes90)} Infraction (Last 90 Days)`;
                    recommendedAction = `Recommend: ${tier3.name}`;
                } else if (strikes30 >= tier2.strikes) {
                    severityTitle = `${getOrdinal(strikes30)} Infraction (Last 30 Days)`;
                    recommendedAction = `Recommend: ${tier2.name}`;
                } else if (strikes90 >= tier1.strikes) {
                    severityTitle = `${getOrdinal(strikes90)} Infraction`;
                    recommendedAction = `Recommend: ${tier1.name}`;
                } else if (lostBonus) {
                    severityTitle = `Micro-Lateness Accumulation`;
                    recommendedAction = `Bonus Bank Reached`;
                }

                if (lostBonus) recommendedAction += " & Revoke Bonus";

                // Tri chronologique des incidents pour le dossier
                stats.incidents.sort((a, b) => a.date.localeCompare(b.date));

                const alertRef = db.collection("manager_alerts").doc();
                batch.set(alertRef, { 
                    type: "risk_disciplinary", 
                    status: "pending", 
                    staffId: staffId, 
                    staffName: stats.name,
                    department: profile.department || null,
                    position: profile.position || null, 
                    branchId: profile.branchId || null,
                    date: endDateStr, 
                    createdAt: Timestamp.now(), 
                    message: `${severityTitle} - ${recommendedAction}`,
                    incidentHistory: stats.incidents, // Le fameux Dossier Complet !
                    unpunishedCount: unpunishedIncidents.length
                });
                alertsCreated++;
            }

            // Création des requêtes Overtime
            for (const ot of stats.otRequests) {
                const alertRef = db.collection("manager_alerts").doc();
                batch.set(alertRef, { 
                    type: "overtime_request", 
                    status: "pending", 
                    staffId: staffId, 
                    staffName: stats.name, 
                    department: profile.department || null,
                    position: profile.position || null,
                    branchId: profile.branchId || null,
                    date: ot.date, 
                    extraMinutes: ot.minutes, 
                    multiplier: hrRules.otMultiplier, 
                    attendanceDocId: ot.attendanceId, 
                    createdAt: Timestamp.now(), 
                    message: `Pending OT Approval (${ot.minutes} mins)` 
                });
                alertsCreated++;
            }
        }

        if (alertsCreated > 0 || staleAlertsDeleted > 0) await batch.commit();
        return { success: true, alertsCreated: alertsCreated, alertsDeleted: staleAlertsDeleted };

    } catch (error) { 
        console.error("hrScanner error:", error);
        throw new HttpsError("internal", error.message); 
    }
});