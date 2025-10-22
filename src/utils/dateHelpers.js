// src/utils/dateHelpers.js

/**
 * Creates a YYYY-MM-DD string from a Date object without timezone conversion issues.
 * @param {Date} date - The date object to format.
 * @returns {string} The formatted date string (YYYY-MM-DD).
 */
export const toLocalDateString = (date) => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const formatDateForDisplay = (dateString) => {
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return '';
    }
    // Adding 'T00:00:00Z' treats the date as UTC to prevent timezone shifts
    const date = new Date(`${dateString}T00:00:00Z`);
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric'
    }).replace(/ /g, '-'); // Replaces spaces with hyphens, e.g., "23 May 2023" -> "23-May-2023"
};


/**
 * Calculates the duration between a start and end date in years, months, and days.
 * @param {string} startDate - The start date in YYYY-MM-DD format.
 * @param {string|null} endDate - The end date in YYYY-MM-DD format, or null.
 * @returns {string} A formatted string, e.g., "1 year, 2 months, 15 days".
 */
export const calculateSeniority = (startDate, endDate) => {
    if (!startDate) return 'N/A';
    
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();

    if (start > end) return 'Starts in the future';

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
        months -= 1;
        days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    }
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    
    const parts = [];
    if (years > 0) parts.push(`${years} year${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);
    // --- THIS LINE IS FIXED ---
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    
    return parts.length > 0 ? parts.join(', ') : '0 days';
};