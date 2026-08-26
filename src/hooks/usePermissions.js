/* src/hooks/usePermissions.js */
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { ALL_PERMISSION_KEYS } from '../config/permissions.config';

const permissionCache = new Map();

export default function usePermissions(db, userRole, userId) {
    const [permissions, setPermissions] = useState({});
    const [loadingPermissions, setLoadingPermissions] = useState(true);
    const cacheKey = `${userRole}-${userId}`;

    useEffect(() => {
        if (!db || !userRole || !userId) {
            setLoadingPermissions(false);
            return;
        }

        if (userRole === 'super_admin') {
            const superAdminPerms = {};
            ALL_PERMISSION_KEYS.forEach(key => superAdminPerms[key] = true);
            setPermissions(superAdminPerms);
            setLoadingPermissions(false);
            return;
        }

        let rolePerms = {};
        let customPerms = {};
        let isMatrixLoaded = false;
        let isUserLoaded = false;

        const compilePermissions = () => {
            if (isMatrixLoaded && isUserLoaded) {
                setPermissions({ ...rolePerms, ...customPerms });
                setLoadingPermissions(false);
            }
        };

        const unsubMatrix = onSnapshot(doc(db, 'settings', 'role_permissions'), (docSnap) => {
            if (docSnap.exists()) { rolePerms = docSnap.data()[userRole] || {}; }
            isMatrixLoaded = true;
            compilePermissions();
        });

        const unsubUser = onSnapshot(doc(db, 'users', userId), (docSnap) => {
            if (docSnap.exists()) { customPerms = docSnap.data().customPermissions || {}; }
            isUserLoaded = true;
            compilePermissions();
        });

        return () => { unsubMatrix(); unsubUser(); };
    }, [db, userRole, userId]);

    return { permissions, loadingPermissions };
}
