import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { InfoIcon } from './Icons';

const formatCurrency = (num) => num ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function PayslipDetailView({ details, companyConfig, payPeriod }) {
    const [showAbsenceTooltip, setShowAbsenceTooltip] = useState(false);
    const [showLeaveTooltip, setShowLeaveTooltip] = useState(false);

    if (!details) return null;

    const hasAbsenceDates = details.deductions.absenceDates && details.deductions.absenceDates.length > 0;
    const hasLeavePayout = details.earnings.leavePayout > 0 && details.earnings.leavePayoutDetails;

    const handleExportIndividualPDF = async () => {
        const doc = new jsPDF();
        const payPeriodTitle = `${months[payPeriod.month - 1]} ${payPeriod.year}`;

        if (companyConfig?.companyLogoUrl) {
            try {
                const response = await fetch(companyConfig.companyLogoUrl);
                const blob = await response.blob();
                const reader = new FileReader();
                const base64Image = await new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });

                // --- NEW: Calculate logo dimensions to maintain aspect ratio ---
                const img = new Image();
                img.src = base64Image;
                await new Promise(resolve => { img.onload = resolve; });

                const pdfLogoWidth = 30; // Set a fixed width for the logo
                const pdfLogoHeight = (img.height * pdfLogoWidth) / img.width; // Calculate height based on aspect ratio
                
                doc.addImage(base64Image, 'PNG', 14, 10, pdfLogoWidth, pdfLogoHeight);

            } catch (error) {
                console.error("Error loading company logo for PDF:", error);
            }
        }
        
        doc.setFontSize(18);
        doc.text("Salary Statement", 105, 15, { align: 'center' });
        doc.setFontSize(12);
        doc.text(`Month: ${payPeriodTitle}`, 105, 22, { align: 'center' });

        autoTable(doc, {
            body: [
                [{ content: 'Employee Name:', styles: { fontStyle: 'bold' } }, details.name],
                [{ content: 'Company:', styles: { fontStyle: 'bold' } }, companyConfig?.companyName || ''],
                [{ content: 'Address:', styles: { fontStyle: 'bold' } }, companyConfig?.companyAddress || ''],
                [{ content: 'Tax ID:', styles: { fontStyle: 'bold' } }, companyConfig?.companyTaxId || ''],
                [{ content: 'Position:', styles: { fontStyle: 'bold' } }, details.payType],
            ],
            startY: 30,
            theme: 'plain',
            styles: { fontSize: 10 },
        });

        let earningsBody = [
            ['Base Pay', formatCurrency(details.earnings.basePay)],
            ['Attendance Bonus', formatCurrency(details.earnings.attendanceBonus)],
            ['Social Security Allowance', formatCurrency(details.earnings.ssoAllowance)],
            ...details.earnings.others.map(e => [e.description, formatCurrency(e.amount)])
        ];

        if (hasLeavePayout) {
            earningsBody.splice(1, 0, ['Leave Payout', formatCurrency(details.earnings.leavePayout)]);
        }
        
        // --- NEW: Use a summarized absence count for the PDF ---
        const absenceLabel = hasAbsenceDates
            ? `Absences (${details.deductions.absenceDates.length} days)`
            : 'Absences';
            
        const deductionsBody = [
            [absenceLabel, formatCurrency(details.deductions.absences)],
            ['Social Security', formatCurrency(details.deductions.sso)],
            ['Salary Advance', formatCurrency(details.deductions.advance)],
            ['Loan Repayment', formatCurrency(details.deductions.loan)],
            ...details.deductions.others.map(d => [d.description, formatCurrency(d.amount)])
        ];

        autoTable(doc, { head: [['Earnings', 'Amount (THB)']], body: earningsBody, foot: [['Total Earnings', formatCurrency(details.totalEarnings)]], startY: doc.lastAutoTable.finalY + 2, theme: 'grid', headStyles: { fillColor: [23, 23, 23] }, footStyles: { fillColor: [41, 41, 41], fontStyle: 'bold' } });
        autoTable(doc, { head: [['Deductions', 'Amount (THB)']], body: deductionsBody, foot: [['Total Deductions', formatCurrency(details.totalDeductions)]], startY: doc.lastAutoTable.finalY + 2, theme: 'grid', headStyles: { fillColor: [23, 23, 23] }, footStyles: { fillColor: [41, 41, 41], fontStyle: 'bold' } });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text("Net Pay:", 14, doc.lastAutoTable.finalY + 10);
        doc.text(`${formatCurrency(details.netPay)} THB`, 196, doc.lastAutoTable.finalY + 10, { align: 'right' });
        
        doc.save(`payslip_${details.name.replace(' ', '_')}_${payPeriod.year}_${payPeriod.month}.pdf`);
    };

    return (
        <div className="text-white">
            <div className="grid grid-cols-2 gap-8 mb-6">
                <div>
                    <h4 className="font-bold text-lg mb-2 border-b border-gray-600 pb-1">Earnings</h4>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><p>Base Pay:</p> <p>{formatCurrency(details.earnings.basePay)}</p></div>
                        
                        {hasLeavePayout && (
                             <div className="flex justify-between relative">
                                <div className="flex items-center gap-2">
                                    <p>Leave Payout:</p>
                                    <button onMouseEnter={() => setShowLeaveTooltip(true)} onMouseLeave={() => setShowLeaveTooltip(false)} className="text-gray-400 hover:text-white">
                                        <InfoIcon className="h-4 w-4" />
                                    </button>
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

                        <div className="flex justify-between"><p>Attendance Bonus:</p> <p>{formatCurrency(details.earnings.attendanceBonus)}</p></div>
                        <div className="flex justify-between"><p>SSO Allowance:</p> <p>{formatCurrency(details.earnings.ssoAllowance)}</p></div>
                        {details.earnings.others.map((e, i) => <div key={i} className="flex justify-between"><p>{e.description}:</p> <p>{formatCurrency(e.amount)}</p></div>)}
                    </div>
                    <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t border-gray-500"><p>Total Earnings:</p> <p>{formatCurrency(details.totalEarnings)}</p></div>
                </div>
                 <div>
                    <h4 className="font-bold text-lg mb-2 border-b border-gray-600 pb-1">Deductions</h4>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between relative">
                            <div className="flex items-center gap-2">
                                <p>Absences:</p>
                                {hasAbsenceDates && (
                                    <button onMouseEnter={() => setShowAbsenceTooltip(true)} onMouseLeave={() => setShowAbsenceTooltip(false)} className="text-gray-400 hover:text-white">
                                        <InfoIcon className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            <p>{formatCurrency(details.deductions.absences)}</p>
                            
                            {showAbsenceTooltip && (
                                <div className="absolute top-6 left-0 z-10 bg-gray-900 border border-gray-600 rounded-lg shadow-lg p-3 w-48">
                                    <p className="font-bold text-xs mb-2">Unpaid Absence Dates</p>
                                    <ul className="list-disc list-inside text-xs text-gray-300">
                                        {details.deductions.absenceDates.map(date => <li key={date}>{date}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-between"><p>Social Security:</p> <p>{formatCurrency(details.deductions.sso)}</p></div>
                        <div className="flex justify-between"><p>Salary Advance:</p> <p>{formatCurrency(details.deductions.advance)}</p></div>
                        <div className="flex justify-between"><p>Loan Repayment:</p> <p>{formatCurrency(details.deductions.loan)}</p></div>
                        {details.deductions.others.map((d, i) => <div key={i} className="flex justify-between"><p>{d.description}:</p> <p>{formatCurrency(d.amount)}</p></div>)}
                    </div>
                    <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t border-gray-500"><p>Total Deductions:</p> <p>{formatCurrency(details.totalDeductions)}</p></div>
                </div>
            </div>
            <div className="flex justify-between items-center bg-gray-900 p-4 rounded-lg mt-6">
                <h3 className="text-xl font-bold">NET PAY:</h3><p className="text-2xl font-bold text-amber-400">{formatCurrency(details.netPay)} THB</p>
            </div>
            <div className="flex justify-end mt-6"><button onClick={handleExportIndividualPDF} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-semibold">Export This Payslip to PDF</button></div>
        </div>
    );
};