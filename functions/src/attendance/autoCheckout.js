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

exports.autoCheckoutHandler = onSchedule({
    region: "asia-southeast1",
    schedule: "every day 05:00",
    timeZone: timeZone, // Specify the timezone for the schedule trigger
}, async (event) => {
    console.log("Running auto-checkout function triggered by schedule.");

    // Ensure Luxon loaded
    if (!DateTime) {
        console.error("CRITICAL: Luxon library not loaded!");
        // Might want to throw an error here or return gracefully
        return null;
    }

    try {
        // --- Luxon Date Handling ---
        // 'event.time' is ISO UTC. Convert it to Luxon DateTime object.
        const scheduledTimeUtc = DateTime.fromISO(event.time, { zone: 'utc' });
        // Convert the scheduled UTC time to the target timezone
        const scheduledTimeZoned = scheduledTimeUtc.setZone(timeZone);
        // Get the start of the day *before* the scheduled time, in the target timezone
        const yesterdayZoned = scheduledTimeZoned.minus({ days: 1 }).startOf('day');
        // Format yesterday's date as YYYY-MM-DD for querying
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

        console.log(`Found ${incompleteRecordsSnap.size} incomplete records for ${yesterdayStr}. Fetching schedules...`);

        // Fetch corresponding schedules
        const schedulesQuery = db.collection("schedules").where("date", "==", yesterdayStr);
        const schedulesSnap = await schedulesQuery.get();
        const schedulesMap = new Map();
        schedulesSnap.forEach(doc => {
            const data = doc.data();
            schedulesMap.set(data.staffId, data);
        });

        console.log(`Fetched ${schedulesMap.size} schedules for ${yesterdayStr}.`);

        const batch = db.batch();
        let updatedCount = 0;

        incompleteRecordsSnap.forEach(doc => {
            const attendanceData = doc.data();
            const staffSchedule = schedulesMap.get(attendanceData.staffId);

            if (staffSchedule && staffSchedule.endTime) {
                try {
                    // *** Use Luxon to create the checkout time ***
                    // Combine yesterday's date string with the schedule's end time and specify the zone
                    const checkoutTimeLuxon = DateTime.fromISO(`${yesterdayStr}T${staffSchedule.endTime}`, { zone: timeZone });

                    if (!checkoutTimeLuxon.isValid) {
                        console.error(`Error parsing checkout time for ${attendanceData.staffName} (${doc.id}). Invalid Luxon DateTime. Date: '${yesterdayStr}', Time: '${staffSchedule.endTime}'. Reason: ${checkoutTimeLuxon.invalidReason}`);
                        return; // Skip this record
                    }

                    // Convert the Luxon DateTime object to a standard JS Date (which becomes UTC based)
                    // The Admin SDK correctly converts JS Date objects to Firestore Timestamps
                    const checkoutTimestamp = Timestamp.fromDate(checkoutTimeLuxon.toJSDate());

                    batch.update(doc.ref, { checkOutTime: checkoutTimestamp });
                    updatedCount++;
                    console.log(`Updating ${attendanceData.staffName} (${doc.id}). Scheduled checkout: ${staffSchedule.endTime}. Firestore Timestamp: ${checkoutTimestamp.toDate().toISOString()}`);

                } catch (parseError) {
                    console.error(`Error processing date/time for ${attendanceData.staffName} (${doc.id}) with date '${yesterdayStr}' and time '${staffSchedule.endTime}'. Skipping.`, parseError);
                }
            } else {
                console.log(`No schedule or end time found for ${attendanceData.staffName} (${doc.id}) on ${yesterdayStr}. Skipping.`);
            }
        });

        if (updatedCount > 0) {
            await batch.commit();
            console.log(`Successfully committed updates for ${updatedCount} records.`);
        } else {
            console.log("No records met the criteria for update.");
        }

    } catch (error) {
        console.error("Error during auto-checkout process:", error);
    }

    return null; // Indicate successful completion (or completion with caught errors)
});