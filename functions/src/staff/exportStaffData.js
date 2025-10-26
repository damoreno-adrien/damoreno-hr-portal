/* functions/src/staff/exportStaffData.js */

const { HttpsError, https } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError: OnCallHttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
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

// Updated Helper to handle Timestamp objects or strings
const formatDateForExport = (dateInput) => {
    if (!isValid || !format || !parseISO || !parse) return '';
    if (!dateInput) return '';

    let dateObj;

    if (dateInput instanceof Timestamp) {
        try {
            dateObj = dateInput.toDate();
            if (isValid(dateObj)) return format(dateObj, 'dd/MM/yyyy');
            else { console.warn(`exportStaffData: Converted Timestamp invalid:`, dateInput); return ''; }
        } catch(e) { console.error(`exportStaffData: Error converting Timestamp:`, dateInput, e); return ''; }
    }
    else if (typeof dateInput === 'string') {
        // Reduced parsing attempts for simplicity, focusing on ISO and dd/MM/yyyy
        try { dateObj = parseISO(dateInput); if (isValid(dateObj)) return format(dateObj, 'dd/MM/yyyy'); } catch(e) {}
        try { dateObj = parse(dateInput, 'dd/MM/yyyy', new Date()); if (isValid(dateObj)) return format(dateObj, 'dd/MM/yyyy'); } catch (e) {}
        // Add dd-MM-yyyy back if needed
        // try { dateObj = parse(dateInput, 'dd-MM-yyyy', new Date()); if (isValid(dateObj)) return format(dateObj, 'dd/MM/yyyy'); } catch (e) {}
    }

    console.warn(`exportStaffData: Could not format or parse date input:`, dateInput);
    return '';
};


// Helper to get display name (remains the same)
const getDisplayName = (staff) => { /* ... keep as is ... */
    if (!staff) return 'Unknown Staff';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    return staff.fullName || 'Unknown Staff';
};


exports.exportStaffDataHandler = onCall({ region: "us-central1" }, async (request) => {
    console.log("exportStaffDataHandler: Full function execution started.");
    // ... (Auth and Role checks remain the same) ...
     if (!request.auth) throw new OnCallHttpsError("unauthenticated", "You must be logged in.");
    try {
        const callerDoc = await db.collection("users").doc(request.auth.uid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") throw new OnCallHttpsError("permission-denied", "Only managers can export staff data.");
        console.log(`exportStaffDataHandler: Authorized manager ${request.auth.uid}.`);
    } catch(err) { throw new OnCallHttpsError("internal", "Failed to verify user role."); }

    // --- Main Export Logic ---
    try {
        console.log("exportStaffDataHandler: Querying staff_profiles...");
        const staffSnap = await db.collection("staff_profiles").get();

        if (staffSnap.empty) {
            console.log("exportStaffDataHandler: No documents found.");
            return { csvData: "", filename: `staff_export_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.csv` };
        }
        console.log(`exportStaffDataHandler: Found ${staffSnap.size} staff profiles.`);

        const records = staffSnap.docs.map(doc => {
            const staff = doc.data();
            // No longer need getCurrentJob here

            return {
                staffId: doc.id,
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
                BankAccount: staff.bankAccount || '',
                // --- JOB FIELDS REMOVED ---
                // Department: latestJob.department || 'N/A',
                // Position: latestJob.position || 'N/A',
                // PayType: latestJob.payType || '',
                // Rate: latestJob.rate !== undefined && latestJob.rate !== null ? Number(latestJob.rate) : '',
            };
        });

        // *** Fields definition updated ***
        const fields = [
            'staffId', 'FirstName', 'LastName', 'Nickname', 'Email', 'PhoneNumber', 'Birthdate',
            'StartDate', 'Status', 'EndDate',
            'Address', 'EmergencyContactName', 'EmergencyContactPhone', 'BankAccount'
             // --- JOB FIELDS REMOVED ---
            // 'Department', 'Position', 'PayType', 'Rate'
        ];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(records);
        console.log("exportStaffDataHandler: CSV generated successfully.");

        // Generate filename (remains the same)
        const now = new Date();
        const timestamp = format(now, 'yyyy-MM-dd_HHmmss');
        const filename = `staff_export_${timestamp}.csv`;
        console.log(`exportStaffDataHandler: Generated filename: ${filename}`);

        return { csvData: csv, filename: filename };

    } catch (error) {
        console.error("Error during staff data export:", error);
        if (error instanceof OnCallHttpsError) throw error;
        throw new OnCallHttpsError("internal", `An unexpected error occurred. ${error.message}`, error.stack);
    }
});