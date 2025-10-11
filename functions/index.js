const { HttpsError, https } = require("firebase-functions/v2");
const { onSchedule } = require("firebase-functions/v2/scheduler"); // Correct import for scheduled functions
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = getFirestore();

// --- HTTP Function (Correct) ---
exports.createUser = https.onRequest({ region: "us-central1" }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") { return res.status(405).send({ error: "Method Not Allowed" }); }
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) { return res.status(401).send({ error: "Unauthorized" }); }
    let decodedToken;
    try { decodedToken = await admin.auth().verifyIdToken(idToken); }
    catch (error) { return res.status(401).send({ error: "Unauthorized" }); }

    try {
      const callerDoc = await db.collection("users").doc(decodedToken.uid).get();
      if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        return res.status(403).send({ error: "Permission denied. Only managers can create users." });
      }
    } catch (error) { return res.status(500).send({ error: "Internal server error while verifying role." }); }

    const { email, password, firstName, lastName, nickname, position, department, startDate, payType, rate } = req.body;
    if (!email || !password || !firstName || !lastName || !nickname || !position || !department || !startDate || !payType || !rate) {
        return res.status(400).send({ error: "Missing required user data." });
    }
    try {
      const userRecord = await admin.auth().createUser({ email, password, displayName: nickname });
      const newUserId = userRecord.uid;
      await db.collection("users").doc(newUserId).set({ role: "staff" });
      const initialJob = { position, department, startDate, payType, rate: Number(rate) };
      await db.collection("staff_profiles").doc(newUserId).set({
        firstName, lastName, nickname, email, startDate, uid: newUserId,
        jobHistory: [initialJob],
        createdAt: FieldValue.serverTimestamp(),
        bonusStreak: 0
      });
      return res.status(200).send({ result: `Successfully created user ${email}` });
    } catch (error) {
      console.error("Error creating new user:", error);
      if (error.code === "auth/email-already-exists") { return res.status(409).send({ error: "This email is already in use." }); }
      return res.status(500).send({ error: "An error occurred while creating the user." });
    }
  });
});

// --- Callable Functions (Correct) ---
exports.deleteStaff = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) { throw new HttpsError("unauthenticated", "The function must be called while authenticated."); }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") { throw new HttpsError("permission-denied", "Only managers can delete staff members."); }
    const staffId = request.data.staffId;
    if (!staffId) { throw new HttpsError("invalid-argument", "The function must be called with a 'staffId'."); }
    try {
        await admin.auth().deleteUser(staffId);
        const batch = db.batch();
        batch.delete(db.collection("users").doc(staffId));
        batch.delete(db.collection("staff_profiles").doc(staffId));
        const collectionsToDeleteFrom = ["schedules", "leave_requests", "attendance"];
        for (const collectionName of collectionsToDeleteFrom) {
            const querySnapshot = await db.collection(collectionName).where("staffId", "==", staffId).get();
            querySnapshot.forEach(doc => { batch.delete(doc.ref); });
        }
        await batch.commit();
        return { result: `Successfully deleted staff member ${staffId} and all their data.` };
    } catch (error) {
        console.error("Error deleting staff member:", error);
        throw new HttpsError("internal", "An error occurred while deleting the staff member.", error.message);
    }
});

exports.calculateBonus = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth || !request.data.staffId || !request.data.payPeriod) { throw new HttpsError("invalid-argument", "Required data is missing."); }
    const { staffId, payPeriod } = request.data;
    const { year, month } = payPeriod;
    try {
        const configDoc = await db.collection("settings").doc("company_config").get();
        if (!configDoc.exists) throw new HttpsError("not-found", "Company config not found.");
        const bonusRules = configDoc.data().attendanceBonus;
        const staffProfileDoc = await db.collection("staff_profiles").doc(staffId).get();
        if (!staffProfileDoc.exists) throw new HttpsError("not-found", "Staff profile not found.");
        const currentStreak = staffProfileDoc.data().bonusStreak || 0;
        const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDate).where("date", "<=", endDate);
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDate).where("date", "<=", endDate);
        const [schedulesSnapshot, attendanceSnapshot] = await Promise.all([schedulesQuery.get(), attendanceQuery.get()]);
        const schedules = schedulesSnapshot.docs.map(doc => doc.data());
        const attendanceRecords = new Map(attendanceSnapshot.docs.map(doc => [doc.data().date, doc.data()]));
        let lateCount = 0;
        let absenceCount = 0;
        schedules.forEach(schedule => {
            const attendance = attendanceRecords.get(schedule.date);
            if (!attendance) { absenceCount++; }
            else {
                const scheduledStart = new Date(`${schedule.date}T${schedule.startTime}`);
                const actualCheckIn = attendance.checkInTime.toDate();
                if (actualCheckIn > scheduledStart) { lateCount++; }
            }
        });
        let newStreak = 0;
        let bonusAmount = 0;
        if (absenceCount <= bonusRules.allowedAbsences && lateCount <= bonusRules.allowedLates) {
            newStreak = currentStreak + 1;
            if (newStreak === 1) bonusAmount = bonusRules.month1;
            else if (newStreak === 2) bonusAmount = bonusRules.month2;
            else bonusAmount = bonusRules.month3;
        }
        return { bonusAmount, newStreak };
    } catch (error) {
        console.error("Error calculating bonus:", error);
        throw new HttpsError("internal", "An error occurred while calculating the bonus.", error.message);
    }
});

exports.finalizePayrollStreaks = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth || !request.data.payrollResults) { throw new HttpsError("invalid-argument", "Payroll results are missing."); }
    const batch = db.batch();
    request.data.payrollResults.forEach(result => {
        const staffRef = db.collection("staff_profiles").doc(result.staffId);
        batch.update(staffRef, { bonusStreak: result.newStreak });
    });
    await batch.commit();
    return { result: "Bonus streaks updated successfully." };
});

exports.calculateAdvanceEligibility = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) { throw new HttpsError("unauthenticated", "You must be logged in to perform this action."); }
    const staffId = request.auth.uid;
    try {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDateOfMonthStr = new Date(year, month, 1).toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];
        const staffProfileDoc = await db.collection("staff_profiles").doc(staffId).get();
        if (!staffProfileDoc.exists) throw new HttpsError("not-found", "Staff profile could not be found.");
        const jobHistory = staffProfileDoc.data().jobHistory || [];
        const latestJob = jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
        if (!latestJob || latestJob.payType !== 'Monthly' || !latestJob.rate) { throw new HttpsError("failed-precondition", "This feature is only for monthly salary staff."); }
        const baseSalary = latestJob.rate;
        const dailyRate = baseSalary / daysInMonth;
        const configDoc = await db.collection("settings").doc("company_config").get();
        const publicHolidays = configDoc.exists ? configDoc.data().publicHolidays.map(h => h.date) : [];
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr);
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr);
        const leaveQuery = db.collection("leave_requests").where("staffId", "==", staffId).where("status", "==", "approved").where("startDate", "<=", todayStr);
        const [schedulesSnap, attendanceSnap, leaveSnap] = await Promise.all([schedulesQuery.get(), attendanceQuery.get(), leaveQuery.get()]);
        const schedules = schedulesSnap.docs.map(doc => doc.data());
        const attendanceDates = new Set(attendanceSnap.docs.map(doc => doc.data().date));
        const approvedLeave = leaveSnap.docs.map(doc => doc.data());
        let unpaidAbsences = 0;
        schedules.forEach(schedule => {
            const isPublicHoliday = publicHolidays.includes(schedule.date);
            const isOnLeave = approvedLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
            const didAttend = attendanceDates.has(schedule.date);
            if (!didAttend && !isOnLeave && !isPublicHoliday) { unpaidAbsences++; }
        });
        const absenceDeductions = dailyRate * unpaidAbsences;
        const currentSalaryDue = Math.max(0, baseSalary - absenceDeductions);
        const maxAdvance = Math.floor(currentSalaryDue * 0.5);
        return { maxAdvance, currentSalaryDue, baseSalary, absenceDeductions, unpaidAbsences };
    } catch (error) {
        console.error("Error in calculateAdvanceEligibility:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred.", error.message);
    }
});

// --- Scheduled Function (Correct) ---
exports.autoCheckout = onSchedule({ region: "us-central1", schedule: "every day 05:00" }, async (event) => {
    console.log("Running auto-checkout function.");
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const attendanceQuery = db.collection("attendance")
        .where("date", "==", yesterdayStr)
        .where("checkInTime", "!=", null)
        .where("checkOutTime", "==", null);
    const incompleteRecordsSnap = await attendanceQuery.get();
    if (incompleteRecordsSnap.empty) {
        console.log("No incomplete records found for yesterday. Exiting.");
        return null;
    }
    console.log(`Found ${incompleteRecordsSnap.size} incomplete records for ${yesterdayStr}.`);
    const schedulesQuery = db.collection("schedules").where("date", "==", yesterdayStr);
    const schedulesSnap = await schedulesQuery.get();
    const schedulesMap = new Map();
    schedulesSnap.forEach(doc => {
        const data = doc.data();
        schedulesMap.set(data.staffId, data);
    });
    const batch = db.batch();
    let updatedCount = 0;
    incompleteRecordsSnap.forEach(doc => {
        const attendanceData = doc.data();
        const staffSchedule = schedulesMap.get(attendanceData.staffId);
        if (staffSchedule && staffSchedule.endTime) {
            const [hours, minutes] = staffSchedule.endTime.split(':');
            const checkoutDate = new Date(yesterday);
            checkoutDate.setHours(hours, minutes, 0, 0);
            batch.update(doc.ref, { checkOutTime: checkoutDate });
            updatedCount++;
            console.log(`Scheduling update for ${attendanceData.staffName} with checkout time ${checkoutDate.toISOString()}`);
        } else {
            console.log(`Could not find a schedule with an end time for ${attendanceData.staffName}. Skipping.`);
        }
    });
    if (updatedCount > 0) {
        await batch.commit();
        console.log(`Successfully updated ${updatedCount} records.`);
    } else {
        console.log("No records were updated.");
    }
    return null;
});