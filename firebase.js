import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

let app;
let auth;
let db;

try {
    const firebaseConfigString = typeof import.meta.env !== 'undefined'
        ? import.meta.env.VITE_FIREBASE_CONFIG
        : (typeof __firebase_config__ !== 'undefined' ? __firebase_config__ : '{}');
    const firebaseConfig = JSON.parse(firebaseConfigString);

    if (firebaseConfig.apiKey) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    } else {
        console.error("Firebase config is missing or invalid!");
    }
} catch (error) {
    console.error("Firebase Initialization Error:", error);
}

// Ensure clean named exports only for the instances
export { app, auth, db };

// You can also export other core firebase helpers here if you prefer
// export { getFunctions, httpsCallable } from "firebase/functions";