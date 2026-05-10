/* functions/src/attendance/alertTriggers.js */
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const db = getFirestore();

exports.onManagerAlertUpdated = onDocumentUpdated({
    document: "manager_alerts/{alertId}",
    region: "asia-southeast1"
}, async (event) => {
    const newValue = event.data.after.data();
    const previousValue = event.data.before.data();

    // 1. HR PENALTY: Zero the Streak, Save Memory State & Apply Progressive Discipline
    if (previousValue.status === 'pending' && newValue.status === 'enforced') {
        console.log(`Executing HR Penalty for Staff: ${newValue.staffName}`);
        try {
            const staffRef = db.collection('staff_profiles').doc(newValue.staffId); 
            const staffSnap = await staffRef.get();

            if (staffSnap.exists) {
                const staffData = staffSnap.data();
                const currentStreak = staffData.bonusStreak || 0; 
                
                // --- LOGIQUE DE DISCIPLINE PROGRESSIVE ---
                const currentTier = staffData.currentWarningTier || 0;
                const newTier = currentTier >= 3 ? 3 : currentTier + 1; // Plafond au Tier 3

                // Save the old streak into the ALERT document so we remember it for 'Undo'
                const alertRef = db.collection('manager_alerts').doc(event.params.alertId);
                await alertRef.update({ previousStreak: currentStreak });

                // Reset streak AND update disciplinary tier
                await staffRef.update({
                    bonusStreak: 0, 
                    currentWarningTier: newTier,
                    lastDisciplinaryAction: newValue.date, // Mémorise la date de la faute punie
                    updatedAt: FieldValue.serverTimestamp()
                });
                
                console.log(`Penalty enforced. Tier ${currentTier} -> Tier ${newTier}. Streak reset to 0.`);
            }
        } catch (error) {
            console.error("Failed to execute penalty:", error);
        }
    }

    // 2. UNDO / REVOKE: Restore previous state
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
            
            // Undo Penalty (Restore the exact previous streak & decrement Tier)
            if (newValue.type === 'risk_late' || newValue.type === 'risk_absence' || newValue.type === 'risk_disciplinary') {
                const staffRef = db.collection('staff_profiles').doc(newValue.staffId); 
                const staffSnap = await staffRef.get();
                
                const streakToRestore = newValue.previousStreak || 0;
                
                let updateData = {
                    bonusStreak: streakToRestore, 
                    updatedAt: FieldValue.serverTimestamp()
                };

                // Optionnel mais recommandé : Faire reculer le Tier si on annule la sanction
                if (staffSnap.exists) {
                    const currentTier = staffSnap.data().currentWarningTier || 0;
                    if (currentTier > 0) {
                        updateData.currentWarningTier = currentTier - 1;
                    }
                }

                await staffRef.update(updateData);
                console.log(`Penalty revoked. Bonus streak restored to ${streakToRestore}. Tier adjusted.`);
            }
        } catch (error) {
            console.error("Failed to revoke action:", error);
        }
    }
});