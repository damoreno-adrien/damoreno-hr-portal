const admin = require("firebase-admin");

// Initialize Firebase Admin SDK ONCE
admin.initializeApp();

// Import and re-export functions from their specific files
const { createUserHandler } = require('./src/auth/createUser');
const { setStaffAuthStatusHandler } = require('./src/auth/setStaffAuthStatus');
const { autoCheckoutHandler } = require('./src/attendance/autoCheckout');
const { calculateAdvanceEligibilityHandler } = require('./src/financials/calculateAdvanceEligibility');
const { calculateLivePayEstimateHandler } = require('./src/financials/calculateLivePayEstimate');
const { calculateBonusHandler } = require('./src/payroll/calculateBonus');
const { deletePayrollRunHandler } = require('./src/payroll/deletePayrollRun');
const { finalizeAndStorePayslipsHandler } = require('./src/payroll/finalizeAndStorePayslips');
const { deleteStaffHandler } = require('./src/staff/deleteStaff');
const { exportStaffDataHandler } = require('./src/staff/exportStaffData');

// Assign the imported handlers to the export names expected by Firebase
exports.createUser = createUserHandler;
exports.setStaffAuthStatus = setStaffAuthStatusHandler;
exports.autoCheckout = autoCheckoutHandler;
exports.calculateAdvanceEligibility = calculateAdvanceEligibilityHandler;
exports.calculateLivePayEstimate = calculateLivePayEstimateHandler;
exports.calculateBonus = calculateBonusHandler;
exports.deletePayrollRun = deletePayrollRunHandler;
exports.finalizeAndStorePayslips = finalizeAndStorePayslipsHandler;
exports.deleteStaff = deleteStaffHandler;
exports.exportStaffData = exportStaffDataHandler;