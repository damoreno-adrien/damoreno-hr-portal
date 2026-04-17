const { HttpsError, https } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

// FIX 1 : On aligne la région sur "asia-southeast1" comme le reste de ton application
exports.setStaffAuthStatusHandler = https.onCall({ region: "asia-southeast1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    
    // FIX 2 : On autorise la hiérarchie complète, pas seulement les "managers"
    const allowedRoles = ['manager', 'admin', 'super_admin'];
    if (!callerDoc.exists || !allowedRoles.includes(callerDoc.data().role)) {
        throw new HttpsError("permission-denied", "You do not have permission to change staff authentication status.");
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