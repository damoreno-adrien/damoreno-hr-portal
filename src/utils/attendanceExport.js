/* src/utils/attendanceExport.js */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as dateUtils from './dateUtils';

export const exportAttendancePDF = ({ reportData, startDate, endDate, summary, activeBranch, branchName }) => {
    const doc = new jsPDF('landscape');
    
    // En-tête du document
    doc.setFontSize(16);
    doc.text(`Attendance Operations Report - ${branchName}`, 14, 15);
    
    doc.setFontSize(9);
    doc.text(`Period: ${dateUtils.formatDisplayDate(startDate)} to ${dateUtils.formatDisplayDate(endDate)}`, 14, 21);
    doc.text(`Generated on: ${dateUtils.formatDisplayDate(new Date())}`, 14, 26);

    // Dessin du bloc Récapitulatif (Analytics)
    doc.setFillColor(30, 41, 59); // Slate 800
    doc.rect(14, 30, 269, 20, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    
    // Positionnement des stats dans le rectangle
    doc.text(`SHIFT COMPLIANCE: ${summary.complianceRate}% (${summary.completedShifts}/${summary.plannedShifts} Shifts)`, 20, 42);
    doc.text(`TOTAL LATENESS: ${summary.totalLateMinutes} mins (${summary.lateCount} Incidents)`, 100, 42);
    doc.text(`TOTAL OVERTIME: ${summary.totalOtHours} hours`, 180, 42);
    doc.text(`ABSENCES: ${summary.absentCount} | LEAVES: ${summary.leaveCount}`, 240, 42);

    // Configuration de la table
    const headers = ['Staff Name', 'Date', 'Status', 'Check-In', 'Check-Out', 'Work Hours'];
    
    const rows = reportData.map(row => [
        row.staffName,
        dateUtils.formatDisplayDate(row.date),
        row.status,
        row.checkIn,
        row.checkOut,
        row.workHours < 0 ? 'N/A' : `${row.workHours.toFixed(2)} h`
    ]);

    autoTable(doc, {
        startY: 55,
        head: [headers],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [217, 119, 6], fontSize: 9 }, // Amber 600
        styles: { fontSize: 8, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (data) => {
            // Coloration d'alerte sur le statut dans le PDF
            if (data.column.index === 2) {
                const txt = data.cell.raw;
                if (txt === 'Absent') data.cell.styles.textColor = [239, 68, 68];
                if (txt.startsWith('Late')) data.cell.styles.textColor = [234, 179, 8];
                if (txt.startsWith('Overtime')) data.cell.styles.textColor = [34, 197, 94];
            }
        }
    });

    const filePeriod = `${startDate}_to_${endDate}`;
    doc.save(`Attendance_Report_${activeBranch}_${filePeriod}.pdf`);
};