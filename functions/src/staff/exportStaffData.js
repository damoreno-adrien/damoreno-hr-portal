/* functions/src/staff/exportStaffData.js */

const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');
const { Parser } = require('json2csv');

// Require date-fns with logging
console.log("exportStaffData: Attempting to require date-fns...");
let parseISO, isValid, format, parse; // Added 'parse'
try {
    const dfns = require('date-fns');
    parseISO = dfns.parseISO;
    isValid = dfns.isValid;
    format = dfns.format;
    parse = dfns.parse; // Assign parse function
    console.log("exportStaffData: Successfully required date-fns.");
} catch (e) {
    console.error("exportStaffData: FAILED to require date-fns:", e);
    // Let the check below handle it
}
// End date-fns Block


const db = getFirestore();

// Helper to format various date strings into DD/MM/YYYY
const formatDateForExport = (dateString) => {
    if (!dateString || !parseISO || !isValid || !format || !parse) return ''; // Ensure functions loaded

    let dateObj;

    // 1. Try standard ISO / YYYY-MM-DD first
    dateObj = parseISO(dateString);
    if (isValid(dateObj)) {
        return format(dateObj, 'dd/MM/yyyy'); // Your preferred format
    }

    // 2. Try DD-MM-YY
    try {
        dateObj = parse(dateString, 'dd-MM-yy', new Date());
        if (isValid(dateObj)) { return format(dateObj, 'dd/MM/yyyy'); }
    } catch (e) { /* Ignore parsing error */ }

    // 3. Try DD/MM/YY
    try {
        dateObj = parse(dateString, 'dd/MM/yy', new Date());
        if (isValid(dateObj)) { return format(dateObj, 'dd/MM/yyyy'); }
    } catch (e) { /* Ignore parsing error */ }

     // 4. Try DD-MM-YYYY
     try {
        dateObj = parse(dateString, 'dd-MM-yyyy', new Date());
        if (isValid(dateObj)) { return format(dateObj, 'dd/MM/yyyy'); }
    } catch (e) { /* Ignore parsing error */ }

     // 5. Try DD/MM/YYYY
     try {
        dateObj = parse(dateString, 'dd/MM/yyyy', new Date());
        if (isValid(dateObj)) { return format(dateObj, 'dd/MM/yyyy'); }
    } catch (e) { /* Ignore parsing error */ }


    // If none of the formats worked
    console.warn(`exportStaffData: Could not parse or format date: "${dateString}"`);
    return '';
};

// Helper to get current job details using robust date parsing
const getCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) {
        return { position: 'N/A', department: 'Unassigned' };
    }
    // Ensure sorting is robust using date-fns
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = a.startDate && parseISO ? parseISO(a.startDate) : new Date(0); // Check parseISO exists
        const dateB = b.startDate && parseISO ? parseISO(b.startDate) : new Date(0); // Check parseISO exists
        const timeA = !isNaN(dateA) ? dateA.getTime() : 0;
        const timeB = !isNaN(dateB) ? dateB.getTime() : 0;
        return timeB - timeA;
    })[0] || {}; // Add fallback for safety
};

// Helper to get display name
const getDisplayName = (staff) => {
    if (!staff) return 'Unknown Staff';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    return staff.fullName || 'Unknown Staff';
};


exports.exportStaffDataHandler = onCall({ region: "us-central1" }, async (request) => {
    console.log("exportStaffDataHandler: Full function execution started.");
    console.log("exportStaffDataHandler: Auth context:", JSON.stringify(request.auth || null));

    // Ensure date-fns loaded (check includes 'parse' now)
     if (!parseISO || !isValid || !format || !parse) {
         console.error("CRITICAL: date-fns functions not loaded!");
         throw new OnCallHttpsError("internal", "Core Date library failed to load.");
     }

    // Auth check
    if (!request.auth) {
        console.error("exportStaffDataHandler: Unauthenticated access.");
        throw new OnCallHttpsError("unauthenticated", "You must be logged in to perform this action.");
    }

    // Role check
    try {
        const callerDoc = await db.collection("users").doc(request.auth.uid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") {
            console.error(`exportStaffDataHandler: Permission denied for user ${request.auth.uid}. Role: ${callerDoc.data()?.role}`);
            throw new OnCallHttpsError("permission-denied", "Only managers can export staff data.");
        }
        console.log(`exportStaffDataHandler: Authorized manager ${request.auth.uid}.`);
    } catch(err) {
         console.error(`exportStaffDataHandler: Error checking manager role for ${request.auth.uid}:`, err);
         throw new OnCallHttpsError("internal", "Failed to verify user role.");
    }

    // --- Restore Original Logic ---
    try {
        console.log("exportStaffDataHandler: Querying staff_profiles...");
        const staffSnap = await db.collection("staff_profiles").get();

        if (staffSnap.empty) {
            console.log("exportStaffDataHandler: No documents found in staff_profiles.");
            return { csvData: "" }; // Return empty string if no staff
        }
        console.log(`exportStaffDataHandler: Found ${staffSnap.size} staff profiles.`);

        const records = staffSnap.docs.map(doc => {
            const staff = doc.data();
            const latestJob = getCurrentJob(staff);

            return {
                // *** ADDED staffId ***
                staffId: doc.id, 
                // ---
                FirstName: staff.firstName || '',
                LastName: staff.lastName || '',
                Nickname: staff.nickname || '',
                Email: staff.email || '',
                PhoneNumber: staff.phoneNumber || '',
                Birthdate: formatDateForExport(staff.birthdate),
                StartDate: formatDateForExport(staff.startDate),
                Status: staff.status || 'active',
                EndDate: formatDateForExport(staff.endDate),
                Address: staff.address || '',
                EmergencyContactName: staff.emergencyContactName || '',
                EmergencyContactPhone: staff.emergencyContactPhone || '',
                Department: latestJob.department || 'N/A',
                Position: latestJob.position || 'N/A',
                PayType: latestJob.payType || 'N/A',
                Rate: staff.rate ?? latestJob.rate ?? '',
                BankAccount: staff.bankAccount || '',
            };
        });

        const fields = [
            // *** ADDED staffId ***
            'staffId', 
            // ---
            'FirstName', 'LastName', 'Nickname', 'Email', 'PhoneNumber', 'Birthdate',
            'StartDate', 'Status', 'EndDate',
            'Address', 'EmergencyContactName', 'EmergencyContactPhone',
            'Department', 'Position', 'PayType', 'Rate', 'BankAccount'
        ];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(records);
        console.log("exportStaffDataHandler: CSV generated successfully.");

        // Generate timestamp string for filename
        const now = new Date();
        const timestamp = format(now, 'yyyy-MM-dd_HHmmss'); // Uses date-fns format
        const filename = `staff_export_${timestamp}.csv`;
        console.log(`exportStaffDataHandler: Generated filename: ${filename}`);

        // Return CSV data AND the filename
        return { csvData: csv, filename: filename };

    } catch (error) {
        console.error("Error during staff data export:", error);
        // Ensure OnCallHttpsError is thrown
        if (error instanceof OnCallHttpsError) throw error;
        throw new OnCallHttpsError("internal", "An unexpected error occurred while exporting data.", error.message);
    }
});