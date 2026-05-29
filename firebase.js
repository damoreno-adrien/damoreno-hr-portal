import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { 
    initializeFirestore, 
    persistentLocalCache, 
    persistentMultipleTabManager,
    connectFirestoreEmulator 
} from 'firebase/firestore'; // <-- Remplacement de getFirestore
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

let app;
let auth;
let db;
let functions;

try {
    const firebaseConfigString = typeof import.meta.env !== 'undefined'
        ? import.meta.env.VITE_FIREBASE_CONFIG
        : (typeof __firebase_config__ !== 'undefined' ? __firebase_config__ : '{}');
    const firebaseConfig = JSON.parse(firebaseConfigString);

    if (firebaseConfig.apiKey) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        
        // --- ACTIVATION DU MODE HORS-LIGNE ROBUSTE ---
        db = initializeFirestore(app, {
            localCache: persistentLocalCache({
                tabManager: persistentMultipleTabManager()
            })
        });
        
        functions = getFunctions(app, "asia-southeast1");

        const useEmulator = false; 

        if (useEmulator) {
            console.info("🛠️ MODE DEV DÉTECTÉ : Connexion aux Émulateurs Locaux Firebase");
            connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
            connectFirestoreEmulator(db, "127.0.0.1", 8080);
            connectFunctionsEmulator(functions, "127.0.0.1", 5001);
        } else {
            console.info("🌍 MODE PROD DÉTECTÉ : Connexion aux vrais serveurs Asie");
        }

    } else {
        console.error("Firebase config is missing or invalid!");
    }
} catch (error) {
    console.error("Firebase Initialization Error:", error);
}

export { app, auth, db, functions };