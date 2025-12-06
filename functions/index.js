const admin = require("firebase-admin");
admin.initializeApp();

// Import and re-export functions
const { createUserHandler } = require('./src/auth/createUser');
const { setStaffAuthStatusHandler } = require('./src/auth/setStaffAuthStatus');
const { setStaffPasswordHandler } = require('./src/auth/setStaffPassword');
const { createMissingCheckoutAlerts, runOperationalScan } = require('./src/attendance/autoCheckout'); 
const { autoFixSingleShift } = require('./src/attendance/autoFixSingleShift'); 
const { calculateAdvanceEligibilityHandler } = require('./src/financials/calculateAdvanceEligibility');
const { calculateLivePayEstimateHandler } = require('./src/financials/calculateLivePayEstimate');
const { calculateBonusHandler } = require('./src/payroll/calculateBonus');
const { deletePayrollRunHandler } = require('./src/payroll/deletePayrollRun');
const { finalizeAndStorePayslipsHandler } = require('./src/payroll/finalizeAndStorePayslips');
const { deleteStaffHandler } = require('./src/staff/deleteStaff');
const { exportStaffDataHandler } = require('./src/staff/exportStaffData');
const { importStaffDataHandler } = require('./src/staff/importStaffData');
const { exportPlanningDataHandler } = require('./src/planning/exportPlanningData');
const { importPlanningDataHandler } = require('./src/planning/importPlanningData');
const { exportAttendanceDataHandler } = require('./src/attendance/exportAttendanceData');
const { importAttendanceDataHandler } = require('./src/attendance/importAttendanceData');
const { cleanupBadAttendanceIdsHandler } = require('./src/attendance/cleanupBadAttendanceIds');


// --- Directly export the handlers defined with v2 syntax ---
exports.createUser = createUserHandler;
exports.setStaffAuthStatus = setStaffAuthStatusHandler;
exports.setStaffPassword = setStaffPasswordHandler;
exports.createMissingCheckoutAlerts = createMissingCheckoutAlerts;
exports.runOperationalScan = runOperationalScan;
exports.autoFixSingleShift = autoFixSingleShift;
exports.calculateAdvanceEligibility = calculateAdvanceEligibilityHandler;
exports.calculateLivePayEstimate = calculateLivePayEstimateHandler;
exports.calculateBonus = calculateBonusHandler;
exports.deletePayrollRun = deletePayrollRunHandler;
exports.finalizeAndStorePayslips = finalizeAndStorePayslipsHandler;
exports.deleteStaff = deleteStaffHandler;
exports.exportStaffData = exportStaffDataHandler;
exports.importStaffData = importStaffDataHandler;
exports.exportPlanningData = exportPlanningDataHandler;
exports.importPlanningData = importPlanningDataHandler;
exports.exportAttendanceData = exportAttendanceDataHandler;
exports.importAttendanceData = importAttendanceDataHandler;
exports.cleanupBadAttendanceIds = cleanupBadAttendanceIdsHandler;