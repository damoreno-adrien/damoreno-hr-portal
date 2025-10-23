const functions = require("firebase-functions"); // Use v1 for compatibility if needed, or stick to v2 imports
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, Timestamp } = require('firebase-admin/firestore'); // Import Timestamp
const { zonedTimeToUtc, utcToZonedTime, format } = require('date-fns-tz');
const { subDays, startOfDay } = require('date-fns');

// Initialize Firestore Admin SDK (ensure admin.initializeApp() is called in your index.js)
const db = getFirestore();

// Define the target timezone
const timeZone = "Asia/Bangkok"; // Phuket Time

exports.autoCheckoutHandler = onSchedule({
    region: "asia-southeast1", // Consider deploying closer to your users/database
    schedule: "every day 05:00",
    timeZone: timeZone, // Specify the timezone for the schedule trigger
}, async (event) => {
    console.log("Running auto-checkout function triggered by schedule.");

    try {
        // Determine "yesterday" based on the function's execution time *in the specified timezone*
        // 'event.time' is the scheduled time in ISO format (UTC)
        const scheduledTimeUtc = new Date(event.time);
        // Convert the scheduled UTC time to the target timezone
        const scheduledTimeZoned = utcToZonedTime(scheduledTimeUtc, timeZone);
        // Get the start of the day *before* the scheduled time, in the target timezone
        const yesterdayZoned = startOfDay(subDays(scheduledTimeZoned, 1));
        // Format yesterday's date as YYYY-MM-DD for querying
        const yesterdayStr = format(yesterdayZoned, 'yyyy-MM-dd', { timeZone });

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
                    // Combine yesterday's date string with the schedule's end time
                    const checkoutDateTimeString = `${yesterdayStr} ${staffSchedule.endTime}`;
                    // Parse this combined string *specifically in the target timezone*
                    const checkoutTimeZoned = zonedTimeToUtc(checkoutDateTimeString, timeZone);

                    // Convert the zoned time to a standard JS Date (which becomes UTC based)
                    // The Admin SDK correctly converts JS Date objects to Firestore Timestamps
                    const checkoutTimestamp = Timestamp.fromDate(checkoutTimeZoned);

                    batch.update(doc.ref, { checkOutTime: checkoutTimestamp });
                    updatedCount++;
                    console.log(`Updating ${attendanceData.staffName} (${doc.id}). Scheduled checkout: ${staffSchedule.endTime}. Firestore Timestamp: ${checkoutTimestamp.toDate().toISOString()}`);

                } catch (parseError) {
                    console.error(`Error parsing date/time for ${attendanceData.staffName} (${doc.id}) with date '${yesterdayStr}' and time '${staffSchedule.endTime}'. Skipping.`, parseError);
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
        // Optional: Re-throw or handle specific errors if needed
    }

    return null; // Indicate successful completion
});