// Use the v2 library for HTTP functions
const {onRequest} = require("firebase-functions/v2/https"); 
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const {onCall} = require("firebase-functions/v2/https");

admin.initializeApp();

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

exports.deleteStaff = onCall({ region: "us-central1" }, async (request) => {
    // 1. Check if the user making the call is authenticated and is a manager
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const db = admin.firestore();
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new functions.https.HttpsError("permission-denied", "Only managers can delete staff members.");
    }

    // 2. Get the ID of the staff member to be deleted
    const staffId = request.data.staffId;
    if (!staffId) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with a 'staffId'.");
    }

    try {
        // 3. Delete the user from Firebase Authentication
        await admin.auth().deleteUser(staffId);

        // 4. Create a batch to delete all associated Firestore documents
        const batch = db.batch();

        // Delete from 'users' collection
        batch.delete(db.collection("users").doc(staffId));
        // Delete from 'staff_profiles' collection
        batch.delete(db.collection("staff_profiles").doc(staffId));

        // Find and delete all documents in other collections
        const collectionsToDeleteFrom = ["schedules", "leave_requests", "attendance"];
        for (const collectionName of collectionsToDeleteFrom) {
            const querySnapshot = await db.collection(collectionName).where("staffId", "==", staffId).get();
            querySnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
        }
        
        // 5. Commit all the deletions at once
        await batch.commit();

        return { result: `Successfully deleted staff member ${staffId} and all their data.` };

    } catch (error) {
        console.error("Error deleting staff member:", error);
        throw new functions.https.HttpsError("internal", "An error occurred while deleting the staff member.");
    }
});