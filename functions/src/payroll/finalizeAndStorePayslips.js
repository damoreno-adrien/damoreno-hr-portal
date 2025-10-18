const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();

exports.finalizeAndStorePayslipsHandler = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth || !request.data.payrollData || !request.data.payPeriod) {
        throw new HttpsError("invalid-argument", "Required data (payrollData, payPeriod) is missing.");
    }

    const { payrollData, payPeriod } = request.data;
    const { year, month } = payPeriod;

    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can finalize payroll.");
    }

    const batch = db.batch();

    payrollData.forEach(payslip => {
        const payslipId = `${payslip.id}_${year}_${month}`;
        const payslipRef = db.collection("payslips").doc(payslipId);

        batch.set(payslipRef, {
            staffId: payslip.id,
            staffName: payslip.name,
            payPeriodYear: year,
            payPeriodMonth: month,
            generatedAt: FieldValue.serverTimestamp(),
            // Spread the rest of the payslip data
            ...payslip 
        });

        // Update bonus streak
        const staffRef = db.collection("staff_profiles").doc(payslip.id);
        const bonusInfo = payslip.bonusInfo || { newStreak: 0 };
        batch.update(staffRef, { bonusStreak: bonusInfo.newStreak });
    });

    try {
        await batch.commit();
        return { result: `Successfully finalized payroll and stored ${payrollData.length} payslips.` };
    } catch (error) {
        console.error("Error finalizing payroll:", error);
        throw new HttpsError("internal", "An error occurred while finalizing the payroll.", error.message);
    }
});