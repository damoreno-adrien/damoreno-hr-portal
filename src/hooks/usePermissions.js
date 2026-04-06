/* src/hooks/usePermissions.js */
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

export default function usePermissions(db, userRole) {
    const [permissions, setPermissions] = useState({});
    const [loadingPermissions, setLoadingPermissions] = useState(true);

    useEffect(() => {
        if (!db || !userRole) {
            setLoadingPermissions(false);
            return;
        }

        // FAIL-SAFE: Super Admin always gets god-mode access
        if (userRole === 'super_admin') {
            setPermissions({
                canViewFinancialRules: true,
                canEditFinancialRules: true,
                canApproveLeave: true,
                canEditGeofence: true,
                canRunPayroll: true,
                canManageUsers: true
            });
            setLoadingPermissions(false);
            return;
        }

        // For everyone else, read the live Matrix from Firebase
        const unsubscribe = onSnapshot(doc(db, 'settings', 'role_permissions'), (docSnap) => {
            if (docSnap.exists()) {
                const allPerms = docSnap.data();
                // Get the permissions for their specific role, or default to empty if not found
                setPermissions(allPerms[userRole] || {});
            }
            setLoadingPermissions(false);
        });

        return () => unsubscribe();
    }, [db, userRole]);

    return { permissions, loadingPermissions };
}