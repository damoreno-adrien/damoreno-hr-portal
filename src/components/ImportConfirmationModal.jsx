// src/components/ImportConfirmationModal.jsx
import React from 'react';
import Modal from './Modal';

const ImportConfirmationModal = ({ isOpen, onClose, analysisResult, onConfirm, isConfirming }) => {
    if (!analysisResult) return null;

    const { creates = [], updates = [], noChanges = [], errors = [] } = analysisResult;

    // Simplified renderChanges - No special job handling needed
    const renderChanges = (changeDetail) => {
        if (!changeDetail || typeof changeDetail !== 'object') return 'N/A';

        // Format date (Timestamp) changes
        const formatValue = (value) => {
            // Check if it looks like a Firestore Timestamp structure from the analysis
            if (value && typeof value === 'object' && value.seconds !== undefined && value.nanoseconds !== undefined) {
                 try {
                    // Convert back to JS Date for display
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
                                         {/* Iterate over all details, JOB field is simply gone now */}
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
                {noChanges.length > 0 && ( /* ... keep as is ... */
                    <div>
                        <p className="font-medium text-gray-500">{noChanges.length} Staff Member(s) with No Changes.</p>
                    </div>
                )}

                 {/* Errors */}
                 {errors.length > 0 && ( /* ... keep as is ... */
                    <div className="pt-2 border-t border-gray-600">
                        <p className="font-medium text-red-400">{errors.length} Row(s) with Errors (will be skipped):</p>
                        <ul className="list-disc list-inside ml-4 max-h-32 overflow-y-auto text-red-500">
                            {errors.map(item => ( <li key={item.rowNum}>Row {item.rowNum}: {item.errors.join(', ')}</li> ))}
                        </ul>
                    </div>
                 )}

                {/* Confirmation message */}
                <p className="mt-6 text-amber-500"> /* ... keep as is ... */
                     Proceed with importing <span className="font-bold">{creates.length + updates.length}</span> record(s)?
                     {errors.length > 0 && ` ${errors.length} record(s) with errors will be skipped.`}
                </p>

            </div>

             {/* Action Buttons */}
             <div className="mt-6 flex justify-end space-x-3"> /* ... keep as is ... */
                <button type="button" onClick={onClose} disabled={isConfirming} className="..."> Cancel </button>
                <button type="button" onClick={onConfirm} disabled={isConfirming || (creates.length === 0 && updates.length === 0)} className="...">
                    {isConfirming ? 'Importing...' : 'Confirm Import'}
                </button>
            </div>
        </Modal>
    );
};

export default ImportConfirmationModal;