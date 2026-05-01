/* src/utils/pdfExport.js */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as dateUtils from './dateUtils';

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
        styles: { fontSize: 9 },
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
            startY: 35, theme: 'plain', styles: { fontSize: 10 }
        });

        // 6. CALCULS
        const hasOvertime = details.earnings?.overtimePay > 0;
        const hasLeavePayout = details.earnings?.leavePayout > 0 && details.earnings.leavePayoutDetails;
        const absenceSummary = formatHours(details.deductions?.totalAbsenceHours);

        let earningsBody = [
            ['Base Pay', formatCurrency(details.earnings?.basePay)],
            ['Attendance Bonus', formatCurrency(details.earnings?.attendanceBonus)],
            ['Social Security Allowance', formatCurrency(details.earnings?.ssoAllowance)],
            ...(details.earnings?.others || []).map(e => [e.description, formatCurrency(e.amount)])
        ];

        if (hasOvertime) earningsBody.splice(1, 0, ['Approved Overtime', formatCurrency(details.earnings.overtimePay)]);
        if (hasLeavePayout) earningsBody.splice(1, 0, ['Leave Payout', formatCurrency(details.earnings.leavePayout)]);

        const deductionsBody = [
            [`Absences ${absenceSummary}`, formatCurrency(details.deductions?.absences)],
            ['Social Security', formatCurrency(details.deductions?.sso)],
            ['Salary Advance', formatCurrency(details.deductions?.advance)],
            ['Loan Repayment', formatCurrency(details.deductions?.loan)],
            ...(details.deductions?.others || []).map(d => [d.description, formatCurrency(d.amount)])
        ];

        // 7. RENDU TABLEAUX
        autoTable(docPDF, { head: [['Earnings', 'Amount (THB)']], body: earningsBody, foot: [['Total Earnings', formatCurrency(details.totalEarnings)]], startY: docPDF.lastAutoTable.finalY + 2, theme: 'grid', headStyles: { fillColor: [23, 23, 23] }, footStyles: { fillColor: [41, 41, 41], fontStyle: 'bold' } });
        autoTable(docPDF, { head: [['Deductions', 'Amount (THB)']], body: deductionsBody, foot: [['Total Deductions', formatCurrency(details.totalDeductions)]], startY: docPDF.lastAutoTable.finalY + 2, theme: 'grid', headStyles: { fillColor: [23, 23, 23] }, footStyles: { fillColor: [41, 41, 41], fontStyle: 'bold' } });

        // 8. FOOTER
        docPDF.setFontSize(14); docPDF.setFont('helvetica', 'bold');
        docPDF.text("Net Pay:", 14, docPDF.lastAutoTable.finalY + 10);
        docPDF.text(`${formatCurrency(details.netPay)} THB`, 196, docPDF.lastAutoTable.finalY + 10, { align: 'right' });
    }

    docPDF.save(defaultFileName);
};