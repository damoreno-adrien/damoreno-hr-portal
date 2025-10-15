import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';

export default function useStaffList(db, user) {
    const [staffList, setStaffList] = useState([]);

    useEffect(() => {
        if (db && user) {
            const staffCollectionRef = collection(db, 'staff_profiles');
            const unsubscribe = onSnapshot(staffCollectionRef, (querySnapshot) => {
                const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setStaffList(list);
            });

            // Cleanup subscription on unmount
            return () => unsubscribe();
        } else {
            // If no user or db, ensure the list is empty
            setStaffList([]);
        }
    }, [db, user]);

    return staffList;
}