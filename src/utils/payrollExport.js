/* src/utils/payrollExport.js */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { THAI_FONT_BASE64 } from './thaiFont.js';

const FIELD_LABELS = {
    nickname: 'Nickname',
    fullName: 'Full Name',
    department: 'Department',
    position: 'Position',
    basePay: 'Base Pay',
    attendanceBonus: 'Attendance Bonus',
    ssoAllowance: 'SSO Allowance',
    totalEarnings: 'Total Earnings',
    absences: 'Absences',
    ssoDeduction: 'SSO Deduction',
    advance: 'Salary Advance',
    loan: 'Loan Repayment',
    totalDeductions: 'Total Deductions',
    netPay: 'Net Pay',
    paymentMethod: 'Payment Method',
};

// Fields whose values are monetary amounts. Used to right-align columns
// and format the amounts with 2 decimal places.
const FINANCIAL_FIELD_IDS = new Set([
    'basePay',
    'attendanceBonus',
    'ssoAllowance',
    'totalEarnings',
    'absences',
    'ssoDeduction',
    'advance',
    'loan',
    'totalDeductions',
    'netPay',
]);

const formatMoney = (num) => {
    const n = Number(num) || 0;
    return n.toFixed(2);
};

const escapeCSV = (str) => {
    if (str === null || str === undefined) return '""';
    return `"${String(str).replace(/"/g, '""')}"`;
};

const getFieldValue = (item, fieldId) => {
    switch (fieldId) {
        case 'nickname': return item.staffName || item.name || 'N/A';
        case 'fullName': return item.name || item.staffName || 'N/A';
        case 'department': return item.department || 'N/A';
        case 'position': return item.position || 'N/A';
        case 'basePay': return formatMoney(item.earnings?.basePay);
        case 'attendanceBonus': return formatMoney(item.earnings?.attendanceBonus);
        case 'ssoAllowance': return formatMoney(item.earnings?.ssoAllowance);
        case 'totalEarnings': return formatMoney(item.totalEarnings);
        case 'absences': return formatMoney(item.deductions?.absences);
        case 'ssoDeduction': return formatMoney(item.deductions?.sso);
        case 'advance': return formatMoney(item.deductions?.advance);
        case 'loan': return formatMoney(item.deductions?.loan);
        case 'totalDeductions': return formatMoney(item.totalDeductions);
        case 'netPay': return formatMoney(item.netPay);
        case 'paymentMethod': return item.paymentMethod === 'cash' ? 'Cash' : 'Bank Transfer';
        default: return 'N/A';
    }
};

const sortPayslips = (payslips, sortBy) => {
    const sorted = [...payslips];

    switch (sortBy) {
        case 'department':
            sorted.sort((a, b) => {
                const deptCompare = (a.department || '').localeCompare(b.department || '');
                if (deptCompare !== 0) return deptCompare;
                return (a.staffName || a.name || '').localeCompare(b.staffName || b.name || '');
            });
            break;
        case 'netPay':
            // Highest net pay first
            sorted.sort((a, b) => (Number(b.netPay) || 0) - (Number(a.netPay) || 0));
            break;
        case 'name':
        default:
            sorted.sort((a, b) => (a.staffName || a.name || '').localeCompare(b.staffName || b.name || ''));
            break;
    }

    return sorted;
};

/**
 * Generates a custom export (CSV or PDF) of the currently selected payslips.
 *
 * @param {Object} params
 * @param {Array} params.selectedPayslips - The payroll line items to export.
 * @param {Object} params.options - { fields: string[], format: 'csv'|'pdf', sortBy: string }
 * @param {Object} params.companyConfig - Used for PDF header branding.
 */
export const generateCustomPayrollExport = ({ selectedPayslips, options, companyConfig }) => {
    if (!selectedPayslips || selectedPayslips.length === 0) return;

    const { fields = [], format = 'csv', sortBy = 'name' } = options || {};
    if (fields.length === 0) return;

    const sortedPayslips = sortPayslips(selectedPayslips, sortBy);

    const headers = fields.map(f => FIELD_LABELS[f] || f);
    const dataRows = sortedPayslips.map(item => fields.map(f => getFieldValue(item, f)));

    const fileNameBase = `Payroll_Export_${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
        const csvContent = [
            headers.map(escapeCSV).join(','),
            ...dataRows.map(row => row.map(escapeCSV).join(','))
        ].join('\n');

        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${fileNameBase}.csv`;
        link.click();
    } else if (format === 'pdf') {
        const doc = new jsPDF('landscape');
        doc.addFileToVFS('Sarabun-Regular.ttf', THAI_FONT_BASE64);
        doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
        doc.setFont('Sarabun');

        doc.setFontSize(14);
        doc.text(`Payroll Custom Export - ${companyConfig?.companyName || 'Company'}`, 14, 15);
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toLocaleDateString()} | Records: ${sortedPayslips.length}`, 14, 22);

        // Dynamically target financial columns to force right-alignment,
        // regardless of which fields/order the user selected.
        const columnStyles = {};
        fields.forEach((fieldId, index) => {
            if (FINANCIAL_FIELD_IDS.has(fieldId)) {
                columnStyles[index] = { halign: 'right' };
            }
        });

        autoTable(doc, {
            startY: 26,
            head: [headers],
            body: dataRows,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229], fontSize: 8, font: 'Sarabun' },
            styles: { font: 'Sarabun', fontSize: 7, cellPadding: 2 },
            columnStyles,
            alternateRowStyles: { fillColor: [250, 250, 250] },
        });

        doc.save(`${fileNameBase}.pdf`);
    }
};
