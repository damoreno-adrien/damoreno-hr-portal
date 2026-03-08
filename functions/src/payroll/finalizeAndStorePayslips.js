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
    const authDisablePromises = []; // Array to hold our Auth lockout commands

    const processPayslips = payrollData.map(async (payslip) => {
        const staffId = payslip.staffId || payslip.id;
        const payslipId = `${staffId}_${year}_${month}`;
        const payslipRef = db.collection("payslips").doc(payslipId);

        const payslipToSave = {
            ...payslip,
            staffId: staffId, 
            payPeriodYear: year,
            payPeriodMonth: month,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(), 
            finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
            finalizedBy: request.auth.uid,
            status: 'finalized'
        };

        batch.set(payslipRef, payslipToSave);

        const staffRef = db.collection("staff_profiles").doc(staffId);

        // 1. Update Bonus Streak
        const newStreak = payslip.bonusInfo?.newStreak ?? 0;
        batch.update(staffRef, { bonusStreak: newStreak });

        // --- 2. THE HUMAN ACTION OFFBOARDING TRIGGER ---
        // If this payslip contains an offboarding payout (meaning it's their final month)
        if (payslip.offboardingPayout) {
            
            // A. Update the database to mark them inactive and stamp the audit trail
            batch.update(staffRef, {
                'status': 'inactive',
                'offboardingSettings.isPendingFutureOffboard': false,
                'offboardingSettings.payoutDisbursed': true,
                'offboardingSettings.payoutDisbursedAt': admin.firestore.FieldValue.serverTimestamp(),
                'offboardingSettings.payoutPayslipId': payslipId
            });

            // B. Reach into the Firebase Auth vault and disable their login credentials
            const disableAuthPromise = admin.auth().updateUser(staffId, { disabled: true })
                .then(() => console.log(`Successfully locked Auth for offboarded staff: ${staffId}`))
                .catch(err => console.error(`Failed to lock Auth for ${staffId}:`, err));
            
            authDisablePromises.push(disableAuthPromise);
        }

        // 3. Handle Loan Deductions
        const loanDeductionAmount = payslip.deductions?.loan || 0;
        if (loanDeductionAmount > 0) {
            const loansSnapshot = await db.collection("loans").where("staffId", "==", staffId).where("isActive", "==", true).get();
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

        // 4. Handle Salary Advance Deductions
        const advanceDeductionAmount = payslip.deductions?.advance || 0;
        if (advanceDeductionAmount > 0) {
            const advancesSnapshot = await db.collection("salary_advances")
                .where("staffId", "==", staffId)
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
        
        // Execute all the Auth lockouts after the database successfully updates
        await Promise.all(authDisablePromises);

        return { result: `Successfully stored ${payrollData.length} payslips for ${month}/${year}.` };
    } catch (error) {
        console.error("Batch commit failed:", error);
        throw new HttpsError("internal", "Failed to store payslips.");
    }
});