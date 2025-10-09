const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();

// createUser function (unchanged)
exports.createUser = onRequest({ region: "us-central1" }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).send({ error: "Method Not Allowed" });
    }

    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) {
      return res.status(401).send({ error: "Unauthorized" });
    }
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).send({ error: "Unauthorized" });
    }

    const db = admin.firestore();
    try {
      const callerDoc = await db.collection("users").doc(decodedToken.uid).get();
      if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        return res.status(403).send({ error: "Permission denied. Only managers can create users." });
      }
    } catch (error) {
      return res.status(500).send({ error: "Internal server error while verifying role." });
    }

    const { email, password, fullName, position, department, startDate, payType, rate } = req.body;
    if (!email || !password || !fullName || !position || !department || !startDate || !payType || !rate) {
        return res.status(400).send({ error: "Missing required user data." });
    }

    try {
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: fullName,
      });
      const newUserId = userRecord.uid;

      await db.collection("users").doc(newUserId).set({ role: "staff" });

      const initialJob = {
          position: position,
          department: department,
          startDate: startDate,
          payType: payType,
          rate: Number(rate),
      };

      await db.collection("staff_profiles").doc(newUserId).set({
        fullName: fullName,
        email: email,
        startDate: startDate, 
        uid: newUserId,
        jobHistory: [initialJob],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).send({ result: `Successfully created user ${email}` });
    } catch (error) {
      console.error("Error creating new user:", error);
      if (error.code === "auth/email-already-exists") {
        return res.status(409).send({ error: "This email is already in use." });
      }
      return res.status(500).send({ error: "An error occurred while creating the user." });
    }
  });
});

// deleteStaff function (unchanged)
exports.deleteStaff = onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const db = admin.firestore();
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can delete staff members.");
    }

    const staffId = request.data.staffId;
    if (!staffId) {
        throw new HttpsError("invalid-argument", "The function must be called with a 'staffId'.");
    }

    try {
        await admin.auth().deleteUser(staffId);

        const batch = db.batch();
        batch.delete(db.collection("users").doc(staffId));
        batch.delete(db.collection("staff_profiles").doc(staffId));

        const collectionsToDeleteFrom = ["schedules", "leave_requests", "attendance"];
        for (const collectionName of collectionsToDeleteFrom) {
            const querySnapshot = await db.collection(collectionName).where("staffId", "==", staffId).get();
            querySnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
        }
        
        await batch.commit();
        return { result: `Successfully deleted staff member ${staffId} and all their data.` };

    } catch (error) {
        console.error("Error deleting staff member:", error);
        throw new HttpsError("internal", "An error occurred while deleting the staff member.", error.message);
    }
});

// --- NEW FUNCTION ---
// This function calculates the bonus for a single staff member for a given month.
exports.calculateAndApplyBonus = onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth || !request.data.staffId || !request.data.payPeriod) {
        throw new HttpsError("invalid-argument", "Required data is missing.");
    }

    const db = admin.firestore();
    const { staffId, payPeriod } = request.data;
    const { year, month } = payPeriod;

    try {
        // 1. Get company bonus rules
        const configDoc = await db.collection("settings").doc("company_config").get();
        if (!configDoc.exists) throw new HttpsError("not-found", "Company config not found.");
        const bonusRules = configDoc.data().attendanceBonus;

        // 2. Get staff profile to read their current streak
        const staffProfileRef = db.collection("staff_profiles").doc(staffId);
        const staffProfileDoc = await staffProfileRef.get();
        if (!staffProfileDoc.exists) throw new HttpsError("not-found", "Staff profile not found.");
        
        const currentStreak = staffProfileDoc.data().bonusStreak || 0;

        // 3. Fetch attendance and schedule data for the pay period
        const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDate).where("date", "<=", endDate);
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDate).where("date", "<=", endDate);
        
        const [schedulesSnapshot, attendanceSnapshot] = await Promise.all([schedulesQuery.get(), attendanceQuery.get()]);
        const schedules = schedulesSnapshot.docs.map(doc => doc.data());
        const attendanceRecords = new Map(attendanceSnapshot.docs.map(doc => [doc.data().date, doc.data()]));

        // 4. Check if the employee qualifies
        let lateCount = 0;
        let absenceCount = 0;
        schedules.forEach(schedule => {
            const attendance = attendanceRecords.get(schedule.date);
            if (!attendance) {
                absenceCount++;
            } else {
                const scheduledStart = new Date(`${schedule.date}T${schedule.startTime}`);
                const actualCheckIn = attendance.checkInTime.toDate();
                if (actualCheckIn > scheduledStart) {
                    lateCount++;
                }
            }
        });

        let newStreak = 0;
        let bonusAmount = 0;

        if (absenceCount <= bonusRules.allowedAbsences && lateCount <= bonusRules.allowedLates) {
            // They qualify, increase streak and determine bonus
            newStreak = currentStreak + 1;
            if (newStreak === 1) bonusAmount = bonusRules.month1;
            else if (newStreak === 2) bonusAmount = bonusRules.month2;
            else bonusAmount = bonusRules.month3;
        } else {
            // They don't qualify, reset streak
            newStreak = 0;
            bonusAmount = 0;
        }

        // 5. Update the bonus streak in the staff's profile
        await staffProfileRef.update({ bonusStreak: newStreak });

        // 6. Return the calculated bonus
        return { bonusAmount };

    } catch (error) {
        console.error("Error calculating bonus:", error);
        throw new HttpsError("internal", "An error occurred while calculating the bonus.", error.message);
    }
});