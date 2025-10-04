// Use the v2 library for HTTP functions
const {onRequest} = require("firebase-functions/v2/https"); 
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();

// Export the function using the v2 syntax
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

    const { email, password, fullName, position, department, startDate, baseSalary } = req.body;
    if (!email || !password || !fullName || !position || !department || !startDate || !baseSalary) {
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
          baseSalary: Number(baseSalary),
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