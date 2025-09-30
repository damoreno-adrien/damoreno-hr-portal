const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();

exports.createUser = functions.https.onRequest((req, res) => {
  // Use the cors middleware to handle the preflight request and set headers.
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
      console.error("Error verifying token:", error);
      return res.status(401).send({ error: "Unauthorized" });
    }

    const callerUid = decodedToken.uid;
    const db = admin.firestore();
    const userDocRef = db.collection("users").doc(callerUid);

    try {
      const userDoc = await userDocRef.get();
      if (!userDoc.exists || userDoc.data().role !== "manager") {
        return res.status(403).send({ error: "Permission denied." });
      }
    } catch (error) {
      console.error("Error checking manager role:", error);
      return res.status(500).send({ error: "Internal server error." });
    }

    const { email, password, fullName, position, department, startDate } = req.body;
    if (!email || !password || !fullName || !position || !department || !startDate) {
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

      // Create the first entry in the job history
      const initialJob = {
          position: position,
          department: department,
          startDate: startDate,
      };

      // Create the detailed profile with the new jobHistory array
      // NOTE: We are using add() which creates a random document ID
      await db.collection("staff_profiles").add({
        uid: newUserId,
        fullName: fullName,
        email: email,
        startDate: startDate, // Keep top-level start date for quick access
        jobHistory: [initialJob], // Save the job history as an array
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