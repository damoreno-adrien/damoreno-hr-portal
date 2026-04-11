const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.deleteBranchData = functions.region('asia-southeast1').https.onCall(async (data, context) => {
    // 1. SECURITY: Ensure user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }

    const db = admin.firestore();

    // 2. SECURITY: Ensure user is a Super Admin
    const callerRef = await db.collection('users').doc(context.auth.uid).get();
    if (!callerRef.exists || callerRef.data().role !== 'super_admin') {
        throw new functions.https.HttpsError('permission-denied', 'Only Super Admins can execute a branch wipe.');
    }

    const targetBranchId = data.branchId;
    if (!targetBranchId) {
        throw new functions.https.HttpsError('invalid-argument', 'Branch ID is required.');
    }

    // Protect core branches from accidental deletion (Safety net)
    if (targetBranchId === 'br_damorenotown' || targetBranchId === 'br_damorenokathu' || targetBranchId === 'global') {
         throw new functions.https.HttpsError('permission-denied', 'Protection Fault: Cannot delete primary operational branches.');
    }

    try {
        // 3. Define all collections that contain branch-specific data
        const collectionsToScrub = [
            'staff_profiles', 
            'leave_requests', 
            'attendance', 
            'schedules', 
            'shifts', 
            'salary_advances', 
            'loans', 
            'monthly_adjustments',
            'payslips'
        ];

        let totalDeleted = 0;

        // 4. Batch Delete Data Across All Collections
        for (const collectionName of collectionsToScrub) {
            const snapshot = await db.collection(collectionName).where('branchId', '==', targetBranchId).get();
            
            if (snapshot.empty) continue;

            // Firestore batches can only handle 500 operations at a time
            const batches = [];
            let currentBatch = db.batch();
            let operationCount = 0;

            snapshot.docs.forEach((doc) => {
                currentBatch.delete(doc.ref);
                operationCount++;
                totalDeleted++;

                if (operationCount === 490) {
                    batches.push(currentBatch.commit());
                    currentBatch = db.batch();
                    operationCount = 0;
                }
            });

            if (operationCount > 0) {
                batches.push(currentBatch.commit());
            }

            await Promise.all(batches);
        }

        // 5. Remove the Branch from Company Config & Settings
        const configRef = db.collection('settings').doc('company_config');
        const configSnap = await configRef.get();
        
        if (configSnap.exists()) {
            const configData = configSnap.data();
            
            // Remove from branches array
            const updatedBranches = (configData.branches || []).filter(b => b.id !== targetBranchId);
            
            // Remove branchSettings silo
            const updatedBranchSettings = { ...configData.branchSettings };
            delete updatedBranchSettings[targetBranchId];

            await configRef.update({
                branches: updatedBranches,
                branchSettings: updatedBranchSettings
            });
        }

        return { 
            success: true, 
            message: `Branch '${targetBranchId}' successfully destroyed. ${totalDeleted} records wiped.` 
        };

    } catch (error) {
        console.error("Branch Deletion Error:", error);
        throw new functions.https.HttpsError('internal', 'An error occurred during the deletion process.');
    }
});