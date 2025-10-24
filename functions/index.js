const admin = require("firebase-admin");
admin.initializeApp();

// Import and re-export functions
const { createUserHandler } = require('./src/auth/createUser');
const { setStaffAuthStatusHandler } = require('./src/auth/setStaffAuthStatus');
const { setStaffPasswordHandler } = require('./src/auth/setStaffPassword');
const { autoCheckoutHandler } = require('./src/attendance/autoCheckout');
const { calculateAdvanceEligibilityHandler } = require('./src/financials/calculateAdvanceEligibility');

// *** ADD LOGGING AROUND THIS IMPORT ***
console.log("index.js: Attempting to require calculateLivePayEstimateHandler...");
let calculateLivePayEstimateHandler;
try {
    calculateLivePayEstimateHandler = require('./src/financials/calculateLivePayEstimate').calculateLivePayEstimateHandler;
    console.log("index.js: Successfully required calculateLivePayEstimateHandler.");
} catch (error) {
    console.error("index.js: FAILED to require calculateLivePayEstimateHandler:", error);
    // Optionally re-throw or handle if needed, but logging might be enough for now
    // throw error; // Uncomment this if deployment should fail loudly on require error
}
// *** END LOGGING BLOCK ***

const { calculateBonusHandler } = require('./src/payroll/calculateBonus');
const { deletePayrollRunHandler } = require('./src/payroll/deletePayrollRun');
const { finalizeAndStorePayslipsHandler } = require('./src/payroll/finalizeAndStorePayslips');
const { deleteStaffHandler } = require('./src/staff/deleteStaff');
const { exportStaffDataHandler } = require('./src/staff/exportStaffData');
const { importStaffDataHandler } = require('./src/staff/importStaffData');
const { exportPlanningDataHandler } = require('./src/planning/exportPlanningData');

// --- Directly export the handlers defined with v2 syntax ---
exports.createUser = createUserHandler;
exports.setStaffAuthStatus = setStaffAuthStatusHandler;
exports.setStaffPassword = setStaffPasswordHandler;
exports.autoCheckout = autoCheckoutHandler;
exports.calculateAdvanceEligibility = calculateAdvanceEligibilityHandler;
// Ensure the handler is exported even if the require failed (it will likely be undefined and cause errors later, but allows deployment)
exports.calculateLivePayEstimate = calculateLivePayEstimateHandler;
exports.calculateBonus = calculateBonusHandler;
exports.deletePayrollRun = deletePayrollRunHandler;
exports.finalizeAndStorePayslips = finalizeAndStorePayslipsHandler;
exports.deleteStaff = deleteStaffHandler;
exports.exportStaffData = exportStaffDataHandler;
exports.importStaffData = importStaffDataHandler;
exports.exportPlanningData = exportPlanningDataHandler;