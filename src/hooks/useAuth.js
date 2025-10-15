import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function useAuth(auth, db) {
    const [user, setUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!auth || !db) {
            setIsLoading(false);
            return;
        };

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                const userDocRef = doc(db, 'users', currentUser.uid);
                const userDocSnap = await getDoc(userDocRef);
                const role = userDocSnap.exists() ? userDocSnap.data().role : null;
                setUser(currentUser);
                setUserRole(role);
            } else {
                setUser(null);
                setUserRole(null);
            }
            setIsLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, [auth, db]);

    return { user, userRole, isLoading };
}