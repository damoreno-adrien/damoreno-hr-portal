/* src/components/Attendance/AttendanceExportOptionsModal.jsx */
import React, { useState } from 'react';
import Modal from '../common/Modal';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
import { ATTENDANCE_EXPORT_FIELDS } from '../../utils/attendanceExport';

export default function AttendanceExportOptionsModal({ isOpen, onClose, onExport, recordCount }) {
    // Par défaut on coche l'essentiel
    const [selectedFields, setSelectedFields] = useState({
        nickname: true, fullName: false, position: false,
        date: true, status: true, variance: true,
        checkIn: true, checkOut: true, workHours: true
    });
    
    const [format, setFormat] = useState('pdf');
    const [sortBy, setSortBy] = useState('date');

    if (!isOpen) return null;

    const handleToggleField = (key) => {
        setSelectedFields(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleExport = () => {
        const fieldsToExport = Object.keys(selectedFields).filter(key => selectedFields[key]);
        onExport({ fields: fieldsToExport, format, sortBy });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Export Attendance Report">
            <div className="space-y-6 text-gray-200">
                <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">1. Select Columns to Export</label>
                    <div className="grid grid-cols-2 gap-2 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                        {Object.entries(ATTENDANCE_EXPORT_FIELDS).map(([key, label]) => (
                            <label key={key} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-gray-800 rounded">
                                <input 
                                    type="checkbox" 
                                    checked={selectedFields[key]} 
                                    onChange={() => handleToggleField(key)}
                                    className="rounded bg-gray-900 border-gray-600 text-indigo-500 focus:ring-indigo-500"
                                />
                                <span className="text-sm">{label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">2. Sort By</label>
                        <select 
                            value={sortBy} 
                            onChange={(e) => setSortBy(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2.5 outline-none focus:border-indigo-500"
                        >
                            <option value="date">Date (Chronological)</option>
                            <option value="name">Staff Name (A-Z)</option>
                            <option value="status">Status</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">3. Format</label>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setFormat('pdf')} 
                                className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border transition-all ${format === 'pdf' ? 'bg-red-900/30 border-red-500 text-red-400' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}
                            >
                                <FileText className="w-4 h-4" /> PDF
                            </button>
                            <button 
                                onClick={() => setFormat('csv')} 
                                className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border transition-all ${format === 'csv' ? 'bg-green-900/30 border-green-500 text-green-400' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}
                            >
                                <FileSpreadsheet className="w-4 h-4" /> CSV
                            </button>
                        </div>
                    </div>
                </div>

                <button 
                    onClick={handleExport}
                    disabled={Object.values(selectedFields).filter(Boolean).length === 0}
                    className="w-full mt-4 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg disabled:opacity-50"
                >
                    <Download className="w-5 h-5" />
                    Extract {recordCount} Records
                </button>
            </div>
        </Modal>
    );
}