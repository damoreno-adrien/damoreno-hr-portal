// src/utils/dateUtils.js
import {
  format,
  parseISO,
  toDate,
  isValid,
  formatDistanceToNow,
  parse,
  eachDayOfInterval as dfnsEachDayOfInterval,
  addDays as dfnsAddDays,
  subDays as dfnsSubDays,
  addMonths as dfnsAddMonths, // --- ADDED THIS IMPORT ---
  startOfWeek as dfnsStartOfWeek,
  startOfToday as dfnsStartOfToday,
  getMonth as dfnsGetMonth,
  getYear as dfnsGetYear,
  differenceInCalendarDays as dfnsDifferenceInCalendarDays,
  differenceInMonths as dfnsDifferenceInMonths,
  startOfMonth as dfnsStartOfMonth,
  endOfMonth as dfnsEndOfMonth,
  startOfYear as dfnsStartOfYear,
  endOfYear as dfnsEndOfYear,
  differenceInMilliseconds as dfnsDifferenceInMilliseconds,
  intervalToDuration,
  getDaysInMonth as dfnsGetDaysInMonth,
  differenceInYears as dfnsDifferenceInYears,
} from 'date-fns';

/**
 * Converts any date input (Firebase Timestamp, ISO string, JS Date)
 * into a valid JS Date object.
 * Returns null if the date is invalid.
 */
export const fromFirestore = (dateInput) => {
  if (!dateInput) {
    return null;
  }

  let date;
  // Handle Firebase Timestamps
  if (typeof dateInput.toDate === 'function') {
    date = dateInput.toDate();
  }
  // Handle ISO strings (yyyy-MM-ddTHH:mm:ss.sssZ or yyyy-MM-ddTHH:mm or yyyy-MM-dd)
  else if (typeof dateInput === 'string') {
    // Try parsing as full ISO first
    date = parseISO(dateInput);
    // If invalid, try parsing as just a date (treats as local)
    if (!isValid(date)) {
        date = parse(dateInput, 'yyyy-MM-dd', new Date());
    }
  }
  // Handle JS Date objects
  else {
    date = toDate(dateInput);
  }

  return isValid(date) ? date : null;
};

/**
 * Converts a JS Date object into the standard
 * UTC ISO 8601 string format we will save in Firestore.
 * Example: "2025-10-22T14:30:00.000Z"
 */
export const toFirestoreFormat = (dateObj) => {
  if (!dateObj || !isValid(toDate(dateObj))) {
    return null;
  }
  return toDate(dateObj).toISOString();
};

/**
* Formats a date for display in tables, headers, etc.
* Example: "22/10/2025"
*/
export const formatDisplayDate = (date) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return '';
  return format(dateObj, 'dd/MM/yyyy');
};

/**
 * Formats a time for display.
 * Example: "10:30 PM"
 */
export const formatDisplayTime = (date) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return '';
  return format(dateObj, 'h:mm a');
};

/**
 * Formats a date into the "yyyy-MM-dd" format.
 * This is essential for database queries, document IDs, and <input type="date">.
 * Example: "2025-10-22"
 */
export const formatISODate = (date) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return '';
  return format(dateObj, 'yyyy-MM-dd');
};

/**
 * Formats a date for relative time display.
 * Example: "about 5 hours ago"
 */
export const formatRelativeTime = (date) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return '';
  return formatDistanceToNow(dateObj, { addSuffix: true });
};

/**
 * A general-purpose formatter for any other needs.
 */
export const formatCustom = (date, formatString) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return '';
  return format(dateObj, formatString);
};

/**
 * Parses a "yyyy-MM-dd" date string (from <input type="date">)
 * into a JS Date object, correctly treating it as a local date.
 */
export const parseISODateString = (dateString) => {
  if (!dateString) return null;
  const date = parse(dateString, 'yyyy-MM-dd', new Date());
  return isValid(date) ? date : null;
};

/**
 * Returns an array of Date objects for each day in the given interval.
 * Dates are expected in 'yyyy-MM-dd' format.
 */
export const eachDayOfInterval = (startDateStr, endDateStr) => {
  const start = parseISODateString(startDateStr);
  const end = parseISODateString(endDateStr);
  if (!start || !end || end < start) return [];
  return dfnsEachDayOfInterval({ start, end });
};

/**
 * Adds a specified number of days to a date.
 */
export const addDays = (date, amount) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return null;
  return dfnsAddDays(dateObj, amount);
};

/**
 * Subtracts a specified number of days from a date.
 */
export const subDays = (date, amount) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return null;
  return dfnsSubDays(dateObj, amount);
};

/**
 * --- NEW: Adds a specified number of months to a date. ---
 * Handles edge cases like Jan 31 + 1 month = Feb 28.
 */
export const addMonths = (date, amount) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return null;
  return dfnsAddMonths(dateObj, amount);
};

/**
 * Returns the start of the week (Monday) for a given date.
 */
export const startOfWeek = (date) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return null;
  return dfnsStartOfWeek(dateObj, { weekStartsOn: 1 });
};

/**
 * Returns a JS Date object set to the start of today (00:00:00).
 */
export const startOfToday = () => {
  return dfnsStartOfToday();
};

/**
 * Gets the month (1-12) from a date.
 */
export const getMonth = (date) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return null;
  return dfnsGetMonth(dateObj) + 1;
};

/**
 * Gets the 4-digit year from a date.
 */
export const getYear = (date) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return null;
  return dfnsGetYear(dateObj);
};

/**
 * Calculates the inclusive number of calendar days between two dates.
 */
export const differenceInCalendarDays = (endDateStr, startDateStr) => {
  const start = parseISODateString(startDateStr);
  const end = parseISODateString(endDateStr);
  if (!start || !end || end < start) return 0;
  return dfnsDifferenceInCalendarDays(end, start) + 1;
};

/**
 * Calculates and formats the seniority (duration) of employment.
 */
export const formatSeniority = (startDate, endDate) => {
    const start = fromFirestore(startDate);
    if (!start) return '-';

    const end = fromFirestore(endDate) || new Date(); 
    if (start > end) return 'Pending Start';

    const numYears = dfnsDifferenceInYears(end, start);
    const startPlusYears = new Date(start.getFullYear() + numYears, start.getMonth(), start.getDate());
    const numMonths = dfnsDifferenceInMonths(end, startPlusYears);

    const yearStr = numYears > 0 ? `${numYears} Year${numYears > 1 ? 's' : ''}` : '';
    const monthStr = numMonths > 0 ? `${numMonths} Month${numMonths > 1 ? 's' : ''}` : '';

    if (numYears > 0 && numMonths > 0) return `${yearStr}, ${monthStr}`;
    if (numYears === 0 && numMonths > 0) return monthStr;
    if (numYears === 0 && numMonths === 0) {
        const numDays = dfnsDifferenceInCalendarDays(end, start);
        if (numDays === 0) return 'Started Today';
        return `${numDays + 1} Day${numDays > 0 ? 's' : ''}`;
    }
    if (numYears > 0 && numMonths === 0) return yearStr;
    return '-';
};


/**
 * Returns the start of the month for a given date.
 */
export const startOfMonth = (date) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return null;
  return dfnsStartOfMonth(dateObj);
};

/**
 * Returns the end of the month for a given date.
 */
export const endOfMonth = (date) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return null;
  return dfnsEndOfMonth(dateObj);
};

/**
 * Calculates the difference between two dates in milliseconds.
 */
export const differenceInMilliseconds = (laterDate, earlierDate) => {
  const later = fromFirestore(laterDate);
  const earlier = fromFirestore(earlierDate);
  if (!later || !earlier) return 0;
  return dfnsDifferenceInMilliseconds(later, earlier);
};

/**
 * Formats a duration in milliseconds into "Xh Ym" string.
 */
export const formatDuration = (milliseconds) => {
  if (milliseconds <= 0) return '0h 0m';
  const duration = intervalToDuration({ start: 0, end: milliseconds });
  const hours = duration.hours || 0;
  const minutes = duration.minutes || 0;
  return `${hours}h ${minutes}m`;
};

/**
 * Gets the number of days in the month for a given date.
 */
export const getDaysInMonth = (date) => {
    const dateObj = fromFirestore(date);
    if (!dateObj) return 0;
    return dfnsGetDaysInMonth(dateObj);
};

export const differenceInYears = (dateLeft, dateRight) => {
    const left = fromFirestore(dateLeft);
    const right = fromFirestore(dateRight);
    if (!left || !right) return 0; 
    return dfnsDifferenceInYears(left, right);
};

/**
 * Returns the start of the year for a given date.
 */
export const startOfYear = (date) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return null;
  return dfnsStartOfYear(dateObj);
};

/**
 * Returns the end of the year for a given date.
 */
export const endOfYear = (date) => {
  const dateObj = fromFirestore(date);
  if (!dateObj) return null;
  return dfnsEndOfYear(dateObj);
};

export const differenceInCalendarMonths = (dateLeft, dateRight) => {
  const d1 = fromFirestore(dateLeft);
  const d2 = fromFirestore(dateRight);
  if (!d1 || !d2) return 0;
  return (d1.getFullYear() - d2.getFullYear()) * 12 + (d1.getMonth() - d2.getMonth());
};