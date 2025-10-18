const { HttpsError, https } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const cors = require("cors")({ origin: true });

const db = getFirestore();

exports.createUserHandler = https.onRequest({ region: "us-central1" }, (req, res) => {
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