import * as dateUtils from './dateUtils';

// --- CONFIGURATION ---
// Staff can check in up to 5 minutes past their start time
const GRACE_PERIOD_MINUTES = 5;

/**
 * Helper to calculate duration in minutes from HH:mm strings
 */
const calculateDurationMinutes = (startTime, endTime) => {
    if (!startTime || !endTime) return 0;
    try {
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        let minutes = (endH * 60 + endM) - (startH * 60 + startM);
        if (minutes < 0) minutes += 24 * 60; // Handle crossing midnight
        return minutes;
    } catch (e) {
        return 0;
    }
};

/**
 * Calculates the net worked minutes from an attendance record
 */
const getWorkedMinutes = (attendance) => {
    if (!attendance || !attendance.checkInTime || !attendance.checkOutTime) return 0;
    
    const checkIn = dateUtils.fromFirestore(attendance.checkInTime);
    const checkOut = dateUtils.fromFirestore(attendance.checkOutTime);
    if (!checkIn || !checkOut) return 0;

    let breakDurationMs = 0;
    if (attendance.breakStart && attendance.breakEnd) {
        const breakStart = dateUtils.fromFirestore(attendance.breakStart);
        const breakEnd = dateUtils.fromFirestore(attendance.breakEnd);
        if (breakStart && breakEnd) {
            breakDurationMs = breakEnd - breakStart;
        }
    }

    const totalDurationMs = (checkOut - checkIn) - breakDurationMs;
    return Math.floor(totalDurationMs / (1000 * 60));
};

export const calculateAttendanceStatus = (schedule, attendance, leave, date) => {
    // 1. Check for Leave FIRST
    if (leave) {
        return { status: 'Leave', isLate: false, otMinutes: 0 };
    }

    // 2. Get Scheduled Minutes
    let scheduledMinutes = 0;
    if (schedule && schedule.type === 'work' && schedule.startTime && schedule.endTime) {
        scheduledMinutes = calculateDurationMinutes(schedule.startTime, schedule.endTime);
    }
    
    // 3. Check for Attendance (Present/Late/On Break/Completed)
    if (attendance && attendance.checkInTime) {
        let isLate = false;
        const checkInTime = dateUtils.fromFirestore(attendance.checkInTime);
        const checkOutTime = dateUtils.fromFirestore(attendance.checkOutTime);

        // Check for lateness
        if (schedule && schedule.type === 'work' && schedule.startTime) {
            const dateString = dateUtils.formatISODate(date);
            // --- FIX 1: Correct Date/Time Parsing ---
            const scheduledStart = dateUtils.fromFirestore(`${dateString}T${schedule.startTime}`);

            if (checkInTime && scheduledStart) {
                const diffMs = checkInTime - scheduledStart;
                const diffMins = Math.floor(diffMs / 60000);

                if (diffMins > GRACE_PERIOD_MINUTES) {
                    isLate = true;
                }
            }
        }
        
        // Calculate OT
        const workedMinutes = getWorkedMinutes(attendance);
        const otMinutes = Math.max(0, workedMinutes - scheduledMinutes);

        // Return detailed status
        let status = 'Present';
        if (checkOutTime) status = 'Completed';
        else if (attendance.breakStart && !attendance.breakEnd) status = 'On Break';
        else if (isLate) status = 'Late'; // 'Late' overrides 'Present'
        
        return { 
            status, 
            isLate, 
            otMinutes, 
            checkInTime, // Pass actual times through
            checkOutTime // Pass actual times through
        };
    }

    // 4. Check for Absence
    const now = new Date();
    const targetDate = new Date(date);
    now.setHours(0,0,0,0);
    targetDate.setHours(0,0,0,0);

    if (schedule && schedule.type === 'work' && !attendance && targetDate < now) {
        return { status: 'Absent', isLate: false, otMinutes: 0 };
    }

    // 5. Default (Day Off, Future shift, or Empty)
    if (schedule && schedule.type === 'off') {
        return { status: 'Off', isLate: false, otMinutes: 0 };
    }

    return { status: 'Empty', isLate: false, otMinutes: 0 };
};

// --- Updated to match PlanningPage.jsx ---
export const getStatusClass = (status) => {
    // This function now only determines the background/border color
    switch (status) {
        case 'Present':
            return 'bg-green-800/60 border-l-4 border-green-500';
        case 'Late':
            return 'bg-yellow-800/60 border-l-4 border-yellow-500';
        case 'On Break':
            return 'bg-orange-800/60 border-l-4 border-orange-500';
        case 'Completed':
            return 'bg-gray-700/60 border-l-4 border-gray-500';
        case 'Absent':
            return 'bg-red-800/60 border-l-4 border-red-500';
        case 'Leave':
            return 'bg-blue-800/60 border-l-4 border-blue-500';
        case 'Off':
        case 'Empty':
        default:
            return 'hover:bg-gray-700'; // Clean look for empty/off cells
    }
};