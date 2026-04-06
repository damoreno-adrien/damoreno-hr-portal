/* functions/src/users/accessControl.js */

const functions = require("firebase-functions/v2");
const { HttpsError } = functions.https;
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

// --- FUNCTION 1: Invite a Pure Admin (Branch Director) ---
exports.inviteAdminHandler = functions.https.onCall({
    region: "us-central1"
}, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const callerRole = callerDoc.exists ? callerDoc.data().role : null;
    
    // STRICT SECURITY: Only Super Admin can create Directors
    if (callerRole !== 'super_admin') {
        throw new HttpsError("permission-denied", "Only the Super Admin can invite new Directors.");
    }

    const { email, password, name } = request.data;
    if (!email || !password || !name) throw new HttpsError("invalid-argument", "Missing required fields.");

    try {
        const userRecord = await admin.auth().createUser({
            email: email.trim().toLowerCase(),
            password: password,
            displayName: name.trim(),
        });

        await db.collection("users").doc(userRecord.uid).set({
            email: email.trim().toLowerCase(),
            name: name.trim(),
            role: "admin",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, uid: userRecord.uid };
    } catch (error) {
        if (error.code === 'auth/email-already-exists') throw new HttpsError("already-exists", "Account email already exists.");
        throw new HttpsError("internal", "Failed to create Admin user.");
    }
});

// --- FUNCTION 2: Update an Existing Staff Member's Role ---
exports.updateUserRoleHandler = functions.https.onCall({
    region: "us-central1"
}, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const callerRole = callerDoc.exists ? callerDoc.data().role : null;
    
    if (!['manager', 'admin', 'super_admin'].includes(callerRole)) {
        throw new HttpsError("permission-denied", "You do not have permission to change roles.");
    }

    const { targetUid, newRole } = request.data;
    if (!targetUid || !newRole) throw new HttpsError("invalid-argument", "Missing UID or Role.");

    // SECURITY: Prevent anyone but Super Admin from promoting to Admin/Super Admin
    if (['admin', 'super_admin'].includes(newRole) && callerRole !== 'super_admin') {
         throw new HttpsError("permission-denied", "Only the Super Admin can grant executive clearance.");
    }

    try {
        await db.collection("users").doc(targetUid).set({ role: newRole }, { merge: true });
        return { success: true };
    } catch (error) {
        throw new HttpsError("internal", "Failed to update user role.");
    }
});