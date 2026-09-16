/* src/components/Financials/FinancialsExportOptionsModal.jsx */
import React, { useState, useEffect, useMemo } from 'react';
import { X, Download, FileText, GripVertical, CheckCircle2, Circle, ArrowUpDown } from 'lucide-react';
import { FINANCIAL_EXPORT_FIELDS, generateCustomFinancialsExport } from '../../utils/financialsExport';
import * as dateUtils from '../../utils/dateUtils';

const getStaffCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) return null;
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(a.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(b.startDate) || new Date(0);
        return dateB - dateA;
    })[0];
};

export default function FinancialsExportOptionsModal({ 
    isOpen, 
    onClose, 
    transactions = [], 
    exportTargetTab = 'all', 
    activeBranch, 
    companyConfig,
    payPeriod
}) {
    const [selectedFieldIds, setSelectedFieldIds] = useState([]);
    const [fieldsOrder, setFieldsOrder] = useState([]);
    const [draggedIndex, setDraggedIndex] = useState(null);

    // --- ETATS DE FILTRAGE ET TRI ---
    const [filters, setFilters] = useState({ department: 'All', status: 'All' });
    const [sortConfig, setSortConfig] = useState({ key: 'date', dir: 'desc' });

    const dictionary = exportTargetTab === 'loans' ? FINANCIAL_EXPORT_FIELDS.loan : FINANCIAL_EXPORT_FIELDS.standard;

    useEffect(() => {
        if (isOpen) {
            const mandatoryIds = dictionary.filter(f => f.mandatory).map(f => f.id);
            const defaultOptionalIds = ['nickname', 'department']; // Valeurs par défaut supplémentaires
            setSelectedFieldIds([...new Set([...mandatoryIds, ...defaultOptionalIds])]);
            setFieldsOrder([...dictionary]);
            setFilters({ department: 'All', status: 'All' });
        }
    }, [isOpen, exportTargetTab, dictionary]);

    // Extraction dynamique des départements présents dans ces transactions
    const availableDepartments = useMemo(() => {
        const depts = new Set();
        transactions.forEach(t => {
            const job = getStaffCurrentJob(t.staff);
            if (job?.department) depts.add(job.department);
        });
        return ['All', ...Array.from(depts)];
    }, [transactions]);

    // Extraction dynamique des statuts présents
    const availableStatuses = useMemo(() => {
        const statuses = new Set();
        transactions.forEach(t => {
            if (t.status) statuses.add(t.status.toUpperCase());
        });
        return ['All', ...Array.from(statuses)];
    }, [transactions]);

    if (!isOpen) return null;

    const toggleField = (id) => {
        const field = dictionary.find(f => f.id === id);
        if (field?.mandatory) return; 
        setSelectedFieldIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const handleSelectAll = () => setSelectedFieldIds(dictionary.map(f => f.id));
    const handleClearOptional = () => setSelectedFieldIds(dictionary.filter(f => f.mandatory).map(f => f.id));

    // Drag and Drop
    const handleDragStart = (index) => setDraggedIndex(index);
    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        const updatedOrder = [...fieldsOrder];
        const draggedItem = updatedOrder[draggedIndex];
        updatedOrder.splice(draggedIndex, 1);
        updatedOrder.splice(index, 0, draggedItem);
        setDraggedIndex(index);
        setFieldsOrder(updatedOrder);
    };
    const handleDragEnd = () => setDraggedIndex(null);

    const toggleSortDirection = () => setSortConfig(prev => ({ ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }));

    const handleExport = (format) => {
        const orderedSelectedFields = fieldsOrder.filter(f => selectedFieldIds.includes(f.id));
        
        generateCustomFinancialsExport({
            transactions,
            exportTargetTab,
            options: { fields: orderedSelectedFields, format },
            filters,
            sortConfig,
            branchName: activeBranch === 'global' ? 'All Branches' : `Branch ID: ${activeBranch}`,
            payPeriod,
            companyConfig
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[200] p-4 animate-fadeIn">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] border border-gray-700 flex flex-col">
                
                <div className="flex justify-between items-center p-5 border-b border-gray-700 shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Download className="h-5 w-5 text-indigo-400" /> Advanced Financials Export
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Customizing export for <span className="text-amber-400 font-bold capitalize">{exportTargetTab}</span> records
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 bg-gray-700/50 rounded-lg">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-800/40 custom-scrollbar">
                    
                    {/* SECTION 1: Pre-Filters & Sorting Rules */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-900/50 border border-gray-700/60 rounded-xl">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Scope Department</label>
                            <select 
                                value={filters.department}
                                onChange={(e) => setFilters(prev => ({ ...prev, department: e.target.value }))}
                                className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white font-medium text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                {availableDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Transaction Status</label>
                            <select 
                                value={filters.status}
                                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                                className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white font-medium text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                {availableStatuses.map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Sort Row Target</label>
                            <div className="flex gap-2">
                                <select 
                                    value={sortConfig.key}
                                    onChange={(e) => setSortConfig(prev => ({ ...prev, key: e.target.value }))}
                                    className="flex-1 p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white font-medium text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="date">By Date</option>
                                    <option value="name">By Staff Name</option>
                                    <option value="department">By Department</option>
                                    <option value="amount">By Amount</option>
                                </select>
                                <button 
                                    onClick={toggleSortDirection}
                                    className="p-2.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-indigo-400 hover:text-indigo-300 transition-colors"
                                    title={sortConfig.dir === 'asc' ? 'Ascending' : 'Descending'}
                                >
                                    <ArrowUpDown className={`h-5 w-5 transform transition-transform duration-200 ${sortConfig.dir === 'desc' ? 'rotate-180' : ''}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* SECTION 2: Column Matrix */}
                    <div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                            <div>
                                <h4 className="text-sm font-bold text-white uppercase tracking-wide">Column Configuration</h4>
                                <p className="text-xs text-gray-400">Select and arrange the columns to include in your export.</p>
                            </div>
                            <div className="flex gap-2 self-start sm:self-center">
                                <button type="button" onClick={handleSelectAll} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20 transition-all">Select All</button>
                                <button type="button" onClick={handleClearOptional} className="text-xs font-semibold text-gray-400 hover:text-gray-300 bg-gray-700 px-2.5 py-1 rounded border border-gray-600 transition-all">Reset</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-1 bg-gray-900/20 rounded-xl">
                            {fieldsOrder.map((field, index) => {
                                const isSelected = selectedFieldIds.includes(field.id);
                                const isDragged = draggedIndex === index;

                                return (
                                    <div
                                        key={field.id} draggable onDragStart={() => handleDragStart(index)} onDragOver={(e) => handleDragOver(e, index)} onDragEnd={handleDragEnd}
                                        className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-150 ${isSelected ? 'bg-gray-800/90 border-indigo-500/40 shadow-md' : 'bg-gray-800/30 border-gray-700/60 opacity-60 hover:opacity-80'} ${isDragged ? 'border-dashed border-indigo-500 bg-indigo-900/20 scale-[0.98]' : ''}`}
                                    >
                                        <div className="flex items-center space-x-3 truncate mr-2">
                                            <div className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-gray-300 transition-colors">
                                                <GripVertical className="h-4 w-4 shrink-0" />
                                            </div>
                                            <button type="button" onClick={() => toggleField(field.id)} className={`transition-colors outline-none shrink-0 ${field.mandatory ? 'text-indigo-400 cursor-not-allowed' : 'text-gray-400 hover:text-white'}`} disabled={field.mandatory}>
                                                {isSelected ? <CheckCircle2 className="h-5 w-5 text-indigo-500 fill-indigo-500/10" /> : <Circle className="h-5 w-5 text-gray-600" />}
                                            </button>
                                            <div className="truncate flex flex-col">
                                                <span className={`text-sm font-medium truncate ${isSelected ? 'text-gray-100 font-semibold' : 'text-gray-400'}`}>{field.label}</span>
                                                <span className="text-[10px] text-gray-500 tracking-wide">{field.category}</span>
                                            </div>
                                        </div>
                                        {field.mandatory && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded shrink-0">Required</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center p-4 border-t border-gray-700 bg-gray-800/50 rounded-b-xl shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white font-medium transition-colors border border-transparent hover:border-gray-700 rounded-lg">Cancel</button>
                    <div className="flex gap-2">
                        <button onClick={() => handleExport('csv')} disabled={selectedFieldIds.length === 0 || transactions.length === 0} className="flex items-center px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg font-bold text-sm transition-all shadow-lg active:scale-95">
                            <FileText className="w-4 h-4 mr-2" /> Export CSV
                        </button>
                        <button onClick={() => handleExport('pdf')} disabled={selectedFieldIds.length === 0 || transactions.length === 0} className="flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg font-bold text-sm transition-all shadow-lg active:scale-95">
                            <Download className="w-4 h-4 mr-2" /> Export PDF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}