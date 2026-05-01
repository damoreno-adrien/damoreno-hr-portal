/* functions/src/staff/exportStaffData.js */

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { Parser } = require('json2csv');
const { format } = require('date-fns');

const db = getFirestore();

/**
 * --- STRICT DATE FORMATTER ---
 * Helper to format date inputs (Timestamp only) into DD/MM/YYYY.
 * Returns an empty string if input is invalid, null, or not a Timestamp.
 */
const formatDateForExport = (dateInput) => {
    if (!dateInput) return '';

    if (dateInput instanceof Timestamp) {
        try {
            const dateObj = dateInput.toDate();
            if (dateObj instanceof Date && !isNaN(dateObj.getTime())) {
                return format(dateObj, 'dd/MM/yyyy');
            } else {
                console.warn(`exportStaffData/formatDate: Converted Timestamp resulted in invalid JS Date:`, dateInput);
                return '';
            }
        } catch(e) {
            console.error(`exportStaffData/formatDate: Error converting Timestamp to Date:`, dateInput, e);
            return '';
        }
    }

    console.warn(`exportStaffData/formatDate: Input was not a Timestamp:`, dateInput);
    return '';
};

exports.exportStaffDataHandler = onCall({
    region: "asia-southeast1",
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (request) => {
    console.log("exportStaffDataHandler: Function execution started.");

    // Auth check
    if (!request.auth) {
        console.error("exportStaffDataHandler: Unauthenticated access attempt.");
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const callerUid = request.auth.uid;
    console.log(`exportStaffDataHandler: Received call from authenticated user: ${callerUid}`);

    // Role check (Règle 3 - RBAC hiérarchique)
    try {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        const callerRole = callerDoc.exists ? callerDoc.data().role : null;
        
        if (!['manager', 'admin', 'super_admin'].includes(callerRole)) {
            console.error(`exportStaffDataHandler: Permission denied for user ${callerUid}. Role: ${callerRole}`);
            throw new HttpsError("permission-denied", "Only managers, admins, and super admins can export staff data.");
        }
        console.log(`exportStaffDataHandler: User ${callerUid} authorized as ${callerRole}.`);
    } catch(err) {
        console.error(`exportStaffDataHandler: Error verifying user role for ${callerUid}:`, err);
        if (err instanceof HttpsError) throw err;
        throw new HttpsError("internal", "Failed to verify user role.", err.message);
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
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", `An unexpected error occurred while exporting data. ${error.message}`, error.stack);
    }
});