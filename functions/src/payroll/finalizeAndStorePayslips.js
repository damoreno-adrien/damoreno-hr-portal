const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = getFirestore();

exports.finalizeAndStorePayslipsHandler = https.onCall({ region: "asia-southeast1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");
    
    const { payrollData, payPeriod } = request.data;
    const { year, month } = payPeriod;

    if (!payrollData || !Array.isArray(payrollData) || !year || !month) {
        throw new HttpsError("invalid-argument", "Missing required payroll data or pay period.");
    }

    // Authorization: Check if user is a manager
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'manager') {
        throw new HttpsError("permission-denied", "Only managers can finalize payroll.");
    }

    const batch = db.batch();

    payrollData.forEach((payslip) => {
        const payslipId = `${payslip.id}_${year}_${month}`;
        const payslipRef = db.collection("payslips").doc(payslipId);

        const payslipToSave = {
            ...payslip,
            payPeriod: { year, month },
            finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
            finalizedBy: request.auth.uid,
            status: 'finalized'
        };

        batch.set(payslipRef, payslipToSave);

        // Update the staff profile with their new bonus streak
        const staffRef = db.collection("staff_profiles").doc(payslip.id);
        const newStreak = payslip.bonusInfo?.newStreak ?? 0;
        batch.update(staffRef, { bonusStreak: newStreak });
    });

    try {
        await batch.commit();
        return { result: `Successfully stored ${payrollData.length} payslips for ${month}/${year}.` };
    } catch (error) {
        console.error("Batch commit failed:", error);
        throw new HttpsError("internal", "Failed to store payslips.");
    }
});