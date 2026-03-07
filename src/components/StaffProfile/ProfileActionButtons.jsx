import React, { useState } from 'react';
import { Save, Edit, X, FileText } from 'lucide-react'; // Added FileText
import ResignationLetterGenerator from '../ManageStaff/ResignationLetterGenerator'; // Added import

export const ProfileActionButtons = ({
    staffProfile, // <-- ADDED PROP: Make sure the parent component passes this!
    isEditing,
    isSaving,
    onSetEditing,
    onSave,
    onClose,
    activeTab,
    showSaveCancel
}) => {
    // --- NEW: State to control the modal ---
    const [showResignationModal, setShowResignationModal] = useState(false);

    return (
        <div className="mt-8 pt-6 border-t border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4">
            
            {/* Left-aligned buttons */}
            <div className="flex space-x-3 w-full sm:w-auto">
                {/* --- NEW BUTTON: Generate Resignation Letter --- */}
                {!isEditing && staffProfile && (
                    <button 
                        type="button"
                        onClick={() => setShowResignationModal(true)}
                        className="flex items-center justify-center w-full sm:w-auto bg-blue-900/40 hover:bg-blue-800 text-blue-300 px-4 py-2 rounded-lg font-bold transition-colors border border-blue-700/50"
                    >
                        <FileText className="w-5 h-5 mr-2" />
                        Generate Resignation Letter
                    </button>
                )}
            </div>

            {/* Right-aligned buttons (Close, Edit/Save/Cancel) */}
            <div className="flex space-x-3 w-full sm:w-auto justify-end">
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

            {/* --- NEW: The Hidden Print Modal --- */}
            <ResignationLetterGenerator 
                staff={staffProfile} 
                isOpen={showResignationModal} 
                onClose={() => setShowResignationModal(false)} 
            />
        </div>
    );
};