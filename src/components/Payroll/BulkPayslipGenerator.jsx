/* src/components/Payroll/BulkPayslipGenerator.jsx */
import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Plus, Trash2, Download, X } from 'lucide-react';
import Modal from '../common/Modal';
import FeedbackModal from '../common/FeedbackModal'; // <-- NOUVEL IMPORT

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Fonction sécurisée pour le formatage des devises
const formatCurrency = (num) => (Number(num) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Conversion sécurisée en nombre pour les calculs
const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

export default function BulkPayslipGenerator({ isOpen, onClose, staffList, companyConfig, userRole }) {
    const [selectedStaffId, setSelectedStaffId] = useState('');
    
    const [payslips, setPayslips] = useState([
        { 
            id: Date.now(), year: new Date().getFullYear(), month: new Date().getMonth() + 1, 
            basePay: '', attendanceBonus: '', ssoAllowance: '', overtimePay: '', 
            absences: '', ssoDeduction: '', advance: '', loan: '', 
            customEarnings: [], 
            customDeductions: [] 
        }
    ]);
    const [isGenerating, setIsGenerating] = useState(false);
    
    // --- NOUVEAU STATE POUR LA MODALE D'ERREUR ---
    const [feedbackModal, setFeedbackModal] = useState(null);

    if (!isOpen || userRole !== 'super_admin') return null;

    const handleAddPayslip = () => {
        const last = payslips[payslips.length - 1];
        let nextMonth = last ? last.month + 1 : new Date().getMonth() + 1;
        let nextYear = last ? last.year : new Date().getFullYear();
        
        if (nextMonth > 12) {
            nextMonth = 1;
            nextYear += 1;
        }

        setPayslips([...payslips, { 
            id: Date.now(), year: nextYear, month: nextMonth, 
            basePay: '', attendanceBonus: '', ssoAllowance: '', overtimePay: '', 
            absences: '', ssoDeduction: '', advance: '', loan: '', 
            customEarnings: [], customDeductions: [] 
        }]);
    };

    const handleRemovePayslip = (id) => { 
        setPayslips(payslips.filter(p => p.id !== id)); 
    };

    const handleChange = (id, field, value) => {
        setPayslips(payslips.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const handleAddCustomField = (payslipId, type) => {
        setPayslips(payslips.map(p => {
            if (p.id !== payslipId) return p;
            const newField = { id: Date.now(), description: '', amount: '' };
            return type === 'earning' 
                ? { ...p, customEarnings: [...p.customEarnings, newField] }
                : { ...p, customDeductions: [...p.customDeductions, newField] };
        }));
    };

    const handleCustomFieldChange = (payslipId, type, fieldId, key, value) => {
        setPayslips(payslips.map(p => {
            if (p.id !== payslipId) return p;
            const listKey = type === 'earning' ? 'customEarnings' : 'customDeductions';
            const updatedList = p[listKey].map(f => f.id === fieldId ? { ...f, [key]: value } : f);
            return { ...p, [listKey]: updatedList };
        }));
    };

    const handleRemoveCustomField = (payslipId, type, fieldId) => {
        setPayslips(payslips.map(p => {
            if (p.id !== payslipId) return p;
            const listKey = type === 'earning' ? 'customEarnings' : 'customDeductions';
            return { ...p, [listKey]: p[listKey].filter(f => f.id !== fieldId) };
        }));
    };

    const calculateTotals = (p) => {
        const customEarningsTotal = p.customEarnings.reduce((sum, item) => sum + toNum(item.amount), 0);
        const customDeductionsTotal = p.customDeductions.reduce((sum, item) => sum + toNum(item.amount), 0);
        
        const totalEarnings = toNum(p.basePay) + toNum(p.attendanceBonus) + toNum(p.ssoAllowance) + toNum(p.overtimePay) + customEarningsTotal;
        const totalDeductions = toNum(p.absences) + toNum(p.ssoDeduction) + toNum(p.advance) + toNum(p.loan) + customDeductionsTotal;
        
        return { totalEarnings, totalDeductions, netPay: totalEarnings - totalDeductions };
    };

    const handleGeneratePDF = async () => {
        // --- MODIFIÉ: Appel de la FeedbackModal au lieu de window.alert ---
        if (!selectedStaffId) {
            setFeedbackModal({ type: 'error', title: 'Action Required', message: "Please select a staff member first." });
            return;
        }
        
        const staff = staffList.find(s => s.id === selectedStaffId);
        if (!staff) return;

        setIsGenerating(true);
        const doc = new jsPDF();
        
        let base64Image = null;
        if (companyConfig?.companyLogoUrl) {
            try {
                const response = await fetch(companyConfig.companyLogoUrl);
                const blob = await response.blob();
                const reader = new FileReader();
                base64Image = await new Promise((resolve) => {
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch (e) { console.error("Logo load failed", e); }
        }

        const staffName = `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || staff.fullName || staff.nickname;
        const position = staff.jobHistory && staff.jobHistory.length > 0 ? staff.jobHistory.sort((a,b) => new Date(b.startDate) - new Date(a.startDate))[0].position : 'Staff';

        let branchName = companyConfig?.companyName || 'Da Moreno';
        let branchAddress = companyConfig?.companyAddress || '';
        let branchTaxId = companyConfig?.companyTaxId || '';

        const branchId = staff.branchId;

        if (branchId && companyConfig?.branchSettings && companyConfig.branchSettings[branchId]) {
            const settings = companyConfig.branchSettings[branchId];
            branchName = settings.companyName || settings.tradingName || branchName;
            branchAddress = settings.companyAddress || branchAddress;
            branchTaxId = settings.companyTaxId || branchTaxId;
        }

        for (let i = 0; i < payslips.length; i++) {
            const p = payslips[i];
            const { totalEarnings, totalDeductions, netPay } = calculateTotals(p);
            
            if (i > 0) doc.addPage();

            if (base64Image) {
                doc.addImage(base64Image, 'PNG', doc.internal.pageSize.getWidth() - 44, 10, 30, 30);
            }

            doc.setFontSize(18);
            doc.text("Salary Statement", 105, 15, { align: 'center' });
            doc.setFontSize(12);
            doc.text(`Month: ${months[p.month - 1]} ${p.year}`, 105, 22, { align: 'center' });

            autoTable(doc, {
                body: [
                    [{ content: 'Employee Name:', styles: { fontStyle: 'bold' } }, staffName],
                    [{ content: 'Company:', styles: { fontStyle: 'bold' } }, branchName],
                    [{ content: 'Address:', styles: { fontStyle: 'bold' } }, branchAddress],
                    [{ content: 'Tax ID:', styles: { fontStyle: 'bold' } }, branchTaxId],
                    [{ content: 'Position:', styles: { fontStyle: 'bold' } }, position],
                ],
                startY: 30, theme: 'plain', styles: { fontSize: 10 },
            });

            const earningsBody = [
                ['Base Pay', formatCurrency(p.basePay)],
                ['Attendance Bonus', formatCurrency(p.attendanceBonus)],
                ['Social Security Allowance', formatCurrency(p.ssoAllowance)],
            ];
            if (toNum(p.overtimePay) > 0) earningsBody.push(['Approved Overtime', formatCurrency(p.overtimePay)]);
            p.customEarnings.forEach(e => {
                if (e.description && toNum(e.amount) > 0) earningsBody.push([e.description, formatCurrency(e.amount)]);
            });

            const deductionsBody = [
                ['Absences', formatCurrency(p.absences)],
                ['Social Security', formatCurrency(p.ssoDeduction)],
            ];
            if (toNum(p.advance) > 0) deductionsBody.push(['Salary Advance', formatCurrency(p.advance)]);
            if (toNum(p.loan) > 0) deductionsBody.push(['Loan Repayment', formatCurrency(p.loan)]);
            p.customDeductions.forEach(d => {
                if (d.description && toNum(d.amount) > 0) deductionsBody.push([d.description, formatCurrency(d.amount)]);
            });

            autoTable(doc, { head: [['Earnings', 'Amount (THB)']], body: earningsBody, foot: [['Total Earnings', formatCurrency(totalEarnings)]], startY: doc.lastAutoTable.finalY + 5, theme: 'grid', headStyles: { fillColor: [23, 23, 23] }, footStyles: { fillColor: [41, 41, 41], fontStyle: 'bold' } });
            
            let currentY = doc.lastAutoTable.finalY + 5;
            
            autoTable(doc, { head: [['Deductions', 'Amount (THB)']], body: deductionsBody, foot: [['Total Deductions', formatCurrency(totalDeductions)]], startY: currentY, theme: 'grid', headStyles: { fillColor: [23, 23, 23] }, footStyles: { fillColor: [41, 41, 41], fontStyle: 'bold' } });

            doc.setFontSize(14); doc.setFont('helvetica', 'bold');
            doc.text("Net Pay:", 14, doc.lastAutoTable.finalY + 15);
            doc.text(`${formatCurrency(netPay)} THB`, 196, doc.lastAutoTable.finalY + 15, { align: 'right' });
        }

        doc.save(`Historical_Payslips_${staffName.replace(/ /g, '_')}.pdf`);
        setIsGenerating(false);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Emergency Bulk Payslip Creator (No DB Sync)">
            {/* --- INJECTION DU FEEDBACK MODAL ICI --- */}
            <FeedbackModal 
                isOpen={!!feedbackModal} 
                type={feedbackModal?.type} 
                title={feedbackModal?.title} 
                message={feedbackModal?.message} 
                onClose={() => setFeedbackModal(null)} 
            />

            <div className="space-y-6">
                <div className="bg-amber-900/30 border border-amber-600 p-3 rounded-lg">
                    <p className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">Warning: Offline Tool</p>
                    <p className="text-sm text-gray-300">This tool runs completely in your browser memory. These records will <strong>NOT</strong> be saved to your database and will <strong>NOT</strong> overwrite any existing payroll history.</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Select Staff Member</label>
                    <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md text-white border-gray-600 outline-none focus:border-indigo-500">
                        <option value="">-- Choose an employee --</option>
                        {staffList.filter(s => s.status !== 'inactive').map(staff => <option key={staff.id} value={staff.id}>{staff.firstName} {staff.lastName || staff.nickname}</option>)}
                    </select>
                </div>

                <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-4">
                    {payslips.map((p, index) => {
                        const { netPay } = calculateTotals(p);
                        return (
                            <div key={p.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 relative">
                                <div className="absolute top-2 right-2">
                                    {payslips.length > 1 && (
                                        <button onClick={() => handleRemovePayslip(p.id)} className="p-1 text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                                    )}
                                </div>
                                <h4 className="text-white font-bold mb-3 border-b border-gray-700 pb-2">Payslip {index + 1}</h4>
                                
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div>
                                        <label className="block text-xs text-gray-400">Month</label>
                                        <select value={p.month} onChange={(e) => handleChange(p.id, 'month', Number(e.target.value))} className="w-full p-1.5 bg-gray-900 rounded text-sm text-white border border-gray-600">
                                            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400">Year</label>
                                        <input type="number" value={p.year} onChange={(e) => handleChange(p.id, 'year', Number(e.target.value))} className="w-full p-1.5 bg-gray-900 rounded text-sm text-white border border-gray-600" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-3">
                                    {/* EARNINGS COLUMN */}
                                    <div className="space-y-2">
                                        <p className="text-gray-400 font-bold border-b border-gray-700 pb-1 flex justify-between">
                                            Earnings
                                            <button onClick={() => handleAddCustomField(p.id, 'earning')} className="text-blue-400 hover:text-blue-300 flex items-center text-xs"><Plus className="w-3 h-3 mr-1"/> Add</button>
                                        </p>
                                        <div className="flex justify-between items-center"><span className="text-gray-300 text-xs">Base Pay</span> <input type="number" value={p.basePay} onChange={(e) => handleChange(p.id, 'basePay', e.target.value)} className="w-20 p-1 bg-gray-900 rounded text-right border border-gray-600 text-white" /></div>
                                        <div className="flex justify-between items-center"><span className="text-gray-300 text-xs">Att. Bonus</span> <input type="number" value={p.attendanceBonus} onChange={(e) => handleChange(p.id, 'attendanceBonus', e.target.value)} className="w-20 p-1 bg-gray-900 rounded text-right border border-gray-600 text-white" /></div>
                                        <div className="flex justify-between items-center"><span className="text-gray-300 text-xs">SSO Allow.</span> <input type="number" value={p.ssoAllowance} onChange={(e) => handleChange(p.id, 'ssoAllowance', e.target.value)} className="w-20 p-1 bg-gray-900 rounded text-right border border-gray-600 text-white" /></div>
                                        <div className="flex justify-between items-center"><span className="text-gray-300 text-xs">Overtime</span> <input type="number" value={p.overtimePay} onChange={(e) => handleChange(p.id, 'overtimePay', e.target.value)} className="w-20 p-1 bg-gray-900 rounded text-right border border-gray-600 text-white" /></div>
                                        
                                        {/* Dynamic Custom Earnings */}
                                        {p.customEarnings.map(ce => (
                                            <div key={ce.id} className="flex gap-2 items-center">
                                                <button onClick={() => handleRemoveCustomField(p.id, 'earning', ce.id)} className="text-red-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                                                <input type="text" placeholder="Description" value={ce.description} onChange={(e) => handleCustomFieldChange(p.id, 'earning', ce.id, 'description', e.target.value)} className="flex-grow p-1 bg-gray-900 rounded text-xs border border-gray-600 text-white" />
                                                <input type="number" placeholder="0" value={ce.amount} onChange={(e) => handleCustomFieldChange(p.id, 'earning', ce.id, 'amount', e.target.value)} className="w-16 p-1 bg-gray-900 rounded text-xs text-right border border-gray-600 text-white" />
                                            </div>
                                        ))}
                                    </div>

                                    {/* DEDUCTIONS COLUMN */}
                                    <div className="space-y-2">
                                        <p className="text-gray-400 font-bold border-b border-gray-700 pb-1 flex justify-between">
                                            Deductions
                                            <button onClick={() => handleAddCustomField(p.id, 'deduction')} className="text-amber-500 hover:text-amber-400 flex items-center text-xs"><Plus className="w-3 h-3 mr-1"/> Add</button>
                                        </p>
                                        <div className="flex justify-between items-center"><span className="text-gray-300 text-xs">Absences</span> <input type="number" value={p.absences} onChange={(e) => handleChange(p.id, 'absences', e.target.value)} className="w-20 p-1 bg-gray-900 rounded text-right border border-gray-600 text-white" /></div>
                                        <div className="flex justify-between items-center"><span className="text-gray-300 text-xs">SSO Deduct.</span> <input type="number" value={p.ssoDeduction} onChange={(e) => handleChange(p.id, 'ssoDeduction', e.target.value)} className="w-20 p-1 bg-gray-900 rounded text-right border border-gray-600 text-white" /></div>
                                        <div className="flex justify-between items-center"><span className="text-gray-300 text-xs">Advance</span> <input type="number" value={p.advance} onChange={(e) => handleChange(p.id, 'advance', e.target.value)} className="w-20 p-1 bg-gray-900 rounded text-right border border-gray-600 text-white" /></div>
                                        <div className="flex justify-between items-center"><span className="text-gray-300 text-xs">Loan</span> <input type="number" value={p.loan} onChange={(e) => handleChange(p.id, 'loan', e.target.value)} className="w-20 p-1 bg-gray-900 rounded text-right border border-gray-600 text-white" /></div>
                                        
                                        {/* Dynamic Custom Deductions */}
                                        {p.customDeductions.map(cd => (
                                            <div key={cd.id} className="flex gap-2 items-center">
                                                <button onClick={() => handleRemoveCustomField(p.id, 'deduction', cd.id)} className="text-red-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                                                <input type="text" placeholder="Description" value={cd.description} onChange={(e) => handleCustomFieldChange(p.id, 'deduction', cd.id, 'description', e.target.value)} className="flex-grow p-1 bg-gray-900 rounded text-xs border border-gray-600 text-white" />
                                                <input type="number" placeholder="0" value={cd.amount} onChange={(e) => handleCustomFieldChange(p.id, 'deduction', cd.id, 'amount', e.target.value)} className="w-16 p-1 bg-gray-900 rounded text-xs text-right border border-gray-600 text-white" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="text-right border-t border-gray-700 pt-2 font-bold text-amber-400">Net: {formatCurrency(netPay)} THB</div>
                            </div>
                        )
                    })}
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-700">
                    <button onClick={handleAddPayslip} className="flex items-center text-sm bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-white transition-colors"><Plus className="w-4 h-4 mr-1" /> Add Another Month</button>
                    <button onClick={handleGeneratePDF} disabled={isGenerating || !selectedStaffId || payslips.length === 0} className="flex items-center text-sm bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-bold text-white transition-colors disabled:opacity-50">
                        {isGenerating ? 'Generating...' : <><Download className="w-4 h-4 mr-2" /> Download Multi-Page PDF</>}
                    </button>
                </div>
            </div>
        </Modal>
    );
}