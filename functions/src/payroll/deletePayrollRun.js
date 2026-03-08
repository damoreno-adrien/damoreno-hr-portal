const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin'); 

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = getFirestore();
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

exports.deletePayrollRunHandler = https.onCall({ region: "asia-southeast1" }, async (request) => { 
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") throw new HttpsError("permission-denied", "Only managers can delete payroll runs.");
    
    const { payPeriod } = request.data;
    if (!payPeriod || typeof payPeriod.year !== 'number' || typeof payPeriod.month !== 'number') {
        throw new HttpsError("invalid-argument", "Invalid payPeriod object.");
    }

    const { year, month } = payPeriod;

    try {
        const payslipsQuery = db.collection("payslips").where("payPeriodYear", "==", year).where("payPeriodMonth", "==", month);
        const payslipsToDeleteSnap = await payslipsQuery.get();

        if (payslipsToDeleteSnap.empty) return { result: `No payslips found for ${months[month - 1]} ${year}. Nothing to delete.` }; 

        const batch = db.batch();
        const authEnablePromises = []; // <-- NEW: Array to hold our Auth unlock commands
        
        const processDeletions = payslipsToDeleteSnap.docs.map(async (docSnap) => {
            const payslipData = docSnap.data();
            const staffId = payslipData.staffId || payslipData.id; 
            
            batch.delete(docSnap.ref);

            if (staffId) {
                let staffUpdates = {};

                // 1. Revert Streak using Historical Data
                let previousStreak = 0;
                const prevMonth = month === 1 ? 12 : month - 1;
                const prevYear = month === 1 ? year - 1 : year;
                
                const prevPayslipSnap = await db.collection("payslips")
                    .where("staffId", "==", staffId)
                    .where("payPeriodYear", "==", prevYear)
                    .where("payPeriodMonth", "==", prevMonth)
                    .get();
                    
                if (!prevPayslipSnap.empty) {
                    previousStreak = prevPayslipSnap.docs[0].data().bonusInfo?.newStreak || 0;
                }
                staffUpdates.bonusStreak = previousStreak;

                // --- 2. THE HUMAN ACTION UNDO (Restore Access) ---
                if (payslipData.offboardingPayout) {
                    
                    // A. Revert the financial audit stamps
                    staffUpdates['offboardingSettings.payoutDisbursed'] = false;
                    staffUpdates['offboardingSettings.payoutDisbursedAt'] = admin.firestore.FieldValue.delete();
                    staffUpdates['offboardingSettings.payoutPayslipId'] = admin.firestore.FieldValue.delete();
                    
                    // B. "Un-fire" them in the database
                    staffUpdates['status'] = 'active';
                    staffUpdates['offboardingSettings.isPendingFutureOffboard'] = true;

                    // C. Reach into Firebase Auth and unlock the door
                    const enableAuthPromise = admin.auth().updateUser(staffId, { disabled: false })
                        .then(() => console.log(`Successfully unlocked Auth for: ${staffId}`))
                        .catch(err => console.error(`Failed to unlock Auth for ${staffId}:`, err));
                    
                    authEnablePromises.push(enableAuthPromise);
                }

                batch.update(db.collection("staff_profiles").doc(staffId), staffUpdates);
            }

            // --- Revert Salary Advances back to 'approved' ---
            const advanceDeduction = payslipData.deductions?.advance || 0;
            if (advanceDeduction > 0) {
                const advSnap = await db.collection("salary_advances")
                    .where("staffId", "==", staffId)
                    .where("payPeriodYear", "==", year)
                    .where("payPeriodMonth", "==", month)
                    .where("status", "==", "deducted")
                    .get();
                
                advSnap.forEach(advDoc => {
                    batch.update(advDoc.ref, {
                        status: "approved",
                        deductedAt: admin.firestore.FieldValue.delete() 
                    });
                });
            }

            // --- Revert Loan Balances ---
            const loanDeduction = payslipData.deductions?.loan || 0;
            if (loanDeduction > 0) {
                const loanSnap = await db.collection("loans").where("staffId", "==", staffId).get();
                if (!loanSnap.empty) {
                    const loanDoc = loanSnap.docs[0];
                    const currentBal = loanDoc.data().remainingBalance || 0;
                    batch.update(loanDoc.ref, {
                        remainingBalance: currentBal + loanDeduction,
                        isActive: true 
                    });
                }
            }
        });

        await Promise.all(processDeletions);
        await batch.commit();

        // Execute all the Auth unlocks after the database successfully updates
        await Promise.all(authEnablePromises);

        return { result: `Successfully deleted ${payslipsToDeleteSnap.size} payslips and reverted all financial deductions for ${months[month - 1]} ${year}.` };

    } catch (error) {
        console.error(`Error deleting payroll run:`, error);
        throw new HttpsError("internal", "An unexpected error occurred while deleting the payroll run.", error.message);
    }
});