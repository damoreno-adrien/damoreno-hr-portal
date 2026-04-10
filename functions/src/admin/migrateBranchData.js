const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin');

if (admin.apps.length === 0) { admin.initializeApp(); }
const db = getFirestore();

// We set a high timeout (540s) because migrating thousands of documents can take a minute!
exports.migrateBranchDataHandler = https.onCall({ region: "asia-southeast1", timeoutSeconds: 540 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

    // Security check: Only Super Admins should be able to run a database-wide migration
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || !['super_admin', 'admin'].includes(callerDoc.data().role)) {
        throw new HttpsError("permission-denied", "Unauthorized.");
    }

    const TARGET_BRANCH = "br_damorenotown";
    
    // THE FULL, CORRECTED LIST OF DATA COLLECTIONS
    const collectionsToMigrate = [
        "staff_profiles", 
        "schedules", 
        "attendance", 
        "leave_requests",
        "salary_advances", 
        "loans",
        "monthly_adjustments",
        "manager_alerts", 
        "payslips", 
        "payroll_runs"
    ];

    let totalUpdated = 0;

    try {
        for (const colName of collectionsToMigrate) {
            console.log(`Scanning collection: ${colName}...`);
            const snap = await db.collection(colName).get();
            
            let batch = db.batch();
            let batchCount = 0;
            let colUpdatedCount = 0;

            for (const docSnap of snap.docs) {
                const data = docSnap.data();
                
                // Only stamp it if it doesn't already have a branchId
                if (!data.branchId) {
                    batch.update(docSnap.ref, { branchId: TARGET_BRANCH });
                    batchCount++;
                    colUpdatedCount++;
                    totalUpdated++;

                    // Firebase limits batches to 500. We commit at 400 to be safe.
                    if (batchCount === 400) {
                        await batch.commit();
                        batch = db.batch(); // Start a fresh batch
                        batchCount = 0;
                    }
                }
            }

            // Commit any remaining documents in the last batch for this collection
            if (batchCount > 0) {
                await batch.commit();
            }
            console.log(`Finished ${colName}. Stamped ${colUpdatedCount} documents.`);
        }

        return { 
            success: true, 
            result: `MIGRATION COMPLETE! Successfully stamped ${totalUpdated} total documents with '${TARGET_BRANCH}'.` 
        };

    } catch (error) {
        console.error("Migration failed:", error);
        throw new HttpsError("internal", "Database migration failed.", error.message);
    }
});