const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const admin = require("firebase-admin");

// *** Use Luxon for Timezone Handling ***
let DateTime;
try {
    const luxon = require('luxon');
    DateTime = luxon.DateTime;
} catch(e) {
    console.error("autoFixSingleShift: FAILED to require luxon:", e);
    throw new Error("Critical dependency luxon failed to load.");
}
// *** End Luxon Block ***

const db = getFirestore();
const timeZone = "Asia/Bangkok";

exports.autoFixSingleShift = onCall({ region: "asia-southeast1" }, async (request) => {
    // --- 1. Authentication & Authorization ---
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const callerUid = request.auth.uid;
    try {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        if (!callerDoc.exists || callerDoc.data().role !== "manager") {
            throw new HttpsError("permission-denied", "Permission denied. Only managers can run this action.");
        }
    } catch (error) {
        console.error("Error verifying caller role:", error);
        throw new HttpsError("internal", "Internal server error while verifying role.");
    }

    // --- 2. Input Validation ---
    const { attendanceDocId, alertId } = request.data;
    if (!attendanceDocId || !alertId) {
        throw new HttpsError("invalid-argument", "Missing required 'attendanceDocId' or 'alertId'.");
    }

    if (!DateTime) {
         throw new HttpsError("internal", "Date/time library (Luxon) not loaded on server.");
    }

    // --- 3. The Logic ---
    try {
        const attendanceRef = db.collection("attendance").doc(attendanceDocId);
        const alertRef = db.collection("manager_alerts").doc(alertId);

        const attendanceDoc = await attendanceRef.get();
        if (!attendanceDoc.exists) {
            throw new HttpsError("not-found", "The attendance record to fix does not exist.");
        }

        const data = attendanceDoc.data();
        
        // Safety check: Don't overwrite if it was already fixed
        if (data.checkOutTime !== null) {
            console.log(`Attendance doc ${attendanceDocId} already has a checkout time. Deleting alert.`);
            await alertRef.delete();
            return { result: "Shift was already fixed. Alert cleared." };
        }

        if (!data.checkInTime || !data.date) {
            throw new HttpsError("failed-precondition", "Attendance record is missing checkInTime or date.");
        }

        // --- 4. Time Calculation ---
        
        // Convert the checkInTime (Timestamp) to a Luxon object in our timezone
        const checkInTimeLuxon = DateTime.fromJSDate(data.checkInTime.toDate()).setZone(timeZone);
        
        // Calculate the "check-in + 9 hours" time
        const autoFixTime = checkInTimeLuxon.plus({ hours: 9 });

        // Create the 11:00 PM "cap" time for that specific day
        const capTime = DateTime.fromISO(`${data.date}T23:00:00`, { zone: timeZone });

        // Find the earlier of the two times
        let finalCheckOutTime;
        if (autoFixTime < capTime) {
            finalCheckOutTime = autoFixTime; // Use the +9h time
        } else {
            finalCheckOutTime = capTime; // Use the 11 PM cap
        }

        // Convert the final Luxon time back to a Firestore Timestamp
        const finalTimestamp = Timestamp.fromDate(finalCheckOutTime.toJSDate());

        // --- 5. Batch Update ---
        const batch = db.batch();

        // Update the attendance record
        batch.update(attendanceRef, {
            checkOutTime: finalTimestamp,
            checkOutNote: "Auto-fixed by manager (+9h cap)"
        });

        // Delete the alert, as it's now resolved
        batch.delete(alertRef);

        await batch.commit();

        console.log(`Successfully auto-fixed shift ${attendanceDocId} by manager ${callerUid}.`);
        return { result: `Success! Shift fixed at ${finalCheckOutTime.toFormat('HH:mm')}.` };

    } catch (error) {
        console.error("Error in autoFixSingleShift:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", "An unexpected error occurred.", error.message);
    }
});