const { HttpsError, https } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

exports.setStaffPasswordHandler = https.onCall({ region: "us-central1" }, async (request) => {
    // 1. Authentication & Authorization Checks
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can reset staff passwords.");
    }

    // 2. Input Validation
    const { staffId, newPassword } = request.data;
    if (!staffId || !newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        throw new HttpsError("invalid-argument", "The function must be called with a 'staffId' and a 'newPassword' (minimum 6 characters).");
    }

    // 3. Update Password using Admin SDK
    try {
        await admin.auth().updateUser(staffId, {
            password: newPassword,
        });
        console.log(`Password successfully updated for user: ${staffId}`);
        return { result: `Password for user ${staffId} has been successfully updated.` };
    } catch (error) {
        console.error("Error updating password:", error);
        // Provide a more specific error if possible
        if (error.code === 'auth/user-not-found') {
             throw new HttpsError("not-found", "The specified staff member was not found.");
        }
        throw new HttpsError("internal", "An unexpected error occurred while updating the password.", error.message);
    }
});