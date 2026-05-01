import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'; // <-- Ajout des imports Functions

let app;
let auth;
let db;
let functions; // <-- Ajout de la variable pour exporter les fonctions

try {
    const firebaseConfigString = typeof import.meta.env !== 'undefined'
        ? import.meta.env.VITE_FIREBASE_CONFIG
        : (typeof __firebase_config__ !== 'undefined' ? __firebase_config__ : '{}');
    const firebaseConfig = JSON.parse(firebaseConfigString);

    if (firebaseConfig.apiKey) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        
        // Initialisation des fonctions sur notre région v2
        functions = getFunctions(app, "asia-southeast1");

        // --- 🛡️ LE BOUCLIER DE SÉCURITÉ VERCEL ---
        // import.meta.env.DEV est VRAI uniquement sur ton PC (localhost).
        // Sur Vercel, ce code sera purement et simplement ignoré.
        if (import.meta.env.DEV) {
            console.info("🛠️ MODE DEV DÉTECTÉ : Connexion aux Émulateurs Locaux Firebase");
            
            // disableWarnings: true évite d'avoir un bandeau rouge géant sur l'écran de login local
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

// On n'oublie pas d'exporter `functions` pour que tes composants React l'utilisent !
export { app, auth, db, functions };