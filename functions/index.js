const admin = require("firebase-admin");

admin.initializeApp();

// Import and re-export functions
// Comment to get function updated
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

exports.createUser = createUserHandler;
exports.setStaffAuthStatus = setStaffAuthStatusHandler;
exports.setStaffPassword = setStaffPasswordHandler; 
exports.autoCheckout = autoCheckoutHandler;
exports.calculateAdvanceEligibility = calculateAdvanceEligibilityHandler;
exports.calculateLivePayEstimate = calculateLivePayEstimateHandler;
exports.calculateBonus = calculateBonusHandler;
exports.deletePayrollRun = deletePayrollRunHandler;
exports.finalizeAndStorePayslips = finalizeAndStorePayslipsHandler;
exports.deleteStaff = deleteStaffHandler;
exports.exportStaffData = exportStaffDataHandler;
exports.importStaffData = importStaffDataHandler;
exports.exportPlanningData = exportPlanningDataHandler;