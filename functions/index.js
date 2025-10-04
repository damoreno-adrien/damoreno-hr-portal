const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();

exports.createUser = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).send({ error: "Method Not Allowed" });
    }

    // 1. Verify the token of the user making the request (the manager)
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

    // 2. Check if the verified user has the 'manager' role
    const db = admin.firestore();
    try {
      const callerDoc = await db.collection("users").doc(decodedToken.uid).get();
      if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        return res.status(403).send({ error: "Permission denied. Only managers can create users." });
      }
    } catch (error) {
      return res.status(500).send({ error: "Internal server error while verifying role." });
    }

    // 3. Get the new user's data from the request body
    const { email, password, fullName, position, department, startDate, baseSalary } = req.body;
    if (!email || !password || !fullName || !position || !department || !startDate || !baseSalary) {
        return res.status(400).send({ error: "Missing required user data." });
    }

    try {
      // 4. Create the Firebase Authentication user
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: fullName,
      });
      const newUserId = userRecord.uid;

      // 5. Create the 'users' document with the 'staff' role
      await db.collection("users").doc(newUserId).set({ role: "staff" });

      // 6. ***CORRECTED FIX***: Create the initial job object for the job history
      const initialJob = {
          position: position,
          department: department,
          startDate: startDate, // This should be the job's start date, not user's general start date if different
          baseSalary: Number(baseSalary), // Ensure salary is a number
          // Add an endDate if it's an old job, but for the first job, it's ongoing.
      };

      // 7. ***CORRECTED FIX***: Create the staff_profiles document with ALL relevant fields
      await db.collection("staff_profiles").doc(newUserId).set({
        fullName: fullName,
        email: email,
        // The general 'startDate' for the staff member can be derived from the first job entry
        // For now, we'll keep it as you had it, but it might be redundant with jobHistory[0].startDate
        startDate: startDate, 
        uid: newUserId, // Store the UID as a field in the profile for easier reference
        jobHistory: [initialJob], // ***This is the crucial change***
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