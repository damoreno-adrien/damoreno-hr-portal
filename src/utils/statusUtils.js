import * as dateUtils from './dateUtils';

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

/**
 * Main Calculation Logic
 */
export const calculateAttendanceStatus = (schedule, attendance, leave, date) => {
    // 1. Check for Leave FIRST
    if (leave) {
        return { status: 'Leave', isLate: false, otMinutes: 0, lateMinutes: 0 };
    }

    // 2. Get Scheduled Minutes
    let scheduledMinutes = 0;
    if (schedule && schedule.type === 'work' && schedule.startTime && schedule.endTime) {
        scheduledMinutes = calculateDurationMinutes(schedule.startTime, schedule.endTime);
    }
    
    // 3. Check for Attendance
    if (attendance && attendance.checkInTime) {
        let isLate = false;
        let lateMinutes = 0;
        const checkInTime = dateUtils.fromFirestore(attendance.checkInTime);
        const checkOutTime = dateUtils.fromFirestore(attendance.checkOutTime);

        // Check for lateness (Strict)
        if (schedule && schedule.type === 'work' && schedule.startTime) {
            const dateString = dateUtils.formatISODate(date);
            const scheduledStart = dateUtils.fromFirestore(`${dateString}T${schedule.startTime}`);

            if (checkInTime && scheduledStart) {
                if (checkInTime > scheduledStart) {
                    isLate = true;
                    const diffMs = checkInTime - scheduledStart;
                    lateMinutes = Math.floor(diffMs / 60000);
                }
            }
        }
        
        // Calculate OT
        const workedMinutes = getWorkedMinutes(attendance);
        const otMinutes = Math.max(0, workedMinutes - scheduledMinutes);

        // --- FIX: Adjusted Priority ---
        // 1. If checked out -> Completed (Gray)
        // 2. If on break -> On Break (Orange)
        // 3. If late (and still working) -> Late (Yellow)
        // 4. Else -> Present (Green)
        
        let status = 'Present';
        
        if (checkOutTime) {
            status = 'Completed'; 
        } else if (attendance.breakStart && !attendance.breakEnd) {
            status = 'On Break';
        } else if (isLate) {
            status = 'Late';
        }
        // ------------------------------
        
        return { 
            status, 
            isLate,
            lateMinutes, 
            otMinutes, 
            checkInTime, 
            checkOutTime 
        };
    }

    // 4. Check for Absence
    const now = new Date();
    const targetDate = new Date(date);
    now.setHours(0,0,0,0);
    targetDate.setHours(0,0,0,0);

    if (schedule && schedule.type === 'work' && !attendance && targetDate < now) {
        return { status: 'Absent', isLate: false, otMinutes: 0, lateMinutes: 0 };
    }

    // 5. Default
    if (schedule && schedule.type === 'off') {
        return { status: 'Off', isLate: false, otMinutes: 0, lateMinutes: 0 };
    }

    return { status: 'Empty', isLate: false, otMinutes: 0, lateMinutes: 0 };
};

export const getStatusClass = (status) => {
    switch (status) {
        case 'Present': return 'bg-green-800/60 border-l-4 border-green-500';
        case 'Late': return 'bg-yellow-800/60 border-l-4 border-yellow-500';
        case 'On Break': return 'bg-orange-800/60 border-l-4 border-orange-500';
        case 'Completed': return 'bg-gray-700/60 border-l-4 border-gray-500';
        case 'Absent': return 'bg-red-800/60 border-l-4 border-red-500';
        case 'Leave': return 'bg-blue-800/60 border-l-4 border-blue-500';
        case 'Off':
        case 'Empty':
        default: return 'hover:bg-gray-700';
    }
};