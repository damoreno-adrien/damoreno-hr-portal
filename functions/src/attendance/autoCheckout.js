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

exports.createMissingCheckoutAlerts = onSchedule({ // <-- Renamed export for clarity
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
        const yesterdayZoned = scheduledTimeZoned.minus({ days: 1 }).startOf('day');
        const yesterdayStr = yesterdayZoned.toISODate(); // e.g., "2025-10-24"
        // --- End Luxon Date Handling ---

        console.log(`Checking for incomplete records for date: ${yesterdayStr} (Timezone: ${timeZone})`);

        const attendanceQuery = db.collection("attendance")
            .where("date", "==", yesterdayStr)
            .where("checkInTime", "!=", null)
            .where("checkOutTime", "==", null);

        const incompleteRecordsSnap = await attendanceQuery.get();

        if (incompleteRecordsSnap.empty) {
            console.log(`No incomplete records found for ${yesterdayStr}. Exiting.`);
            return null;
        }

        console.log(`Found ${incompleteRecordsSnap.size} incomplete records for ${yesterdayStr}. Creating alerts...`);

        const batch = db.batch();

        incompleteRecordsSnap.forEach(doc => {
            const attendanceData = doc.data();
            
            // We will use the attendance doc ID as the alert ID.
            // This is "idempotent" - it ensures we can't create duplicate alerts for the same shift.
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
        });

        await batch.commit();
        console.log(`Successfully created ${incompleteRecordsSnap.size} alerts.`);

    } catch (error) {
        console.error("Error during createMissingCheckoutAlerts process:", error);
    }

    return null; 
});