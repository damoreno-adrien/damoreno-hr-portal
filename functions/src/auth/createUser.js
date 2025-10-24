const { HttpsError, onCall } = require("firebase-functions/v2/https"); // Use onCall
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
// const cors = require("cors")({ origin: true }); // Not needed for onCall

const db = getFirestore();

// Use onCall instead of onRequest
exports.createUserHandler = onCall({ region: "asia-southeast1" }, async (request) => { // Updated region, use request object
    // --- Authentication check (provided by onCall) ---
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to create a user.");
    }
    const callerUid = request.auth.uid;

    // --- Authorization check ---
    try {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") {
            throw new HttpsError("permission-denied", "Permission denied. Only managers can create users.");
        }
    } catch (error) {
        console.error("Error verifying caller role:", error);
        throw new HttpsError("internal", "Internal server error while verifying role.");
    }

    // --- Input Validation (data comes from request.data) ---
    const {
        email, password, firstName, lastName, nickname,
        position, department, startDate, payType, rate, // Job info
        phoneNumber, birthdate, bankAccount, address, // Optional profile info
        emergencyContactName, emergencyContactPhone
     } = request.data;

    // Keep essential fields required
    if (!email || !password || !firstName || !lastName || !nickname || !position || !department || !startDate || !payType || typeof rate !== 'number') {
        throw new HttpsError("invalid-argument", "Missing required core user data (email, password, name, job info including numeric rate).");
    }
     // Optional: Add stricter validation (email format, password length, date format)
     if (password.length < 6) {
         throw new HttpsError("invalid-argument", "Password must be at least 6 characters long.");
     }
     // Basic date format check
     const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
     if (!dateRegex.test(startDate) || (birthdate && !dateRegex.test(birthdate))) {
         throw new HttpsError("invalid-argument", "Start date (and birthdate, if provided) must be in YYYY-MM-DD format.");
     }


    // --- Create User and Profile ---
    try {
        console.log(`Manager ${callerUid} attempting to create user ${email}`);
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: nickname // Use nickname for Auth display name
        });
        const newUserId = userRecord.uid;
        console.log(`Successfully created Auth user ${newUserId} for email ${email}`);

        // Set role in 'users' collection
        await db.collection("users").doc(newUserId).set({ role: "staff" });

        // Create initial job history entry
        const initialJob = {
            position,
            department,
            startDate, // Already validated as YYYY-MM-DD
            payType,
            rate: Number(rate) // Ensure rate is stored as a number
        };

        // Create staff profile document
        await db.collection("staff_profiles").doc(newUserId).set({
            // Core fields
            firstName,
            lastName,
            nickname,
            email,
            startDate, // YYYY-MM-DD string
            uid: newUserId, // Link to auth UID
            jobHistory: [initialJob], // Store as array
            createdAt: FieldValue.serverTimestamp(), // Use server timestamp
            bonusStreak: 0,
            status: 'active', // Default status
            // Optional fields (use null if empty/not provided)
            phoneNumber: phoneNumber || null,
            birthdate: birthdate || null, // YYYY-MM-DD string or null
            bankAccount: bankAccount || null,
            address: address || null,
            emergencyContactName: emergencyContactName || null,
            emergencyContactPhone: emergencyContactPhone || null,
        });
        console.log(`Successfully created Firestore profile for ${newUserId}`);

        return { result: `Successfully created user ${email} with ID ${newUserId}` };

    } catch (error) {
        console.error(`Error creating new user ${email}:`, error);
        // Delete the Auth user if Firestore profile creation fails to prevent orphaned auth accounts
        if (error.code !== "auth/email-already-exists" && typeof newUserId !== 'undefined') {
             try {
                 await admin.auth().deleteUser(newUserId);
                 console.log(`Cleaned up partially created Auth user ${newUserId}.`);
             } catch (cleanupError) {
                 console.error(`Failed to clean up partially created Auth user ${newUserId}:`, cleanupError);
             }
         }

        if (error.code === "auth/email-already-exists") {
            throw new HttpsError("already-exists", "This email is already in use.");
        }
        if (error instanceof HttpsError) { // Re-throw HttpsErrors
             throw error;
         }
        // Throw a generic internal error for other issues
        throw new HttpsError("internal", "An unexpected error occurred while creating the user.", error.message);
    }
});