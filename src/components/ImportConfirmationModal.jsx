// src/components/ImportConfirmationModal.jsx
import React from 'react';
import Modal from './Modal'; // Assuming Modal.jsx is in the same directory

const ImportConfirmationModal = ({ isOpen, onClose, analysisResult, onConfirm, isConfirming }) => {
    if (!analysisResult) return null; // Don't render if no analysis data

    const { creates = [], updates = [], noChanges = [], errors = [] } = analysisResult;

    const renderChanges = (changeDetail) => {
        if (!changeDetail || typeof changeDetail !== 'object') return 'N/A';

        // Special handling for job changes
        if (changeDetail.from && typeof changeDetail.from === 'object' && changeDetail.to && typeof changeDetail.to === 'object' && changeDetail.to.position) {
             const fromJob = changeDetail.from === 'None' ? 'None' : `${changeDetail.from.position} (${changeDetail.from.department}), ${changeDetail.from.rate} (${changeDetail.from.payType})`;
             const toJob = `${changeDetail.to.position} (${changeDetail.to.department}), ${changeDetail.to.rate} (${changeDetail.to.payType})`;
             return `Job: ${fromJob} -> ${toJob}`;
        }

        // Handle date (Timestamp) changes - Format them if possible
        const formatValue = (value) => {
            if (value && typeof value === 'object' && value.seconds !== undefined) {
                 try {
                    // Basic date formatting, you might want date-fns here if needed
                    return new Date(value.seconds * 1000).toLocaleDateString('en-GB'); // dd/mm/yyyy
                 } catch (e) {
                     return '[Date Object]';
                 }
            }
             if (value === null || value === undefined || value === '') return 'Empty';
            return String(value);
        };

        return `${formatValue(changeDetail.from)} -> ${formatValue(changeDetail.to)}`;
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Confirm Staff Import">
            <div className="space-y-4 text-sm text-gray-300">
                <p className="font-semibold text-lg text-amber-400">Import Summary:</p>

                {/* Creates */}
                {creates.length > 0 && (
                    <div>
                        <p className="font-medium text-green-400">{creates.length} New Staff Member(s) to Create:</p>
                        <ul className="list-disc list-inside ml-4 max-h-32 overflow-y-auto">
                            {creates.map(item => (
                                <li key={item.rowNum}>{item.displayName} ({item.email})</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Updates */}
                {updates.length > 0 && (
                    <div>
                        <p className="font-medium text-blue-400">{updates.length} Staff Member(s) to Update:</p>
                        <ul className="list-disc list-inside ml-4 space-y-1 max-h-48 overflow-y-auto">
                            {updates.map(item => (
                                <li key={item.rowNum}>
                                    {item.displayName} ({item.email}):
                                    <ul className="list-['▹'] list-inside ml-4 text-gray-400">
                                         {Object.entries(item.details || {}).map(([field, change]) => (
                                            <li key={field}>{field}: {renderChanges(change)}</li>
                                        ))}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* No Changes */}
                {noChanges.length > 0 && (
                    <div>
                        <p className="font-medium text-gray-500">{noChanges.length} Staff Member(s) with No Changes.</p>
                    </div>
                )}

                 {/* Errors */}
                 {errors.length > 0 && (
                    <div className="pt-2 border-t border-gray-600">
                        <p className="font-medium text-red-400">{errors.length} Row(s) with Errors (will be skipped):</p>
                        <ul className="list-disc list-inside ml-4 max-h-32 overflow-y-auto text-red-500">
                            {errors.map(item => (
                                <li key={item.rowNum}>Row {item.rowNum}: {item.errors.join(', ')}</li>
                            ))}
                        </ul>
                    </div>
                )}


                <p className="mt-6 text-amber-500">
                     Proceed with importing <span className="font-bold">{creates.length + updates.length}</span> record(s)?
                     {errors.length > 0 && ` ${errors.length} record(s) with errors will be skipped.`}
                </p>

            </div>

             {/* Action Buttons */}
             <div className="mt-6 flex justify-end space-x-3">
                <button
                    type="button"
                    onClick={onClose}
                    disabled={isConfirming}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-md disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={isConfirming || (creates.length === 0 && updates.length === 0)} // Disable if nothing to import
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:bg-gray-500 disabled:opacity-70"
                >
                    {isConfirming ? 'Importing...' : 'Confirm Import'}
                </button>
            </div>
        </Modal>
    );
};

export default ImportConfirmationModal;