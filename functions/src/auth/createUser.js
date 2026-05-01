const { HttpsError, onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();

exports.createUserHandler = onCall({ region: "asia-southeast1" }, async (request) => {

    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to create a user.");
    }
    const callerUid = request.auth.uid;

    // --- Authorization check pour autoriser Admin et Super Admin ---
    try {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        const allowedRoles = ['manager', 'admin', 'super_admin'];
        if (!callerDoc.exists || !allowedRoles.includes(callerDoc.data().role)) {
            throw new HttpsError("permission-denied", "Permission denied. Only managers and admins can create users.");
        }
    } catch (error) {
        console.error("Error verifying caller role:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "Internal server error while verifying role.");
    }

    // --- Input Validation & Extraction ---
    const {
        email, password, firstName, lastName, nickname,
        position, department, startDate, payType, rate, 
        baseSalary, hourlyRate, standardDayHours,       // <-- AJOUT DES INFOS DE PAIE DÉTAILLÉES
        branchId, isSsoRegistered, holidayPolicy,       // <-- AJOUT DE LA SUCCURSALE ET COMPLIANCE
        phoneNumber, birthdate, bankAccount, address, 
        emergencyContactName, emergencyContactPhone
     } = request.data;

    // Keep essential fields required
    if (!email || !password || !firstName || !lastName || !nickname || !position || !department || !startDate || !payType || typeof rate !== 'number') {
        throw new HttpsError("invalid-argument", "Missing required core user data (email, password, name, job info including numeric rate).");
    }
     if (password.length < 6) {
         throw new HttpsError("invalid-argument", "Password must be at least 6 characters long.");
     }
     const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
     if (!dateRegex.test(startDate) || (birthdate && !dateRegex.test(birthdate))) {
         throw new HttpsError("invalid-argument", "Start date (and birthdate, if provided) must be in YYYY-MM-DD format.");
     }

    // --- Create User and Profile ---
    let newUserId;
    try {
        console.log(`User ${callerUid} attempting to create user ${email}`);
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: nickname
        });
        newUserId = userRecord.uid; 
        console.log(`Successfully created Auth user ${newUserId} for email ${email}`);

        // Set role in 'users' collection
        await db.collection("users").doc(newUserId).set({ role: "staff" });

        // Create initial job history entry avec les NOUVELLES DONNÉES
        const initialJob = {
            position,
            department,
            startDate,
            payType,
            rate: parseInt(rate, 10),
            baseSalary: baseSalary || null,
            hourlyRate: hourlyRate || null,
            standardDayHours: standardDayHours || 8
        };

        // Create staff profile document avec les NOUVELLES DONNÉES
        await db.collection("staff_profiles").doc(newUserId).set({
            firstName,
            lastName,
            nickname,
            email,
            startDate,
            uid: newUserId,
            jobHistory: [initialJob],
            branchId: branchId || null,                                      // <-- INCLUSION DE LA SUCCURSALE
            isSsoRegistered: isSsoRegistered !== undefined ? isSsoRegistered : true, // <-- INCLUSION SSO
            holidayPolicy: holidayPolicy || 'in_lieu',                       // <-- INCLUSION POLICY
            createdAt: FieldValue.serverTimestamp(),
            bonusStreak: 0,
            status: 'active',
            phoneNumber: phoneNumber || null,
            birthdate: birthdate || null,
            bankAccount: bankAccount || null,
            address: address || null,
            emergencyContactName: emergencyContactName || null,
            emergencyContactPhone: emergencyContactPhone || null,
        });
        console.log(`Successfully created Firestore profile for ${newUserId}`);

        return { result: `Successfully created user ${email} with ID ${newUserId}` };

    } catch (error) {
        console.error(`Error creating new user ${email}:`, error);

        // Delete the Auth user if Firestore profile creation fails
        if (error.code !== "auth/email-already-exists" && newUserId) { 
             try {
                 await admin.auth().deleteUser(newUserId);
                 console.log(`Cleaned up partially created Auth user ${newUserId}.`);
             } catch (cleanupError) {
                 console.error(`Failed to clean up partially created Auth user ${newUserId}:`, cleanupError);
             }
         }

        if (error.code === "auth/email-already-exists") {
            throw new HttpsError("already-exists", "This email is in use.");
        }
        if (error instanceof HttpsError) {
             throw error;
         }
        throw new HttpsError("internal", "An unexpected error occurred while creating the user.", error.message);
    }
});