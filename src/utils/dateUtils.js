import {
  format,
  parseISO,
  toDate,
  isValid,
  formatDistanceToNow,
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
  // Handle ISO strings
  else if (typeof dateInput === 'string') {
    date = parseISO(dateInput);
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
  // Updated to match your DD/MM/YYYY format
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