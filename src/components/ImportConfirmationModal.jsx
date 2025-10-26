// src/components/ImportConfirmationModal.jsx
import React from 'react';
import Modal from './Modal'; // Assuming Modal.jsx is in the same directory

const ImportConfirmationModal = ({ isOpen, onClose, analysisResult, onConfirm, isConfirming }) => {
    if (!analysisResult) return null; // Don't render if no analysis data

    // Default to empty arrays if properties are missing in analysisResult
    const { creates = [], updates = [], noChanges = [], errors = [] } = analysisResult;

    // Helper to render the 'from -> to' string for changes
    const renderChanges = (changeDetail) => {
        if (!changeDetail || typeof changeDetail !== 'object') return 'N/A';

        // Format date (Timestamp) changes detected during analysis
        const formatValue = (value) => {
            // Check if it looks like a Firestore Timestamp structure returned from the function
            // (Cloud Functions often serialize Timestamps this way in responses)
            if (value && typeof value === 'object' && value._seconds !== undefined && value._nanoseconds !== undefined) {
                 try {
                    // Convert back to JS Date for display
                    return new Date(value._seconds * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }); // dd/mm/yyyy
                 } catch (e) {
                     console.error("Error formatting date from analysis:", value, e);
                     return '[Date Object]';
                 }
            }
             // Handle simple null/undefined/empty string representation
            if (value === null || value === undefined || value === '') return 'Empty';
            // Otherwise, return the value as a string
            return String(value);
        };

        return `${formatValue(changeDetail.from)} -> ${formatValue(changeDetail.to)}`;
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Confirm Staff Import">
            <div className="space-y-4 text-sm text-gray-300">
                <p className="font-semibold text-lg text-amber-400">Import Summary:</p>

                {/* Creates Section */}
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

                {/* Updates Section */}
                {updates.length > 0 && (
                    <div>
                        <p className="font-medium text-blue-400">{updates.length} Staff Member(s) to Update:</p>
                        <ul className="list-disc list-inside ml-4 space-y-1 max-h-48 overflow-y-auto">
                            {updates.map(item => (
                                <li key={item.rowNum}>
                                    {item.displayName} ({item.email || item.staffId}): {/* Show email or ID */}
                                    {/* Display changes */}
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

                {/* No Changes Section */}
                {noChanges.length > 0 && (
                    <div>
                        <p className="font-medium text-gray-500">{noChanges.length} Staff Member(s) with No Changes.</p>
                        {/* Optionally list them if needed for clarity on large imports */}
                         {/* <ul className="list-disc list-inside ml-4 max-h-32 overflow-y-auto text-xs text-gray-600">
                             {noChanges.map(item => (<li key={item.rowNum}>{item.displayName} ({item.email || item.staffId})</li>))}
                         </ul> */}
                    </div>
                )}

                 {/* Errors Section */}
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


                {/* Confirmation Prompt */}
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
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-md transition duration-150 ease-in-out disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    // Disable confirmation if currently confirming OR if there are no creates/updates to perform
                    disabled={isConfirming || (creates.length === 0 && updates.length === 0)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition duration-150 ease-in-out disabled:bg-gray-500 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isConfirming ? 'Importing...' : 'Confirm Import'}
                </button>
            </div>
        </Modal>
    );
};

export default ImportConfirmationModal;