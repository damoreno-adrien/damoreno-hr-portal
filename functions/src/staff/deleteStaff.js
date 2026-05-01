const { HttpsError, onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

exports.deleteStaffHandler = onCall({ region: "asia-southeast1" }, async (request) => {
    // 1. Authentication & Authorization (Règle 3 - RBAC hiérarchique)
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const callerRole = callerDoc.exists ? callerDoc.data().role : null;
    
    if (!['manager', 'admin', 'super_admin'].includes(callerRole)) {
        throw new HttpsError("permission-denied", "Only managers, admins, and super admins can delete staff members.");
    }

    // 2. Input Validation
    const staffId = request.data.staffId;
    if (!staffId || typeof staffId !== 'string') {
        throw new HttpsError("invalid-argument", "The function must be called with a valid 'staffId' string.");
    }

    console.log(`Attempting to delete staff member ${staffId} invoked by ${callerRole} ${request.auth.uid}`);

    try {
        // 3. Delete Auth user first (safer in case Firestore fails later)
        try {
            await admin.auth().deleteUser(staffId);
            console.log(`Successfully deleted Firebase Auth user for ${staffId}.`);
        } catch (authError) {
            if (authError.code === 'auth/user-not-found') {
                console.warn(`Firebase Auth user ${staffId} not found, proceeding with Firestore cleanup.`);
            } else {
                throw authError;
            }
        }

        // 4. Prepare batch for Firestore deletes
        const batch = db.batch();
        let deletedDocsCount = 0;

        // Delete user role and profile
        const userRef = db.collection("users").doc(staffId);
        const profileRef = db.collection("staff_profiles").doc(staffId);
        batch.delete(userRef);
        batch.delete(profileRef);
        deletedDocsCount += 2;

        // Delete related data from other collections
        const collectionsToDeleteFrom = [
            "schedules", "leave_requests", "attendance", "salary_advances",
            "loans", "payslips", "monthly_adjustments"
        ];

        console.log(`Querying related collections for staffId ${staffId}...`);
        for (const collectionName of collectionsToDeleteFrom) {
            const querySnapshot = await db.collection(collectionName).where("staffId", "==", staffId).get();
            if (!querySnapshot.empty) {
                console.log(`Found ${querySnapshot.size} documents in ${collectionName} for ${staffId}. Adding to delete batch.`);
                querySnapshot.forEach(doc => {
                    batch.delete(doc.ref);
                    deletedDocsCount++;
                });
            }
        }

        // 5. Commit all deletes
        console.log(`Committing batch delete for ${deletedDocsCount} documents related to ${staffId}.`);
        await batch.commit();

        console.log(`Successfully deleted staff member ${staffId} and ${deletedDocsCount} related Firestore documents.`);
        return { result: `Successfully deleted staff member ${staffId} and all related data.` };

    } catch (error) {
        console.error(`Error deleting staff member ${staffId}:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An error occurred while deleting the staff member's data.", error.message);
    }
});