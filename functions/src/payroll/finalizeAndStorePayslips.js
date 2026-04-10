const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin');

if (admin.apps.length === 0) { admin.initializeApp(); }
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
    const authDisablePromises = []; 
    const branchTotals = {}; // Tracks totals to create separate 'payroll_run' documents

    const processPayslips = payrollData.map(async (payslip) => {
        const staffId = payslip.staffId || payslip.id;
        
        // --- 1. THE SPLITTER: Fetch Staff Branch ---
        const staffRef = db.collection("staff_profiles").doc(staffId);
        const staffSnap = await staffRef.get();
        const staffData = staffSnap.data() || {};
        const branchId = staffData.branchId || 'global'; 

        // Keep track of the totals for this specific branch
        if (!branchTotals[branchId]) branchTotals[branchId] = { totalNetPay: 0, count: 0 };
        branchTotals[branchId].totalNetPay += (Number(payslip.netPay) || 0);
        branchTotals[branchId].count += 1;

        // --- 2. STAMP THE PAYSLIP ---
        const payslipId = `${staffId}_${year}_${month}`;
        const payslipRef = db.collection("payslips").doc(payslipId);

        const payslipToSave = {
            ...payslip,
            staffId: staffId, 
            payPeriodYear: year,
            payPeriodMonth: month,
            branchId: branchId !== 'global' ? branchId : null, // The DNA Stamp
            generatedAt: admin.firestore.FieldValue.serverTimestamp(), 
            finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
            finalizedBy: request.auth.uid,
            status: 'finalized'
        };

        batch.set(payslipRef, payslipToSave);

        // 3. Update Bonus Streak
        const newStreak = payslip.bonusInfo?.newStreak ?? 0;
        batch.update(staffRef, { bonusStreak: newStreak });

        // 4. Handle Offboarding Lockout
        if (payslip.offboardingPayout) {
            batch.update(staffRef, {
                'status': 'inactive',
                'offboardingSettings.isPendingFutureOffboard': false,
                'offboardingSettings.payoutDisbursed': true,
                'offboardingSettings.payoutDisbursedAt': admin.firestore.FieldValue.serverTimestamp(),
                'offboardingSettings.payoutPayslipId': payslipId
            });
            const disableAuthPromise = admin.auth().updateUser(staffId, { disabled: true })
                .then(() => console.log(`Successfully locked Auth for offboarded staff: ${staffId}`))
                .catch(err => console.error(`Failed to lock Auth for ${staffId}:`, err));
            authDisablePromises.push(disableAuthPromise);
        }

        // 5. Handle Loan Deductions
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

        // 6. Handle Salary Advance Deductions
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

        // --- 7. CREATE THE SEPARATE PAYROLL_RUN DOCUMENTS ---
        for (const [bId, data] of Object.entries(branchTotals)) {
            // Give each branch a completely separate run document in the database
            const runDocId = bId === 'global' ? `${year}_${month}` : `${year}_${month}_${bId}`;
            const runRef = db.collection("payroll_runs").doc(runDocId);
            
            batch.set(runRef, {
                year,
                month,
                branchId: bId === 'global' ? null : bId, // Tie the run to the branch
                totalNetPay: data.totalNetPay,
                payslipCount: data.count,
                finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
                finalizedBy: request.auth.uid
            }, { merge: true });
        }

        await batch.commit();
        await Promise.all(authDisablePromises);

        return { result: `Successfully grouped and stored ${payrollData.length} payslips for ${month}/${year}.` };
    } catch (error) {
        console.error("Batch commit failed:", error);
        throw new HttpsError("internal", "Failed to store payslips.");
    }
});