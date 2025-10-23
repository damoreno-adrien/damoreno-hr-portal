const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];


exports.deletePayrollRunHandler = https.onCall({ region: "asia-southeast1" }, async (request) => { // Updated region
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can delete payroll runs.");
    }
    const { payPeriod } = request.data;
    if (!payPeriod || typeof payPeriod.year !== 'number' || typeof payPeriod.month !== 'number' || payPeriod.month < 1 || payPeriod.month > 12) { // Added type checks
        throw new HttpsError("invalid-argument", "The function must be called with a 'payPeriod' object containing a valid 'year' and 'month' (1-12).");
    }

    const { year, month } = payPeriod;

    try {
        const payslipsQuery = db.collection("payslips")
            .where("payPeriodYear", "==", year)
            .where("payPeriodMonth", "==", month); // Use 1-indexed month directly

        const payslipsToDeleteSnap = await payslipsQuery.get();

        if (payslipsToDeleteSnap.empty) {
            return { result: `No payslips found for ${months[month - 1]} ${year}. Nothing to delete.` }; // Added month name
        }

        const batch = db.batch();
        let staffToUpdate = []; // Keep track of staff whose streaks need reverting

        payslipsToDeleteSnap.forEach(doc => {
            const payslipData = doc.data();
            const staffId = payslipData.staffId;
            const bonusInfo = payslipData.bonusInfo;

            batch.delete(doc.ref);

            // Revert bonus streak based on the *deleted* payslip's recorded *new* streak
            if (staffId && bonusInfo && typeof bonusInfo.newStreak === 'number') {
                // Calculate the streak the user *had* before this payslip was generated
                const previousStreak = bonusInfo.newStreak > 0 ? bonusInfo.newStreak - 1 : 0;
                staffToUpdate.push({ staffId, previousStreak });
            }
        });

        // Update streaks after collecting all deletes for the batch
        staffToUpdate.forEach(({ staffId, previousStreak }) => {
            console.log(`Reverting bonus streak for ${staffId} to ${previousStreak}`);
            const staffRef = db.collection("staff_profiles").doc(staffId);
            batch.update(staffRef, { bonusStreak: previousStreak });
        });

        await batch.commit();

        console.log(`Deleted ${payslipsToDeleteSnap.size} payslips and reverted ${staffToUpdate.length} bonus streaks for ${year}-${month}.`);
        return { result: `Successfully deleted ${payslipsToDeleteSnap.size} payslips for ${months[month - 1]} ${year} and reverted bonus streaks.` };

    } catch (error) {
        console.error(`Error deleting payroll run for ${year}-${month}:`, error);
        throw new HttpsError("internal", "An unexpected error occurred while deleting the payroll run.", error.message);
    }
});