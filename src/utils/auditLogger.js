/* src/utils/auditLogger.js */
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Enregistre une action sensible dans le journal d'audit global.
 * * @param {Object} db - L'instance Firestore
 * @param {Object} user - L'objet utilisateur actuel (qui fait l'action)
 * @param {String} branchId - L'ID de la succursale concernée (ou 'global')
 * @param {String} actionType - Le type d'action (ex: 'UPDATE_SETTINGS', 'REVOKE_ACCESS')
 * @param {String} details - Une description lisible par un humain
 */
export const logSystemAction = async (db, user, branchId, actionType, details) => {
    if (!db || !user) return;

    try {
        await addDoc(collection(db, 'system_logs'), {
            timestamp: serverTimestamp(),
            userId: user.uid,
            userEmail: user.email || 'Unknown Email',
            branchId: branchId || 'global',
            actionType: actionType,
            details: details
        });
    } catch (error) {
        // On loggue l'erreur dans la console, mais on ne fait pas planter l'application
        // car une erreur de journalisation ne doit pas empêcher le directeur de travailler.
        console.error("Audit Logger Error: Failed to write log.", error);
    }
};