const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const admin = require('firebase-admin');

if (admin.apps.length === 0) { admin.initializeApp(); }
const db = getFirestore();

exports.migrateBranchSettingsHandler = https.onCall({ region: "asia-southeast1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || !['super_admin', 'admin'].includes(callerDoc.data().role)) {
        throw new HttpsError("permission-denied", "Unauthorized.");
    }

    const TARGET_BRANCH = "br_damorenotown";
    
    try {
        const configRef = db.collection('settings').doc('company_config');
        const configSnap = await configRef.get();
        if (!configSnap.exists) throw new Error("company_config not found.");
        
        const data = configSnap.data();
        const branchOverrides = {};

        // 1. GATHER ALL ROOT FIELDS
        const fieldsToMove = [
            'companyName', 'tradingName', 'companyAddress', 'companyTaxId', 'companyLogoUrl', 'directors',
            'departments', 'roleDescriptions', 'publicHolidays', 'leaveEntitlements', 'geofence',
            'attendanceBonus', 'disciplinaryRules', 'annualLeaveDays', 'paidSickDays', 'paidPersonalDays',
            'advanceEligibilityPercentage', 'ssoRate', 'ssoCap', 'overtimeRate', 'overtimeThreshold',
            'probationMonths', 'dailyAllowanceTHB', 'mealDiscountPercent', 'staffUniforms', 'standardStartTime'
        ];

        for (const field of fieldsToMove) {
            if (data[field] !== undefined) {
                branchOverrides[field] = data[field];
            }
        }

        // 2. STUFF THEM INTO THE TOWN BRANCH
        const updatePayload = {
            [`branchSettings.${TARGET_BRANCH}`]: branchOverrides
        };

        // 3. DELETE THEM FROM THE ROOT (to force strict isolation)
        for (const field of fieldsToMove) {
            updatePayload[field] = FieldValue.delete();
        }

        await configRef.update(updatePayload);

        return { 
            success: true, 
            result: `SETTINGS CLEANUP COMPLETE! All legacy global rules have been moved to ${TARGET_BRANCH} and wiped from the global root.` 
        };

    } catch (error) {
        console.error("Settings migration failed:", error);
        throw new HttpsError("internal", "Database migration failed.", error.message);
    }
});