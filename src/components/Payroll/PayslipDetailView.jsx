/* src/components/Payroll/PayslipDetailView.jsx */

import React, { useState } from 'react';
import { Info, Banknote } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';
import { generateDocument } from '../../utils/documentGenerator'; 
import FeedbackModal from '../common/FeedbackModal';
import { generatePayslipsPDF } from '../../utils/pdfExport'; // <-- IMPORT DU GÉNÉRATEUR

const formatCurrency = (num) => num ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const formatHours = (hours) => {
    if (!hours || hours <= 0) return '';
    const h = Math.floor(hours);
    const m = Math.round((hours % 1) * 60);
    return `(${h}h ${m}m)`;
};

// AJOUT DE staffList ET activeBranch DANS LES PROPS
export default function PayslipDetailView({ details, companyConfig, payPeriod, staffList = [], activeBranch = 'global' }) {
    const [showAbsenceTooltip, setShowAbsenceTooltip] = useState(false);
    const [showLeaveTooltip, setShowLeaveTooltip] = useState(false);
    const [feedbackModal, setFeedbackModal] = useState(null);

    if (!details) return null;

    const staffName = details.name || details.staffName || 'Unknown Staff';
    const hasAbsences = details.deductions?.unpaidAbsences && details.deductions.unpaidAbsences.length > 0;
    const hasLeavePayout = details.earnings?.leavePayout > 0 && details.earnings.leavePayoutDetails;
    const hasOvertime = details.earnings?.overtimePay > 0;
    const absenceSummary = formatHours(details.deductions?.totalAbsenceHours);

    const handleGenerateDocxReceipt = async () => {
        const monthNum = details.payPeriodMonth || payPeriod?.month;
        const yearNum = details.payPeriodYear || payPeriod?.year;
        const periodStr = monthNum && yearNum ? `${months[monthNum - 1]} ${yearNum}` : 'Unknown Period';
        const todayStr = dateUtils.formatCustom(new Date(), 'dd/MM/yyyy');
        
        const mockStaff = { 
            fullName: staffName,
            paymentMethod: details.paymentMethod || 'cash',
            bankAccount: details.bankAccount || '-',
            idNumber: details.idNumber || '-',
            idType: details.idType || '-',
            jobHistory: [{ position: details.position || details.payType || 'Staff', startDate: new Date().toISOString() }]
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

    // --- LE NOUVEL EXPORT INDIVIDUEL ---
    const handleExportIndividualPDF = async () => {
        const monthNum = details.payPeriodMonth || payPeriod?.month;
        const yearNum = details.payPeriodYear || payPeriod?.year;
        const fileName = `payslip_${staffName.replace(/ /g, '_')}_${yearNum}_${monthNum}.pdf`;

        try {
            await generatePayslipsPDF(
                [details], // On envoie un tableau contenant uniquement cette fiche
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

            <div className="grid grid-cols-2 gap-8 mb-6">
                <div>
                    <h4 className="font-bold text-lg mb-2 border-b border-gray-600 pb-1">Earnings</h4>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><p>Base Pay:</p> <p>{formatCurrency(details.earnings?.basePay)}</p></div>
                        {hasOvertime && <div className="flex justify-between text-green-400"><p>Approved Overtime:</p><p>{formatCurrency(details.earnings.overtimePay)}</p></div>}
                        {hasLeavePayout && (
                            <div className="flex justify-between relative">
                                <div className="flex items-center gap-2">
                                    <p>Leave Payout:</p>
                                    <button onMouseEnter={() => setShowLeaveTooltip(true)} onMouseLeave={() => setShowLeaveTooltip(false)} className="text-gray-400 hover:text-white"><Info className="h-4 w-4" /></button>
                                </div>
                                <p>{formatCurrency(details.earnings.leavePayout)}</p>
                                {showLeaveTooltip && (
                                    <div className="absolute top-6 left-0 z-20 bg-gray-900 border border-gray-600 rounded-lg shadow-lg p-3 w-56">
                                        <p className="font-bold text-xs mb-2">Leave Payout Details</p>
                                        <div className="text-xs text-gray-300 space-y-1">
                                            <p>Annual Leave: {details.earnings.leavePayoutDetails.annualDays} days</p>
                                            <p>Holiday Credits: {details.earnings.leavePayoutDetails.holidayCredits} days</p>
                                            <p className="border-t border-gray-700 mt-1 pt-1">@ {formatCurrency(details.earnings.leavePayoutDetails.dailyRate)} / day</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex justify-between"><p>Attendance Bonus:</p> <p>{formatCurrency(details.earnings?.attendanceBonus)}</p></div>
                        <div className="flex justify-between"><p>SSO Allowance:</p> <p>{formatCurrency(details.earnings?.ssoAllowance)}</p></div>
                        {(details.earnings?.others || []).map((e, i) => <div key={i} className="flex justify-between"><p>{e.description}:</p> <p>{formatCurrency(e.amount)}</p></div>)}
                    </div>
                    <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t border-gray-500"><p>Total Earnings:</p> <p>{formatCurrency(details.totalEarnings)}</p></div>
                </div>
                <div>
                    <h4 className="font-bold text-lg mb-2 border-b border-gray-600 pb-1">Deductions</h4>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between relative">
                            <div className="flex items-center gap-2">
                                <p>Absences {absenceSummary}:</p>
                                {hasAbsences && <button onMouseEnter={() => setShowAbsenceTooltip(true)} onMouseLeave={() => setShowAbsenceTooltip(false)} className="text-gray-400 hover:text-white"><Info className="h-4 w-4" /></button>}
                            </div>
                            <p>{formatCurrency(details.deductions?.absences)}</p>
                            {showAbsenceTooltip && (
                                <div className="absolute top-6 left-0 z-10 bg-gray-900 border border-gray-600 rounded-lg shadow-lg p-3 w-48">
                                    <p className="font-bold text-xs mb-2">Unpaid Absence Dates</p>
                                    <ul className="list-disc list-inside text-xs text-gray-300">
                                        {details.deductions.unpaidAbsences.map(abs => <li key={abs.date}>{dateUtils.formatDisplayDate(abs.date)} <span className="text-gray-400">{formatHours(abs.hours)}</span></li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-between"><p>Social Security:</p> <p>{formatCurrency(details.deductions?.sso)}</p></div>
                        <div className="flex justify-between"><p>Salary Advance:</p> <p>{formatCurrency(details.deductions?.advance)}</p></div>
                        <div className="flex justify-between"><p>Loan Repayment:</p> <p>{formatCurrency(details.deductions?.loan)}</p></div>
                        {(details.deductions?.others || []).map((d, i) => <div key={i} className="flex justify-between"><p>{d.description}:</p> <p>{formatCurrency(d.amount)}</p></div>)}
                    </div>
                    <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t border-gray-500"><p>Total Deductions:</p> <p>{formatCurrency(details.totalDeductions)}</p></div>
                </div>
            </div>
            <div className="flex justify-between items-center bg-gray-900 p-4 rounded-lg mt-6">
                <h3 className="text-xl font-bold">NET PAY:</h3><p className="text-2xl font-bold text-amber-400">{formatCurrency(details.netPay)} THB</p>
            </div>
            <div className="flex justify-end mt-6">
                <button onClick={handleExportIndividualPDF} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-semibold">Export Payslip to PDF</button>
                {details?.paymentMethod === 'cash' && (
                    <button
                        onClick={handleGenerateDocxReceipt}
                        className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm shadow-lg ml-2"
                    >
                        <Banknote className="w-4 h-4 mr-2" /> Receipt (Cash) .docx
                    </button>
                )}
            </div>
        </div>
    );
}