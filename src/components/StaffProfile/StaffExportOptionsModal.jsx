/* src/components/StaffProfile/StaffExportOptionsModal.jsx */
import React, { useState, useMemo, useEffect } from 'react';
import { X, Download, FileText, GripVertical, CheckCircle2, Circle, ArrowUpDown } from 'lucide-react';
import { generateCustomStaffExport } from '../../utils/staffExport';

const MASTER_DICTIONARY = [
    { id: 'id', label: 'Document ID (UID)', category: 'Technical', mandatory: false },
    { id: 'name', label: 'Full Name', category: 'Personal', mandatory: true },
    { id: 'nickname', label: 'Nickname', category: 'Personal', mandatory: false },
    { id: 'department', label: 'Department', category: 'Job', mandatory: true },
    { id: 'position', label: 'Position', category: 'Job', mandatory: false },
    { id: 'status', label: 'Status', category: 'Job', mandatory: false },
    { id: 'email', label: 'Email Address', category: 'Personal', mandatory: false },
    { id: 'phone', label: 'Phone Number', category: 'Personal', mandatory: false },
    { id: 'address', label: 'Physical Address', category: 'Personal', mandatory: false },
    { id: 'startDate', label: 'Start Date', category: 'Job', mandatory: false },
    { id: 'baseSalary', label: 'Base Salary', category: 'Financial', mandatory: false },
    { id: 'payType', label: 'Payment Type', category: 'Financial', mandatory: false },
    { id: 'bankName', label: 'Bank Name', category: 'Financial', mandatory: false },
    { id: 'bankAccountNumber', label: 'Bank Account Number', category: 'Financial', mandatory: false },
    { id: 'bonusStreak', label: 'Bonus Streak', category: 'Performance', mandatory: false },
    { id: 'emergencyContactName', label: 'Emergency Contact Name', category: 'Emergency', mandatory: false },
    { id: 'emergencyContactPhone', label: 'Emergency Contact Phone', category: 'Emergency', mandatory: false }
];

export default function StaffExportOptionsModal({ 
    isOpen, 
    onClose, 
    staffList = [], 
    activeBranch, 
    userRole, 
    adminBranchIds 
}) {
    const [selectedFieldIds, setSelectedFieldIds] = useState([]);
    const [fieldsOrder, setFieldsOrder] = useState([]);
    const [draggedIndex, setDraggedIndex] = useState(null);

    // États locaux pour le filtrage et le tri à l'intérieur du rapport personnalisé
    const [filters, setFilters] = useState({ department: 'All', status: 'Active' });
    const [sortConfig, setSortConfig] = useState({ key: 'department', dir: 'asc' });

    // Initialisation par défaut à l'ouverture de la modale
    useEffect(() => {
        if (isOpen) {
            const mandatoryIds = MASTER_DICTIONARY.filter(f => f.mandatory).map(f => f.id);
            const defaultOptionalIds = ['nickname', 'position', 'startDate', 'status'];
            setSelectedFieldIds([...mandatoryIds, ...defaultOptionalIds]);
            setFieldsOrder([...MASTER_DICTIONARY]);
        }
    }, [isOpen]);

    // Extraire la liste unique des départements présents pour le composant de filtre de l'UI
    const availableDepartments = useMemo(() => {
        const depts = new Set();
        staffList.forEach(staff => {
            if (staff.jobHistory && staff.jobHistory.length > 0) {
                const sortedJobs = [...staff.jobHistory].sort((a, b) => b.startDate - a.startDate);
                if (sortedJobs[0]?.department) depts.add(sortedJobs[0].department);
            } else if (staff.department) {
                depts.add(staff.department);
            }
        });
        return ['All', ...Array.from(depts)];
    }, [staffList]);

    if (!isOpen) return null;

    const toggleField = (id) => {
        const field = MASTER_DICTIONARY.find(f => f.id === id);
        if (field?.mandatory) return; // Impossible de désélectionner un champ requis

        setSelectedFieldIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        setSelectedFieldIds(MASTER_DICTIONARY.map(f => f.id));
    };

    const handleClearOptional = () => {
        setSelectedFieldIds(MASTER_DICTIONARY.filter(f => f.mandatory).map(f => f.id));
    };

    // Gestion du Drag and Drop pour réordonner les colonnes
    const handleDragStart = (index) => {
        setDraggedIndex(index);
    };

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

    const handleDragEnd = () => {
        setDraggedIndex(null);
    };

    const toggleSortDirection = () => {
        setSortConfig(prev => ({ ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }));
    };

    // Déclenchement de l'export avec injection des filtres et du contexte de branche
    const handleExport = (format) => {
        const orderedSelectedFields = fieldsOrder.filter(f => selectedFieldIds.includes(f.id));
        
        generateCustomStaffExport({
            staffList,
            filters,
            sortConfig,
            selectedFields: orderedSelectedFields,
            format,
            branchName: activeBranch === 'global' ? 'All Branches' : `Branch ID: ${activeBranch}`,
            activeBranch,
            userRole,
            adminBranchIds
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-fadeIn">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] border border-gray-700 flex flex-col">
                
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-gray-700 shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Download className="h-5 w-5 text-indigo-400" /> Advanced Staff Export Engine
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">Customize fields, sorting orientation and layouts before compilation.</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 bg-gray-700/50 rounded-lg">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content Area */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-800/40">
                    
                    {/* Section 1: Pre-Filters & Sorting Rules */}
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
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Contract Status</label>
                            <select 
                                value={filters.status}
                                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                                className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white font-medium text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="All">All Workers (Active + Inactive)</option>
                                <option value="Active">Active Contracts Only</option>
                                <option value="Inactive">Terminated / Inactive Only</option>
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
                                    <option value="department">By Department</option>
                                    <option value="name">By Nickname / First Name</option>
                                    <option value="startDate">By Seniority (Start Date)</option>
                                    <option value="baseSalary">By Structural Base Salary</option>
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

                    {/* Section 2: Field Selection & Order Matrix */}
                    <div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                            <div>
                                <h4 className="text-sm font-bold text-white uppercase tracking-wide">Column Configuration Matrix</h4>
                                <p className="text-xs text-gray-400">Toggle inclusion checkboxes and drag items using the handle to arrange column mapping structure.</p>
                            </div>
                            <div className="flex gap-2 self-start sm:self-center">
                                <button type="button" onClick={handleSelectAll} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20 transition-all">Select All</button>
                                <button type="button" onClick={handleClearOptional} className="text-xs font-semibold text-gray-400 hover:text-gray-300 bg-gray-700 px-2.5 py-1 rounded border border-gray-600 transition-all">Reset Requisites</button>
                            </div>
                        </div>

                        {/* Drag and Drop Grid Layout */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-1 bg-gray-900/20 rounded-xl">
                            {fieldsOrder.map((field, index) => {
                                const isSelected = selectedFieldIds.includes(field.id);
                                const isDragged = draggedIndex === index;

                                return (
                                    <div
                                        key={field.id}
                                        draggable
                                        onDragStart={() => handleDragStart(index)}
                                        onDragOver={(e) => handleDragOver(e, index)}
                                        onDragEnd={handleDragEnd}
                                        className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-150 ${
                                            isSelected 
                                                ? 'bg-gray-800/90 border-indigo-500/40 shadow-md' 
                                                : 'bg-gray-800/30 border-gray-700/60 opacity-60 hover:opacity-80'
                                        } ${isDragged ? 'border-dashed border-indigo-500 bg-indigo-900/20 scale-[0.98]' : ''}`}
                                    >
                                        <div className="flex items-center space-x-3 truncate mr-2">
                                            {/* Drag Handle */}
                                            <div className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-gray-300 transition-colors">
                                                <GripVertical className="h-4 w-4 shrink-0" />
                                            </div>

                                            {/* Checkbox Trigger */}
                                            <button 
                                                type="button"
                                                onClick={() => toggleField(field.id)}
                                                className={`transition-colors outline-none shrink-0 ${field.mandatory ? 'text-indigo-400 cursor-not-allowed' : 'text-gray-400 hover:text-white'}`}
                                                disabled={field.mandatory}
                                            >
                                                {isSelected ? <CheckCircle2 className="h-5 w-5 text-indigo-500 fill-indigo-500/10" /> : <Circle className="h-5 w-5 text-gray-600" />}
                                            </button>

                                            {/* Meta Label Content */}
                                            <div className="truncate flex flex-col">
                                                <span className={`text-sm font-medium truncate ${isSelected ? 'text-gray-100 font-semibold' : 'text-gray-400'}`}>
                                                    {field.label}
                                                </span>
                                                <span className="text-[10px] text-gray-500 tracking-wide">{field.category}</span>
                                            </div>
                                        </div>

                                        {field.mandatory && (
                                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded shrink-0">
                                                Required
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer Action Controls */}
                <div className="flex justify-between items-center p-4 border-t border-gray-700 bg-gray-800/50 rounded-b-xl shrink-0">
                    <button 
                        onClick={onClose} 
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white font-medium transition-colors border border-transparent hover:border-gray-700 rounded-lg"
                    >
                        Cancel
                    </button>
                    
                    <div className="flex gap-2">
                        <button 
                            onClick={() => handleExport('csv')} 
                            disabled={selectedFieldIds.length === 0} 
                            className="flex items-center px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg font-bold text-sm transition-all shadow-lg active:scale-95"
                        >
                            <FileText className="w-4 h-4 mr-2" /> Export CSV
                        </button>
                        <button 
                            onClick={() => handleExport('pdf')} 
                            disabled={selectedFieldIds.length === 0} 
                            className="flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg font-bold text-sm transition-all shadow-lg active:scale-95"
                        >
                            <Download className="w-4 h-4 mr-2" /> Export PDF (Landscape)
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}