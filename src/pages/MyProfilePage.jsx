// src/pages/MyProfilePage.jsx
import React, { useState } from 'react';
import * as dateUtils from '../utils/dateUtils';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

// Helper component for displaying information rows
const InfoRow = ({ label, value }) => (
    <div>
        <p className="text-sm font-medium text-gray-400">{label}</p>
        <p className="mt-1 text-lg text-white">{value || '-'}</p>
    </div>
);

// Helper to get the current job from job history
const getCurrentJob = (staff) => {
    if (!staff?.jobHistory || staff.jobHistory.length === 0) {
        // Fallback: If legacy baseSalary exists on root, mock a job object
        if (staff?.baseSalary) return { position: staff.position || 'Staff', department: staff.department, baseSalary: staff.baseSalary, payType: 'Monthly' };
        return { position: 'N/A', department: 'N/A', rate: 'N/A', payType: 'N/A' };
    }
    // Use standard date parsing for robust sorting
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB; // Sort descending (most recent first)
    })[0];
};

// Helper to format pay rate (FIXED to handle baseSalary)
const formatRate = (job) => {
    // 1. Check for Base Salary (Monthly)
    if (job?.baseSalary) {
        const salary = parseFloat(job.baseSalary);
        if (!isNaN(salary)) return `฿${salary.toLocaleString()} / month`;
    }
    
    // 2. Check for Rate (Hourly/Daily)
    if (typeof job?.rate === 'number') {
        const rateString = job.rate.toLocaleString();
        const payType = job.payType || 'Monthly';
        return payType === 'Hourly' ? `฿${rateString} / hour` : `฿${rateString} / month`;
    }
    
    return 'N/A';
};

export default function MyProfilePage({ staffProfile }) {
    const [isSalaryVisible, setIsSalaryVisible] = useState(false);

    if (!staffProfile) {
        return <p className="text-center text-gray-400">Loading profile information...</p>;
    }

    const currentJob = getCurrentJob(staffProfile);
    const displayName = `${staffProfile.firstName} ${staffProfile.lastName}`;

    return (
        <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">My Profile</h2>

            <div className="space-y-8">
                {/* Personal & Contact Information Card */}
                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white mb-6 border-b border-gray-700 pb-4">Personal & Contact Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        <InfoRow label="Legal Name" value={displayName} />
                        <InfoRow label="Nickname" value={staffProfile.nickname} />
                        <InfoRow label="Email Address" value={staffProfile.email} />
                        <InfoRow label="Phone Number" value={staffProfile.phoneNumber} />
                        <InfoRow label="Birthdate" value={dateUtils.formatDisplayDate(staffProfile.birthdate)} />
                        <div className="md:col-span-2">
                           <InfoRow label="Bank Account" value={staffProfile.bankAccount} />
                        </div>
                        <div className="md:col-span-2">
                           <InfoRow label="Address" value={staffProfile.address} />
                        </div>
                        <InfoRow label="Emergency Contact Name" value={staffProfile.emergencyContactName} />
                        <InfoRow label="Emergency Contact Phone" value={staffProfile.emergencyContactPhone} />
                    </div>
                </div>

                {/* Employment Information Card */}
                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white mb-6 border-b border-gray-700 pb-4">Employment Information</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        <InfoRow label="Start Date" value={dateUtils.formatDisplayDate(staffProfile.startDate)} />
                        <InfoRow label="Seniority" value={dateUtils.formatSeniority(staffProfile.startDate, null)} />
                        <InfoRow label="Current Department" value={currentJob.department} />
                        <InfoRow label="Current Position" value={currentJob.position} />

                        {/* Salary Row */}
                        <div className="md:col-span-2">
                             <div>
                                <p className="text-sm font-medium text-gray-400">Current Pay Rate</p>
                                <div className="mt-1 flex items-center space-x-3">
                                    <p className="text-lg text-white">
                                        {isSalaryVisible ? formatRate(currentJob) : `***** THB`}
                                    </p>
                                    <button
                                        onClick={() => setIsSalaryVisible(!isSalaryVisible)}
                                        className="text-gray-400 hover:text-white transition-colors"
                                        title={isSalaryVisible ? 'Hide salary' : 'Show salary'}
                                    >
                                        {isSalaryVisible ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}