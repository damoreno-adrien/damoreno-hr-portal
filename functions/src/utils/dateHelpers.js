// functions/src/utils/dateHelpers.js

// 1. Safely load Luxon
let DateTime;
try {
    const luxon = require('luxon');
    DateTime = luxon.DateTime;
} catch(e) {
    console.error("dateHelpers: FAILED to require luxon:", e);
    throw new Error("Critical dependency luxon failed to load.");
}

// 2. Safely load date-fns
let parseISO, isValid;
try {
    const dfns = require('date-fns');
    parseISO = dfns.parseISO;
    isValid = dfns.isValid;
} catch (e) {
    console.error("dateHelpers: FAILED to require date-fns:", e);
    throw new Error("Critical dependency date-fns failed to load.");
}

// 3. Define Master Timezone
const timeZone = "Asia/Bangkok";

// 4. Centralize the Firestore Date Parser
const safeToDate = (value) => {
    if (!value) return null;
    if (typeof value === 'object' && value !== null && typeof value.toDate === 'function' && typeof value.nanoseconds === 'number') {
        try { return value.toDate(); }
        catch (e) { console.error("safeToDate - Error calling .toDate():", value, e); return null; }
    }
    try {
        if (value instanceof Date && !isNaN(value)) { return value; }
    } catch(e) { console.error("safeToDate - Error during 'instanceof Date':", e); }
    if (typeof value === 'string') {
        if (parseISO && isValid) {
            const parsed = parseISO(value);
            if (isValid(parsed)) { return parsed; }
        } else { console.error("safeToDate - date-fns not loaded."); }
    }
    console.warn("safeToDate - Could not convert:", value);
    return null;
};

// Export everything so your functions can use it
module.exports = {
    DateTime,
    parseISO,
    isValid,
    timeZone,
    safeToDate
};