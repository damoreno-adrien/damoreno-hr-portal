/* src/utils/pdfExport.js */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as dateUtils from './dateUtils';

export const exportFinancialsPDF = ({ 
    activeTab, 
    displayedMonthlyTransactions, 
    payPeriod, 
    months, 
    activeBranch, 
    companyConfig 
}) => {
    const doc = new jsPDF();
    const periodStr = `${months[payPeriod.month - 1]} ${payPeriod.year}`;
    
    let reportTitle = `Financial Records - ${periodStr}`;
    if (activeTab === 'advances') reportTitle = `Monthly Advances - ${periodStr}`;
    if (activeTab === 'loans') reportTitle = `Active Loans - ${periodStr}`;
    if (activeTab === 'adjustments') reportTitle = `Monthly Adjustments - ${periodStr}`;

    doc.setFontSize(14);
    doc.text(reportTitle, 14, 15);

    const isLoans = activeTab === 'loans';

    // Configuration des en-têtes selon le contexte
    const tableHead = isLoans 
        ? [['Staff Name', 'Loan Detail', 'Start Date', 'Monthly Ded.', 'Balance / Total', 'Progress']]
        : [['Staff Name', 'Type', 'Date', 'Amount (THB)', 'Status']];

    // Construction du corps du tableau
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