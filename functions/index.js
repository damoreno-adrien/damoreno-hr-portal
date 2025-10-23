const admin = require("firebase-admin");
const functions = require('firebase-functions'); // IMPORT ADDED HERE

admin.initializeApp();

// Import and re-export functions
const { createUserHandler } = require('./src/auth/createUser');
const { setStaffAuthStatusHandler } = require('./src/auth/setStaffAuthStatus');
const { setStaffPasswordHandler } = require('./src/auth/setStaffPassword'); 
const { autoCheckoutHandler } = require('./src/attendance/autoCheckout');
const { calculateAdvanceEligibilityHandler } = require('./src/financials/calculateAdvanceEligibility');
const { calculateLivePayEstimateHandler } = require('./src/financials/calculateLivePayEstimate');
const { calculateBonusHandler } = require('./src/payroll/calculateBonus');
const { deletePayrollRunHandler } = require('./src/payroll/deletePayrollRun');
const { finalizeAndStorePayslipsHandler } = require('./src/payroll/finalizeAndStorePayslips');
const { deleteStaffHandler } = require('./src/staff/deleteStaff');
const { exportStaffDataHandler } = require('./src/staff/exportStaffData');
const { importStaffDataHandler } = require('./src/staff/importStaffData');
const { exportPlanningDataHandler } = require('./src/planning/exportPlanningData');

// --- Explicitly export functions as 'callable' functions ---
exports.createUser = functions.https.onCall(createUserHandler);
exports.setStaffAuthStatus = functions.https.onCall(setStaffAuthStatusHandler);
exports.setStaffPassword = functions.https.onCall(setStaffPasswordHandler); 
exports.autoCheckout = functions.https.onCall(autoCheckoutHandler);
exports.calculateAdvanceEligibility = functions.https.onCall(calculateAdvanceEligibilityHandler);
exports.calculateLivePayEstimate = functions.https.onCall(calculateLivePayEstimateHandler);
exports.calculateBonus = functions.https.onCall(calculateBonusHandler);
exports.deletePayrollRun = functions.https.onCall(deletePayrollRunHandler);
exports.finalizeAndStorePayslips = functions.https.onCall(finalizeAndStorePayslipsHandler);
exports.deleteStaff = functions.https.onCall(deleteStaffHandler);
exports.exportStaffData = functions.https.onCall(exportStaffDataHandler);
exports.importStaffData = functions.https.onCall(importStaffDataHandler);
exports.exportPlanningData = functions.https.onCall(exportPlanningDataHandler);