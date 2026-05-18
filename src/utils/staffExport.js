/* src/utils/staffExport.js */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as dateUtils from './dateUtils';

const getStaffCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) return null;
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(a.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(b.startDate) || new Date(0);
        return dateB - dateA;
    })[0];
};

const escapeCSV = (str) => {
    if (str === null || str === undefined) return '""';
    return `"${String(str).replace(/"/g, '""')}"`;
};

// CORRECTION : Ajout de sortConfig, activeBranch, userRole et adminBranchIds dans les paramètres
export const generateCustomStaffExport = ({ staffList, filters, sortConfig, selectedFields, format, branchName, activeBranch, userRole, adminBranchIds }) => {
    
    // 1. Filtrage global (incluant les succursales)
    let filteredStaff = staffList.filter(staff => {
        const job = getStaffCurrentJob(staff);
        const dept = job?.department || 'Unassigned';
        
        // Filtre de statut
        if (filters.status !== 'All') {
            if (filters.status === 'Active' && staff.status === 'inactive') return false;
            if (filters.status === 'Inactive' && staff.status !== 'inactive') return false;
        }
        
        // Filtre de département
        if (filters.department !== 'All' && dept !== filters.department) return false;
        
        // CORRECTION : Filtre de succursale strict
        if (activeBranch && activeBranch !== 'global') {
            if (staff.branchId !== activeBranch) return false;
        } else if (activeBranch === 'global' && userRole === 'admin') {
            // Un admin sur "Global" ne voit que SES succursales
            if (adminBranchIds && !adminBranchIds.includes(staff.branchId)) return false;
        }
        
        return true;
    });

    // 1.5. TRI DYNAMIQUE
    if (sortConfig) {
        filteredStaff.sort((a, b) => {
            const jobA = getStaffCurrentJob(a) || {};
            const jobB = getStaffCurrentJob(b) || {};
            
            let valA, valB;
            switch(sortConfig.key) {
                case 'name': 
                    valA = a.nickname || a.firstName || ''; 
                    valB = b.nickname || b.firstName || ''; 
                    break;
                case 'department': 
                    valA = jobA.department || 'Z'; 
                    valB = jobB.department || 'Z'; 
                    break;
                case 'startDate': 
                    valA = jobA.startDate ? new Date(dateUtils.fromFirestore(jobA.startDate)).getTime() : 0; 
                    valB = jobB.startDate ? new Date(dateUtils.fromFirestore(jobB.startDate)).getTime() : 0; 
                    break;
                case 'baseSalary': 
                    valA = Number(jobA.baseSalary) || 0; 
                    valB = Number(jobB.baseSalary) || 0; 
                    break;
                default: 
                    valA = ''; valB = '';
            }

            if (valA < valB) return sortConfig.dir === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.dir === 'asc' ? 1 : -1;
            return 0;
        });
    }

    const headers = selectedFields.map(f => f.label);

    // 2. Mapping dynamique
    const dataRows = filteredStaff.map(staff => {
        const job = getStaffCurrentJob(staff);
        
        return selectedFields.map(field => {
            switch (field.id) {
                case 'id': return staff.id || 'N/A';
                case 'name': return staff.nickname ? `${staff.nickname} (${staff.firstName} ${staff.lastName})` : `${staff.firstName} ${staff.lastName}`;
                case 'nickname': return staff.nickname || 'N/A';
                case 'department': return job?.department || 'Unassigned';
                case 'position': return job?.position || 'N/A';
                case 'status': return staff.status === 'inactive' ? 'Inactive' : 'Active';
                case 'email': return staff.email || 'N/A';
                case 'phone': return staff.phone || 'N/A';
                case 'address': return staff.address || 'N/A';
                case 'startDate': return job?.startDate ? dateUtils.formatCustom(dateUtils.fromFirestore(job.startDate), 'dd/MM/yyyy') : 'N/A';
                case 'baseSalary': return job?.baseSalary ? `${job.baseSalary.toLocaleString()} THB` : 'N/A';
                case 'payType': return job?.payType || 'N/A';
                case 'bankName': return staff.bankName || 'N/A';
                case 'bankAccountNumber': return staff.bankAccountNumber || 'N/A';
                case 'bonusStreak': return String(staff.bonusStreak || 0);
                case 'emergencyContactName': return staff.emergencyContactName || 'N/A';
                case 'emergencyContactPhone': return staff.emergencyContactPhone || 'N/A';
                default: return 'N/A';
            }
        });
    });

    const fileName = `Staff_Export_${filters.department}_${new Date().toISOString().split('T')[0]}`;

    // 3. Traitement
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
    } 
    else if (format === 'pdf') {
        const doc = new jsPDF('landscape');
        
        doc.setFontSize(14);
        doc.text(`Staff Custom Report - ${branchName}`, 14, 15);
        doc.setFontSize(9);
        doc.text(`Filters: Department (${filters.department}) | Status (${filters.status}) | Exported Fields: ${selectedFields.length}`, 14, 22);

        autoTable(doc, {
            startY: 26,
            head: [headers],
            body: dataRows,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229], fontSize: 8 },
            styles: { fontSize: 7, cellPadding: 2 },
            alternateRowStyles: { fillColor: [250, 250, 250] },
        });

        doc.save(`${fileName}.pdf`);
    }
};