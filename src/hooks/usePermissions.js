/* src/hooks/usePermissions.js */
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { ALL_PERMISSION_KEYS } from '../config/permissions.config';

// Module-level cache shared across all hook instances/components.
// Key: "role-userId" -> compiled permissions object.
const permissionCache = new Map();

export default function usePermissions(db, userRole, userId) {
    const cacheKey = `${userRole}-${userId}`;
    const cached = permissionCache.get(cacheKey);

    // Seed initial state from cache (if any) to avoid a loading flicker
    // when this hook remounts (e.g., navigating between pages).
    const [permissions, setPermissions] = useState(cached || {});
    const [loadingPermissions, setLoadingPermissions] = useState(!cached);

    useEffect(() => {
        if (!db || !userRole || !userId) {
            setLoadingPermissions(false);
            return;
        }

        if (userRole === 'super_admin') {
            const superAdminPerms = {};
            ALL_PERMISSION_KEYS.forEach(key => superAdminPerms[key] = true);
            permissionCache.set(cacheKey, superAdminPerms);
            setPermissions(superAdminPerms);
            setLoadingPermissions(false);
            return;
        }

        // Show cached permissions immediately while fresh data loads in the background.
        const cachedForKey = permissionCache.get(cacheKey);
        if (cachedForKey) {
            setPermissions(cachedForKey);
            setLoadingPermissions(false);
        }

        let rolePerms = {};
        let customPerms = {};
        let isMatrixLoaded = false;
        let isUserLoaded = false;

        const compilePermissions = () => {
            if (isMatrixLoaded && isUserLoaded) {
                const compiled = { ...rolePerms, ...customPerms };
                permissionCache.set(cacheKey, compiled);
                setPermissions(compiled);
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
    }, [db, userRole, userId, cacheKey]);

    return { permissions, loadingPermissions };
}
