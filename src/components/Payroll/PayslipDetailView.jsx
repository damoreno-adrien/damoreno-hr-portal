/* src/components/Payroll/PayslipDetailView.jsx */

import React, { useState } from 'react';
import { Info, Banknote } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';
import { generateDocument } from '../../utils/documentGenerator'; 
import FeedbackModal from '../common/FeedbackModal';
import { generatePayslipsPDF } from '../../utils/pdfExport'; 

const formatCurrency = (num) => num ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const formatHours = (hours) => {
    if (!hours || hours <= 0) return '';
    const h = Math.floor(hours);
    const m = Math.round((hours % 1) * 60);
    return `(${h}h ${m}m)`;
};

export default function PayslipDetailView({ details, companyConfig, payPeriod, staffList = [], activeBranch = 'global' }) {
    const [showAbsenceTooltip, setShowAbsenceTooltip] = useState(false);
    const [showLeaveTooltip, setShowLeaveTooltip] = useState(false);
    const [feedbackModal, setFeedbackModal] = useState(null);

    if (!details) return null;

    const actualProfile = staffList.find(s => s.id === details.staffId || s.id === details.id);

    // CORRECTION : Décomposition du nom pour l'en-tête
    const staffName = details.name || details.staffName || actualProfile?.nickname || 'Unknown Staff';
    const nickname = actualProfile?.nickname || details.staffNickname || staffName.split(' ')[0];
    const fullName = actualProfile?.fullName || details.staffFullName || staffName;
    const position = actualProfile?.jobHistory?.[0]?.position || details.position || 'Staff';

    const hasAbsences = details.deductions?.absences > 0;
    const hasAbsenceDetails = hasAbsences && details.deductions?.unpaidAbsences && details.deductions.unpaidAbsences.length > 0;
    const hasLeavePayout = details.earnings?.leavePayout > 0 && details.earnings.leavePayoutDetails;
    const hasOvertime = details.earnings?.overtimePay > 0;
    const hasAttendanceBonus = details.earnings?.attendanceBonus > 0;
    const hasSsoAllowance = details.earnings?.ssoAllowance > 0;
    const hasSsoDeduction = details.deductions?.sso > 0;
    const hasAdvance = details.deductions?.advance > 0;
    const hasLoan = details.deductions?.loan > 0;
    const absenceSummary = formatHours(details.deductions?.totalAbsenceHours);

    const handleGenerateDocxReceipt = async () => {
        const monthNum = details.payPeriodMonth || payPeriod?.month;
        const yearNum = details.payPeriodYear || payPeriod?.year;
        const periodStr = monthNum && yearNum ? `${months[monthNum - 1]} ${yearNum}` : 'Unknown Period';
        const todayStr = dateUtils.formatCustom(new Date(), 'dd/MM/yyyy');
        
        const mockStaff = { 
            ...actualProfile, 
            fullName: staffName,
            paymentMethod: details.paymentMethod || 'cash',
            bankAccount: details.bankAccount || '-',
            idNumber: details.idNumber || '-',
            idType: details.idType || '-',
            jobHistory: actualProfile?.jobHistory || [{ position: details.position || 'Staff', department: 'General' }]
        }; 
        
        const extraData = {
            NET_PAY: formatCurrency(details.netPay),
            NET_PAY_RAW: details.netPay,
            PAY_PERIOD: periodStr,
            PAYMENT_DATE: todayStr
        };

        const result = await generateDocument('receipt', mockStaff, companyConfig, extraData);
        if (!result.success) {
            setFeedbackModal({ type: 'error', title: 'Generation Failed', message: "Erreur lors de la génération : " + result.error });
        }
    };

    const handleExportIndividualPDF = async () => {
        const monthNum = details.payPeriodMonth || payPeriod?.month;
        const yearNum = details.payPeriodYear || payPeriod?.year;
        const fileName = `payslip_${staffName.replace(/ /g, '_')}_${yearNum}_${monthNum}.pdf`;

        try {
            await generatePayslipsPDF(
                [details], 
                companyConfig,
                { month: monthNum, year: yearNum },
                staffList,
                activeBranch,
                fileName
            );
        } catch (error) {
            console.error("PDF Export Error:", error);
            setFeedbackModal({ type: 'error', title: 'Export Failed', message: error.message });
        }
    };

    return (
        <div className="text-white relative">
            <FeedbackModal 
                isOpen={!!feedbackModal} 
                type={feedbackModal?.type} 
                title={feedbackModal?.title} 
                message={feedbackModal?.message} 
                onClose={() => setFeedbackModal(null)} 
            />

            {/* NOUVEL EN-TÊTE DU PROFIL */}
            <div className="flex flex-col items-center justify-center mb-6 pb-5 border-b border-gray-700 bg-gray-900/30 -mx-6 -mt-4 pt-6 rounded-t-xl">
                <div className="w-14 h-14 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center text-xl font-black mb-3">
                    {nickname.substring(0, 2).toUpperCase()}
                </div>
                <h2 className="text-3xl font-black text-white tracking-tight">{nickname}</h2>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">
                    {fullName} <span className="text-gray-600 mx-1">•</span> <span className="text-indigo-400">{position}</span>
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                {/* SECTION EARNINGS */}
                <div className="flex flex-col h-full">
                    <h4 className="font-bold text-lg mb-3 border-b border-gray-600 pb-2 text-indigo-400">Earnings</h4>
                    <div className="space-y-2 text-sm flex-grow font-medium">
                        <div className="flex justify-between"><p className="text-gray-300">Base Pay:</p> <p className="font-mono text-white">{formatCurrency(details.earnings?.basePay)}</p></div>
                        {hasOvertime && <div className="flex justify-between text-green-400"><p>Approved Overtime:</p><p className="font-mono">{formatCurrency(details.earnings.overtimePay)}</p></div>}
                        {hasLeavePayout && (
                            <div className="flex justify-between relative">
                                <div className="flex items-center gap-2">
                                    <p className="text-gray-300">Leave Payout:</p>
                                    <button onMouseEnter={() => setShowLeaveTooltip(true)} onMouseLeave={() => setShowLeaveTooltip(false)} className="text-gray-400 hover:text-white"><Info className="h-4 w-4" /></button>
                                </div>
                                <p className="font-mono text-white">{formatCurrency(details.earnings.leavePayout)}</p>
                                {showLeaveTooltip && (
                                    <div className="absolute top-6 left-0 z-20 bg-gray-900 border border-gray-600 rounded-lg shadow-lg p-3 w-56">
                                        <p className="font-bold text-xs mb-2">Leave Payout Details</p>
                                        <div className="text-xs text-gray-300 space-y-1 font-sans">
                                            <p>Annual Leave: {details.earnings.leavePayoutDetails.annualDays} days</p>
                                            <p>Holiday Credits: {details.earnings.leavePayoutDetails.holidayCredits} days</p>
                                            <p className="border-t border-gray-700 mt-1 pt-1">@ {formatCurrency(details.earnings.leavePayoutDetails.dailyRate)} / day</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {hasAttendanceBonus && <div className="flex justify-between"><p className="text-gray-300">Attendance Bonus:</p> <p className="font-mono text-white">{formatCurrency(details.earnings.attendanceBonus)}</p></div>}
                        {hasSsoAllowance && <div className="flex justify-between"><p className="text-gray-300">SSO Allowance:</p> <p className="font-mono text-white">{formatCurrency(details.earnings.ssoAllowance)}</p></div>}
                        {(details.earnings?.others || []).map((e, i) => <div key={i} className="flex justify-between"><p className="text-gray-300">{e.description}:</p> <p className="font-mono text-white">{formatCurrency(e.amount)}</p></div>)}
                    </div>
                    <div className="flex justify-between font-bold text-base mt-3 pt-3 border-t border-gray-600"><p>Total Earnings:</p> <p className="font-mono text-green-400">{formatCurrency(details.totalEarnings)}</p></div>
                </div>

                {/* SECTION DEDUCTIONS */}
                <div className="flex flex-col h-full">
                    <h4 className="font-bold text-lg mb-3 border-b border-gray-600 pb-2 text-amber-400">Deductions</h4>
                    <div className="space-y-2 text-sm flex-grow font-medium">
                        {hasAbsences && (
                            <div className="flex justify-between relative">
                                <div className="flex items-center gap-2">
                                    <p className="text-gray-300">Absences <span className="text-gray-500 font-mono text-xs">{absenceSummary}</span>:</p>
                                    {hasAbsenceDetails && <button onMouseEnter={() => setShowAbsenceTooltip(true)} onMouseLeave={() => setShowAbsenceTooltip(false)} className="text-gray-400 hover:text-white"><Info className="h-4 w-4" /></button>}
                                </div>
                                <p className="font-mono text-red-400">-{formatCurrency(details.deductions?.absences)}</p>
                                {showAbsenceTooltip && (
                                    <div className="absolute top-6 left-0 z-10 bg-gray-900 border border-gray-600 rounded-lg shadow-lg p-3 w-48">
                                        <p className="font-bold text-xs mb-2">Unpaid Absence Dates</p>
                                        <ul className="list-disc list-inside text-xs text-gray-300 font-sans">
                                            {details.deductions.unpaidAbsences.map(abs => <li key={abs.date}>{dateUtils.formatDisplayDate(abs.date)} <span className="text-gray-500">{formatHours(abs.hours)}</span></li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                        {details.deductions?.lateness > 0 && (
                            <div className="flex justify-between">
                                <p className="text-gray-300">
                                    Attendance Adj. <span className="text-gray-500 font-mono text-xs">({details.deductions.latenessMinutes}m)</span>:
                                </p> 
                                <p className="font-mono text-red-400">-{formatCurrency(details.deductions.lateness)}</p>
                            </div>
                        )}
                        {hasSsoDeduction && <div className="flex justify-between"><p className="text-gray-300">Social Security:</p> <p className="font-mono text-red-400">-{formatCurrency(details.deductions.sso)}</p></div>}
                        {hasAdvance && <div className="flex justify-between"><p className="text-gray-300">Salary Advance:</p> <p className="font-mono text-red-400">-{formatCurrency(details.deductions.advance)}</p></div>}
                        {hasLoan && <div className="flex justify-between"><p className="text-gray-300">Loan Repayment:</p> <p className="font-mono text-red-400">-{formatCurrency(details.deductions.loan)}</p></div>}
                        {(details.deductions?.others || []).map((d, i) => <div key={i} className="flex justify-between"><p className="text-gray-300">{d.description}:</p> <p className="font-mono text-red-400">-{formatCurrency(d.amount)}</p></div>)}
                    </div>
                    <div className="flex justify-between font-bold text-base mt-3 pt-3 border-t border-gray-600"><p>Total Deductions:</p> <p className="font-mono text-red-400">-{formatCurrency(details.totalDeductions)}</p></div>
                </div>
            </div>

            <div className="flex justify-between items-center bg-gray-900 border border-gray-700 p-5 rounded-xl mt-6 shadow-inner">
                <h3 className="text-xl font-bold text-gray-300">NET PAY:</h3>
                <p className="text-3xl font-black text-amber-400 tracking-tight font-mono">{formatCurrency(details.netPay)} <span className="text-sm text-gray-500">THB</span></p>
            </div>

            {/* ACTIONS */}
            <div className="flex flex-wrap justify-end gap-3 mt-6">
                <button 
                    onClick={handleExportIndividualPDF} 
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95"
                >
                    Export Payslip to PDF
                </button>
                {details?.paymentMethod === 'cash' && (
                    <button
                        onClick={handleGenerateDocxReceipt}
                        className="flex items-center px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm shadow-lg transition-all active:scale-95"
                    >
                        <Banknote className="w-4 h-4 mr-2" /> Receipt (Cash) .docx
                    </button>
                )}
            </div>
        </div>
    );
}