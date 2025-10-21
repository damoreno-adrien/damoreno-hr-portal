const { HttpsError, https } = require("firebase-functions/v2");
const { getFirestore } = require('firebase-admin/firestore');
const { Parser } = require('json2csv');

const db = getFirestore();

exports.exportStaffDataHandler = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can export staff data.");
    }

    try {
        const staffSnap = await db.collection("staff_profiles").get();
        if (staffSnap.empty) {
            return { csvData: "" }; // Return empty string if no staff
        }

        const records = staffSnap.docs.map(doc => {
            const staff = doc.data();
            const latestJob = (staff.jobHistory || [])
                .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0] || {};

            // --- ADD the new fields here ---
            return {
                FirstName: staff.firstName || '',
                LastName: staff.lastName || '',
                Nickname: staff.nickname || '',
                Email: staff.email || '',
                PhoneNumber: staff.phoneNumber || '',
                Birthdate: staff.birthdate || '',
                StartDate: staff.startDate || '',
                Status: staff.status || 'active', // Default to active if status is missing
                EndDate: staff.endDate || '',
                // New fields
                Address: staff.address || '',
                EmergencyContactName: staff.emergencyContactName || '',
                EmergencyContactPhone: staff.emergencyContactPhone || '',
                // Job details
                Department: latestJob.department || 'N/A',
                Position: latestJob.position || 'N/A',
                PayType: latestJob.payType || 'N/A',
                Rate: latestJob.rate || 0,
                // Financial
                BankAccount: staff.bankAccount || '',
            };
        });

        // --- ADD the corresponding headers to the fields array ---
        const fields = [
            'FirstName', 'LastName', 'Nickname', 'Email', 'PhoneNumber', 'Birthdate',
            'StartDate', 'Status', 'EndDate',
            // New fields added
            'Address', 'EmergencyContactName', 'EmergencyContactPhone',
            'Department', 'Position', 'PayType', 'Rate', 'BankAccount'
        ];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(records);

        return { csvData: csv };

    } catch (error) {
        console.error("Error exporting staff data:", error);
        throw new HttpsError("internal", "An unexpected error occurred while exporting data.", error.message);
    }
});