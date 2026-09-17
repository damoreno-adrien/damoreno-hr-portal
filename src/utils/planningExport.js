/* src/utils/planningExport.js */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as dateUtils from './dateUtils';
import { THAI_FONT_BASE64 } from './thaiFont.js';
import { getCurrentJob } from './staffUtils';

const escapeCSV = (str) => {
    if (str === null || str === undefined) return '""';
    return `"${String(str).replace(/"/g, '""')}"`;
};

// Helper pour ajouter le footer confidentiel et les numéros de page
const addFooterAndPageNumbers = (doc) => {
    const pageCount = doc.internal.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        
        // Mention de confidentialité en bas à gauche
        doc.text(
            "CONFIDENTIAL - Internal Use Only. Do not distribute without authorization.", 
            14, 
            pageHeight - 8
        );
        
        // Numérotation "Page 01 / 10" en bas à droite
        const pageString = `Page ${String(i).padStart(2, '0')} / ${String(pageCount).padStart(2, '0')}`;
        doc.text(pageString, pageWidth - 14, pageHeight - 8, { align: 'right' });
    }
};

export const generatePlanningExport = ({ 
    staffList, 
    schedules, 
    leaves, 
    startDateStr, 
    endDateStr, 
    format, 
    branchName, 
    filterContext,
    targetType
}) => {
    const dates = [];
    let current = new Date(startDateStr);
    const end = new Date(endDateStr);
    while (current <= end) {
        dates.push({
            iso: current.toISOString().split('T')[0],
            display: dateUtils.formatCustom(current, 'dd/MM (EEE)')
        });
        current.setDate(current.getDate() + 1);
    }

    const periodLabel = startDateStr === endDateStr ? startDateStr : `${startDateStr}_to_${endDateStr}`;
    const fileName = `Schedule_Export_${filterContext.replace(/\s+/g, '_')}_${periodLabel}`;

    // =========================================================================
    // CAS SPÉCIFIQUE : 1 Employé + PDF + > 7 jours -> VUE CALENDRIER
    // =========================================================================
    if (format === 'pdf' && targetType === 'staff' && dates.length > 7) {
        const doc = new jsPDF('portrait'); 
        doc.addFileToVFS('Sarabun-Regular.ttf', THAI_FONT_BASE64);
        doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
        doc.setFont('Sarabun');

        const staff = staffList[0];
        const job = getCurrentJob(staff);
        
        const fullName = `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || staff.fullName || 'Staff';
        const displayName = staff.nickname ? `${staff.nickname} (${fullName})` : fullName;

        doc.setFontSize(18);
        doc.text(`Monthly Schedule: ${displayName}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Department: ${job.department || 'N/A'} | Position: ${job.position || 'N/A'} | Branch: ${branchName}`, 14, 22);
        doc.text(`Period: ${startDateStr} to ${endDateStr}`, 14, 28);

        let currentY = 35;

        const datesByMonth = {};
        dates.forEach(d => {
             const dateObj = new Date(d.iso);
             const monthYear = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });
             if (!datesByMonth[monthYear]) datesByMonth[monthYear] = [];
             datesByMonth[monthYear].push(d);
        });

        Object.entries(datesByMonth).forEach(([monthYear, monthDates]) => {
            if (currentY > 250) {
                doc.addPage();
                currentY = 20;
            }

            doc.setFontSize(14);
            doc.text(monthYear, 14, currentY);
            currentY += 4;

            let weeks = [];
            let currentWeek = new Array(7).fill(''); 

            monthDates.forEach(d => {
                 const dateObj = new Date(d.iso);
                 let colIndex = dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1;
                 
                 let cellContent = `${dateObj.getDate()}\n\n`; 
                 const shift = schedules.find(s => s.staffId === staff.id && s.date === d.iso);
                 const leave = leaves.find(l => l.staffId === staff.id && l.startDate <= d.iso && l.endDate >= d.iso);
                 
                 // CORRECTION: Textes simplifiés (LEAVE, OFF, ou les heures)
                 if (leave) {
                     cellContent += `LEAVE`;
                 } else if (shift && shift.startTime) {
                     cellContent += `${shift.startTime} - ${shift.endTime}`;
                 } else {
                     cellContent += 'OFF';
                 }
                 
                 currentWeek[colIndex] = {
                     content: cellContent,
                     isOff: !shift && !leave,
                     isLeave: !!leave
                 };
                 
                 if (colIndex === 6) {
                     weeks.push(currentWeek);
                     currentWeek = new Array(7).fill('');
                 }
            });
            if (currentWeek.some(cell => cell !== '')) weeks.push(currentWeek);

            autoTable(doc, {
                startY: currentY,
                head: [['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']],
                body: weeks.map(row => row.map(cell => cell ? cell.content : '')),
                theme: 'grid',
                headStyles: { fillColor: [79, 70, 229], halign: 'center' },
                // CORRECTION: Largeur de colonnes stricte et uniforme
                styles: { font: 'Sarabun', fontSize: 9, halign: 'center', minCellHeight: 20, valign: 'top' },
                columnStyles: {
                    0: { cellWidth: 26 }, 1: { cellWidth: 26 }, 2: { cellWidth: 26 },
                    3: { cellWidth: 26 }, 4: { cellWidth: 26 }, 5: { cellWidth: 26 }, 6: { cellWidth: 26 }
                },
                didParseCell: (data) => {
                    if (data.section === 'body') {
                        const rawCell = weeks[data.row.index][data.column.index];
                        if (rawCell && rawCell.isOff) {
                            data.cell.styles.textColor = [156, 163, 175]; 
                        } else if (rawCell && rawCell.isLeave) {
                            data.cell.styles.textColor = [59, 130, 246]; 
                            data.cell.styles.fillColor = [239, 246, 255]; 
                        } else if (!rawCell) {
                             data.cell.styles.fillColor = [249, 250, 251]; 
                        }
                    }
                }
            });

            currentY = doc.lastAutoTable.finalY + 15;
        });

        // Appliquer le footer confidentiel sur toutes les pages
        addFooterAndPageNumbers(doc);

        doc.save(fileName + '.pdf');
        return { success: true };
    }

    // =========================================================================
    // CAS STANDARD : MATRICE (Équipe entière, CSV ou PDF court)
    // =========================================================================
    const headers = ['Staff Name', 'Department', 'Position', ...dates.map(d => d.display)];

    const dataRows = staffList.map(staff => {
        const job = getCurrentJob(staff);
        
        const fullName = `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || staff.fullName || 'Staff';
        const displayName = staff.nickname ? `${staff.nickname} (${fullName})` : fullName;

        const row = [displayName, job.department || 'Unassigned', job.position || 'Staff'];

        dates.forEach(date => {
            const leave = leaves.find(l => l.staffId === staff.id && l.startDate <= date.iso && l.endDate >= date.iso);
            
            // CORRECTION: Textes simplifiés
            if (leave) {
                row.push(`LEAVE`);
                return;
            }

            const shift = schedules.find(s => s.staffId === staff.id && s.date === date.iso);
            if (shift && shift.startTime) {
                row.push(`${shift.startTime} - ${shift.endTime}`);
            } else {
                row.push('OFF');
            }
        });

        return row;
    });

    dataRows.sort((a, b) => a[0].localeCompare(b[0]));

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
        doc.text(`Staff Schedule - ${branchName}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Period: ${startDateStr} to ${endDateStr} | Scope: ${filterContext}`, 14, 22);

        // Définition des colonnes pour la matrice
        const matrixColumnStyles = {
            0: { cellWidth: 35, fontStyle: 'bold', halign: 'left' },
            1: { cellWidth: 20, halign: 'left' },
            2: { cellWidth: 20, halign: 'left' }
        };

        autoTable(doc, {
            startY: 28,
            head: [headers],
            body: dataRows,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229], fontSize: 8, halign: 'center' },
            styles: { font: 'Sarabun', fontSize: 7, cellPadding: 2 },
            columnStyles: matrixColumnStyles,
            alternateRowStyles: { fillColor: [250, 250, 250] },
            horizontalPageBreak: true,
            horizontalPageBreakRepeat: 0,
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index > 2) {
                    data.cell.styles.halign = 'center';
                    const val = data.cell.raw;
                    if (val === 'OFF') data.cell.styles.textColor = [156, 163, 175];
                    else if (val === 'LEAVE') data.cell.styles.textColor = [59, 130, 246];
                    else data.cell.styles.textColor = [17, 24, 39];
                }
            }
        });

        // Appliquer le footer confidentiel sur toutes les pages de la matrice
        addFooterAndPageNumbers(doc);

        doc.save(`${fileName}.pdf`);
        return { success: true };
    }
};