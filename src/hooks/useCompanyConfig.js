import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

export default function useCompanyConfig(db) {
    const [companyConfig, setCompanyConfig] = useState(null);

    useEffect(() => {
        if (!db) return;

        const configDocRef = doc(db, 'settings', 'company_config');
        const unsubscribe = onSnapshot(configDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setCompanyConfig(docSnap.data());
            } else {
                console.error("Company config document not found!");
                setCompanyConfig({}); // Set to empty object to avoid errors
            }
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, [db]);

    return companyConfig;
}