import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

const DEFAULT_CONFIG = {
    holidayPayMultiplier: 1.0,
    maxHolidayBalance: 15,
    cashOutWindowDays: 60,
};

// --- FIX: Pass 'user' into the hook ---
export default function useCompanyConfig(db, user) {
    const [companyConfig, setCompanyConfig] = useState(null);

    useEffect(() => {
        // --- FIX: Wait for both the database AND the user to be ready ---
        if (!db || !user) return;

        const configDocRef = doc(db, 'settings', 'company_config');
        const unsubscribe = onSnapshot(configDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setCompanyConfig({ ...DEFAULT_CONFIG, ...docSnap.data() });
            } else {
                console.error("Company config document not found!");
                setCompanyConfig(DEFAULT_CONFIG); 
            }
        });

        return () => unsubscribe();
    }, [db, user]); // <-- Added 'user' to the dependency array

    return companyConfig;
}