/* functions/src/staff/exportStaffData.js */

const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
// *** FIX: Import Timestamp ***
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { Parser } = require('json2csv');

// Require date-fns
console.log("exportStaffData: Attempting to require date-fns...");
let parseISO, isValid, format, parse;
try {
    const dfns = require('date-fns');
    parseISO = dfns.parseISO;
    isValid = dfns.isValid;
    format = dfns.format;
    parse = dfns.parse;
    console.log("exportStaffData: Successfully required date-fns.");
} catch (e) {
    console.error("exportStaffData: FAILED to require date-fns:", e);
}
// End date-fns Block

const db = getFirestore();

// *** FIX: Updated Helper to handle Timestamp objects ***
const formatDateForExport = (dateInput) => {
    // Ensure date-fns functions loaded first
    if (!isValid || !format || !parseISO || !parse) return '';
    if (!dateInput) return ''; // Handle null, undefined immediately

    let dateObj;

    // 1. Check if it's a Firestore Timestamp
    if (dateInput instanceof Timestamp) {
        try {
            dateObj = dateInput.toDate(); // Convert to JS Date
            if (isValid(dateObj)) {
                return format(dateObj, 'dd/MM/yyyy'); // Format directly
            } else {
                 console.warn(`exportStaffData: Converted Timestamp resulted in invalid JS Date:`, dateInput);
                 return '';
            }
        } catch(e) {
             console.error(`exportStaffData: Error converting Timestamp to Date:`, dateInput, e);
             return '';
        }
    }
    // 2. If it's a string, try parsing various formats
    else if (typeof dateInput === 'string') {
        let parsedSuccessfully = false;
        // Try ISO format first (most reliable if present)
        try {
             dateObj = parseISO(dateInput);
             if (isValid(dateObj)) {
                parsedSuccessfully = true;
             }
        } catch(e) { /* Ignore ISO parse error */ }

        // Try 'dd/MM/yyyy' if ISO failed
        if (!parsedSuccessfully) {
            try {
                dateObj = parse(dateInput, 'dd/MM/yyyy', new Date());
                if (isValid(dateObj)) { parsedSuccessfully = true; }
            } catch (e) { /* Ignore */ }
        }
        // Try 'dd-MM-yyyy' if others failed
        if (!parsedSuccessfully) {
             try {
                dateObj = parse(dateInput, 'dd-MM-yyyy', new Date());
                if (isValid(dateObj)) { parsedSuccessfully = true; }
            } catch (e) { /* Ignore */ }
        }
         // Add other formats like yy if necessary...
         // try { dateObj = parse(dateInput, 'dd/MM/yy', new Date()); ... } catch(e) {}

        // If any parsing succeeded, format the result
        if (parsedSuccessfully) {
             return format(dateObj, 'dd/MM/yyyy');
        }
    }

    // If input wasn't Timestamp or a parsable string
    console.warn(`exportStaffData: Could not format or parse date input:`, dateInput);
    return '';
};


// *** FIX: Make getCurrentJob slightly more robust for Timestamps ***
const getCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) {
        return { position: 'N/A', department: 'Unassigned', rate: '', payType: '' }; // Ensure defaults
    }
    // Ensure sorting is robust using date-fns or Timestamps
    return [...staff.jobHistory].sort((a, b) => {
        let dateA, dateB;
        // Prefer converting Timestamp to Date
        if (a.startDate instanceof Timestamp) dateA = a.startDate.toDate();
        else if (typeof a.startDate === 'string' && parseISO) dateA = parseISO(a.startDate); // Fallback to parsing string
        else dateA = new Date(0); // Default if missing or unparsable

        if (b.startDate instanceof Timestamp) dateB = b.startDate.toDate();
        else if (typeof b.startDate === 'string' && parseISO) dateB = parseISO(b.startDate);
        else dateB = new Date(0);

        // Use getTime() only if the dates are valid JS Dates
        const timeA = isValid(dateA) ? dateA.getTime() : 0;
        const timeB = isValid(dateB) ? dateB.getTime() : 0;
        return timeB - timeA; // Descending order
    })[0] || { position: 'N/A', department: 'Unassigned', rate: '', payType: '' }; // Add fallback with defaults
};


// Helper to get display name (remains the same)
const getDisplayName = (staff) => {
    if (!staff) return 'Unknown Staff';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    return staff.fullName || 'Unknown Staff';
};


exports.exportStaffDataHandler = onCall({ region: "us-central1" }, async (request) => {
    console.log("exportStaffDataHandler: Full function execution started.");
    console.log("exportStaffDataHandler: Auth context:", JSON.stringify(request.auth || null));

    // Ensure date-fns loaded
     if (!parseISO || !isValid || !format || !parse) {
         console.error("CRITICAL: date-fns functions not loaded!");
         throw new OnCallHttpsError("internal", "Core Date library failed to load.");
     }

    // Auth check (remains the same)
    if (!request.auth) { /* ... */
         console.error("exportStaffDataHandler: Unauthenticated access.");
         throw new OnCallHttpsError("unauthenticated", "You must be logged in.");
    }

    // Role check (remains the same)
    try { /* ... */
         const callerDoc = await db.collection("users").doc(request.auth.uid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") {
            console.error(`exportStaffDataHandler: Permission denied for user ${request.auth.uid}. Role: ${callerDoc.data()?.role}`);
            throw new OnCallHttpsError("permission-denied", "Only managers can export staff data.");
        }
        console.log(`exportStaffDataHandler: Authorized manager ${request.auth.uid}.`);
    } catch(err) { /* ... */
         console.error(`exportStaffDataHandler: Error checking manager role for ${request.auth.uid}:`, err);
         throw new OnCallHttpsError("internal", "Failed to verify user role.");
    }

    // --- Main Export Logic ---
    try {
        console.log("exportStaffDataHandler: Querying staff_profiles...");
        const staffSnap = await db.collection("staff_profiles").get();

        if (staffSnap.empty) {
            console.log("exportStaffDataHandler: No documents found in staff_profiles.");
            return { csvData: "", filename: `staff_export_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.csv` }; // Return empty but with filename
        }
        console.log(`exportStaffDataHandler: Found ${staffSnap.size} staff profiles.`);

        const records = staffSnap.docs.map(doc => {
            const staff = doc.data();
            const latestJob = getCurrentJob(staff); // Now slightly more robust

            // Use the updated formatDateForExport helper
            return {
                staffId: doc.id,
                FirstName: staff.firstName || '',
                LastName: staff.lastName || '',
                Nickname: staff.nickname || '',
                Email: staff.email || '',
                PhoneNumber: staff.phoneNumber || '',
                // Pass Firestore Timestamps or strings directly to the helper
                Birthdate: formatDateForExport(staff.birthdate),
                StartDate: formatDateForExport(staff.startDate),
                Status: staff.status || 'active',
                EndDate: formatDateForExport(staff.endDate),
                Address: staff.address || '',
                EmergencyContactName: staff.emergencyContactName || '',
                EmergencyContactPhone: staff.emergencyContactPhone || '',
                Department: latestJob.department || 'N/A',
                Position: latestJob.position || 'N/A',
                PayType: latestJob.payType || '', // Use default from getCurrentJob
                // Ensure rate is treated as a number for consistency if possible, fallback to empty string
                Rate: latestJob.rate !== undefined && latestJob.rate !== null ? Number(latestJob.rate) : '',
                BankAccount: staff.bankAccount || '',
            };
        });

        // Fields definition remains the same
        const fields = [ /* ... keep as is ... */
            'staffId', 'FirstName', 'LastName', 'Nickname', 'Email', 'PhoneNumber', 'Birthdate',
            'StartDate', 'Status', 'EndDate',
            'Address', 'EmergencyContactName', 'EmergencyContactPhone',
            'Department', 'Position', 'PayType', 'Rate', 'BankAccount'
        ];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(records);
        console.log("exportStaffDataHandler: CSV generated successfully.");

        // Generate filename (remains the same)
        const now = new Date();
        const timestamp = format(now, 'yyyy-MM-dd_HHmmss');
        const filename = `staff_export_${timestamp}.csv`;
        console.log(`exportStaffDataHandler: Generated filename: ${filename}`);

        // Return CSV data AND the filename
        return { csvData: csv, filename: filename };

    } catch (error) {
        console.error("Error during staff data export:", error);
        // Ensure OnCallHttpsError is thrown for client
        if (error instanceof OnCallHttpsError) throw error;
        // Include original error message for better debugging
        throw new OnCallHttpsError("internal", `An unexpected error occurred while exporting data. ${error.message}`, error.stack);
    }
});