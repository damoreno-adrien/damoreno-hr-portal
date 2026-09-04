/* src/components/Payroll/PayrollExportOptionsModal.jsx */
import React, { useState, useEffect } from 'react';
import { X, Download, FileText, CheckCircle2, Circle } from 'lucide-react';

const FIELD_LIST = [
    { id: 'nickname', label: 'Nickname', category: 'Personal' },
    { id: 'fullName', label: 'Full Name', category: 'Personal' },
    { id: 'department', label: 'Department', category: 'Job' },
    { id: 'position', label: 'Position', category: 'Job' },
    { id: 'basePay', label: 'Base Pay', category: 'Earnings' },
    { id: 'attendanceBonus', label: 'Attendance Bonus', category: 'Earnings' },
    { id: 'ssoAllowance', label: 'SSO Allowance', category: 'Earnings' },
    { id: 'totalEarnings', label: 'Total Earnings', category: 'Earnings' },
    { id: 'absences', label: 'Absences', category: 'Deductions' },
    { id: 'ssoDeduction', label: 'SSO Deduction', category: 'Deductions' },
    { id: 'advance', label: 'Salary Advance', category: 'Deductions' },
    { id: 'loan', label: 'Loan Repayment', category: 'Deductions' },
    { id: 'totalDeductions', label: 'Total Deductions', category: 'Deductions' },
    { id: 'netPay', label: 'Net Pay', category: 'Payment' },
    { id: 'paymentMethod', label: 'Payment Method', category: 'Payment' },
];

const DEFAULT_FIELD_IDS = ['nickname', 'fullName', 'department', 'totalEarnings', 'totalDeductions', 'netPay', 'paymentMethod'];

export default function PayrollExportOptionsModal({ isOpen, onClose, onExport, selectedCount = 0 }) {
    const [selectedFieldIds, setSelectedFieldIds] = useState(DEFAULT_FIELD_IDS);
    const [format, setFormat] = useState('csv');
    const [sortBy, setSortBy] = useState('name');

    // Reset to the "Quick Extract" defaults every time the modal opens
    useEffect(() => {
        if (isOpen) {
            setSelectedFieldIds(DEFAULT_FIELD_IDS);
            setFormat('csv');
            setSortBy('name');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const toggleField = (id) => {
        setSelectedFieldIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const handleSelectAll = () => setSelectedFieldIds(FIELD_LIST.map(f => f.id));
    const handleClear = () => setSelectedFieldIds([]);

    const handleExportClick = () => {
        if (selectedFieldIds.length === 0) return;
        // Preserve a consistent, predictable column order based on FIELD_LIST definition order,
        // regardless of the order fields were toggled on in.
        const orderedFields = FIELD_LIST.filter(f => selectedFieldIds.includes(f.id)).map(f => f.id);
        onExport({ fields: orderedFields, format, sortBy });
    };

    const categories = [...new Set(FIELD_LIST.map(f => f.category))];

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[200] p-4 animate-fadeIn">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] border border-gray-700 flex flex-col">

                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-gray-700 shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Download className="h-5 w-5 text-indigo-400" /> Export Payroll ({selectedCount} selected)
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">Choose which fields to include and the output format.</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 bg-gray-700/50 rounded-lg">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-800/40">

                    {/* Format & Sort */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-900/50 border border-gray-700/60 rounded-xl">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Export Format</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-200">
                                    <input
                                        type="radio"
                                        name="payroll-export-format"
                                        value="csv"
                                        checked={format === 'csv'}
                                        onChange={() => setFormat('csv')}
                                        className="text-indigo-500 focus:ring-indigo-500"
                                    />
                                    CSV
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-200">
                                    <input
                                        type="radio"
                                        name="payroll-export-format"
                                        value="pdf"
                                        checked={format === 'pdf'}
                                        onChange={() => setFormat('pdf')}
                                        className="text-indigo-500 focus:ring-indigo-500"
                                    />
                                    PDF (Landscape)
                                </label>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Sort By</label>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white font-medium text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="name">Name</option>
                                <option value="department">Department</option>
                                <option value="netPay">Net Pay (Highest First)</option>
                            </select>
                        </div>
                    </div>

                    {/* Fields */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-bold text-white uppercase tracking-wide">Fields to Include</h4>
                            <div className="flex gap-2">
                                <button type="button" onClick={handleSelectAll} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20 transition-all">Select All</button>
                                <button type="button" onClick={handleClear} className="text-xs font-semibold text-gray-400 hover:text-gray-300 bg-gray-700 px-2.5 py-1 rounded border border-gray-600 transition-all">Clear All</button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {categories.map(category => (
                                <div key={category}>
                                    <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">{category}</h5>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {FIELD_LIST.filter(f => f.category === category).map(field => {
                                            const isSelected = selectedFieldIds.includes(field.id);
                                            return (
                                                <button
                                                    key={field.id}
                                                    type="button"
                                                    onClick={() => toggleField(field.id)}
                                                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${
                                                        isSelected
                                                            ? 'bg-gray-800/90 border-indigo-500/40'
                                                            : 'bg-gray-800/30 border-gray-700/60 opacity-60 hover:opacity-80'
                                                    }`}
                                                >
                                                    {isSelected ? <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0" /> : <Circle className="h-4 w-4 text-gray-600 shrink-0" />}
                                                    <span className={`text-sm ${isSelected ? 'text-gray-100 font-semibold' : 'text-gray-400'}`}>{field.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center p-4 border-t border-gray-700 bg-gray-800/50 rounded-b-xl shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white font-medium transition-colors border border-transparent hover:border-gray-700 rounded-lg">
                        Cancel
                    </button>
                    <button
                        onClick={handleExportClick}
                        disabled={selectedFieldIds.length === 0 || selectedCount === 0}
                        className="flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg font-bold text-sm transition-all shadow-lg active:scale-95"
                    >
                        <FileText className="w-4 h-4 mr-2" /> Export ({selectedCount} selected)
                    </button>
                </div>
            </div>
        </div>
    );
}
