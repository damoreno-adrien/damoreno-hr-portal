/* src/components/StaffProfile/StaffProfileExportModal.jsx */
import React, { useState } from 'react';
import { X, Download, Loader2, FileText } from 'lucide-react';
import { exportIndividualStaffProfile } from '../../utils/pdfExport';

export default function StaffProfileExportModal({ isOpen, onClose, staff, companyConfig }) {
    const [options, setOptions] = useState({
        includePersonal: true,
        includeJob: true,
        includeHR: true,
        includeDocuments: true
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const toggleOption = (key) => {
        setOptions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError('');
        try {
            await exportIndividualStaffProfile({ staff, companyConfig, options });
            onClose();
        } catch (err) {
            console.error("Failed to generate staff profile PDF:", err);
            setError("Failed to generate PDF. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const checkboxConfig = [
        { key: 'includePersonal', label: 'Personal Information', description: 'Contact details, address, bank account, SSO status & ID document.' },
        { key: 'includeJob', label: 'Job & Financials', description: 'Current department, position, start date and pay rate.' },
        { key: 'includeHR', label: 'HR Settings', description: 'Employment status, bonus streak and holiday policy.' },
        { key: 'includeDocuments', label: 'List Official Documents', description: 'Appendix listing all uploaded documents with clickable links.' },
    ];

    const hasAnyOptionSelected = Object.values(options).some(Boolean);

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[200] p-4 animate-fadeIn">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700">

                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-gray-700">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <FileText className="h-5 w-5 text-indigo-400" /> Export Profile to PDF
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">Select the sections to include in the report.</p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isGenerating}
                        className="text-gray-400 hover:text-white transition-colors p-1 bg-gray-700/50 rounded-lg disabled:opacity-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Options */}
                <div className="p-5 space-y-3">
                    {checkboxConfig.map(({ key, label, description }) => (
                        <label
                            key={key}
                            className="flex items-start space-x-3 p-3 bg-gray-900/40 rounded-lg border border-gray-700/60 cursor-pointer hover:border-indigo-500/40 transition-colors"
                        >
                            <input
                                type="checkbox"
                                checked={options[key]}
                                onChange={() => toggleOption(key)}
                                disabled={isGenerating}
                                className="h-5 w-5 mt-0.5 rounded bg-gray-700 border-gray-600 text-indigo-500 focus:ring-indigo-500 disabled:opacity-50"
                            />
                            <div>
                                <span className="text-sm font-semibold text-white">{label}</span>
                                <p className="text-xs text-gray-400">{description}</p>
                            </div>
                        </label>
                    ))}

                    {error && <p className="text-red-400 text-sm bg-red-900/30 p-2 rounded-md">{error}</p>}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 p-4 border-t border-gray-700 bg-gray-800/50 rounded-b-xl">
                    <button
                        onClick={onClose}
                        disabled={isGenerating}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white font-medium transition-colors border border-transparent hover:border-gray-700 rounded-lg disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || !hasAnyOptionSelected}
                        className="flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg font-bold text-sm transition-all shadow-lg active:scale-95"
                    >
                        {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        {isGenerating ? 'Generating...' : 'Generate PDF'}
                    </button>
                </div>
            </div>
        </div>
    );
}
