const { HttpsError, https } = require("firebase-functions/v2");
const { onSchedule } = require("firebase-functions/v2/scheduler"); // Correct import for scheduled functions
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const { Parser } = require('json2csv');

admin.initializeApp();
const db = getFirestore();
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

exports.createUser = https.onRequest({ region: "us-central1" }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") { return res.status(405).send({ error: "Method Not Allowed" }); }
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) { return res.status(401).send({ error: "Unauthorized" }); }
    let decodedToken;
    try { decodedToken = await admin.auth().verifyIdToken(idToken); }
    catch (error) { return res.status(401).send({ error: "Unauthorized" }); }

    try {
      const callerDoc = await db.collection("users").doc(decodedToken.uid).get();
      if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        return res.status(403).send({ error: "Permission denied. Only managers can create users." });
      }
    } catch (error) { return res.status(500).send({ error: "Internal server error while verifying role." }); }

    const { email, password, firstName, lastName, nickname, position, department, startDate, payType, rate } = req.body;
    if (!email || !password || !firstName || !lastName || !nickname || !position || !department || !startDate || !payType || !rate) {
        return res.status(400).send({ error: "Missing required user data." });
    }
    try {
      const userRecord = await admin.auth().createUser({ email, password, displayName: nickname });
      const newUserId = userRecord.uid;
      await db.collection("users").doc(newUserId).set({ role: "staff" });
      const initialJob = { position, department, startDate, payType, rate: Number(rate) };
      await db.collection("staff_profiles").doc(newUserId).set({
        firstName, lastName, nickname, email, startDate, uid: newUserId,
        jobHistory: [initialJob],
        createdAt: FieldValue.serverTimestamp(),
        bonusStreak: 0
      });
      return res.status(200).send({ result: `Successfully created user ${email}` });
    } catch (error) {
      console.error("Error creating new user:", error);
      if (error.code === "auth/email-already-exists") { return res.status(409).send({ error: "This email is already in use." }); }
      return res.status(500).send({ error: "An error occurred while creating the user." });
    }
  });
});

exports.deleteStaff = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) { throw new HttpsError("unauthenticated", "The function must be called while authenticated."); }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") { throw new HttpsError("permission-denied", "Only managers can delete staff members."); }
    const staffId = request.data.staffId;
    if (!staffId) { throw new HttpsError("invalid-argument", "The function must be called with a 'staffId'."); }
    try {
        await admin.auth().deleteUser(staffId);
        const batch = db.batch();
        batch.delete(db.collection("users").doc(staffId));
        batch.delete(db.collection("staff_profiles").doc(staffId));
        const collectionsToDeleteFrom = ["schedules", "leave_requests", "attendance"];
        for (const collectionName of collectionsToDeleteFrom) {
            const querySnapshot = await db.collection(collectionName).where("staffId", "==", staffId).get();
            querySnapshot.forEach(doc => { batch.delete(doc.ref); });
        }
        await batch.commit();
        return { result: `Successfully deleted staff member ${staffId} and all their data.` };
    } catch (error) {
        console.error("Error deleting staff member:", error);
        throw new HttpsError("internal", "An error occurred while deleting the staff member.", error.message);
    }
});

exports.calculateBonus = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth || !request.data.staffId || !request.data.payPeriod) { throw new HttpsError("invalid-argument", "Required data is missing."); }
    const { staffId, payPeriod } = request.data;
    const { year, month } = payPeriod;
    try {
        const configDoc = await db.collection("settings").doc("company_config").get();
        if (!configDoc.exists) throw new HttpsError("not-found", "Company config not found.");
        const bonusRules = configDoc.data().attendanceBonus;
        const staffProfileDoc = await db.collection("staff_profiles").doc(staffId).get();
        if (!staffProfileDoc.exists) throw new HttpsError("not-found", "Staff profile not found.");
        const currentStreak = staffProfileDoc.data().bonusStreak || 0;
        const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDate).where("date", "<=", endDate);
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDate).where("date", "<=", endDate);
        const [schedulesSnapshot, attendanceSnapshot] = await Promise.all([schedulesQuery.get(), attendanceQuery.get()]);
        const schedules = schedulesSnapshot.docs.map(doc => doc.data());
        const attendanceRecords = new Map(attendanceSnapshot.docs.map(doc => [doc.data().date, doc.data()]));
        let lateCount = 0;
        let absenceCount = 0;
        schedules.forEach(schedule => {
            const attendance = attendanceRecords.get(schedule.date);
            if (!attendance) { absenceCount++; }
            else {
                const scheduledStart = new Date(`${schedule.date}T${schedule.startTime}`);
                const actualCheckIn = attendance.checkInTime.toDate();
                if (actualCheckIn > scheduledStart) { lateCount++; }
            }
        });
        let newStreak = 0;
        let bonusAmount = 0;
        if (absenceCount <= bonusRules.allowedAbsences && lateCount <= bonusRules.allowedLates) {
            newStreak = currentStreak + 1;
            if (newStreak === 1) bonusAmount = bonusRules.month1;
            else if (newStreak === 2) bonusAmount = bonusRules.month2;
            else bonusAmount = bonusRules.month3;
        }
        return { bonusAmount, newStreak };
    } catch (error) {
        console.error("Error calculating bonus:", error);
        throw new HttpsError("internal", "An error occurred while calculating the bonus.", error.message);
    }
});

exports.calculateLivePayEstimate = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const staffId = request.auth.uid;

    try {
        // --- 1. Date Setup (MODIFIED to use UTC) ---
        const today = new Date();
        const year = today.getUTCFullYear();
        const month = today.getUTCMonth(); // 0-indexed
        
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const daysPassed = today.getUTCDate();
        const startDateOfMonthStr = new Date(Date.UTC(year, month, 1)).toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];

        // --- 2. Parallel Data Fetching (No changes here) ---
        const staffProfileRef = db.collection("staff_profiles").doc(staffId).get();
        const configRef = db.collection("settings").doc("company_config").get();
        const advancesQuery = db.collection("salary_advances").where("staffId", "==", staffId).where("payPeriodYear", "==", year).where("payPeriodMonth", "==", month + 1).where("status", "in", ["approved", "pending"]).get();
        const loansQuery = db.collection("loans").where("staffId", "==", staffId).where("status", "==", "active").get();
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr).get();
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr).get();
        const leaveQuery = db.collection("leave_requests").where("staffId", "==", staffId).where("status", "==", "approved").where("startDate", "<=", todayStr).get();
        const latestPayslipQuery = db.collection("payslips").where("staffId", "==", staffId).orderBy("generatedAt", "desc").limit(1).get();


        const [staffProfileSnap, configSnap, advancesSnap, loansSnap, schedulesSnap, attendanceSnap, leaveSnap, latestPayslipSnap] = await Promise.all([
            staffProfileRef, configRef, advancesQuery, loansQuery, schedulesQuery, attendanceQuery, leaveQuery, latestPayslipSnap
        ]);

        if (!staffProfileSnap.exists) throw new HttpsError("not-found", "Staff profile not found.");
        if (!configSnap.exists) throw new HttpsError("not-found", "Company config not found.");
        
        // --- 3. Process Fetched Data (No changes here) ---
        const staffProfile = staffProfileSnap.data();
        const companyConfig = configSnap.data();
        const latestJob = (staffProfile.jobHistory || []).sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
        
        if (!latestJob || latestJob.payType !== 'Monthly' || !latestJob.rate) {
            throw new HttpsError("failed-precondition", "Pay estimation is only available for monthly salary staff.");
        }

        const baseSalary = latestJob.rate || 0;
        const dailyRate = daysInMonth > 0 ? baseSalary / daysInMonth : 0;

        const advancesAlreadyTaken = advancesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const currentAdvance = advancesSnap.docs.length > 0 ? advancesSnap.docs[0].data() : null;
        
        const activeLoans = loansSnap.docs.map(doc => doc.data());
        const loanRepayment = activeLoans.reduce((sum, loan) => sum + loan.recurringPayment, 0);

        // --- 4. Calculate Earnings (No changes here) ---
        const baseSalaryEarned = dailyRate * daysPassed;

        // --- 5. Calculate Potential Bonus (No changes here) ---
        const bonusRules = companyConfig.attendanceBonus || {};
        const schedules = schedulesSnap.docs.map(doc => doc.data());
        const attendanceRecords = new Map(attendanceSnap.docs.map(doc => [doc.data().date, doc.data()]));
        let lateCount = 0;
        let absenceCount = 0;
        schedules.forEach(schedule => {
            const attendance = attendanceRecords.get(schedule.date);
            if (!attendance) { absenceCount++; }
            else if (new Date(`${schedule.date}T${schedule.startTime}`) < attendance.checkInTime.toDate()) { lateCount++; }
        });
        
        let potentialBonus = 0;
        const bonusOnTrack = absenceCount <= (bonusRules.allowedAbsences || 0) && lateCount <= (bonusRules.allowedLates || 0);
        if (bonusOnTrack) {
            const currentStreak = staffProfile.bonusStreak || 0;
            const projectedStreak = currentStreak + 1;
            if (projectedStreak === 1) potentialBonus = bonusRules.month1 || 0;
            else if (projectedStreak === 2) potentialBonus = bonusRules.month2 || 0;
            else potentialBonus = bonusRules.month3 || 0;
        }

        // --- 6. Calculate Deductions (No changes here) ---
        const approvedLeave = leaveSnap.docs.map(doc => doc.data());
        let unpaidAbsencesCount = 0;
        schedules.forEach(schedule => {
            const isOnLeave = approvedLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
            if (!attendanceRecords.has(schedule.date) && !isOnLeave) {
                unpaidAbsencesCount++;
            }
        });
        const absenceDeductions = unpaidAbsencesCount * dailyRate;

        const ssoRate = companyConfig.ssoRate || 0;
        const ssoMax = companyConfig.ssoMaxContribution || 0;
        const ssoDeduction = Math.min(baseSalary * (ssoRate / 100), ssoMax);

        const totalEarnings = baseSalaryEarned + potentialBonus;
        const totalDeductions = absenceDeductions + ssoDeduction + advancesAlreadyTaken + loanRepayment;

        const latestPayslip = latestPayslipSnap.docs.length > 0 ? { id: latestPayslipSnap.docs[0].id, ...latestPayslipSnap.docs[0].data() } : null;

        // --- 7. Return Result (No changes here) ---
        return {
            baseSalaryEarned: baseSalaryEarned,
            potentialBonus: {
                amount: potentialBonus,
                onTrack: bonusOnTrack,
            },
            deductions: {
                absences: absenceDeductions,
                socialSecurity: ssoDeduction,
                salaryAdvances: advancesAlreadyTaken,
                loanRepayment: loanRepayment,
            },
            activeLoans: activeLoans,
            estimatedNetPay: totalEarnings - totalDeductions,
            currentAdvance: currentAdvance,
            latestPayslip: latestPayslip,
        };

    } catch (error) {
        console.error("Error in calculateLivePayEstimate:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred while calculating your pay estimate.", error.message);
    }
});

exports.finalizeAndStorePayslips = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth || !request.data.payrollData || !request.data.payPeriod) {
        throw new HttpsError("invalid-argument", "Required data (payrollData, payPeriod) is missing.");
    }

    const { payrollData, payPeriod } = request.data;
    const { year, month } = payPeriod;

    // Verify user is a manager
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can finalize payroll.");
    }

    const batch = db.batch();

    payrollData.forEach(payslip => {
        // 1. Create a reference for the new payslip document
        const payslipId = `${payslip.id}_${year}_${month}`;
        const payslipRef = db.collection("payslips").doc(payslipId);

        // 2. Add the operation to create the payslip document to the batch
        batch.set(payslipRef, {
            staffId: payslip.id,
            staffName: payslip.name, // Legal name
            payPeriodYear: year,
            payPeriodMonth: month,
            generatedAt: FieldValue.serverTimestamp(),
            // Store a complete snapshot of the data
            ...payslip
        });

        // 3. Add the operation to update the bonus streak to the batch
        const staffRef = db.collection("staff_profiles").doc(payslip.id);
        const bonusInfo = payslip.bonusInfo || { newStreak: 0 }; // Ensure bonusInfo exists
        batch.update(staffRef, { bonusStreak: bonusInfo.newStreak });
    });

    try {
        await batch.commit();
        return { result: `Successfully finalized payroll and stored ${payrollData.length} payslips.` };
    } catch (error) {
        console.error("Error finalizing payroll:", error);
        throw new HttpsError("internal", "An error occurred while finalizing the payroll.", error.message);
    }
});

exports.calculateAdvanceEligibility = https.onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) { throw new HttpsError("unauthenticated", "You must be logged in to perform this action."); }
    const staffId = request.auth.uid;
    try {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDateOfMonthStr = new Date(year, month, 1).toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];
        const monthYearStr = `${year}-${String(month + 1).padStart(2, '0')}`;

        const staffProfileDoc = await db.collection("staff_profiles").doc(staffId).get();
        if (!staffProfileDoc.exists) throw new HttpsError("not-found", "Staff profile could not be found.");
        
        const jobHistory = staffProfileDoc.data().jobHistory || [];
        const latestJob = jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
        if (!latestJob || latestJob.payType !== 'Monthly' || !latestJob.rate) { throw new HttpsError("failed-precondition", "This feature is only for monthly salary staff."); }
        
        const baseSalary = latestJob.rate;
        const dailyRate = baseSalary / daysInMonth;
        
        const configDoc = await db.collection("settings").doc("company_config").get();
        const companyConfig = configDoc.exists ? configDoc.data() : {};
        const publicHolidays = companyConfig.publicHolidays ? companyConfig.publicHolidays.map(h => h.date) : [];
        
        const schedulesQuery = db.collection("schedules").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr);
        const attendanceQuery = db.collection("attendance").where("staffId", "==", staffId).where("date", ">=", startDateOfMonthStr).where("date", "<=", todayStr);
        const leaveQuery = db.collection("leave_requests").where("staffId", "==", staffId).where("status", "==", "approved").where("startDate", "<=", todayStr);
        
        const advancesQuery = db.collection("salary_advances")
            .where("staffId", "==", staffId)
            .where("payPeriodYear", "==", year)
            .where("payPeriodMonth", "==", month + 1)
            .where("status", "in", ["approved", "pending"]);

        const [schedulesSnap, attendanceSnap, leaveSnap, advancesSnap] = await Promise.all([
            schedulesQuery.get(), 
            attendanceQuery.get(), 
            leaveQuery.get(),
            advancesQuery.get()
        ]);
        
        const schedules = schedulesSnap.docs.map(doc => doc.data());
        const attendanceDates = new Set(attendanceSnap.docs.map(doc => doc.data().date));
        const approvedLeave = leaveSnap.docs.map(doc => doc.data());

        let unpaidAbsences = 0;
        schedules.forEach(schedule => {
            const isPublicHoliday = publicHolidays.includes(schedule.date);
            const isOnLeave = approvedLeave.some(l => schedule.date >= l.startDate && schedule.date <= l.endDate);
            const didAttend = attendanceDates.has(schedule.date);
            if (!didAttend && !isOnLeave && !isPublicHoliday) { unpaidAbsences++; }
        });
        
        const absenceDeductions = dailyRate * unpaidAbsences;
        const currentSalaryDue = Math.max(0, baseSalary - absenceDeductions);
        
        // --- KEY CHANGE ---
        // Read the percentage from config, with a fallback to 50
        const advancePercentage = companyConfig.advanceEligibilityPercentage || 50;
        // Use the dynamic percentage in the calculation
        const maxTheoreticalAdvance = Math.floor(currentSalaryDue * (advancePercentage / 100));

        const advancesAlreadyTaken = advancesSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const availableAdvance = Math.max(0, maxTheoreticalAdvance - advancesAlreadyTaken);
        
        return { 
            maxAdvance: availableAdvance,
            currentSalaryDue, 
            baseSalary, 
            absenceDeductions, 
            unpaidAbsences,
            maxTheoreticalAdvance,
            advancesAlreadyTaken
        };
    } catch (error) {
        console.error("Error in calculateAdvanceEligibility:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "An unexpected error occurred.", error.message);
    }
});

exports.autoCheckout = onSchedule({ region: "us-central1", schedule: "every day 05:00" }, async (event) => {
    console.log("Running auto-checkout function.");
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const attendanceQuery = db.collection("attendance")
        .where("date", "==", yesterdayStr)
        .where("checkInTime", "!=", null)
        .where("checkOutTime", "==", null);
    const incompleteRecordsSnap = await attendanceQuery.get();
    if (incompleteRecordsSnap.empty) {
        console.log("No incomplete records found for yesterday. Exiting.");
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

exports.deletePayrollRun = https.onCall({ region: "us-central1" }, async (request) => {
    // 1. Authentication & Validation
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can delete payroll runs.");
    }
    const { payPeriod } = request.data;
    if (!payPeriod || !payPeriod.year || !payPeriod.month) {
        throw new HttpsError("invalid-argument", "The function must be called with a 'payPeriod' object containing a 'year' and 'month'.");
    }

    const { year, month } = payPeriod;

    try {
        // 2. Find all payslips for the given period
        const payslipsQuery = db.collection("payslips")
            .where("payPeriodYear", "==", year)
            .where("payPeriodMonth", "==", month);
        
        const payslipsToDeleteSnap = await payslipsQuery.get();

        if (payslipsToDeleteSnap.empty) {
            return { result: "No payslips found for this period. Nothing to delete." };
        }

        // 3. Use a batch write to delete payslips and revert bonus streaks
        const batch = db.batch();

        payslipsToDeleteSnap.forEach(doc => {
            const payslipData = doc.data();
            const staffId = payslipData.staffId;
            const bonusInfo = payslipData.bonusInfo;

            // Add the delete operation for the payslip
            batch.delete(doc.ref);

            // Calculate the previous bonus streak and add the update operation
            if (staffId && bonusInfo) {
                const previousStreak = bonusInfo.newStreak > 0 ? bonusInfo.newStreak - 1 : 0;
                const staffRef = db.collection("staff_profiles").doc(staffId);
                batch.update(staffRef, { bonusStreak: previousStreak });
            }
        });

        // 4. Commit all operations at once
        await batch.commit();

        return { result: `Successfully deleted ${payslipsToDeleteSnap.size} payslips for ${months[month - 1]} ${year} and reverted bonus streaks.` };

    } catch (error) {
        console.error("Error deleting payroll run:", error);
        // CORRECTED: Added the 'new' keyword
        throw new HttpsError("internal", "An unexpected error occurred while deleting the payroll run.", error.message);
    }
});

exports.setStaffAuthStatus = https.onCall({ region: "us-central1" }, async (request) => {
    // 1. Authentication & Validation
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can change staff authentication status.");
    }
    const { staffId, disabled } = request.data;
    if (!staffId || typeof disabled !== 'boolean') {
        throw new HttpsError("invalid-argument", "The function must be called with a 'staffId' and a 'disabled' boolean value.");
    }

    try {
        // 2. Update the user's disabled status in Firebase Auth
        await admin.auth().updateUser(staffId, { disabled: disabled });

        return { result: `Successfully ${disabled ? 'disabled' : 'enabled'} the account for user ${staffId}.` };
    } catch (error) {
        console.error("Error updating user auth status:", error);
        throw new HttpsError("internal", "An unexpected error occurred while updating the user's account.", error.message);
    }
});

exports.exportStaffData = https.onCall({ region: "us-central1" }, async (request) => {
    // 1. Authentication
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "manager") {
        throw new HttpsError("permission-denied", "Only managers can export staff data.");
    }

    try {
        // 2. Fetch all staff profiles
        const staffSnap = await db.collection("staff_profiles").get();
        if (staffSnap.empty) {
            return { csvData: "" }; // Return empty string if no staff
        }

        // 3. Format the data for CSV
        const records = staffSnap.docs.map(doc => {
            const staff = doc.data();
            const latestJob = (staff.jobHistory || [])
                .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0] || {};
            
            return {
                FirstName: staff.firstName || '',
                LastName: staff.lastName || '',
                Nickname: staff.nickname || '',
                Email: staff.email || '',
                PhoneNumber: staff.phoneNumber || '',
                Birthdate: staff.birthdate || '',
                StartDate: staff.startDate || '',
                Status: staff.status || 'active',
                EndDate: staff.endDate || '',
                Department: latestJob.department || 'N/A',
                Position: latestJob.position || 'N/A',
                PayType: latestJob.payType || 'N/A',
                Rate: latestJob.rate || 0,
                BankAccount: staff.bankAccount || '',
            };
        });

        // 4. Define CSV headers and create the CSV string
        const fields = ['FirstName', 'LastName', 'Nickname', 'Email', 'PhoneNumber', 'Birthdate', 'StartDate', 'Status', 'EndDate', 'Department', 'Position', 'PayType', 'Rate', 'BankAccount'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(records);

        // 5. Return the CSV data
        return { csvData: csv };

    } catch (error) {
        console.error("Error exporting staff data:", error);
        throw new HttpsError("internal", "An unexpected error occurred while exporting data.", error.message);
    }
});