import React from 'react';
import * as dateUtils from '../../utils/dateUtils';

const InfoRow = ({ label, value, className = '' }) => (
    <div className={className}>
        <p className="text-sm text-gray-400">{label}</p>
        <p className="text-white text-lg">{value || '-'}</p>
    </div>
);

// UPDATED HELPER to support new structure
const formatRate = (job) => {
    if (!job) return 'N/A';

    if (job.payType === 'Hourly') {
        const r = job.hourlyRate || job.rate;
        return typeof r === 'number' ? `${r.toLocaleString()} THB / hr` : 'N/A';
    } 
    
    // Salary
    const salary = job.baseSalary || job.rate;
    const hours = job.standardDayHours || 8;
    
    return typeof salary === 'number' 
        ? `${salary.toLocaleString()} THB / mo (${hours}h/day)` 
        : 'N/A';
};

export const ProfileDetailsView = ({ staff, currentJob }) => {
    const displayName = staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 flex-grow">
            {staff.status === 'inactive' && <InfoRow label="Last Day of Employment" value={dateUtils.formatDisplayDate(staff.endDate)} className="md:col-span-2 bg-red-900/50 p-3 rounded-lg" />}
            
            <InfoRow label="Legal Name" value={displayName} />
            <InfoRow label="Nickname" value={staff.nickname} />
            <InfoRow label="Email Address" value={staff.email} />
            <InfoRow label="Phone Number" value={staff.phoneNumber} />
            <InfoRow label="Start Date" value={dateUtils.formatDisplayDate(staff.startDate)} />
            <InfoRow label="Seniority" value={dateUtils.formatSeniority(staff.startDate, staff.endDate)} />
            <InfoRow label="Birthdate" value={dateUtils.formatDisplayDate(staff.birthdate)} />
            
            <div className="md:col-span-2">
                <InfoRow label="Bank Account" value={staff.bankAccount} />
            </div>
            
            <div className="md:col-span-2">
                <InfoRow label="Address" value={staff.address} />
            </div>
            
            <InfoRow label="Emergency Contact Name" value={staff.emergencyContactName} />
            <InfoRow label="Emergency Contact Phone" value={staff.emergencyContactPhone} />
            
            <hr className="md:col-span-2 border-gray-700 my-2" />
            
            <InfoRow label="Current Department" value={currentJob.department} />
            <InfoRow label="Current Position" value={currentJob.position} />
            <InfoRow label="Current Pay Rate" value={formatRate(currentJob)} />
        </div>
    );
};