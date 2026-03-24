const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const db = getFirestore();

// ============================================================================
// MANAGER ALERT LISTENER: Safely connects dashboard clicks to payroll data
// ============================================================================
exports.onManagerAlertUpdated = onDocumentUpdated({
    document: "manager_alerts/{alertId}",
    region: "asia-southeast1"
}, async (event) => {
    const newValue = event.data.after.data();
    const previousValue = event.data.before.data();

    // 1. HR PENALTY: Revoke Bonus
    if (previousValue.status === 'pending' && newValue.status === 'enforced') {
        console.log(`Executing HR Penalty for Staff: ${newValue.staffName}`);
        try {
            // Note: Update 'staff' to 'users' if your collection is named users
            const staffRef = db.collection('staff').doc(newValue.staffId); 
            await staffRef.update({
                isEligibleForAttendanceBonus: false,
                attendanceBonusStreak: 0,
                lastDisciplinaryAction: newValue.date,
                updatedAt: FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error("Failed to apply HR penalty:", error);
        }
    }

    // 2. OVERTIME APPROVAL: Feed the Payroll Generator
    if (previousValue.status === 'pending' && newValue.status === 'approved' && newValue.type === 'overtime_request') {
        console.log(`Approving ${newValue.extraMinutes} mins of OT for: ${newValue.staffName}`);
        try {
            if (newValue.attendanceDocId) {
                // We update the attendance record so usePayrollGenerator.js can find it naturally
                const attendanceRef = db.collection('attendance').doc(newValue.attendanceDocId);
                await attendanceRef.update({
                    approvedOvertimeMins: newValue.extraMinutes,
                    isOvertimeApproved: true,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            console.error("Failed to approve Overtime:", error);
        }
    }
});