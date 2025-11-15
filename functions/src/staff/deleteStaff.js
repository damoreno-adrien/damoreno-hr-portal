const { HttpsError, https } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

exports.deleteStaffHandler = https.onCall({ region: "us-central1" }, async (request) => { // Updated region
    // 1. Authentication & Authorizationy
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can delete staff members.");
    }

    // 2. Input Validation
    const staffId = request.data.staffId;
    if (!staffId || typeof staffId !== 'string') { // Added type check
        throw new HttpsError("invalid-argument", "The function must be called with a valid 'staffId' string.");
    }

    console.log(`Attempting to delete staff member ${staffId} invoked by manager ${request.auth.uid}`);

    try {
        // 3. Delete Auth user first (safer in case Firestore fails later)
        try {
            await admin.auth().deleteUser(staffId);
            console.log(`Successfully deleted Firebase Auth user for ${staffId}.`);
        } catch (authError) {
            // If user not found in Auth, maybe they were already deleted or never existed.
            // Log it but proceed to delete Firestore data as it might still exist.
            if (authError.code === 'auth/user-not-found') {
                console.warn(`Firebase Auth user ${staffId} not found, proceeding with Firestore cleanup.`);
            } else {
                // For other auth errors, re-throw as it might indicate a bigger issue.
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
        deletedDocsCount += 2; // Count these main docs

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
        // Ensure HttpsError is thrown
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An error occurred while deleting the staff member's data.", error.message);
    }
});