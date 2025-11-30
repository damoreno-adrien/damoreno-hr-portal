import React, { useMemo } from 'react';
import Modal from './Modal';
import { CheckCircle, AlertTriangle, Info, ArrowRight, Plus } from 'lucide-react'; 
import * as dateUtils from '../../utils/dateUtils';

// Helper to get a consistent display name
const getRowName = (row) => {
    let name = 'Unknown';
    
    if (row.name) name = row.name;
    else if (row.displayName) name = row.displayName;
    else if (row.staffName) name = row.staffName;
    else if (row.staffId) name = row.staffId;

    if (row.date) {
        const dateObj = dateUtils.parseISODateString(row.date);
        const dateStr = dateObj ? dateUtils.formatCustom(dateObj, 'dd/MM/yy') : row.date;
        return `${dateStr} - ${name}`;
    }

    if (row.email) {
        return `${name} (${row.email})`;
    }

    return name;
};

const formatValue = (value) => {
    if (value && typeof value === 'object' && value._seconds !== undefined) {
        try {
            return new Date(value._seconds * 1000).toLocaleDateString('en-GB');
        } catch (e) {
            return '[Date]';
        }
    }
    if (value === null || value === undefined || value === '') return 'Empty';
    return String(value);
};

const renderUpdateChanges = (details) => {
    return (
        <ul className="list-['▹'] list-inside ml-4 text-gray-400">
            {Object.entries(details || {}).map(([field, change]) => (
                <li key={field}>
                    <span className="font-semibold">{field}</span>:
                    <span className="text-red-400 line-through ml-1">{formatValue(change.from)}</span>
                    <ArrowRight className="inline-block mx-1 h-3 w-3 text-gray-400" />
                    <span className="text-green-400">{formatValue(change.to)}</span>
                </li>
            ))}
        </ul>
    );
};

// --- FIX 1: Add safety check for null details ---
const renderCreateChanges = (details) => {
    if (!details) return '';
    if (details.type === 'work') {
        return `Set to WORK: ${details.startTime} - ${details.endTime}`;
    }
    return `Set to OFF`;
};

export default function ImportConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    analysis,
    isLoading,
    fileName = "Import",
    error,
    entityName
}) {
    const safeAnalysis = useMemo(() => analysis || {}, [analysis]);
    
    const { creates = [], updates = [], deletes = [], noChanges = [], errors = [] } = safeAnalysis;
    const totalProcessed = creates.length + updates.length + deletes.length + noChanges.length + errors.length;

    // --- FIX 2: Smarter detection logic ---
    const isPlanningImport = useMemo(() => {
        // Explicitly check fileName to distinguish between Attendance and Planning
        if (fileName && fileName.toLowerCase().includes('planning')) return true;
        if (fileName && fileName.toLowerCase().includes('attendance')) return false;

        // Fallback: Check data structure if fileName is generic
        const firstRow = creates[0] || updates[0] || errors[0];
        // Planning imports usually have 'details' with schedule info, not just 'date'
        return firstRow && firstRow.hasOwnProperty('date') && !firstRow.hasOwnProperty('checkInTime'); 
    }, [creates, updates, errors, fileName]);

    const label = entityName || (isPlanningImport ? 'Schedules' : 'Staff');
    
    const AnalysisSection = ({ title, icon, data, colorClass }) => {
        if (!data || data.length === 0) return null;
        return (
            <div>
                <h4 className={`text-lg font-semibold flex items-center mb-2 ${colorClass}`}>
                    {icon}
                    <span className="ml-2">{title} ({data.length})</span>
                </h4>
                <div className="max-h-40 overflow-y-auto bg-gray-900 rounded-md p-3 space-y-2">
                    {data.map((row) => (
                        <div key={row.rowNum} className="text-sm border-b border-gray-700 pb-2 last:border-b-0">
                            <p className="font-medium text-gray-200">
                                Row {row.rowNum}: {getRowName(row)}
                            </p>
                            
                            {row.action === 'error' && (
                                <p className="text-red-400 text-xs">{row.errors.join(', ')}</p>
                            )}

                            {isPlanningImport && row.action === 'create' && (
                                <div className="text-gray-400 text-xs">{renderCreateChanges(row.details)}</div>
                            )}
                            
                            {!isPlanningImport && row.action === 'create' && (
                                <div className="text-gray-400 text-xs">
                                    {row.createData ? "New record will be created." : "New user will be created."}
                                </div>
                            )}

                            {row.action === 'update' && (
                                <div className="text-gray-400">{renderUpdateChanges(row.details)}</div>
                            )}
                             
                            {row.action === 'delete' && (
                                <div className="text-red-400 text-xs">
                                    Record will be deleted. {row.details?.note && `(${row.details.note})`}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    if (!analysis) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Confirm ${fileName}`}>
            <div className="space-y-6">
                <p className="text-gray-300">
                    The file has been analyzed. Please review the changes below before confirming the import.
                </p>
                <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="bg-gray-700 p-3 rounded-lg">
                        <p className="text-sm text-gray-400">Total Rows Processed</p>
                        <p className="text-2xl font-bold text-white">{totalProcessed}</p>
                    </div>
                    <div className="bg-gray-700 p-3 rounded-lg">
                        <p className="text-sm text-gray-400">Total Errors Found</p>
                        <p className={`text-2xl font-bold ${errors.length > 0 ? 'text-red-400' : 'text-green-400'}`}>{errors.length}</p>
                    </div>
                </div>

                {error && (
                     <div className="bg-red-900/50 border border-red-700 text-red-300 p-3 rounded-lg">
                        <p className="font-bold">An error occurred:</p>
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                <div className="space-y-4">
                    <AnalysisSection
                        title="Errors"
                        icon={<AlertTriangle className="h-5 w-5" />}
                        data={errors}
                        colorClass="text-red-400"
                    />
                    <AnalysisSection
                        title="Deletions"
                        icon={<AlertTriangle className="h-5 w-5" />}
                        data={deletes}
                        colorClass="text-red-500"
                    />
                    <AnalysisSection
                        title={`New ${label} to Create`}
                        icon={<Plus className="h-5 w-5" />}
                        data={creates}
                        colorClass="text-green-400"
                    />
                    <AnalysisSection
                        title={`${label} to Update`}
                        icon={<CheckCircle className="h-5 w-5" />}
                        data={updates}
                        colorClass="text-yellow-400"
                    />
                    <AnalysisSection
                        title="No Changes Detected"
                        icon={<Info className="h-5 w-5" />}
                        data={noChanges}
                        colorClass="text-gray-400"
                    />
                </div>
                
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-4 pt-6 border-t border-gray-700">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="mt-3 sm:mt-0 w-full sm:w-auto px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isLoading || errors.length > 0 || (creates.length === 0 && updates.length === 0 && deletes.length === 0)}
                        className="w-full sm:w-auto px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:bg-gray-500"
                    >
                        {isLoading ? 'Importing...' : `Confirm Import (${creates.length + updates.length + deletes.length} changes)`}
                    </button>
                </div>
            </div>
        </Modal>
    );
};