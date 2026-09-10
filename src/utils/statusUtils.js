/* src/utils/statusUtils.js */
import * as dateUtils from './dateUtils';

const calculateDurationMinutes = (startTime, endTime) => {
    if (!startTime || !endTime) return 0;
    try {
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        let minutes = (endH * 60 + endM) - (startH * 60 + startM);
        if (minutes < 0) minutes += 24 * 60; // Gère les shifts passant minuit
        return minutes;
    } catch (e) { return 0; }
};

const getWorkedMinutes = (attendance, companyConfig) => {
    if (!attendance || !attendance.checkInTime || !attendance.checkOutTime) return 0;
    
    const checkIn = attendance.checkInTime.toDate ? attendance.checkInTime.toDate() : new Date(attendance.checkInTime);
    const checkOut = attendance.checkOutTime.toDate ? attendance.checkOutTime.toDate() : new Date(attendance.checkOutTime);
    
    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) return 0;

    let breakDurationMs = 0;
    const breakMins = companyConfig?.breakDurationMinutes !== undefined ? parseInt(companyConfig.breakDurationMinutes) : 60;
    
    // 1. Manual Break (Start/End)
    if (attendance.breakStart && attendance.breakEnd) {
        const bStart = attendance.breakStart.toDate ? attendance.breakStart.toDate() : new Date(attendance.breakStart);
        const bEnd = attendance.breakEnd.toDate ? attendance.breakEnd.toDate() : new Date(attendance.breakEnd);
        if (!isNaN(bStart.getTime()) && !isNaN(bEnd.getTime())) {
            breakDurationMs = bEnd - bStart;
        }
    } 
    // 2. Auto Break (Dynamic based on config)
    else if (attendance.includesBreak !== false) {
        // Only deduct if shift > 5 hours
        const rawDuration = checkOut - checkIn;
        if (rawDuration > 5 * 60 * 60 * 1000) {
            breakDurationMs = breakMins * 60 * 1000;
        }
    }

    return Math.floor(((checkOut - checkIn) - breakDurationMs) / 60000);
};

export const calculateAttendanceStatus = (schedule, attendance, leave, date, companyConfig) => {
    if (leave) return { status: 'Leave', suggestedLateMinutes: 0, suggestedOtMinutes: 0, approvedLateMinutes: 0, approvedOtMinutes: 0 };

    if (attendance && attendance.checkInTime) {
        let suggestedLateMinutes = 0;
        let suggestedOtMinutes = 0;
        
        let approvedLateMinutes = attendance.lateApprovedMinutes || 0;
        let approvedOtMinutes = attendance.otApprovedMinutes || 0;

        const checkInTime = attendance.checkInTime.toDate ? attendance.checkInTime.toDate() : new Date(attendance.checkInTime);
        const checkOutTime = attendance.checkOutTime ? (attendance.checkOutTime.toDate ? attendance.checkOutTime.toDate() : new Date(attendance.checkOutTime)) : null;

        // --- SUGGESTED LATENESS CHECK ---
        if (schedule && schedule.startTime) {
            const [schedH, schedM] = schedule.startTime.split(':').map(Number);
            const scheduledTime = new Date(checkInTime);
            scheduledTime.setHours(schedH, schedM, 0, 0);

            const gracePeriod = companyConfig?.lateGracePeriod || 0;
            const diff = (checkInTime - scheduledTime) / 60000;

            if (diff > gracePeriod) {
                suggestedLateMinutes = Math.floor(diff);
            }
        }

        // --- SUGGESTED OVERTIME CHECK ---
        if (checkOutTime && schedule && schedule.endTime) {
            const workedMinutes = getWorkedMinutes(attendance, companyConfig);
            let scheduledMinutes = calculateDurationMinutes(schedule.startTime, schedule.endTime);
            
            const breakMins = companyConfig?.breakDurationMinutes !== undefined ? parseInt(companyConfig.breakDurationMinutes) : 60;
            if (schedule.includesBreak !== false) {
                scheduledMinutes -= breakMins;
            }

            const rawOtMinutes = Math.max(0, workedMinutes - scheduledMinutes);
            const otThreshold = parseInt(companyConfig?.overtimeThreshold || 15);
            
            if (rawOtMinutes >= otThreshold) {
                suggestedOtMinutes = rawOtMinutes;
            }
        } else if (checkOutTime && !schedule) {
             suggestedOtMinutes = getWorkedMinutes(attendance, companyConfig);
        }

        // --- INTELLIGENT STATUS RESOLUTION ---
        let status = 'Present';
        
        if (checkOutTime) {
            if (approvedOtMinutes > 0 && approvedLateMinutes > 0) {
                status = 'Adjusted';
            } else if (approvedOtMinutes > 0) {
                status = 'Paid OT';
            } else if (approvedLateMinutes > 0) {
                status = 'Penalty Late';
            } else if (!schedule) {
                status = 'Extra Shift'; 
            } else {
                status = 'Completed'; 
            }
        } else {
            if (suggestedLateMinutes > 0) status = 'Late';
        }

        return { 
            status, 
            checkInTime, 
            checkOutTime,
            suggestedLateMinutes,
            suggestedOtMinutes,
            approvedLateMinutes,
            approvedOtMinutes
        };
    }

    const now = new Date();
    const targetDate = new Date(date);
    now.setHours(0,0,0,0);
    targetDate.setHours(0,0,0,0);

    if (schedule && schedule.type === 'work' && !attendance && targetDate < now) {
        return { status: 'Absent', suggestedLateMinutes: 0, suggestedOtMinutes: 0, approvedLateMinutes: 0, approvedOtMinutes: 0 };
    }

    if (schedule && schedule.type === 'off') {
        return { status: 'Off', suggestedLateMinutes: 0, suggestedOtMinutes: 0, approvedLateMinutes: 0, approvedOtMinutes: 0 };
    }

    if (schedule && schedule.type === 'work') {
        return { status: 'Scheduled', suggestedLateMinutes: 0, suggestedOtMinutes: 0, approvedLateMinutes: 0, approvedOtMinutes: 0 };
    }

    return { status: 'Empty', suggestedLateMinutes: 0, suggestedOtMinutes: 0, approvedLateMinutes: 0, approvedOtMinutes: 0 };
};

export const getStatusClass = (status) => {
    switch (status) {
        case 'Present': return 'bg-green-800/60 border-l-4 border-green-500';
        case 'Completed': return 'bg-green-800/60 border-l-4 border-green-500'; 
        case 'Paid OT': return 'bg-purple-800/60 border-l-4 border-purple-500'; 
        case 'Penalty Late': return 'bg-orange-800/60 border-l-4 border-orange-500';
        case 'Adjusted': return 'bg-indigo-800/60 border-l-4 border-indigo-500'; 
        case 'Late': return 'bg-yellow-800/60 border-l-4 border-yellow-500';
        case 'Extra Shift': return 'bg-teal-800/60 border-l-4 border-teal-500';
        case 'Absent': return 'bg-red-800/60 border-l-4 border-red-500';
        case 'Leave': return 'bg-blue-800/60 border-l-4 border-blue-500';
        case 'Scheduled': return 'bg-gray-700/60 border-l-4 border-gray-500';
        case 'Off': return 'bg-gray-800/40 border-l-4 border-gray-600';
        default: return 'bg-gray-800 border border-gray-700';
    }
};