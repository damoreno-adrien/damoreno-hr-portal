/* functions/src/staff/exportStaffData.js */

const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, Timestamp } = require('firebase-admin/firestore'); // Ensure Timestamp is imported
const { Parser } = require('json2csv');

// Require date-fns
console.log("exportStaffData: Attempting to require date-fns...");
let parseISO, isValid, format, parse;
try {
    const dfns = require('date-fns');
    parseISO = dfns.parseISO;
    isValid = dfns.isValid;
    format = dfns.format;
    parse = dfns.parse; // Keep parse if needed for string fallback
    console.log("exportStaffData: Successfully required date-fns.");
} catch (e) {
    console.error("exportStaffData: FAILED to require date-fns:", e);
    // Let the check below handle it, but log the error clearly
}
// End date-fns Block

const db = getFirestore();

/**
 * Helper to format date inputs (Timestamp or String) into DD/MM/YYYY.
 * Returns an empty string if input is invalid, null, undefined, or date-fns isn't loaded.
 */
const formatDateForExport = (dateInput) => {
    // Ensure date-fns functions are loaded before proceeding
    if (!isValid || !format || !parseISO || !parse) {
        console.error("exportStaffData/formatDate: date-fns functions not loaded!");
        return '';
    }
    // Handle null/undefined/empty string immediately
    if (!dateInput || dateInput === '') return '';

    let dateObj;

    // 1. Check if it's a Firestore Timestamp
    if (dateInput instanceof Timestamp) {
        try {
            dateObj = dateInput.toDate(); // Convert to JS Date
            if (isValid(dateObj)) {
                return format(dateObj, 'dd/MM/yyyy'); // Format directly
            } else {
                 console.warn(`exportStaffData/formatDate: Converted Timestamp resulted in invalid JS Date:`, dateInput);
                 return ''; // Return empty string for invalid dates
            }
        } catch(e) {
             console.error(`exportStaffData/formatDate: Error converting Timestamp to Date:`, dateInput, e);
             return ''; // Return empty string on error
        }
    }
    // 2. If it's a string, try parsing known formats
    else if (typeof dateInput === 'string') {
        let parsedSuccessfully = false;
        const formatsToTry = [
            'yyyy-MM-dd', // ISO subset often used
            'dd/MM/yyyy',
            'dd-MM-yyyy',
            'dd/MM/yy',
            'dd-MM-yy'
            // Add more formats if needed
        ];

        // Try ISO parse first
        try {
             dateObj = parseISO(dateInput);
             if (isValid(dateObj)) parsedSuccessfully = true;
        } catch(e) { /* Ignore ISO parse error, try others */ }

        // Try other formats if ISO failed
        if (!parsedSuccessfully) {
            for (const fmt of formatsToTry) {
                 try {
                    dateObj = parse(dateInput, fmt, new Date());
                    if (isValid(dateObj)) {
                        parsedSuccessfully = true;
                        break; // Stop trying once a valid parse occurs
                    }
                } catch (e) { /* Ignore parsing error for this format */ }
            }
        }

        // If any parsing succeeded, format the result
        if (parsedSuccessfully) {
             return format(dateObj, 'dd/MM/yyyy');
        }
    }

    // If input wasn't Timestamp or a parsable string
    console.warn(`exportStaffData/formatDate: Could not format or parse date input:`, dateInput);
    return ''; // Return empty string if unhandled
};


// Helper to get display name
const getDisplayName = (staff) => {
    if (!staff) return 'Unknown Staff';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName && staff.lastName) return `${staff.firstName} ${staff.lastName}`;
    if (staff.firstName) return staff.firstName; // Fallback if only first name
    return staff.fullName || 'Unknown Staff'; // Final fallback
};


exports.exportStaffDataHandler = onCall({
    region: "us-central1", // Ensure region consistency if needed elsewhere
    timeoutSeconds: 300, // Standard timeout, adjust if needed for very large exports
    memory: "512MiB" // Default memory, adjust if needed
}, async (request) => {
    console.log("exportStaffDataHandler: Function execution started.");

    // Ensure date-fns loaded (critical check)
     if (!isValid || !format || !parseISO || !parse) {
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
         // Propagate specific error types if possible, otherwise use internal
         if (err instanceof OnCallHttpsError) throw err;
         throw new OnCallHttpsError("internal", "Failed to verify user role.", err.message);
    }

    // --- Main Export Logic ---
    try {
        console.log("exportStaffDataHandler: Querying 'staff_profiles' collection...");
        const staffSnap = await db.collection("staff_profiles").get();

        const now = new Date(); // Get current time once for filename
        const timestamp = format(now, 'yyyy-MM-dd_HHmmss');
        const filename = `staff_export_${timestamp}.csv`;

        if (staffSnap.empty) {
            console.log("exportStaffDataHandler: No documents found in 'staff_profiles'. Returning empty CSV.");
            // Return empty CSV data but still provide a filename
            return { csvData: "", filename: filename };
        }
        console.log(`exportStaffDataHandler: Found ${staffSnap.size} staff profiles.`);

        // Map Firestore documents to plain objects for CSV conversion
        const records = staffSnap.docs.map(doc => {
            const staff = doc.data();
            if (!staff) return null; // Safety check in case of empty data

            // Prepare record using profile data only
            return {
                staffId: doc.id, // Include the document ID
                FirstName: staff.firstName || '',
                LastName: staff.lastName || '',
                Nickname: staff.nickname || '',
                Email: staff.email || '',
                PhoneNumber: staff.phoneNumber || '',
                // Use the robust date formatting helper
                Birthdate: formatDateForExport(staff.birthdate),
                StartDate: formatDateForExport(staff.startDate),
                Status: staff.status || 'active', // Default to 'active' if missing
                EndDate: formatDateForExport(staff.endDate),
                Address: staff.address || '',
                EmergencyContactName: staff.emergencyContactName || '',
                EmergencyContactPhone: staff.emergencyContactPhone || '',
                BankAccount: staff.bankAccount || '',
                // Job fields are intentionally omitted
            };
        }).filter(record => record !== null); // Filter out any potentially null records

        // Define the fields/columns for the CSV file (matching the keys above)
        const fields = [
            'staffId',
            'FirstName', 'LastName', 'Nickname', 'Email',
            'PhoneNumber', 'Birthdate', 'StartDate', 'Status', 'EndDate',
            'Address', 'EmergencyContactName', 'EmergencyContactPhone',
            'BankAccount'
            // Job fields are intentionally omitted
        ];

        // Use json2csv Parser
        const json2csvParser = new Parser({ fields, excelStrings: true }); // excelStrings helps prevent formula injection
        const csv = json2csvParser.parse(records);
        console.log("exportStaffDataHandler: CSV generated successfully.");
        console.log(`exportStaffDataHandler: Generated filename: ${filename}`);

        // Return CSV data and the generated filename
        return { csvData: csv, filename: filename };

    } catch (error) {
        console.error("exportStaffDataHandler: Error during CSV generation or data fetching:", error);
        // Ensure OnCallHttpsError is thrown back to the client
        if (error instanceof OnCallHttpsError) throw error;
        // Provide more context in the error message if possible
        throw new OnCallHttpsError("internal", `An unexpected error occurred while exporting data. ${error.message}`, error.stack);
    }
});