const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];


exports.deletePayrollRunHandler = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can delete payroll runs.");
    }
    const { payPeriod } = request.data;
    if (!payPeriod || !payPeriod.year || !payPeriod.month) {
        throw new HttpsError("invalid-argument", "The function must be called with a 'payPeriod' object containing a 'year' and 'month'.");
    }

    const { year, month } = payPeriod;

    try {
        const payslipsQuery = db.collection("payslips")
            .where("payPeriodYear", "==", year)
            .where("payPeriodMonth", "==", month);
        
        const payslipsToDeleteSnap = await payslipsQuery.get();

        if (payslipsToDeleteSnap.empty) {
            return { result: "No payslips found for this period. Nothing to delete." };
        }

        const batch = db.batch();

        payslipsToDeleteSnap.forEach(doc => {
            const payslipData = doc.data();
            const staffId = payslipData.staffId;
            const bonusInfo = payslipData.bonusInfo;

            batch.delete(doc.ref);

            if (staffId && bonusInfo) {
                // Revert streak
                const previousStreak = bonusInfo.newStreak > 0 ? bonusInfo.newStreak - 1 : 0;
                const staffRef = db.collection("staff_profiles").doc(staffId);
                batch.update(staffRef, { bonusStreak: previousStreak });
            }
        });

        await batch.commit();

        return { result: `Successfully deleted ${payslipsToDeleteSnap.size} payslips for ${months[month - 1]} ${year} and reverted bonus streaks.` };

    } catch (error) {
        console.error("Error deleting payroll run:", error);
        throw new HttpsError("internal", "An unexpected error occurred while deleting the payroll run.", error.message);
    }
});