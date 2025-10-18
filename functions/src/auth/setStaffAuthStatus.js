const { HttpsError, https } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

exports.setStaffAuthStatusHandler = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can change staff authentication status.");
    }
    const { staffId, disabled } = request.data;
    if (!staffId || typeof disabled !== 'boolean') {
        throw new HttpsError("invalid-argument", "The function must be called with a 'staffId' and a 'disabled' boolean value.");
    }

    try {
        await admin.auth().updateUser(staffId, { disabled: disabled });
        return { result: `Successfully ${disabled ? 'disabled' : 'enabled'} the account for user ${staffId}.` };
    } catch (error) {
        console.error("Error updating user auth status:", error);
        throw new HttpsError("internal", "An unexpected error occurred while updating the user's account.", error.message);
    }
});