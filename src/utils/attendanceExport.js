/* src/utils/attendanceExport.js */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as dateUtils from './dateUtils';
import { THAI_FONT_BASE64 } from './thaiFont';

export const ATTENDANCE_EXPORT_FIELDS = {
    nickname: 'Nickname',
    fullName: 'Full Name',
    position: 'Position',
    date: 'Date',
    status: 'Status',
    variance: 'Variances (OT/Late)',
    checkIn: 'Check-In',
    checkOut: 'Check-Out',
    workHours: 'Work Hours'
};

const escapeCSV = (str) => {
    if (str === null || str === undefined) return '""';
    return `"${String(str).replace(/"/g, '""')}"`;
};

// --- HELPER D'AFFICHAGE ---
const formatDuration = (mins) => {
    if (!mins || mins === 0) return '0m';
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export const generateCustomAttendanceExport = ({ reportData, options, branchName, summary }) => {
    const { fields, format, sortBy } = options;

    let sortedData = [...reportData];
    if (sortBy === 'date') sortedData.sort((a, b) => a.date.localeCompare(b.date));
    else if (sortBy === 'name') sortedData.sort((a, b) => (a.staffNickname || '').localeCompare(b.staffNickname || ''));
    else if (sortBy === 'status') sortedData.sort((a, b) => (a.baseStatus || '').localeCompare(b.baseStatus || ''));

    const getColumnValue = (item, fieldId) => {
        switch (fieldId) {
            case 'nickname': return item.staffNickname || 'N/A';
            case 'fullName': return item.staffFullName || 'N/A';
            case 'position': return item.position || 'N/A';
            case 'date': return dateUtils.formatDisplayDate(item.date);
            case 'status': return item.baseStatus || 'N/A';
            case 'variance': return item.varianceText || '-';
            case 'checkIn': return item.checkIn || '-';
            case 'checkOut': return item.checkOut || '-';
            case 'workHours': return item.workMinutes < 0 ? 'N/A' : formatDuration(item.workMinutes); // <-- CHANGEMENT ICI
            default: return '';
        }
    };

    if (format === 'csv') {
        const headers = fields.map(f => escapeCSV(ATTENDANCE_EXPORT_FIELDS[f])).join(',');
        const rows = sortedData.map(item => fields.map(f => escapeCSV(getColumnValue(item, f))).join(','));
        const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Attendance_Export_${branchName.replace(/\s+/g, '_')}_${dateUtils.formatISODate(new Date())}.csv`;
        link.click();
        return { success: true };
    }

    if (format === 'pdf') {
        const doc = new jsPDF('landscape');
        
        doc.addFileToVFS('Sarabun-Regular.ttf', THAI_FONT_BASE64);
        doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
        doc.setFont('Sarabun');

        doc.setFontSize(16);
        doc.text(`Attendance Report - ${branchName}`, 14, 15);
        doc.setFontSize(9);
        doc.text(`Generated on: ${dateUtils.formatDisplayDate(new Date())}`, 14, 21);

        if (summary) {
            doc.setFillColor(30, 41, 59);
            doc.rect(14, 25, 269, 15, 'F');
            doc.setTextColor(255, 255, 255);
            doc.text(`COMPLIANCE: ${summary.complianceRate}%`, 20, 34);
            doc.text(`LATENESS: ${summary.totalApprovedLate}m Paid / ${summary.totalSuggestedLate}m Sug.`, 80, 34);
            doc.text(`OVERTIME: ${summary.approvedOtHours}h Paid / ${summary.suggestedOtHours}h Sug.`, 160, 34);
            doc.text(`ABSENCES: ${summary.absentCount} | LEAVES: ${summary.leaveCount}`, 240, 34);
        }

        const tableHeaders = fields.map(f => ATTENDANCE_EXPORT_FIELDS[f]);
        const tableRows = sortedData.map(item => fields.map(f => getColumnValue(item, f)));

        autoTable(doc, {
            startY: summary ? 45 : 30,
            head: [tableHeaders],
            body: tableRows,
            theme: 'grid',
            styles: { font: 'Sarabun', fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [79, 70, 229] }, 
            alternateRowStyles: { fillColor: [248, 250, 252] },
            didParseCell: (data) => {
                if (fields[data.column.index] === 'status') {
                    const txt = data.cell.raw;
                    if (txt === 'Absent') data.cell.styles.textColor = [239, 68, 68];
                    if (txt === 'Off') data.cell.styles.textColor = [156, 163, 175];
                    if (txt === 'Leave') data.cell.styles.textColor = [56, 189, 248];
                }
                if (fields[data.column.index] === 'variance') {
                    const txt = data.cell.raw;
                    if (txt.includes('Paid OT')) data.cell.styles.textColor = [168, 85, 247]; 
                    else if (txt.includes('Deducted')) data.cell.styles.textColor = [249, 115, 22]; 
                    else if (txt.includes('Sug. OT')) data.cell.styles.textColor = [16, 185, 129]; 
                    else if (txt.includes('Sug. Late')) data.cell.styles.textColor = [234, 179, 8]; 
                }
            }
        });

        doc.save(`Attendance_Report_${branchName.replace(/\s+/g, '_')}_${dateUtils.formatISODate(new Date())}.pdf`);
        return { success: true };
    }
};