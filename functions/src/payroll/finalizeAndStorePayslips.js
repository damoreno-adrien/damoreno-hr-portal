const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();

exports.finalizeAndStorePayslipsHandler = https.onCall({ region: "asia-southeast1" }, async (request) => { // Updated region
    // 1. Input Validation & Authentication
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    if (!request.data.payrollData || !Array.isArray(request.data.payrollData) || request.data.payrollData.length === 0 || !request.data.payPeriod) {
        throw new HttpsError("invalid-argument", "Required data (non-empty payrollData array, payPeriod object) is missing or invalid.");
    }

    const { payrollData, payPeriod } = request.data;
    const { year, month } = payPeriod;

    // Basic validation for year and month
    if (typeof year !== 'number' || typeof month !== 'number' || month < 1 || month > 12) {
        throw new HttpsError("invalid-argument", "Invalid pay period provided.");
    }

    // 2. Authorization Check
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can finalize payroll.");
    }

    // 3. Prepare Batch Write
    const batch = db.batch();
    const generatedTimestamp = FieldValue.serverTimestamp(); // Use the same timestamp for all docs in this run

    payrollData.forEach(payslip => {
        // Validate essential payslip data
        if (!payslip.id || !payslip.name || typeof payslip.netPay !== 'number') {
            console.error("Skipping invalid payslip data:", payslip);
            // Optionally throw an error or continue to process valid ones
            // For now, we'll just log and skip
            return;
        }

        const payslipId = `${payslip.id}_${year}_${month}`;
        const payslipRef = db.collection("payslips").doc(payslipId);

        // Prepare payslip data for saving
        const payslipToSave = {
            staffId: payslip.id,
            staffName: payslip.name, // Ensure this is just the name, not display name with dept
            payPeriodYear: year,
            payPeriodMonth: month,
            generatedAt: generatedTimestamp, // Consistent timestamp
            // Include earnings and deductions structures explicitly if needed, or spread
            earnings: payslip.earnings || {},
            deductions: payslip.deductions || {},
            totalEarnings: payslip.totalEarnings || 0,
            totalDeductions: payslip.totalDeductions || 0,
            netPay: payslip.netPay,
            bonusInfo: payslip.bonusInfo || { newStreak: 0 }, // Ensure bonusInfo exists
            // Add any other relevant top-level fields from payslip if needed
            payType: payslip.payType || null, // e.g., 'Monthly' or position title
        };

        batch.set(payslipRef, payslipToSave);

        // Update bonus streak on staff profile
        const staffRef = db.collection("staff_profiles").doc(payslip.id);
        const newStreak = payslip.bonusInfo?.newStreak ?? 0; // Use nullish coalescing for safety
        batch.update(staffRef, { bonusStreak: newStreak });
    });

    // 4. Commit Batch
    try {
        await batch.commit();
        console.log(`Finalized payroll for ${year}-${month}. Stored ${payrollData.length} payslips.`);
        return { result: `Successfully finalized payroll and stored ${payrollData.length} payslips.` };
    } catch (error) {
        console.error(`Error finalizing payroll batch for ${year}-${month}:`, error);
        throw new HttpsError("internal", "An error occurred while saving the finalized payroll data.", error.message);
    }
});