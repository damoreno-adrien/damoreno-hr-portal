/* src/hooks/useAuth.js */
import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function useAuth(auth, db) {
    const [user, setUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [hasStaffProfile, setHasStaffProfile] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    
    // NOUVEAU : State pour capter et classifier l'erreur fatale
    const [authError, setAuthError] = useState(null); 

    useEffect(() => {
        if (!auth || !db) {
            setIsLoading(false);
            return;
        };

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                try {
                    setAuthError(null); // On reset l'erreur à chaque nouvelle tentative

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

                } catch (error) {
                    console.error("Auth Initialization Error:", error);
                    
                    // CLASSIFICATION DE L'ERREUR POUR L'UI
                    if (error.code === 'unavailable' || error.message.includes('offline') || error.message.includes('Failed to get document')) {
                        setAuthError({ code: 'offline', message: "No internet connection or the server is currently unreachable." });
                    } else if (error.code === 'permission-denied') {
                        setAuthError({ code: 'denied', message: "Access denied. Your session may have expired or your account was restricted." });
                    } else if (error.code === 'deadline-exceeded') {
                        setAuthError({ code: 'timeout', message: "Connection timed out. Your internet connection might be too slow." });
                    } else {
                        setAuthError({ code: 'unknown', message: "An unexpected error occurred while loading the portal data." });
                    }
                    
                    // Par sécurité, si ça plante, on ne connecte pas l'utilisateur à moitié
                    setUser(null);
                    setUserRole(null);
                    setHasStaffProfile(false);
                }
            } else {
                setUser(null);
                setUserRole(null);
                setHasStaffProfile(false);
                setAuthError(null);
            }
            setIsLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, [auth, db]);

    // On exporte bien la nouvelle variable authError
    return { user, userRole, hasStaffProfile, isLoading, authError };
}