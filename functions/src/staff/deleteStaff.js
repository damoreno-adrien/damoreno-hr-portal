const { HttpsError, https } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

exports.deleteStaffHandler = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) { throw new HttpsError("unauthenticated", "The function must be called while authenticated."); }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") { throw new HttpsError("permission-denied", "Only managers can delete staff members."); }
    const staffId = request.data.staffId;
    if (!staffId) { throw new HttpsError("invalid-argument", "The function must be called with a 'staffId'."); }
    try {
        // Delete Auth user
        await admin.auth().deleteUser(staffId);
        
        // Prepare batch for Firestore deletes
        const batch = db.batch();
        
        // Delete user role and profile
        batch.delete(db.collection("users").doc(staffId));
        batch.delete(db.collection("staff_profiles").doc(staffId));
        
        // Delete related data from other collections
        const collectionsToDeleteFrom = ["schedules", "leave_requests", "attendance", "salary_advances", "loans", "payslips", "monthly_adjustments"];
        for (const collectionName of collectionsToDeleteFrom) {
            const querySnapshot = await db.collection(collectionName).where("staffId", "==", staffId).get();
            querySnapshot.forEach(doc => { batch.delete(doc.ref); });
        }
        
        // Commit all deletes
        await batch.commit();
        
        return { result: `Successfully deleted staff member ${staffId} and all their data.` };
    } catch (error) {
        console.error("Error deleting staff member:", error);
        throw new HttpsError("internal", "An error occurred while deleting the staff member.", error.message);
    }
});