import React from 'react';
import { calculateSeniority, formatDateForDisplay } from '../../utils/dateHelpers';

const InfoRow = ({ label, value, className = '' }) => (<div className={className}><p className="text-sm text-gray-400">{label}</p><p className="text-white text-lg">{value || '-'}</p></div>);

const formatRate = (job) => {
    if (typeof job?.rate !== 'number') return 'N/A';
    const rateString = job.rate.toLocaleString();
    return job.payType === 'Hourly' ? `${rateString} THB / hr` : `${rateString} THB / mo`;
};

export const ProfileDetailsView = ({ staff, currentJob }) => {
    const displayName = staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 flex-grow">
            {staff.status === 'inactive' && <InfoRow label="Last Day of Employment" value={formatDateForDisplay(staff.endDate)} className="md:col-span-2 bg-red-900/50 p-3 rounded-lg" />}
            <InfoRow label="Legal Name" value={displayName} />
            <InfoRow label="Nickname" value={staff.nickname} />
            <InfoRow label="Email Address" value={staff.email} />
            <InfoRow label="Phone Number" value={staff.phoneNumber} />
            <InfoRow label="Start Date" value={formatDateForDisplay(staff.startDate)} />
            <InfoRow label="Seniority" value={calculateSeniority(staff.startDate, staff.endDate)} />
            <InfoRow label="Birthdate" value={formatDateForDisplay(staff.birthdate)} />
            <div className="md:col-span-2"><InfoRow label="Bank Account" value={staff.bankAccount} /></div>
            <hr className="md:col-span-2 border-gray-700 my-2" />
            <InfoRow label="Current Department" value={currentJob.department} />
            <InfoRow label="Current Position" value={currentJob.position} />
            <InfoRow label="Current Pay Rate (THB)" value={formatRate(currentJob)} />
        </div>
    );
};