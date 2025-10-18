const { HttpsError, https } = require("firebase-functions/v2"); // Keep for consistency, though not used directly
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

exports.autoCheckoutHandler = onSchedule({ region: "us-central1", schedule: "every day 05:00" }, async (event) => {
    console.log("Running auto-checkout function.");
    const timeZone = "Asia/Bangkok";
    const nowInLocalTime = new Date(new Date().toLocaleString("en-US", { timeZone }));
    const yesterdayInLocalTime = new Date(nowInLocalTime);
    yesterdayInLocalTime.setDate(yesterdayInLocalTime.getDate() - 1);
    
    const year = yesterdayInLocalTime.getFullYear();
    const month = String(yesterdayInLocalTime.getMonth() + 1).padStart(2, '0');
    const day = String(yesterdayInLocalTime.getDate()).padStart(2, '0');
    const yesterdayStr = `${year}-${month}-${day}`;
    
    const attendanceQuery = db.collection("attendance")
        .where("date", "==", yesterdayStr)
        .where("checkInTime", "!=", null)
        .where("checkOutTime", "==", null);
        
    const incompleteRecordsSnap = await attendanceQuery.get();
    if (incompleteRecordsSnap.empty) {
        console.log(`No incomplete records found for ${yesterdayStr}. Exiting.`);
        return null;
    }
    
    console.log(`Found ${incompleteRecordsSnap.size} incomplete records for ${yesterdayStr}.`);
    const schedulesQuery = db.collection("schedules").where("date", "==", yesterdayStr);
    const schedulesSnap = await schedulesQuery.get();
    const schedulesMap = new Map();
    schedulesSnap.forEach(doc => {
        const data = doc.data();
        schedulesMap.set(data.staffId, data);
    });
    
    const batch = db.batch();
    let updatedCount = 0;
    
    incompleteRecordsSnap.forEach(doc => {
        const attendanceData = doc.data();
        const staffSchedule = schedulesMap.get(attendanceData.staffId);
        if (staffSchedule && staffSchedule.endTime) {
            const checkoutTimestampString = `${yesterdayStr}T${staffSchedule.endTime}:00.000+07:00`;
            const checkoutDate = new Date(checkoutTimestampString);
            batch.update(doc.ref, { checkOutTime: checkoutDate });
            updatedCount++;
            console.log(`Scheduling update for ${attendanceData.staffName} with checkout time ${checkoutDate.toISOString()}`);
        } else {
            console.log(`Could not find a schedule with an end time for ${attendanceData.staffName}. Skipping.`);
        }
    });
    
    if (updatedCount > 0) {
        await batch.commit();
        console.log(`Successfully updated ${updatedCount} records.`);
    } else {
        console.log("No records were updated.");
    }
    return null;
});