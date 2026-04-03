/* functions/src/staff/updateStaffEmail.js */

const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

exports.updateStaffEmailHandler = functions.https.onCall({
    region: "us-central1"
}, async (request) => {
    // 1. Security: Must be logged in
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    // 2. Security: Must be a Manager
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can update login emails.");
    }

    const { targetUid, newEmail } = request.data;
    if (!targetUid || !newEmail || typeof newEmail !== 'string') {
        throw new HttpsError("invalid-argument", "Missing required fields (UID or Email).");
    }

    try {
        // 3. Update Firebase Authentication Vault
        // This will automatically fail if the email is invalid or already in use!
        await admin.auth().updateUser(targetUid, { 
            email: newEmail.trim().toLowerCase() 
        });

        // 4. Update the Firestore Profile Database
        await db.collection("staff_profiles").doc(targetUid).update({
            email: newEmail.trim().toLowerCase()
        });

        return { success: true, message: "Email updated successfully in Auth and Database." };

    } catch (error) {
        console.error("Error updating email for UID:", targetUid, error);
        
        // Catch specific Firebase Auth errors and translate them to frontend alerts
        if (error.code === 'auth/email-already-exists') {
            throw new HttpsError("already-exists", "This email address is already in use by another staff member.");
        }
        if (error.code === 'auth/invalid-email') {
            throw new HttpsError("invalid-argument", "The email address format is invalid.");
        }
        
        throw new HttpsError("internal", "Failed to update email.", error.message);
    }
});