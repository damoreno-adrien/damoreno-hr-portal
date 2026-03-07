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

    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'manager') {
        throw new HttpsError("permission-denied", "Only managers can finalize payroll.");
    }

    const batch = db.batch();

    const processPayslips = payrollData.map(async (payslip) => {
        const payslipId = `${payslip.id}_${year}_${month}`;
        const payslipRef = db.collection("payslips").doc(payslipId);

        // --- CRITICAL FIX: Flattened payPeriodYear/Month so the frontend queries actually work! ---
        const payslipToSave = {
            ...payslip, // This inherently includes our new 'offboardingPayout' object!
            staffId: payslip.id, 
            payPeriodYear: year,
            payPeriodMonth: month,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(), 
            finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
            finalizedBy: request.auth.uid,
            status: 'finalized'
        };

        batch.set(payslipRef, payslipToSave);

        const staffRef = db.collection("staff_profiles").doc(payslip.id);

        // 1. Update Bonus Streak
        const newStreak = payslip.bonusInfo?.newStreak ?? 0;
        batch.update(staffRef, { bonusStreak: newStreak });

        // --- NEW: Bulletproof Audit Trail for Offboarding Payouts ---
        if (payslip.offboardingPayout && payslip.offboardingPayout.totalAmount > 0) {
            batch.update(staffRef, {
                'offboardingSettings.payoutDisbursed': true,
                'offboardingSettings.payoutDisbursedAt': admin.firestore.FieldValue.serverTimestamp(),
                'offboardingSettings.payoutPayslipId': payslipId
            });
        }

        // 2. Handle Loan Deductions
        const loanDeductionAmount = payslip.deductions?.loan || 0;
        if (loanDeductionAmount > 0) {
            const loansSnapshot = await db.collection("loans").where("staffId", "==", payslip.id).where("isActive", "==", true).get();
            if (!loansSnapshot.empty) {
                const loanDoc = loansSnapshot.docs[0]; 
                const loanData = loanDoc.data();
                const newBalance = (loanData.remainingBalance || 0) - loanDeductionAmount;
                batch.update(loanDoc.ref, {
                    remainingBalance: newBalance > 0 ? newBalance : 0,
                    isActive: newBalance > 0 
                });
            }
        }

        // 3. Handle Salary Advance Deductions
        const advanceDeductionAmount = payslip.deductions?.advance || 0;
        if (advanceDeductionAmount > 0) {
            const advancesSnapshot = await db.collection("salary_advances")
                .where("staffId", "==", payslip.id)
                .where("payPeriodYear", "==", year)
                .where("payPeriodMonth", "==", month)
                .where("status", "==", "approved")
                .get();

            advancesSnapshot.forEach((doc) => {
                batch.update(doc.ref, {
                    status: 'deducted',
                    deductedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });
        }
    });

    try {
        await Promise.all(processPayslips);
        await batch.commit();
        return { result: `Successfully stored ${payrollData.length} payslips for ${month}/${year}.` };
    } catch (error) {
        console.error("Batch commit failed:", error);
        throw new HttpsError("internal", "Failed to store payslips.");
    }
});