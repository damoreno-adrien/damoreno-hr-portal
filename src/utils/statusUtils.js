import { DateTime } from 'luxon';

const THAILAND_TIMEZONE = 'Asia/Bangkok';

/**
 * Calculates the final attendance status by comparing schedule, attendance, and leave data.
 * @param {object} schedule - The schedule object (or null).
 * @param {object} attendance - The attendance object (or null).
 * @param {object} leave - The leave object (or null).
 * @param {Date} date - The JS Date object for the day being checked.
 * @returns {object} - An object like { status: 'Present', minutes: 0 }
 */
export const calculateAttendanceStatus = (schedule, attendance, leave, date) => {
    // 1. Get today's date in Bangkok time.
    const today = DateTime.now().setZone(THAILAND_TIMEZONE).startOf('day');
    // 2. Get the date of the shift we are checking.
    const shiftDate = DateTime.fromJSDate(date).setZone(THAILAND_TIMEZONE).startOf('day');

    // 3. If the shift date is in the future, it's 'Upcoming'.
    if (shiftDate > today) {
        return { status: 'Upcoming', minutes: 0 };
    }

    // 4. Check for approved leave.
    if (leave) {
        return { status: 'Leave', minutes: 0 };
    }

    // 5. Check work schedule vs. attendance.
    const isWorkSchedule = schedule && typeof schedule.type === 'string' && schedule.type.toLowerCase() === 'work';

    if (isWorkSchedule) {
        // There is a work shift scheduled for this day.
        if (attendance && attendance.checkInTime) {
            // Staff checked in.
            try {
                // Check for lateness.
                const scheduledStart = DateTime.fromISO(`${schedule.date}T${schedule.startTime}`, { zone: THAILAND_TIMEZONE });
                const actualCheckIn = DateTime.fromJSDate(attendance.checkInTime.toDate()).setZone(THAILAND_TIMEZONE);

                if (actualCheckIn.isValid && scheduledStart.isValid && actualCheckIn > scheduledStart) {
                    const lateMinutes = Math.ceil(actualCheckIn.diff(scheduledStart, 'minutes').minutes);
                    return { status: 'Late', minutes: lateMinutes };
                }
                // Not late, so they are Present.
                return { status: 'Present', minutes: 0 };
            } catch (e) {
                console.error("Error calculating lateness:", e);
                return { status: 'Present', minutes: 0 }; // Fallback to 'Present' if time parsing fails
            }
        } else {
            // Scheduled to work, but did NOT check in.
            return { status: 'Absent', minutes: 0 };
        }
    }

    // 6. If not scheduled, not on leave, and date is not in future, they are 'Off'.
    // We also land here if they are 'Off' and didn't check in.
    if (!attendance) {
        return { status: 'Off', minutes: 0 };
    }

    // 7. Handle 'Worked on Day Off' (optional, but good to have)
    if (!isWorkSchedule && attendance && attendance.checkInTime) {
        // You can decide what to do here. For now, we'll just treat it as 'Present'.
        // You could also create a 'Worked Off Day' status.
        return { status: 'Present', minutes: 0 };
    }

    // Default fallback
    return { status: 'Off', minutes: 0 };
};

/**
 * Returns the correct Tailwind CSS class based on the calculated status.
 * @param {string} status - The status string (e.g., 'Present', 'Late').
 * @returns {string} - The Tailwind CSS class string.
 */
export const getStatusClass = (status) => {
    switch (status) {
        case 'Present':
            return 'bg-green-700 text-white'; // Darker green for contrast
        case 'Late':
            return 'bg-orange-600 text-white'; // Orange needs white text
        case 'Absent':
            return 'bg-red-700 text-white'; // Darker red
        case 'Leave':
            return 'bg-blue-600 text-white';
        // 'Upcoming' and 'Off' will not have a class and will use the default bg-gray-800
        default:
            return ''; 
    }
};