/* src/utils/pdfExport.js */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as dateUtils from './dateUtils';
import { THAI_FONT_BASE64 } from './thaiFont.js';

const formatCurrency = (num) => num ? num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

const formatHours = (hours) => {
    if (!hours || hours <= 0) return '';
    const h = Math.floor(hours);
    const m = Math.round((hours % 1) * 60);
    return `(${h}h ${m}m)`;
};

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ============================================================================
// 1. L'EXPORT EXISTANT POUR LES FINANCES
// ============================================================================
export const exportFinancialsPDF = ({ activeTab, displayedMonthlyTransactions, payPeriod, months, activeBranch, companyConfig }) => {
    const doc = new jsPDF();
    doc.addFileToVFS('Sarabun-Regular.ttf', THAI_FONT_BASE64);
    doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
    doc.setFont('Sarabun');

    const periodStr = `${months[payPeriod.month - 1]} ${payPeriod.year}`;

    let reportTitle = `Financial Records - ${periodStr}`;
    if (activeTab === 'advances') reportTitle = `Monthly Advances - ${periodStr}`;
    if (activeTab === 'loans') reportTitle = `Active Loans - ${periodStr}`;
    if (activeTab === 'adjustments') reportTitle = `Monthly Adjustments - ${periodStr}`;

    doc.setFontSize(14);
    doc.text(reportTitle, 14, 15);

    const isLoans = activeTab === 'loans';

    const tableHead = isLoans
        ? [['Staff Name', 'Loan Detail', 'Start Date', 'Monthly Ded.', 'Balance / Total', 'Progress']]
        : [['Staff Name', 'Type', 'Date', 'Amount (THB)', 'Status']];

    const tableBody = displayedMonthlyTransactions.map(item => {
        let name = item.staffName;
        if (activeBranch === 'global' && item.staff?.branchId) {
            const bName = companyConfig?.branches?.find(b => b.id === item.staff.branchId)?.name || item.staff.branchId;
            name += ` (${bName.replace('Da Moreno ', '')})`;
        }

        const dateStr = item.date ? dateUtils.formatCustom(new Date(item.date), 'dd/MM/yyyy') : '';

        if (isLoans) {
            const total = Number(item.amount) || Number(item.raw?.amount) || Number(item.raw?.loanAmount) || 0;
            const remaining = Number(item.raw?.remainingBalance) || 0;
            const monthly = Number(item.raw?.monthlyRepayment || item.raw?.monthlyAmount || 0);
            const paid = Math.max(0, total - remaining);
            const progress = total > 0 ? Math.round((paid / total) * 100) : 0;

            return [
                name,
                item.raw?.loanName || 'Long-Term Loan',
                dateStr,
                monthly.toLocaleString(),
                `${remaining.toLocaleString()} / ${total.toLocaleString()}`,
                `${progress}%`
            ];
        } else {
            return [
                name,
                item.type,
                dateStr,
                (Number(item.amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }),
                item.status.toUpperCase()
            ];
        }
    });

    autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: 25,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { font: 'Sarabun', fontSize: 9 },
        columnStyles: isLoans
            ? { 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' }, 5: { halign: 'center', textColor: [34, 197, 94] } }
            : { 3: { halign: 'right', fontStyle: 'bold' } }
    });

    doc.save(`financials_${activeTab}_${payPeriod.year}_${String(payPeriod.month).padStart(2, '0')}.pdf`);
};

// ============================================================================
// 2. EXPORT UNIVERSEL POUR LES FICHES DE PAIE
// ============================================================================
export const generatePayslipsPDF = async (payslipsArray, companyConfig, payPeriod, staffList, activeBranch, defaultFileName = 'Payslips.pdf') => {
    if (!payslipsArray || payslipsArray.length === 0) return;

    const docPDF = new jsPDF();
    docPDF.addFileToVFS('Sarabun-Regular.ttf', THAI_FONT_BASE64);
    docPDF.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
    docPDF.setFont('Sarabun');

    const logoCache = {}; 

    for (let i = 0; i < payslipsArray.length; i++) {
        const details = payslipsArray[i];
        if (i > 0) docPDF.addPage();

        const staffA = staffList?.find(s => s.id === details.staffId || s.id === details.id);
        const staffBranchId = staffA?.branchId;

        const branchSpecificConfig = (staffBranchId && companyConfig?.branchSettings?.[staffBranchId])
            ? companyConfig.branchSettings[staffBranchId]
            : companyConfig;

        const cName = branchSpecificConfig?.companyName || companyConfig?.companyName || '[Company Name Missing]';
        const cAddress = branchSpecificConfig?.companyAddress || companyConfig?.companyAddress || '[Company Address Missing]';
        const cTaxId = branchSpecificConfig?.companyTaxId || companyConfig?.companyTaxId || '[Tax ID Missing]';
        const cLogo = branchSpecificConfig?.companyLogoUrl || companyConfig?.companyLogoUrl || null;

        // --- GESTION DES NOMS (FULL NAME VS NICKNAME) ---
        // Pour le champ "Employee Name" (Légal)
        const fullName = staffA 
            ? `${staffA.firstName || ''} ${staffA.lastName || ''}`.trim() 
            : (details.staffName || details.name || '[Staff Name Missing]');

        // Pour le titre sous "Salary Statement" (Adrien (Town))
        const staffNickname = staffA?.nickname || staffA?.firstName || 'Staff';

        const job = staffA?.jobHistory ? [...staffA.jobHistory].sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0))[0] : {};
        const departmentStr = job?.department || '[Department Missing]';

        const monthNum = details.payPeriodMonth || payPeriod?.month;
        const yearNum = details.payPeriodYear || payPeriod?.year;
        const payPeriodTitle = monthNum && yearNum ? `${months[monthNum - 1]} ${yearNum}` : '[Unknown Period]';

        // 4. INJECTION DU LOGO
        let base64Logo = null;
        if (cLogo) {
            if (logoCache[cLogo]) {
                base64Logo = logoCache[cLogo];
            } else {
                try {
                    const response = await fetch(cLogo);
                    const blob = await response.blob();
                    const reader = new FileReader();
                    base64Logo = await new Promise((resolve, reject) => {
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                    logoCache[cLogo] = base64Logo;
                } catch (error) { console.error("Logo fetch error:", error); }
            }
        }

        if (base64Logo) {
            const img = new Image();
            img.src = base64Logo;
            await new Promise(resolve => { img.onload = resolve; });
            const pdfLogoWidth = 30;
            const pdfLogoHeight = (img.height * pdfLogoWidth) / img.width;
            const pageWidth = docPDF.internal.pageSize.getWidth();
            docPDF.addImage(base64Logo, 'PNG', pageWidth - pdfLogoWidth - 14, 10, pdfLogoWidth, pdfLogoHeight);
        }

        // 5. EN-TÊTES
        docPDF.setFontSize(18);
        docPDF.text("Salary Statement", 105, 15, { align: 'center' });
        docPDF.setFontSize(12);
        docPDF.text(`Month: ${payPeriodTitle}`, 105, 22, { align: 'center' });

        autoTable(docPDF, {
            body: [
                [{ content: 'Employee Name:', styles: { fontStyle: 'bold' } }, fullName], // <-- Full Name
                [{ content: 'Company:', styles: { fontStyle: 'bold' } }, cName],
                [{ content: 'Address:', styles: { fontStyle: 'bold' } }, cAddress],
                [{ content: 'Tax ID:', styles: { fontStyle: 'bold' } }, cTaxId],
                [{ content: 'Department:', styles: { fontStyle: 'bold' } }, departmentStr],
                [{ content: 'Position:', styles: { fontStyle: 'bold' } }, details.position || details.payType || '[Position Missing]'],
                [{ content: 'Payment Method:', styles: { fontStyle: 'bold' } }, details.paymentMethod === 'cash' ? 'Cash' : 'Bank Transfer']
            ],
            startY: 35, theme: 'plain', styles: { font: 'Sarabun', fontSize: 10 }
        });

        // 6. CALCULS (Rendu conditionnel : on masque les lignes à 0)
        const hasOvertime = details.earnings?.overtimePay > 0;
        const hasLeavePayout = details.earnings?.leavePayout > 0 && details.earnings.leavePayoutDetails;
        const absenceSummary = formatHours(details.deductions?.totalAbsenceHours);

        let earningsBody = [
            ['Base Pay', formatCurrency(details.earnings?.basePay)],
        ];
        if (hasLeavePayout) earningsBody.push(['Leave Payout', formatCurrency(details.earnings.leavePayout)]);
        if (hasOvertime) earningsBody.push(['Approved Overtime', formatCurrency(details.earnings.overtimePay)]);
        if (details.earnings?.attendanceBonus > 0) earningsBody.push(['Attendance Bonus', formatCurrency(details.earnings.attendanceBonus)]);
        if (details.earnings?.ssoAllowance > 0) earningsBody.push(['Social Security Allowance', formatCurrency(details.earnings.ssoAllowance)]);
        earningsBody.push(...(details.earnings?.others || []).map(e => [e.description, formatCurrency(e.amount)]));

        const deductionsBody = [];
        if (details.deductions?.absences > 0) deductionsBody.push([`Absences ${absenceSummary}`, formatCurrency(details.deductions.absences)]);
        if (details.deductions?.sso > 0) deductionsBody.push(['Social Security', formatCurrency(details.deductions.sso)]);
        if (details.deductions?.advance > 0) deductionsBody.push(['Salary Advance', formatCurrency(details.deductions.advance)]);
        if (details.deductions?.loan > 0) deductionsBody.push(['Loan Repayment', formatCurrency(details.deductions.loan)]);
        deductionsBody.push(...(details.deductions?.others || []).map(d => [d.description, formatCurrency(d.amount)]));

        // 7. RENDU TABLEAUX
        autoTable(docPDF, { head: [['Earnings', 'Amount (THB)']], body: earningsBody, foot: [['Total Earnings', formatCurrency(details.totalEarnings)]], startY: docPDF.lastAutoTable.finalY + 2, theme: 'grid', headStyles: { fillColor: [23, 23, 23] }, footStyles: { fillColor: [41, 41, 41], fontStyle: 'bold' }, styles: { font: 'Sarabun' } });
        autoTable(docPDF, { head: [['Deductions', 'Amount (THB)']], body: deductionsBody, foot: [['Total Deductions', formatCurrency(details.totalDeductions)]], startY: docPDF.lastAutoTable.finalY + 2, theme: 'grid', headStyles: { fillColor: [23, 23, 23] }, footStyles: { fillColor: [41, 41, 41], fontStyle: 'bold' }, styles: { font: 'Sarabun' } });

        // 8. FOOTER
        docPDF.setFontSize(14); docPDF.setFont('helvetica', 'bold');
        docPDF.text("Net Pay:", 14, docPDF.lastAutoTable.finalY + 10);
        docPDF.text(`${formatCurrency(details.netPay)} THB`, 196, docPDF.lastAutoTable.finalY + 10, { align: 'right' });
    }

    docPDF.save(defaultFileName);
};

// ============================================================================
// 3. EXPORT INDIVIDUEL DU PROFIL STAFF (RAPPORT PDF SUR MESURE)
// ============================================================================
const formatPayRateForExport = (job) => {
    if (!job) return 'N/A';

    if (job.payType === 'Hourly') {
        const r = job.hourlyRate || job.rate;
        return typeof r === 'number' ? `${r.toLocaleString()} THB / hr` : 'N/A';
    }

    const salary = job.baseSalary || job.rate;
    const hours = job.standardDayHours || 8;

    return typeof salary === 'number'
        ? `${salary.toLocaleString()} THB / mo (${hours}h/day)`
        : 'N/A';
};

export const exportIndividualStaffProfile = async ({ staff, companyConfig, options = {} }) => {
    if (!staff) return;

    const docPDF = new jsPDF();
    docPDF.addFileToVFS('Sarabun-Regular.ttf', THAI_FONT_BASE64);
    docPDF.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
    docPDF.setFont('Sarabun');

    const pageWidth = docPDF.internal.pageSize.getWidth();

    const staffBranchId = staff.branchId;
    const branchSpecificConfig = (staffBranchId && companyConfig?.branchSettings?.[staffBranchId])
        ? companyConfig.branchSettings[staffBranchId]
        : companyConfig;

    const cLogo = branchSpecificConfig?.companyLogoUrl || companyConfig?.companyLogoUrl || null;

    // --- Logo (top-right, mirrors payslip PDF behavior) ---
    if (cLogo) {
        try {
            const response = await fetch(cLogo);
            const blob = await response.blob();
            const reader = new FileReader();
            const base64Logo = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const img = new Image();
            img.src = base64Logo;
            await new Promise(resolve => { img.onload = resolve; });
            const pdfLogoWidth = 28;
            const pdfLogoHeight = (img.height * pdfLogoWidth) / img.width;
            docPDF.addImage(base64Logo, 'PNG', pageWidth - pdfLogoWidth - 14, 10, pdfLogoWidth, pdfLogoHeight);
        } catch (error) {
            console.error("Logo fetch error (Staff Profile Export):", error);
        }
    }

    // --- Header ---
    const displayName = staff.firstName ? `${staff.firstName} ${staff.lastName}` : (staff.fullName || 'Staff Member');

    docPDF.setFontSize(18);
    docPDF.setFont('helvetica', 'bold');
    docPDF.text("Staff Profile Report", 14, 20);

    docPDF.setFontSize(11);
    docPDF.setFont('helvetica', 'normal');
    docPDF.text(displayName, 14, 28);

    docPDF.setFontSize(9);
    docPDF.setTextColor(120, 120, 120);
    docPDF.text(`Generated on: ${dateUtils.formatCustom(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 34);
    docPDF.setTextColor(0, 0, 0);

    let currentY = 42;

    const currentJob = [...(staff.jobHistory || [])].sort((a, b) => {
        return new Date(b.startDate || 0) - new Date(a.startDate || 0);
    })[0] || {};

    // --- Section: Personal Information ---
    if (options.includePersonal) {
        const bankDisplay = (staff.bankName && staff.bankAccountNumber)
            ? `${staff.bankName} - ${staff.bankAccountNumber}`
            : (staff.bankAccount || 'N/A');

        const ssoStatus = staff.isSsoRegistered !== false ? 'Enrolled' : 'Not Enrolled';
        const ssoAllowanceStatus = staff.isSsoRegistered !== false
            ? (staff.receivesSsoAllowance !== false ? 'Covered by Company' : 'Paid by Staff')
            : 'N/A';

        docPDF.setFontSize(12);
        docPDF.setFont('helvetica', 'bold');
        docPDF.text('Personal Information', 14, currentY);
        currentY += 4;

        autoTable(docPDF, {
            body: [
                [{ content: 'Legal Name:', styles: { fontStyle: 'bold' } }, displayName],
                [{ content: 'Nickname:', styles: { fontStyle: 'bold' } }, staff.nickname || 'N/A'],
                [{ content: 'Email:', styles: { fontStyle: 'bold' } }, staff.email || 'N/A'],
                [{ content: 'Phone Number:', styles: { fontStyle: 'bold' } }, staff.phoneNumber || 'N/A'],
                [{ content: 'Birthdate:', styles: { fontStyle: 'bold' } }, staff.birthdate ? dateUtils.formatDisplayDate(dateUtils.fromFirestore(staff.birthdate)) : 'N/A'],
                [{ content: 'Address:', styles: { fontStyle: 'bold' } }, staff.address || 'N/A'],
                [{ content: 'Emergency Contact:', styles: { fontStyle: 'bold' } }, `${staff.emergencyContactName || 'N/A'} (${staff.emergencyContactPhone || 'N/A'})`],
                [{ content: 'Bank Account:', styles: { fontStyle: 'bold' } }, bankDisplay],
                [{ content: 'ID Document:', styles: { fontStyle: 'bold' } }, `${(staff.idType && staff.idType !== 'None') ? staff.idType : 'N/A'} - ${staff.idNumber || 'N/A'}`],
                [{ content: 'SSO Status:', styles: { fontStyle: 'bold' } }, ssoStatus],
                [{ content: 'SSO Allowance:', styles: { fontStyle: 'bold' } }, ssoAllowanceStatus],
            ],
            startY: currentY,
            theme: 'plain',
            styles: { font: 'Sarabun', fontSize: 10, cellPadding: 1.5, minCellHeight: 6 },
            columnStyles: { 0: { cellWidth: 45 } }
        });

        currentY = docPDF.lastAutoTable.finalY + 8;
    }

    // --- Section: Job & Financials ---
    if (options.includeJob) {
        if (currentY > 260) { docPDF.addPage(); currentY = 20; }

        docPDF.setFontSize(12);
        docPDF.setFont('helvetica', 'bold');
        docPDF.text('Job & Financials', 14, currentY);
        currentY += 4;

        autoTable(docPDF, {
            body: [
                [{ content: 'Department:', styles: { fontStyle: 'bold' } }, currentJob.department || 'N/A'],
                [{ content: 'Position:', styles: { fontStyle: 'bold' } }, currentJob.position || 'N/A'],
                [{ content: 'Start Date:', styles: { fontStyle: 'bold' } }, staff.startDate ? dateUtils.formatDisplayDate(dateUtils.fromFirestore(staff.startDate)) : 'N/A'],
                [{ content: 'Seniority:', styles: { fontStyle: 'bold' } }, dateUtils.formatSeniority(staff.startDate, staff.endDate) || 'N/A'],
                [{ content: 'Pay Type:', styles: { fontStyle: 'bold' } }, currentJob.payType || 'N/A'],
                [{ content: 'Pay Rate:', styles: { fontStyle: 'bold' } }, formatPayRateForExport(currentJob)],
            ],
            startY: currentY,
            theme: 'plain',
            styles: { font: 'Sarabun', fontSize: 10, cellPadding: 1.5, minCellHeight: 6 },
            columnStyles: { 0: { cellWidth: 45 } }
        });

        currentY = docPDF.lastAutoTable.finalY + 8;

        // --- Job & Salary History (only if more than one entry exists) ---
        if (staff.jobHistory && staff.jobHistory.length > 1) {
            if (currentY > 250) { docPDF.addPage(); currentY = 20; }

            docPDF.setFontSize(12);
            docPDF.setFont('helvetica', 'bold');
            docPDF.text('Job & Salary History', 14, currentY);
            currentY += 4;

            const sortedHistory = [...staff.jobHistory].sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));

            const historyBody = sortedHistory.map(job => [
                job.startDate ? dateUtils.formatDisplayDate(dateUtils.fromFirestore(job.startDate)) : 'N/A',
                job.department || 'N/A',
                job.position || 'N/A',
                formatPayRateForExport(job)
            ]);

            autoTable(docPDF, {
                head: [['Start Date', 'Department', 'Position', 'Pay Rate']],
                body: historyBody,
                startY: currentY,
                theme: 'grid',
                headStyles: { fillColor: [79, 70, 229] },
                styles: { font: 'Sarabun', fontSize: 8, cellPadding: 1.5, minCellHeight: 6 },
            });

            currentY = docPDF.lastAutoTable.finalY + 10;
        }
    }

    // --- Section: HR Settings ---
    if (options.includeHR) {
        if (currentY > 260) { docPDF.addPage(); currentY = 20; }

        docPDF.setFontSize(12);
        docPDF.setFont('helvetica', 'bold');
        docPDF.text('HR Settings', 14, currentY);
        currentY += 4;

        const hrBody = [
            [{ content: 'Status:', styles: { fontStyle: 'bold' } }, (staff.status === 'inactive' || staff.status === 'archived') ? 'Inactive' : 'Active'],
        ];

        // Bonus Streak: only show if the staff member is actually eligible for the attendance bonus.
        if (staff.isAttendanceBonusEligible !== false) {
            hrBody.push([{ content: 'Bonus Streak:', styles: { fontStyle: 'bold' } }, `${staff.bonusStreak || 0} months`]);
        }

        hrBody.push([{ content: 'Holiday Policy:', styles: { fontStyle: 'bold' } }, staff.holidayPolicy === 'paid' ? 'Paid (Cash payout)' : 'In Lieu (Substitute days off)']);

        autoTable(docPDF, {
            body: hrBody,
            startY: currentY,
            theme: 'plain',
            styles: { font: 'Sarabun', fontSize: 10, cellPadding: 1.5, minCellHeight: 6 },
            columnStyles: { 0: { cellWidth: 45 } }
        });

        currentY = docPDF.lastAutoTable.finalY + 8;

        // --- Offboarding Details (only if staff is inactive/archived) ---
        if (staff.status === 'archived' || staff.status === 'inactive') {
            if (currentY > 260) { docPDF.addPage(); currentY = 20; }

            docPDF.setFontSize(12);
            docPDF.setFont('helvetica', 'bold');
            docPDF.text('Offboarding Details', 14, currentY);
            currentY += 4;

            autoTable(docPDF, {
                body: [
                    [{ content: 'Last Day of Employment:', styles: { fontStyle: 'bold' } }, staff.endDate ? dateUtils.formatDisplayDate(dateUtils.fromFirestore(staff.endDate)) : 'N/A'],
                    [{ content: 'Termination Type:', styles: { fontStyle: 'bold' } }, staff.offboardingSettings?.terminationType || 'N/A'],
                ],
                startY: currentY,
                theme: 'plain',
                styles: { font: 'Sarabun', fontSize: 10, cellPadding: 1.5, minCellHeight: 6 },
                columnStyles: { 0: { cellWidth: 55 } }
            });

            currentY = docPDF.lastAutoTable.finalY + 8;
        }
    }

    // --- Section: Appendix - Official Documents ---
    if (options.includeDocuments) {
        const documents = staff.documents || [];

        if (documents.length > 0) {
            if (currentY > 250) { docPDF.addPage(); currentY = 20; }

            docPDF.setFontSize(12);
            docPDF.setFont('helvetica', 'bold');
            docPDF.text('Appendix: Official Documents', 14, currentY);
            currentY += 4;

            const docsBody = documents.map(d => [
                d.name || 'Untitled Document',
                d.uploadedAt ? dateUtils.formatDisplayDate(dateUtils.fromFirestore(d.uploadedAt)) : 'N/A',
                d.expiryDate ? dateUtils.formatDisplayDate(new Date(d.expiryDate)) : 'N/A',
                d.url ? 'View Document' : 'N/A'
            ]);

            autoTable(docPDF, {
                head: [['Document Name', 'Uploaded', 'Expires', 'Link']],
                body: docsBody,
                startY: currentY,
                theme: 'grid',
                headStyles: { fillColor: [79, 70, 229] },
                styles: { font: 'Sarabun', fontSize: 8, cellPadding: 1.5, minCellHeight: 6 },
                columnStyles: { 3: { textColor: [37, 99, 235] } },
                didDrawCell: (data) => {
                    // Make the entire "Link" cell clickable, opening the raw Firebase Storage URL
                    // without ever printing the raw URL text in the PDF itself.
                    if (data.section === 'body' && data.column.index === 3) {
                        const rawUrl = documents[data.row.index]?.url;
                        if (rawUrl) {
                            docPDF.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: rawUrl });
                        }
                    }
                }
            });

            currentY = docPDF.lastAutoTable.finalY + 10;
        }
    }

    const safeFirstName = (staff.firstName || 'Staff').replace(/\s+/g, '_');
    const safeLastName = (staff.lastName || '').replace(/\s+/g, '_');
    const fileName = `Staff_Profile_${safeFirstName}_${safeLastName}.pdf`;

    docPDF.save(fileName);
};
