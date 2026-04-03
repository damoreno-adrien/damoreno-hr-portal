import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function useAuth(auth, db) {
    const [user, setUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [hasStaffProfile, setHasStaffProfile] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!auth || !db) {
            setIsLoading(false);
            return;
        };

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                // 1. Get Security Role
                const userDocRef = doc(db, 'users', currentUser.uid);
                const userDocSnap = await getDoc(userDocRef);
                const role = userDocSnap.exists() ? userDocSnap.data().role : null;
                
                // 2. Check for Staff Profile existence
                const staffDocRef = doc(db, 'staff_profiles', currentUser.uid);
                const staffDocSnap = await getDoc(staffDocRef);
                
                setUser(currentUser);
                setUserRole(role);
                setHasStaffProfile(staffDocSnap.exists());
            } else {
                setUser(null);
                setUserRole(null);
                setHasStaffProfile(false);
            }
            setIsLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, [auth, db]);

    return { user, userRole, hasStaffProfile, isLoading };
}