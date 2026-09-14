// src/pages/MyProfilePage.jsx
import React, { useState } from 'react';
import * as dateUtils from '../utils/dateUtils';
import { EyeIcon, EyeOffIcon, FileText, Download, AlertTriangle } from 'lucide-react';

const InfoRow = ({ label, value }) => (
    <div>
        <p className="text-sm font-medium text-gray-400">{label}</p>
        <p className="mt-1 text-lg text-white">{value || '-'}</p>
    </div>
);

// 1. Helper local robuste pour récupérer le job (évite les erreurs si jobHistory est vide)
const getRobustCurrentJob = (staff) => {
    if (!staff) return {};
    if (staff.jobHistory && staff.jobHistory.length > 0) {
        return [...staff.jobHistory].sort((a, b) => {
            const dateA = dateUtils.fromFirestore(a.startDate) || new Date(0);
            const dateB = dateUtils.fromFirestore(b.startDate) || new Date(0);
            return dateB - dateA;
        })[0];
    }
    return staff;
};

// 2. Helper local robuste qui convertit tout en Number (corrige le N/A des strings)
const formatPayRate = (job) => {
    if (!job) return 'N/A';
    
    if (job.payType === 'Hourly') {
        const r = Number(job.hourlyRate || job.rate || 0);
        return r > 0 ? `${r.toLocaleString('en-US')} THB / hr` : 'N/A';
    }
    
    const salary = Number(job.baseSalary || job.rate || 0);
    const hours = Number(job.standardDayHours || 8);
    
    return salary > 0 ? `${salary.toLocaleString('en-US')} THB / mo (${hours}h/day)` : 'N/A';
};

export default function MyProfilePage({ staffProfile }) {
    const [isSalaryVisible, setIsSalaryVisible] = useState(false);

    if (!staffProfile) {
        return <p className="text-center text-gray-400">Loading profile information...</p>;
    }

    const currentJob = getRobustCurrentJob(staffProfile);
    const displayName = staffProfile.firstName ? `${staffProfile.firstName} ${staffProfile.lastName}` : staffProfile.fullName;

    const bankAccountDisplay = staffProfile.bankName && staffProfile.bankAccountNumber
        ? `${staffProfile.bankName} - ${staffProfile.bankAccountNumber}`
        : (staffProfile.bankAccount || '-');

    const visibleDocs = (staffProfile.documents || []).filter(doc => doc.isVisibleToStaff !== false);
    const expiringDocs = visibleDocs.filter(doc => {
        if (!doc.expiryDate) return false;
        const daysLeft = Math.ceil((new Date(doc.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
        return daysLeft <= 30; 
    });

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white">My Profile</h2>
            </div>

            {expiringDocs.length > 0 && (
                <div className="mb-8 p-4 bg-red-900/40 border border-red-500 rounded-lg flex items-start animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                    <AlertTriangle className="h-6 w-6 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="text-red-400 font-bold text-lg">Important Action Required / ประกาศสำคัญ</h3>
                        <p className="text-red-200 mt-1">
                            You have {expiringDocs.length} official document(s) that are expired or expiring very soon. 
                            Please review your Official Documents below and contact management immediately to update your paperwork.
                        </p>
                        <p className="text-red-200 mt-2 font-thai">
                            คุณมีเอกสารสำคัญจำนวน {expiringDocs.length} ฉบับที่หมดอายุหรือใกล้จะหมดอายุ 
                            โปรดตรวจสอบเอกสารของคุณด้านล่าง และติดต่อผู้จัดการหรือฝ่ายบริหารทันทีเพื่ออัปเดตเอกสาร
                        </p>
                    </div>
                </div>
            )}

            <div className="space-y-8">
                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white mb-6 border-b border-gray-700 pb-4">Personal &amp; Contact Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        <InfoRow label="Legal Name" value={displayName} />
                        <InfoRow label="Nickname" value={staffProfile.nickname} />
                        <InfoRow label="Email Address" value={staffProfile.email} />
                        <InfoRow label="Phone Number" value={staffProfile.phoneNumber} />
                        <InfoRow label="Birthdate" value={dateUtils.formatDisplayDate(staffProfile.birthdate)} />
                        
                        <div className="md:col-span-2 border-t border-gray-700 pt-4 mt-2">
                            <h4 className="text-sm font-bold text-indigo-400 mb-4">Social Security (SSO)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                <InfoRow label="SSO Status" value={staffProfile.isSsoRegistered !== false ? 'Enrolled' : 'Not Enrolled'} />
                                {staffProfile.isSsoRegistered !== false && (
                                    <>
                                        <InfoRow label="Social Security ID" value={staffProfile.ssoId || '-'} />
                                        <InfoRow label="SSO Allowance" value={staffProfile.receivesSsoAllowance !== false ? 'Covered by Company' : 'Paid by Staff'} />
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="md:col-span-2 border-t border-gray-700 pt-4 mt-2"><InfoRow label="Bank Account" value={bankAccountDisplay} /></div>
                        <div className="md:col-span-2"><InfoRow label="Address" value={staffProfile.address} /></div>
                        <InfoRow label="Emergency Contact Name" value={staffProfile.emergencyContactName} />
                        <InfoRow label="Emergency Contact Phone" value={staffProfile.emergencyContactPhone} />
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white mb-6 border-b border-gray-700 pb-4">Employment Information</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        <InfoRow label="Start Date" value={dateUtils.formatDisplayDate(staffProfile.startDate)} />
                        <InfoRow label="Seniority" value={dateUtils.formatSeniority(staffProfile.startDate, null)} />
                        <InfoRow label="Current Department" value={currentJob.department} />
                        <InfoRow label="Current Position" value={currentJob.position} />

                        <div className="md:col-span-2">
                             <div>
                                <p className="text-sm font-medium text-gray-400">Current Pay Rate</p>
                                <div className="mt-1 flex items-center space-x-3">
                                    <p className="text-lg text-white">{isSalaryVisible ? formatPayRate(currentJob) : `***** THB`}</p>
                                    <button onClick={() => setIsSalaryVisible(!isSalaryVisible)} className="text-gray-400 hover:text-white transition-colors">
                                        {isSalaryVisible ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white mb-6 border-b border-gray-700 pb-4">Official Documents</h3>
                    
                    {visibleDocs.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {visibleDocs.map((doc, index) => {
                                let isExpiring = false;
                                if (doc.expiryDate) {
                                    const daysLeft = Math.ceil((new Date(doc.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
                                    isExpiring = daysLeft <= 30;
                                }

                                return (
                                    <a key={index} href={doc.url} target="_blank" rel="noopener noreferrer" 
                                       className={`flex items-center p-4 border rounded-xl transition-all text-left group ${isExpiring ? 'bg-red-900/20 border-red-500/50 hover:bg-red-900/40 hover:border-red-400' : 'bg-gray-900/50 border-gray-700 hover:border-indigo-500 hover:bg-gray-700'}`}>
                                        <div className={`p-3 rounded-lg mr-4 transition-colors ${isExpiring ? 'bg-red-900/50 group-hover:bg-red-500' : 'bg-indigo-900/50 group-hover:bg-indigo-600'}`}>
                                            <FileText className={`h-6 w-6 transition-colors ${isExpiring ? 'text-red-300 group-hover:text-white' : 'text-indigo-300 group-hover:text-white'}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className={`${isExpiring ? 'text-red-400' : 'text-white'} font-medium truncate`} title={doc.name}>{doc.name}</h4>
                                            
                                            <div className="flex flex-col mt-1">
                                                <span className="text-xs text-gray-400">Uploaded: {doc.uploadedAt ? dateUtils.formatDisplayDate(dateUtils.fromFirestore(doc.uploadedAt)) : 'N/A'}</span>
                                                {doc.expiryDate && (
                                                    <span className={`text-xs mt-0.5 font-bold ${isExpiring ? 'text-red-400' : 'text-emerald-400'}`}>
                                                        Expires: {dateUtils.formatDisplayDate(new Date(doc.expiryDate))}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <Download className="h-5 w-5 text-gray-500 group-hover:text-white transition-colors ml-2 flex-shrink-0" />
                                    </a>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-6 bg-gray-900/30 rounded-lg border border-dashed border-gray-700">
                            <p className="text-gray-500 italic">No official documents have been uploaded yet.</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}