/* functions/src/attendance/cleanupBadAttendanceIds.js */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const db = admin.firestore();

exports.cleanupBadAttendanceIdsHandler = onCall({
    region: "asia-southeast1", // CORRECTION : Alignement sur l'Asie
    timeoutSeconds: 540,   
    memory: "512MiB"
}, async (request) => {
    
    if (!request.auth) {
        console.error("cleanupBadAttendanceIds: Unauthenticated access.");
        throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const callerUid = request.auth.uid;
    try {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") {
            console.error(`cleanupBadAttendanceIds: Permission denied for user ${callerUid}.`);
            throw new HttpsError("permission-denied", "Manager role required.");
        }
    } catch(err) {
         console.error(`cleanupBadAttendanceIds: Error verifying role:`, err);
         throw new HttpsError("internal", "Failed to verify user role.", err.message);
    }

    let batch = db.batch();
    let deleteCounter = 0;
    const maxBatchSize = 499; 
    let batchCounter = 0; 

    try {
        const attendanceCol = db.collection("attendance");
        const snapshot = await attendanceCol.get();

        if (snapshot.empty) {
            return { message: "Cleanup complete. No documents found." };
        }

        for (const doc of snapshot.docs) {
            if (doc.id.length === 20) {
                batch.delete(doc.ref);
                deleteCounter++;
                batchCounter++;

                if (batchCounter >= maxBatchSize) {
                    await batch.commit();
                    batch = db.batch(); 
                    batchCounter = 0; 
                }
            }
        }

        if (batchCounter > 0) {
            await batch.commit();
        }

        const successMessage = `Cleanup complete. Found and deleted ${deleteCounter} invalid attendance records.`;
        return { message: successMessage };

    } catch (error) {
        console.error("cleanupBadAttendanceIds: CRITICAL error during cleanup:", error);
        throw new HttpsError("internal", `Cleanup failed: ${error.message}`);
    }
});