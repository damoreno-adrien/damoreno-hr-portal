/* functions/src/attendance/cleanupBadAttendanceIds.js */
/*
 * This is a temporary admin function to clean up attendance documents
 * that were created with an incorrect Firestore Auto-ID (20 chars)
 * instead of the correct formatted ID (staffId_date, 39 chars).
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const db = admin.firestore();

exports.cleanupBadAttendanceIdsHandler = onCall({
    region: "us-central1", // Match your other attendance functions
    timeoutSeconds: 540,   // Allow time for a large query
    memory: "512MiB"
}, async (request) => {
    
    // 1. Authorization: Only managers can run this.
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
        console.log(`cleanupBadAttendanceIds: Authorized manager ${callerUid}.`);
    } catch(err) {
         console.error(`cleanupBadAttendanceIds: Error verifying role:`, err);
         throw new HttpsError("internal", "Failed to verify user role.", err.message);
    }

    // 2. Cleanup Logic
    console.log("cleanupBadAttendanceIds: Starting cleanup process...");
    let batch = db.batch();
    let deleteCounter = 0;
    const maxBatchSize = 499; // Stay safely under the 500 limit
    let batchCounter = 0; 

    try {
        const attendanceCol = db.collection("attendance");
        const snapshot = await attendanceCol.get();

        if (snapshot.empty) {
            console.log("cleanupBadAttendanceIds: No documents found in attendance collection.");
            return { message: "Cleanup complete. No documents found." };
        }

        console.log(`cleanupBadAttendanceIds: Scanning ${snapshot.size} total documents...`);

        for (const doc of snapshot.docs) {
            // A Firestore Auto-ID is 20 characters.
            // Our correct formatted ID (staffId_date) is 39 characters.
            if (doc.id.length === 20) {
                batch.delete(doc.ref);
                deleteCounter++;
                batchCounter++;
                console.log(`cleanupBadAttendanceIds: Queued for deletion: ${doc.id}`);

                // Commit the batch when it's full and start a new one
                if (batchCounter >= maxBatchSize) {
                    await batch.commit();
                    console.log(`cleanupBadAttendanceIds: Committed batch of ${batchCounter} deletions.`);
                    batch = db.batch(); // Start a new batch
                    batchCounter = 0; // Reset batch counter
                }
            }
        }

        // Commit any remaining deletions in the last batch
        if (batchCounter > 0) {
            await batch.commit();
            console.log(`cleanupBadAttendanceIds: Committed final batch of ${batchCounter} deletions.`);
        }

        const successMessage = `Cleanup complete. Found and deleted ${deleteCounter} invalid attendance records.`;
        console.log(successMessage);
        return { message: successMessage };

    } catch (error) {
        console.error("cleanupBadAttendanceIds: CRITICAL error during cleanup:", error);
        throw new HttpsError("internal", `Cleanup failed: ${error.message}`);
    }
});