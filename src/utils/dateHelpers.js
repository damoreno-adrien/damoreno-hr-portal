/**
 * Calculates the duration between a start and end date in years, months, and days.
 * If no end date is provided, it calculates up to the current date.
 * @param {string} startDate - The start date in YYYY-MM-DD format.
 * @param {string|null} endDate - The end date in YYYY-MM-DD format, or null.
 * @returns {string} A formatted string, e.g., "1 year, 2 months, 15 days".
 */
export const calculateSeniority = (startDate, endDate) => {
    if (!startDate) return 'N/A';
    
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();

    // Prevent calculation if start date is in the future
    if (start > end) return 'Starts in the future';

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
        months -= 1;
        // Get the number of days in the month *before* the end date's month
        days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    }
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    
    const parts = [];
    if (years > 0) parts.push(`${years} year${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    
    return parts.length > 0 ? parts.join(', ') : '0 days';
};