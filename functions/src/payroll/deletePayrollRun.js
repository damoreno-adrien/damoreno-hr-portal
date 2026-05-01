/* functions/src/payroll/deletePayrollRun.js */
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const admin = require('firebase-admin');

if (admin.apps.length === 0) { admin.initializeApp(); }
const db = getFirestore();
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

exports.deletePayrollRunHandler = onCall({ region: "asia-southeast1" }, async (request) => {
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
        const authEnablePromises = [];

        const runDocId = branchId ? `${year}_${month}_${branchId}` : `${year}_${month}`;
        batch.delete(db.collection("payroll_runs").doc(runDocId));

        let payslipsQuery = db.collection("payslips").where("payPeriodYear", "==", year).where("payPeriodMonth", "==", month);
        if (branchId) payslipsQuery = payslipsQuery.where("branchId", "==", branchId);

        const payslipsSnap = await payslipsQuery.get();
        if (payslipsSnap.empty) {
            await batch.commit();
            return { result: `Deleted empty payroll run record for ${months[month - 1]} ${year}.` };
        }

        const processDeletions = payslipsSnap.docs.map(async (docSnap) => {
            const payslipData = docSnap.data();
            const staffId = payslipData.staffId || payslipData.id;

            batch.delete(docSnap.ref);

            if (staffId) {
                let staffUpdates = {};

                if (payslipData.bonusInfo && payslipData.bonusInfo.oldStreak !== undefined) {
                    staffUpdates.bonusStreak = payslipData.bonusInfo.oldStreak;
                } else {
                    let previousStreak = 0;
                    const prevMonth = month === 1 ? 12 : month - 1;
                    const prevYear = month === 1 ? year - 1 : year;

                    const prevPayslipSnap = await db.collection("payslips").where("staffId", "==", staffId).where("payPeriodYear", "==", prevYear).where("payPeriodMonth", "==", prevMonth).get();
                    if (!prevPayslipSnap.empty) previousStreak = prevPayslipSnap.docs[0].data().bonusInfo?.newStreak || 0;
                    staffUpdates.bonusStreak = previousStreak;
                }

                if (payslipData.leavePayoutDetails && payslipData.leavePayoutDetails.total > 0) {
                    staffUpdates['offboardingSettings.payoutDisbursed'] = false;
                    staffUpdates['offboardingSettings.payoutDisbursedAt'] = FieldValue.delete();
                    staffUpdates['offboardingSettings.payoutPayslipId'] = FieldValue.delete();
                    staffUpdates['status'] = 'active';
                    staffUpdates['offboardingSettings.isPendingFutureOffboard'] = true;

                    const enableAuthPromise = admin.auth().updateUser(staffId, { disabled: false }).catch(err => console.error(err));
                    authEnablePromises.push(enableAuthPromise);
                }
                batch.update(db.collection("staff_profiles").doc(staffId), staffUpdates);
            }

            const advanceDeduction = Number(payslipData.deductions?.advance) || 0;
            if (advanceDeduction > 0) {
                const advSnap = await db.collection("salary_advances")
                    .where("staffId", "==", staffId)
                    .where("payPeriodYear", "==", year)
                    .where("payPeriodMonth", "==", month)
                    .where("status", "==", "deducted").get();

                advSnap.forEach(advDoc => {
                    // FIX : On restaure le statut EXACT qu'avait l'avance avant la paie
                    const oldStatus = advDoc.data().previousStatus || "approved";
                    batch.update(advDoc.ref, {
                        status: oldStatus,
                        previousStatus: FieldValue.delete(),
                        deductedAt: FieldValue.delete()
                    });
                });
            }
            if (payslipData.appliedLoans && Array.isArray(payslipData.appliedLoans)) {
                payslipData.appliedLoans.forEach(applied => {
                    if (!applied.loanId || applied.loanId === 'unknown') return;
                    const loanRef = db.collection("loans").doc(applied.loanId);

                    const updateData = {
                        remainingBalance: FieldValue.increment(Number(applied.amountDeducted) || 0),
                        isActive: true,
                        status: 'active',
                        updatedAt: FieldValue.serverTimestamp()
                    };

                    // NOUVEAU : Restauration de l'Override si on annule la paie qui l'avait consommé !
                    if (applied.wasOverrideUsed && applied.originalOverrideAmount !== undefined) {
                        updateData.nextInstallmentOverride = applied.originalOverrideAmount;
                    }

                    batch.update(loanRef, updateData);
                });
            }
        });

        await Promise.all(processDeletions);
        await batch.commit();
        await Promise.all(authEnablePromises);

        return { result: `Successfully deleted ${payslipsSnap.size} payslips and reverted balances.` };

    } catch (error) {
        console.error(`Error deleting payroll run:`, error);
        throw new HttpsError("internal", "An unexpected error occurred while deleting the payroll run.", error.message);
    }
});