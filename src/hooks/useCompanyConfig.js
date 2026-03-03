import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

// --- NEW: Baseline defaults for the new Holiday Ledger ---
// These will be used automatically if the database doesn't have them yet.
const DEFAULT_CONFIG = {
    holidayPayMultiplier: 1.0,
    maxHolidayBalance: 15,
    cashOutWindowDays: 60,
};

export default function useCompanyConfig(db) {
    const [companyConfig, setCompanyConfig] = useState(null);

    useEffect(() => {
        if (!db) return;

        const configDocRef = doc(db, 'settings', 'company_config');
        const unsubscribe = onSnapshot(configDocRef, (docSnap) => {
            if (docSnap.exists()) {
                // Merge database data WITH our new defaults. 
                // This guarantees the app has the rules it needs instantly.
                setCompanyConfig({ ...DEFAULT_CONFIG, ...docSnap.data() });
            } else {
                console.error("Company config document not found!");
                setCompanyConfig(DEFAULT_CONFIG); 
            }
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, [db]);

    return companyConfig;
}