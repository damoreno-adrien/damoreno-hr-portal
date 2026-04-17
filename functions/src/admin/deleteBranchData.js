const { HttpsError, https } = require("firebase-functions/v2");
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

if (admin.apps.length === 0) { admin.initializeApp(); }
const db = getFirestore();

// FIX 1 : On utilise la syntaxe v2 et le bon nom d'export attendu par index.js
exports.deleteBranchDataHandler = https.onCall({ region: "asia-southeast1", timeoutSeconds: 540 }, async (request) => {
    // 1. SECURITY: Ensure user is authenticated
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in.');
    }

    // 2. SECURITY: Ensure user is a Super Admin
    const callerRef = await db.collection('users').doc(request.auth.uid).get();
    if (!callerRef.exists || callerRef.data().role !== 'super_admin') {
        throw new HttpsError('permission-denied', 'Only Super Admins can execute a branch wipe.');
    }

    // FIX 2 : En v2, les données envoyées sont dans request.data
    const targetBranchId = request.data.branchId;
    if (!targetBranchId) {
        throw new HttpsError('invalid-argument', 'Branch ID is required.');
    }

    // Protect core branches from accidental deletion (Safety net)
    if (targetBranchId === 'br_damorenotown' || targetBranchId === 'br_damorenokathu' || targetBranchId === 'global') {
         throw new HttpsError('permission-denied', 'Protection Fault: Cannot delete primary operational branches.');
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
        
        // FIX 3 : En Admin SDK Node.js, .exists est une propriété, pas une fonction
        if (configSnap.exists) {
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
        throw new HttpsError('internal', 'An error occurred during the deletion process.');
    }
});