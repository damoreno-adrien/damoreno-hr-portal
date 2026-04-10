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
    if (!callerDoc.exists || !['admin', 'super_admin', 'manager'].includes(callerDoc.data().role)) {
        throw new HttpsError("permission-denied", "Only managers can delete payroll runs.");
    }
    
    const { payPeriod, branchId } = request.data;
    if (!payPeriod || typeof payPeriod.year !== 'number' || typeof payPeriod.month !== 'number') {
        throw new HttpsError("invalid-argument", "Invalid payPeriod object.");
    }

    const { year, month } = payPeriod;

    try {
        const batch = db.batch();
        const authEnablePromises = []; // Array to hold our Auth unlock commands

        // 1. Delete the specific branch's payroll_run document
        const runDocId = branchId ? `${year}_${month}_${branchId}` : `${year}_${month}`;
        batch.delete(db.collection("payroll_runs").doc(runDocId));

        // 2. Fetch ONLY the payslips belonging to this branch run
        let payslipsQuery = db.collection("payslips")
            .where("payPeriodYear", "==", year)
            .where("payPeriodMonth", "==", month);
        
        if (branchId) {
            payslipsQuery = payslipsQuery.where("branchId", "==", branchId);
        }

        const payslipsSnap = await payslipsQuery.get();

        if (payslipsSnap.empty) {
            // Even if there are no payslips, we still commit the deletion of the payroll_run doc
            await batch.commit();
            return { result: `Deleted empty payroll run record for ${months[month - 1]} ${year}.` };
        }

        // 3. Process Deletions and Rollbacks for all affected staff
        const processDeletions = payslipsSnap.docs.map(async (docSnap) => {
            const payslipData = docSnap.data();
            const staffId = payslipData.staffId || payslipData.id; 
            
            batch.delete(docSnap.ref);

            if (staffId) {
                let staffUpdates = {};

                // --- A. Revert Streak using Historical Data ---
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

                // --- B. THE HUMAN ACTION UNDO (Restore Access for Offboarded Staff) ---
                if (payslipData.offboardingPayout) {
                    staffUpdates['offboardingSettings.payoutDisbursed'] = false;
                    staffUpdates['offboardingSettings.payoutDisbursedAt'] = admin.firestore.FieldValue.delete();
                    staffUpdates['offboardingSettings.payoutPayslipId'] = admin.firestore.FieldValue.delete();
                    
                    staffUpdates['status'] = 'active';
                    staffUpdates['offboardingSettings.isPendingFutureOffboard'] = true;

                    const enableAuthPromise = admin.auth().updateUser(staffId, { disabled: false })
                        .then(() => console.log(`Successfully unlocked Auth for: ${staffId}`))
                        .catch(err => console.error(`Failed to unlock Auth for ${staffId}:`, err));
                    
                    authEnablePromises.push(enableAuthPromise);
                }

                batch.update(db.collection("staff_profiles").doc(staffId), staffUpdates);
            }

            // --- C. Revert Salary Advances back to 'approved' ---
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

            // --- D. Revert Loan Balances ---
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

        const bName = branchId || 'Global';
        return { result: `Successfully deleted ${payslipsSnap.size} payslips and reverted streak/financials for ${months[month - 1]} ${year} (${bName}).` };

    } catch (error) {
        console.error(`Error deleting payroll run:`, error);
        throw new HttpsError("internal", "An unexpected error occurred while deleting the payroll run.", error.message);
    }
});