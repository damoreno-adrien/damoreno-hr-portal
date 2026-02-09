/* src/utils/statusUtils.js */
import * as dateUtils from './dateUtils';

const calculateDurationMinutes = (startTime, endTime) => {
    if (!startTime || !endTime) return 0;
    try {
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        let minutes = (endH * 60 + endM) - (startH * 60 + startM);
        if (minutes < 0) minutes += 24 * 60;
        return minutes;
    } catch (e) { return 0; }
};

const getWorkedMinutes = (attendance) => {
    if (!attendance || !attendance.checkInTime || !attendance.checkOutTime) return 0;
    
    // Handle timestamps or Date objects
    const checkIn = attendance.checkInTime.toDate ? attendance.checkInTime.toDate() : new Date(attendance.checkInTime);
    const checkOut = attendance.checkOutTime.toDate ? attendance.checkOutTime.toDate() : new Date(attendance.checkOutTime);
    
    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) return 0;

    let breakDurationMs = 0;
    
    // 1. Manual Break (Start/End)
    if (attendance.breakStart && attendance.breakEnd) {
        const bStart = attendance.breakStart.toDate ? attendance.breakStart.toDate() : new Date(attendance.breakStart);
        const bEnd = attendance.breakEnd.toDate ? attendance.breakEnd.toDate() : new Date(attendance.breakEnd);
        if (!isNaN(bStart.getTime()) && !isNaN(bEnd.getTime())) {
            breakDurationMs = bEnd - bStart;
        }
    } 
    // 2. Auto Break (Standard 1h if not disabled)
    else if (attendance.includesBreak !== false) {
        // Only deduct if shift > 5 hours
        const rawDuration = checkOut - checkIn;
        if (rawDuration > 5 * 60 * 60 * 1000) {
            breakDurationMs = 60 * 60 * 1000;
        }
    }

    return Math.floor(((checkOut - checkIn) - breakDurationMs) / 60000);
};

export const calculateAttendanceStatus = (schedule, attendance, leave, date, companyConfig) => {
    // 1. Check for Leave
    if (leave) return { status: 'Leave', isLate: false, otMinutes: 0, lateMinutes: 0 };

    // 2. Basic Attendance Check
    if (attendance && attendance.checkInTime) {
        let status = 'Present';
        let isLate = false;
        let lateMinutes = 0;
        let otMinutes = 0;

        const checkInTime = attendance.checkInTime.toDate ? attendance.checkInTime.toDate() : new Date(attendance.checkInTime);
        const checkOutTime = attendance.checkOutTime ? (attendance.checkOutTime.toDate ? attendance.checkOutTime.toDate() : new Date(attendance.checkOutTime)) : null;

        // --- LATENESS CHECK ---
        if (schedule && schedule.startTime) {
            const [schedH, schedM] = schedule.startTime.split(':').map(Number);
            const scheduledTime = new Date(checkInTime);
            scheduledTime.setHours(schedH, schedM, 0, 0);

            // Use Config Grace Period (Default to 0 if Strict)
            const gracePeriod = companyConfig?.lateGracePeriod || 0;
            const diff = (checkInTime - scheduledTime) / 60000;

            if (diff > gracePeriod) {
                isLate = true;
                lateMinutes = Math.floor(diff);
                status = 'Late';
            }
        }

        // --- OVERTIME CHECK ---
        if (checkOutTime && schedule && schedule.endTime) {
            const workedMinutes = getWorkedMinutes(attendance);
            
            // Calculate Scheduled Duration
            let scheduledMinutes = calculateDurationMinutes(schedule.startTime, schedule.endTime);
            
            // Deduct Break from Schedule Target ONLY if schedule includes break
            if (schedule.includesBreak !== false) {
                scheduledMinutes -= 60;
            }

            const rawOtMinutes = Math.max(0, workedMinutes - scheduledMinutes);

            // --- FIX: APPLY THRESHOLD ---
            const otThreshold = parseInt(companyConfig?.overtimeThreshold || 15);
            
            if (rawOtMinutes >= otThreshold) {
                otMinutes = rawOtMinutes;
                // IMPORTANT: Check if Manager explicitly rejected this OT
                if (attendance.otStatus === 'rejected') {
                    status = isLate ? 'Late' : 'Completed';
                } else if (!isLate) {
                    status = 'Overtime';
                }
            } else if (!isLate && checkOutTime) {
                status = 'Completed';
            }
        } else if (checkOutTime && !schedule) {
             // Extra Shift (Unscheduled work) - Always OT
             status = 'Present'; 
             otMinutes = getWorkedMinutes(attendance);
        }

        return { 
            status, 
            isLate, 
            lateMinutes, 
            otMinutes, 
            checkInTime, 
            checkOutTime 
        };
    }

    // 3. Absent Check
    const now = new Date();
    const targetDate = new Date(date);
    now.setHours(0,0,0,0);
    targetDate.setHours(0,0,0,0);

    if (schedule && schedule.type === 'work' && !attendance && targetDate < now) {
        return { status: 'Absent', isLate: false, otMinutes: 0, lateMinutes: 0 };
    }

    // 4. Day Off
    if (schedule && schedule.type === 'off') {
        return { status: 'Off', isLate: false, otMinutes: 0, lateMinutes: 0 };
    }

    // 5. Scheduled but Future (or Today Pre-Checkin)
    // We return 'Scheduled' instead of 'Empty' to help the Modal know what to show
    if (schedule && schedule.type === 'work') {
        return { status: 'Scheduled', isLate: false, otMinutes: 0, lateMinutes: 0 };
    }

    return { status: 'Empty', isLate: false, otMinutes: 0, lateMinutes: 0 };
};

export const getStatusClass = (status) => {
    switch (status) {
        case 'Present': return 'bg-green-800/60 border-l-4 border-green-500';
        case 'Completed': return 'bg-green-800/60 border-l-4 border-green-500'; 
        case 'Late': return 'bg-yellow-800/60 border-l-4 border-yellow-500';
        case 'Overtime': return 'bg-indigo-800/60 border-l-4 border-indigo-500'; 
        case 'Absent': return 'bg-red-800/60 border-l-4 border-red-500';
        case 'Leave': return 'bg-blue-800/60 border-l-4 border-blue-500';
        case 'Scheduled': return 'bg-gray-700/60 border-l-4 border-gray-500'; // New Style
        case 'Off': return 'bg-gray-800/40 border-l-4 border-gray-600';
        default: return 'bg-gray-800 border border-gray-700';
    }
};