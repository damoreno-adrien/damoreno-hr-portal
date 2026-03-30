const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const db = getFirestore();

exports.onManagerAlertUpdated = onDocumentUpdated({
    document: "manager_alerts/{alertId}",
    region: "asia-southeast1"
}, async (event) => {
    const newValue = event.data.after.data();
    const previousValue = event.data.before.data();

    // 1. HR PENALTY: Zero the Streak & Save Memory State
    if (previousValue.status === 'pending' && newValue.status === 'enforced') {
        console.log(`Executing HR Penalty for Staff: ${newValue.staffName}`);
        try {
            // Check your exact collection name: 'staff_profiles' or 'staff'
            const staffRef = db.collection('staff_profiles').doc(newValue.staffId); 
            const staffSnap = await staffRef.get();

            if (staffSnap.exists) {
                const currentStreak = staffSnap.data().bonusStreak || 0; // Grab the current streak

                // Save the old streak into the ALERT document so we remember it for 'Undo'
                const alertRef = db.collection('manager_alerts').doc(event.params.alertId);
                await alertRef.update({ previousStreak: currentStreak });

                // Reset the staff's streak to 0 (DO NOT touch isEligibleForAttendanceBonus)
                await staffRef.update({
                    bonusStreak: 0,
                    lastDisciplinaryAction: newValue.date,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            console.error("Failed to apply HR penalty:", error);
        }
    }

    // 2. OVERTIME APPROVAL: Feed the Payroll Generator
    if (previousValue.status === 'pending' && newValue.status === 'approved' && newValue.type === 'overtime_request') {
        console.log(`Approving ${newValue.extraMinutes} mins of OT for: ${newValue.staffName}`);
        try {
            if (newValue.attendanceDocId) {
                const attendanceRef = db.collection('attendance').doc(newValue.attendanceDocId);
                await attendanceRef.update({
                    otApprovedMinutes: newValue.extraMinutes,
                    otStatus: "approved",
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            console.error("Failed to approve Overtime:", error);
        }
    }

    // 3. THE UNDO BUTTON: Revoke/Delete an action using Memory State
    if (previousValue.status !== 'revoked' && newValue.status === 'revoked') {
        console.log(`Revoking HR Action for: ${newValue.staffName}`);
        try {
            // Undo Overtime
            if (newValue.type === 'overtime_request' && newValue.attendanceDocId) {
                const attendanceRef = db.collection('attendance').doc(newValue.attendanceDocId);
                await attendanceRef.update({
                    otApprovedMinutes: 0,
                    otStatus: "pending", 
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
            
            // Undo Penalty (Restore the exact previous streak)
            if (newValue.type === 'risk_late' || newValue.type === 'risk_absence') {
                const staffRef = db.collection('staff_profiles').doc(newValue.staffId); 
                
                // Pull the memory state we saved during enforcement (default to 0 if missing)
                const streakToRestore = newValue.previousStreak || 0;

                await staffRef.update({
                    bonusStreak: streakToRestore, 
                    updatedAt: FieldValue.serverTimestamp()
                });
                console.log(`Penalty revoked. Bonus streak successfully restored to ${streakToRestore}.`);
            }
        } catch (error) {
            console.error("Failed to revoke action:", error);
        }
    }
});