import * as dateUtils from './dateUtils';

export const calculateAttendanceStatus = (schedule, attendance, leave, date) => {
    // 1. Check for Leave FIRST
    if (leave) {
        return { status: 'Leave', minutes: 0 };
    }

    // 2. Check for "Day Off" Schedule
    // This is the new logic to prevent "Day Off" appearing as "Absent"
    if (schedule && schedule.type === 'off') {
        return { status: 'Off', minutes: 0 };
    }

    // 3. Check for Attendance (Present/Late)
    if (attendance && attendance.checkInTime) {
        // If there is a schedule with a start time, check for lateness
        if (schedule && schedule.startTime) {
            const checkIn = attendance.checkInTime.toDate ? attendance.checkInTime.toDate() : new Date(attendance.checkInTime);
            
            // Construct scheduled start time for that specific date
            const scheduledStart = dateUtils.parseISODateString(`${schedule.date}T${schedule.startTime}`);
            
            // Add grace period (e.g., 5 minutes, or 0 if strict)
            // You can adjust this logic based on your preferences
            if (checkIn > scheduledStart) {
                const diffMs = checkIn - scheduledStart;
                const diffMins = Math.floor(diffMs / 60000);
                return { status: 'Late', minutes: diffMins };
            }
        }
        return { status: 'Present', minutes: 0 };
    }

    // 4. Check for Absence
    // If there is a "work" schedule, the date is in the past, and no attendance...
    const now = new Date();
    const targetDate = new Date(date);
    // Reset hours to compare dates only
    now.setHours(0,0,0,0);
    targetDate.setHours(0,0,0,0);

    if (schedule && schedule.type === 'work' && !attendance && targetDate < now) {
        return { status: 'Absent', minutes: 0 };
    }

    // 5. Default (Future shift or Empty)
    return { status: 'Off', minutes: 0 };
};

export const getStatusClass = (status) => {
    switch (status) {
        case 'Present': return 'bg-green-900/50 text-green-200 border-l-4 border-green-500';
        case 'Late': return 'bg-yellow-900/50 text-yellow-200 border-l-4 border-yellow-500';
        case 'Absent': return 'bg-red-900/50 text-red-200 border-l-4 border-red-500';
        case 'Leave': return 'bg-blue-900/50 text-blue-200 border-l-4 border-blue-500';
        case 'Off': return ''; // Clean look for empty/off cells
        default: return '';
    }
};