/* functions/src/payroll/finalizeAndStorePayslips.js */
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require('firebase-admin/firestore'); // LE FIX EST ICI
const admin = require('firebase-admin');

if (admin.apps.length === 0) { admin.initializeApp(); }
const db = getFirestore();

exports.finalizeAndStorePayslipsHandler = onCall({ region: "asia-southeast1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");
    
    const { payrollData, payPeriod } = request.data;
    const { year, month } = payPeriod;

    if (!payrollData || !Array.isArray(payrollData) || !year || !month) {
        throw new HttpsError("invalid-argument", "Missing required payroll data or pay period.");
    }

    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const allowedRoles = ['manager', 'admin', 'super_admin'];
    if (!callerDoc.exists || !allowedRoles.includes(callerDoc.data().role)) {
        throw new HttpsError("permission-denied", "Only managers and admins can finalize payroll.");
    }

    const batch = db.batch();
    const authDisablePromises = []; 
    const branchTotals = {}; 

    const processPayslips = payrollData.map(async (payslip) => {
        const staffId = payslip.staffId || payslip.id;
        const staffRef = db.collection("staff_profiles").doc(staffId);
        const staffSnap = await staffRef.get();
        const staffData = staffSnap.data() || {};
        const branchId = staffData.branchId || 'global'; 

        if (!branchTotals[branchId]) branchTotals[branchId] = { totalNetPay: 0, count: 0 };
        branchTotals[branchId].totalNetPay += (Number(payslip.netPay) || 0);
        branchTotals[branchId].count += 1;

        const payslipId = `${staffId}_${year}_${month}`;
        const payslipRef = db.collection("payslips").doc(payslipId);

        const payslipToSave = {
            ...payslip,
            staffId: staffId, 
            payPeriodYear: year,
            payPeriodMonth: month,
            branchId: branchId !== 'global' ? branchId : null, 
            generatedAt: FieldValue.serverTimestamp(), // UTILISATION DIRECTE ICI
            finalizedAt: FieldValue.serverTimestamp(),
            finalizedBy: request.auth.uid,
            status: 'finalized'
        };
        batch.set(payslipRef, payslipToSave);

        const newStreak = Number(payslip.bonusInfo?.newStreak) || 0;
        batch.update(staffRef, { bonusStreak: newStreak });

        if (payslip.leavePayoutDetails && payslip.leavePayoutDetails.total > 0) {
            batch.update(staffRef, {
                'status': 'inactive',
                'offboardingSettings.isPendingFutureOffboard': false,
                'offboardingSettings.payoutDisbursed': true,
                'offboardingSettings.payoutDisbursedAt': FieldValue.serverTimestamp(),
                'offboardingSettings.payoutPayslipId': payslipId
            });
            const disableAuthPromise = admin.auth().updateUser(staffId, { disabled: true }).catch(err => console.error("Auth disable failed:", err));
            authDisablePromises.push(disableAuthPromise);
        }

        if (payslip.appliedLoans && Array.isArray(payslip.appliedLoans)) {
            payslip.appliedLoans.forEach(applied => {
                if (!applied.loanId || applied.loanId === 'unknown') return;
                const loanRef = db.collection("loans").doc(applied.loanId);
                const safeNewBalance = Number(applied.newBalance) || 0;
                
                const updateData = {
                    remainingBalance: safeNewBalance,
                    isActive: safeNewBalance > 0, 
                    status: safeNewBalance <= 0 ? 'paid_off' : 'active',
                    updatedAt: FieldValue.serverTimestamp()
                };

                // NOUVEAU : Si on a utilisé l'Override, on l'efface pour le mois suivant
                if (applied.wasOverrideUsed) {
                    updateData.nextInstallmentOverride = FieldValue.delete();
                }
                
                batch.update(loanRef, updateData);
            });
        }

        const advanceDeductionAmount = Number(payslip.deductions?.advance) || 0;
        if (advanceDeductionAmount > 0) {
            // FIX : On accepte les avances "approved" ET "paid"
            const advancesSnapshot = await db.collection("salary_advances")
                .where("staffId", "==", staffId)
                .where("payPeriodYear", "==", year)
                .where("payPeriodMonth", "==", month)
                .where("status", "in", ["approved", "paid"])
                .get();
                
            advancesSnapshot.forEach((doc) => {
                // FIX : On sauvegarde le statut d'origine (previousStatus) pour le Rollback
                batch.update(doc.ref, { 
                    status: 'deducted', 
                    previousStatus: doc.data().status || 'approved',
                    deductedAt: FieldValue.serverTimestamp() 
                });
            });
        }
    });

    try {
        await Promise.all(processPayslips);

        for (const [bId, data] of Object.entries(branchTotals)) {
            const runDocId = bId === 'global' ? `${year}_${month}` : `${year}_${month}_${bId}`;
            const runRef = db.collection("payroll_runs").doc(runDocId);
            batch.set(runRef, {
                year, month, branchId: bId === 'global' ? null : bId,
                totalNetPay: data.totalNetPay, payslipCount: data.count,
                finalizedAt: FieldValue.serverTimestamp(), finalizedBy: request.auth.uid
            }, { merge: true });
        }

        await batch.commit();
        await Promise.all(authDisablePromises);

        return { success: true, result: `Successfully finalized ${payrollData.length} payslips.` };
    } catch (error) {
        console.error("Batch commit failed:", error);
        throw new HttpsError("internal", `Failed to store payslips. Detailed Error: ${error.message}`);
    }
});