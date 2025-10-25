import React from 'react';
import { Save, Edit, X } from 'lucide-react'; // Only import icons needed here

export const ProfileActionButtons = ({
    isEditing,
    isSaving,
    onSetEditing,
    onSave,
    onClose,
    activeTab,
    showSaveCancel
}) => {

    return (
        <div className="mt-8 pt-6 border-t border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4">
            {/* Left-aligned buttons */}
            <div className="flex space-x-3">
                {/* Intentionally empty - Archive/Delete/Reset buttons are now in Settings tab */}
            </div>

            {/* Right-aligned buttons (Close, Edit/Save/Cancel) */}
            <div className="flex space-x-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white"
                >
                    Close
                </button>

                {/* Conditional Rendering for Save/Cancel/Edit */}
                {!isEditing && activeTab === 'details' && (
                    <button
                        type="button"
                        onClick={() => onSetEditing(true)}
                        disabled={isSaving}
                        className="flex items-center px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                    >
                        <Edit className="h-5 w-5 mr-2"/>
                        Edit Details
                    </button>
                )}

                {showSaveCancel && (
                    <>
                        <button
                            type="button"
                            onClick={() => onSetEditing(false)} // Cancel
                            disabled={isSaving}
                            className="flex items-center px-6 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white disabled:opacity-50"
                        >
                             <X className="h-5 w-5 mr-2"/>
                             Cancel
                        </button>
                        <button
                            type="button"
                            onClick={onSave} // Save Details
                            disabled={isSaving}
                            className="flex items-center px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                        >
                            <Save className="h-5 w-5 mr-2"/>
                            {isSaving ? 'Saving...' : 'Save Details'}
                        </button>
                    </>
                )}
                 {/* --- End Conditional Rendering --- */}
            </div>
        </div>
    );
};