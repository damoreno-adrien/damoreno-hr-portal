const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
// *** Use Luxon for Timezone Handling ***
console.log("autoCheckout: Attempting to require luxon...");
let DateTime;
try {
    const luxon = require('luxon');
    DateTime = luxon.DateTime;
    console.log("autoCheckout: Successfully required luxon.");
} catch(e) {
    console.error("autoCheckout: FAILED to require luxon:", e);
    throw new Error("Critical dependency luxon failed to load.");
}
// *** End Luxon Block ***

// Initialize Firestore Admin SDK
const db = getFirestore();

// Define the target timezone
const timeZone = "Asia/Bangkok"; // IANA timezone string for Luxon

// This export name comes from your index.js file
exports.createMissingCheckoutAlerts = onSchedule({ 
    region: "asia-southeast1",
    schedule: "every day 05:00",
    timeZone: timeZone,
}, async (event) => {
    console.log("Running createMissingCheckoutAlerts function.");

    if (!DateTime) {
        console.error("CRITICAL: Luxon library not loaded!");
        return null;
    }

    try {
        // --- Luxon Date Handling ---
        const scheduledTimeUtc = DateTime.fromISO(event.time, { zone: 'utc' });
        const scheduledTimeZoned = scheduledTimeUtc.setZone(timeZone);
        // --- UPDATED: We now get TODAY's date, not yesterday's ---
        const todayStr = scheduledTimeZoned.toISODate(); // e.g., "2025-11-02"
        // --- End Luxon Date Handling ---

        console.log(`Checking for all incomplete records before ${todayStr} (Timezone: ${timeZone})`);

        // --- UPDATED QUERY ---
        // Instead of filtering by date, we just find all records missing a checkout.
        // This is a collection scan, but is fine for this purpose and requires no new index.
        const attendanceQuery = db.collection("attendance")
            .where("checkInTime", "!=", null)
            .where("checkOutTime", "==", null);

        const incompleteRecordsSnap = await attendanceQuery.get();

        if (incompleteRecordsSnap.empty) {
            console.log(`No incomplete records found. Exiting.`);
            return null;
        }

        console.log(`Found ${incompleteRecordsSnap.size} total incomplete records. Filtering and creating alerts...`);

        const batch = db.batch();
        let alertsCreated = 0;

        incompleteRecordsSnap.forEach(doc => {
            const attendanceData = doc.data();
            
            // --- NEW: Server-side filter ---
            // Skip any records for "today" (e.g., if the function runs at 5 AM
            // and someone already checked in but not out).
            if (attendanceData.date === todayStr) {
                return; // Skip this record
            }
            // --- END NEW FILTER ---

            // We will use the attendance doc ID as the alert ID.
            // This is "idempotent" - it ensures we can't create duplicate alerts.
            const alertRef = db.collection("manager_alerts").doc(doc.id);

            // Create a new alert document
            batch.set(alertRef, {
                status: "pending",
                attendanceDocId: doc.id,
                date: attendanceData.date,
                staffId: attendanceData.staffId,
                staffName: attendanceData.staffName || "Unknown",
                checkInTime: attendanceData.checkInTime, // This is a Timestamp
                createdAt: Timestamp.now(),
            });
            alertsCreated++;
        });

        if (alertsCreated > 0) {
            await batch.commit();
            console.log(`Successfully created or updated ${alertsCreated} alerts.`);
        } else {
            console.log("No past incomplete records found.");
        }

    } catch (error) {
        console.error("Error during createMissingCheckoutAlerts process:", error);
    }

    return null; 
});