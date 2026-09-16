/* src/utils/financialsExport.js */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as dateUtils from './dateUtils';
import { THAI_FONT_BASE64 } from './thaiFont.js';

const escapeCSV = (str) => {
    if (str === null || str === undefined) return '""';
    return `"${String(str).replace(/"/g, '""')}"`;
};

const getStaffCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) return null;
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(a.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(b.startDate) || new Date(0);
        return dateB - dateA;
    })[0];
};

// Dictionnaire enrichi aligné sur le Staff Export
export const FINANCIAL_EXPORT_FIELDS = {
    standard: [
        { id: 'name', label: 'Full Name', category: 'Personal', mandatory: true },
        { id: 'nickname', label: 'Nickname', category: 'Personal', mandatory: false },
        { id: 'department', label: 'Department', category: 'Job', mandatory: false },
        { id: 'position', label: 'Position', category: 'Job', mandatory: false },
        { id: 'branch', label: 'Branch', category: 'Job', mandatory: false },
        { id: 'type', label: 'Transaction Type', category: 'Details', mandatory: true },
        { id: 'date', label: 'Date', category: 'Details', mandatory: false },
        { id: 'amount', label: 'Amount (THB)', category: 'Financial', mandatory: true },
        { id: 'status', label: 'Status', category: 'Details', mandatory: false }
    ],
    loan: [
        { id: 'name', label: 'Full Name', category: 'Personal', mandatory: true },
        { id: 'nickname', label: 'Nickname', category: 'Personal', mandatory: false },
        { id: 'department', label: 'Department', category: 'Job', mandatory: false },
        { id: 'position', label: 'Position', category: 'Job', mandatory: false },
        { id: 'branch', label: 'Branch', category: 'Job', mandatory: false },
        { id: 'loanDetail', label: 'Loan Detail', category: 'Details', mandatory: false },
        { id: 'startDate', label: 'Start Date', category: 'Details', mandatory: false },
        { id: 'monthlyRepayment', label: 'Monthly Deduction (THB)', category: 'Financial', mandatory: true },
        { id: 'balance', label: 'Remaining Balance (THB)', category: 'Financial', mandatory: true },
        { id: 'totalAmount', label: 'Total Amount (THB)', category: 'Financial', mandatory: false },
        { id: 'progress', label: 'Progress (%)', category: 'Financial', mandatory: false },
        { id: 'status', label: 'Status', category: 'Details', mandatory: false }
    ]
};

export const generateCustomFinancialsExport = ({
    transactions,
    exportTargetTab,
    options,
    filters,
    sortConfig,
    branchName,
    payPeriod,
    companyConfig
}) => {
    const { fields, format } = options;
    
    // 1. FILTRAGE
    let filteredData = transactions.filter(item => {
        const job = getStaffCurrentJob(item.staff);
        const dept = job?.department || 'Unassigned';

        if (filters.department !== 'All' && dept !== filters.department) return false;
        if (filters.status !== 'All' && (item.status || '').toLowerCase() !== filters.status.toLowerCase()) return false;

        return true;
    });

    // 2. TRI DYNAMIQUE
    if (sortConfig) {
        filteredData.sort((a, b) => {
            const jobA = getStaffCurrentJob(a.staff);
            const jobB = getStaffCurrentJob(b.staff);

            let valA, valB;
            switch(sortConfig.key) {
                case 'name': 
                    valA = a.staff?.nickname || a.staff?.firstName || a.staffName || ''; 
                    valB = b.staff?.nickname || b.staff?.firstName || b.staffName || ''; 
                    break;
                case 'department': 
                    valA = jobA?.department || 'Z'; 
                    valB = jobB?.department || 'Z'; 
                    break;
                case 'amount': 
                    valA = Number(a.amount) || Number(a.raw?.amount) || Number(a.raw?.loanAmount) || 0; 
                    valB = Number(b.amount) || Number(b.raw?.amount) || Number(b.raw?.loanAmount) || 0; 
                    break;
                case 'date': 
                    valA = new Date(a.date).getTime() || 0; 
                    valB = new Date(b.date).getTime() || 0; 
                    break;
                default: 
                    valA = ''; valB = '';
            }

            if (valA < valB) return sortConfig.dir === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.dir === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // 3. MAPPING DES COLONNES
    const getColumnValue = (item, fieldId) => {
        const staff = item.staff || {};
        const job = getStaffCurrentJob(staff);

        let bName = 'N/A';
        if (staff.branchId) {
            bName = companyConfig?.branches?.find(b => b.id === staff.branchId)?.name || staff.branchId;
        }

        const total = Number(item.amount) || Number(item.raw?.amount) || Number(item.raw?.loanAmount) || 0;
        const remaining = Number(item.raw?.remainingBalance) || 0;
        const monthly = Number(item.raw?.monthlyRepayment || item.raw?.monthlyAmount || 0);
        const paid = Math.max(0, total - remaining);
        const progress = total > 0 ? Math.round((paid / total) * 100) : 0;

        const dateStr = item.date ? dateUtils.formatCustom(new Date(item.date), 'dd/MM/yyyy') : 'N/A';

        switch (fieldId) {
            // Reprise exacte de la logique de nom du staffExport
            case 'name': 
                if (staff.firstName || staff.lastName) {
                    return staff.nickname ? `${staff.nickname} (${staff.firstName} ${staff.lastName || ''})`.trim() : `${staff.firstName} ${staff.lastName || ''}`.trim();
                } else if (staff.fullName) {
                    return staff.nickname ? `${staff.nickname} (${staff.fullName})` : staff.fullName;
                }
                return item.staffName || 'N/A';
            case 'nickname': return staff.nickname || 'N/A';
            case 'department': return job?.department || 'Unassigned';
            case 'position': return job?.position || 'N/A';
            case 'branch': return bName.replace('Da Moreno ', '');
            case 'type': return item.type || 'N/A';
            case 'date': return dateStr;
            case 'startDate': return dateStr;
            case 'amount': return total;
            case 'status': return (item.status || 'N/A').toUpperCase();
            
            // Spécifique aux Loans
            case 'loanDetail': return item.raw?.loanName || 'Long-Term Loan';
            case 'monthlyRepayment': return monthly;
            case 'balance': return remaining;
            case 'totalAmount': return total;
            case 'progress': return `${progress}%`;
            
            default: return 'N/A';
        }
    };

    const headers = fields.map(f => f.label);
    const dataRows = filteredData.map(item => fields.map(f => getColumnValue(item, f.id)));

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const periodStr = exportTargetTab === 'pending' ? 'Pending' : `${months[payPeriod.month - 1]} ${payPeriod.year}`;
    const safeTarget = exportTargetTab.charAt(0).toUpperCase() + exportTargetTab.slice(1);
    const fileName = `Financials_${safeTarget}_${periodStr.replace(/\s+/g, '_')}`;

    if (format === 'csv') {
        const csvContent = [
            headers.map(escapeCSV).join(','),
            ...dataRows.map(row => row.map(escapeCSV).join(','))
        ].join('\n');

        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${fileName}.csv`;
        link.click();
        return { success: true };
    } 
    else if (format === 'pdf') {
        const doc = new jsPDF('landscape');
        doc.addFileToVFS('Sarabun-Regular.ttf', THAI_FONT_BASE64);
        doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
        doc.setFont('Sarabun');

        doc.setFontSize(16);
        let reportTitle = `Financial Records - ${periodStr} (${branchName})`;
        if (exportTargetTab === 'advances') reportTitle = `Monthly Advances - ${periodStr} (${branchName})`;
        if (exportTargetTab === 'loans') reportTitle = `Active Loans - ${periodStr} (${branchName})`;
        if (exportTargetTab === 'adjustments') reportTitle = `Monthly Adjustments - ${periodStr} (${branchName})`;
        if (exportTargetTab === 'pending') reportTitle = `Pending Financial Requests (${branchName})`;

        doc.text(reportTitle, 14, 15);
        doc.setFontSize(9);
        doc.text(`Generated on: ${dateUtils.formatCustom(new Date(), 'dd/MM/yyyy HH:mm')} | Exported Fields: ${fields.length}`, 14, 22);

        autoTable(doc, {
            startY: 28,
            head: [headers],
            body: dataRows.map(row => row.map(cell => typeof cell === 'number' ? cell.toLocaleString('en-US', { minimumFractionDigits: 2 }) : cell)),
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229], fontSize: 8 },
            styles: { font: 'Sarabun', fontSize: 7, cellPadding: 2 },
            alternateRowStyles: { fillColor: [250, 250, 250] },
            didParseCell: (data) => {
                const colName = fields[data.column.index].id;
                if (['amount', 'monthlyRepayment', 'balance', 'totalAmount', 'progress'].includes(colName)) {
                    data.cell.styles.halign = 'right';
                }
                if (colName === 'status' && data.section === 'body') {
                    const val = data.cell.raw;
                    if (val === 'APPROVED' || val === 'ACTIVE' || val === 'PAID_OFF' || val === 'APPLIED') data.cell.styles.textColor = [22, 163, 74];
                    if (val === 'PENDING') data.cell.styles.textColor = [217, 119, 6];
                    if (val === 'REJECTED') data.cell.styles.textColor = [220, 38, 38];
                }
            }
        });

        doc.save(`${fileName}.pdf`);
        return { success: true };
    }
};