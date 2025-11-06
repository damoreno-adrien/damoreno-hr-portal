/* functions/src/staff/exportStaffData.js */

const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { Parser } = require('json2csv');

// Require date-fns
console.log("exportStaffData: Attempting to require date-fns...");
let isValid, format;
try {
    const dfns = require('date-fns');
    isValid = dfns.isValid;
    format = dfns.format;
    console.log("exportStaffData: Successfully required date-fns.");
} catch (e) {
    console.error("exportStaffData: FAILED to require date-fns:", e);
}
// End date-fns Block

const db = getFirestore();

/**
 * --- UPDATED: Strict Date Formatter ---
 * Helper to format date inputs (Timestamp only) into DD/MM/YYYY.
 * Returns an empty string if input is invalid, null, or not a Timestamp.
 */
const formatDateForExport = (dateInput) => {
    // Ensure date-fns functions are loaded
    if (!isValid || !format) {
        console.error("exportStaffData/formatDate: date-fns functions not loaded!");
        return '';
    }
    
    // Handle null/undefined/empty string immediately
    if (!dateInput) return '';

    // We ONLY accept Firestore Timestamps from the database
    if (dateInput instanceof Timestamp) {
        try {
            const dateObj = dateInput.toDate();
            if (isValid(dateObj)) {
                return format(dateObj, 'dd/MM/yyyy'); // Format to standard
            } else {
                 console.warn(`exportStaffData/formatDate: Converted Timestamp resulted in invalid JS Date:`, dateInput);
                 return '';
            }
        } catch(e) {
             console.error(`exportStaffData/formatDate: Error converting Timestamp to Date:`, dateInput, e);
             return '';
        }
    }

    // If input wasn't a Timestamp (e.g., a bad string), return empty
    console.warn(`exportStaffData/formatDate: Input was not a Timestamp:`, dateInput);
    return '';
};
// --- END UPDATED FUNCTION ---


// Helper to get display name
const getDisplayName = (staff) => {
    // ... (rest of function is unchanged) ...
    if (!staff) return 'Unknown Staff';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName && staff.lastName) return `${staff.firstName} ${staff.lastName}`;
    if (staff.firstName) return staff.firstName; // Fallback if only first name
    return staff.fullName || 'Unknown Staff'; // Final fallback
};


exports.exportStaffDataHandler = onCall({
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (request) => {
    console.log("exportStaffDataHandler: Function execution started.");

    // Ensure date-fns loaded
     if (!isValid || !format) {
         console.error("exportStaffDataHandler: CRITICAL - date-fns functions not loaded!");
         throw new OnCallHttpsError("internal", "Core Date library failed to load, cannot export dates correctly.");
     }

    // Auth check
    if (!request.auth) {
        console.error("exportStaffDataHandler: Unauthenticated access attempt.");
        throw new OnCallHttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const callerUid = request.auth.uid;
    console.log(`exportStaffDataHandler: Received call from authenticated user: ${callerUid}`);

    // Role check
    try {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") {
            console.error(`exportStaffDataHandler: Permission denied for user ${callerUid}. Role: ${callerDoc.data()?.role}`);
            throw new OnCallHttpsError("permission-denied", "Only managers can export staff data.");
        }
        console.log(`exportStaffDataHandler: User ${callerUid} authorized as manager.`);
    } catch(err) {
         console.error(`exportStaffDataHandler: Error verifying manager role for ${callerUid}:`, err);
         if (err instanceof OnCallHttpsError) throw err;
         throw new OnCallHttpsError("internal", "Failed to verify user role.", err.message);
    }

    // --- Main Export Logic ---
    try {
        console.log("exportStaffDataHandler: Querying 'staff_profiles' collection...");
        const staffSnap = await db.collection("staff_profiles").get();

        const now = new Date();
        const timestamp = format(now, 'yyyy-MM-dd_HHmmss');
        const filename = `staff_export_${timestamp}.csv`;

        if (staffSnap.empty) {
            console.log("exportStaffDataHandler: No documents found in 'staff_profiles'. Returning empty CSV.");
            return { csvData: "", filename: filename };
        }
        console.log(`exportStaffDataHandler: Found ${staffSnap.size} staff profiles.`);

        // Map Firestore documents to plain objects for CSV conversion
        const records = staffSnap.docs.map(doc => {
            const staff = doc.data();
            if (!staff) return null;

            return {
                staffId: doc.id,
                FirstName: staff.firstName || '',
                LastName: staff.lastName || '',
                Nickname: staff.nickname || '',
                Email: staff.email || '',
                PhoneNumber: staff.phoneNumber || '',
                // Use the robust date formatting helper
                Birthdate: formatDateForExport(staff.birthdate),
                StartDate: formatDateForExport(staff.startDate),
                Status: staff.status || 'active',
                EndDate: formatDateForExport(staff.endDate),
                Address: staff.address || '',
                EmergencyContactName: staff.emergencyContactName || '',
                EmergencyContactPhone: staff.emergencyContactPhone || '',
                BankAccount: staff.bankAccount || '',
            };
        }).filter(record => record !== null);

        // Define the fields/columns for the CSV file
        const fields = [
            'staffId',
            'FirstName', 'LastName', 'Nickname', 'Email',
            'PhoneNumber', 'Birthdate', 'StartDate', 'Status', 'EndDate',
            'Address', 'EmergencyContactName', 'EmergencyContactPhone',
            'BankAccount'
        ];

        const json2csvParser = new Parser({ fields, excelStrings: true });
        const csv = json2csvParser.parse(records);
        console.log("exportStaffDataHandler: CSV generated successfully.");
        console.log(`exportStaffDataHandler: Generated filename: ${filename}`);

        return { csvData: csv, filename: filename };

    } catch (error) {
        console.error("exportStaffDataHandler: Error during CSV generation or data fetching:", error);
        if (error instanceof OnCallHttpsError) throw error;
        throw new OnCallHttpsError("internal", `An unexpected error occurred while exporting data. ${error.message}`, error.stack);
    }
});