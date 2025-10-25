import React from 'react';
import { SaveIcon, EditIcon, XIcon, ArchiveIcon, UserCheckIcon, TrashIcon, KeyIcon } from '../../components/Icons';

export const ProfileActionButtons = ({
    isEditing,
    isSaving,
    staffStatus,
    staffId, // Needed for reset password
    onSetEditing,
    onSave,
    onArchiveStaff,
    onDeleteStaff,
    onResetPassword,
    onClose,
    activeTab, // Receive activeTab
    showSaveCancel // Receive new prop
}) => {
    const isActive = staffStatus === 'active' || staffStatus === undefined || staffStatus === null;

    return (
        <div className="mt-8 pt-6 border-t border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4">
            {/* Left-aligned buttons (Delete/Archive/Activate) */}
            <div className="flex space-x-3">
                {isActive ? (
                    <button
                        onClick={() => onArchiveStaff('inactive')}
                        disabled={isSaving || isEditing}
                        className="flex items-center px-4 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Archive this staff member"
                    >
                        <ArchiveIcon className="h-4 w-4 mr-2" />
                        Archive
                    </button>
                ) : (
                    <button
                        onClick={() => onArchiveStaff('active')}
                        disabled={isSaving || isEditing}
                        className="flex items-center px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Reactivate this staff member"
                    >
                        <UserCheckIcon className="h-4 w-4 mr-2" />
                        Set Active
                    </button>
                )}
                {/* Only show delete if staff is inactive */}
                {!isActive && (
                     <button
                        onClick={onDeleteStaff}
                        disabled={isSaving || isEditing}
                        className="flex items-center px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Permanently delete this staff member"
                    >
                        <TrashIcon className="h-4 w-4 mr-2" />
                        Delete Permanently
                    </button>
                )}
                {/* Reset Password Button */}
                 <button
                    onClick={() => onResetPassword(staffId)}
                    disabled={isSaving || isEditing} // Disable if editing details to avoid confusion
                    className="flex items-center px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Reset staff member's password"
                >
                    <KeyIcon className="h-4 w-4 mr-2" />
                    Reset Password
                </button>
            </div>

            {/* Right-aligned buttons (Edit/Save/Cancel) */}
            <div className="flex space-x-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white"
                >
                    Close
                </button>

                {/* --- Conditional Rendering for Save/Cancel/Edit --- */}
                {/* Show Edit button ONLY if NOT editing AND on the 'details' tab */}
                {!isEditing && activeTab === 'details' && (
                    <button
                        type="button"
                        onClick={() => onSetEditing(true)}
                        disabled={isSaving} // Disable if any other save is happening
                        className="flex items-center px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                    >
                        <EditIcon className="h-5 w-5 mr-2"/>
                        Edit Details
                    </button>
                )}

                {/* Show Save and Cancel buttons ONLY if showSaveCancel is true */}
                {showSaveCancel && (
                    <>
                        <button
                            type="button"
                            onClick={() => onSetEditing(false)} // This is the Cancel button
                            disabled={isSaving}
                            className="flex items-center px-6 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white disabled:opacity-50"
                        >
                             <XIcon className="h-5 w-5 mr-2"/>
                             Cancel
                        </button>
                        <button
                            type="button" // Should trigger form submission via onSave prop
                            onClick={onSave} // Call the passed onSave handler
                            disabled={isSaving}
                            className="flex items-center px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                        >
                            <SaveIcon className="h-5 w-5 mr-2"/>
                            {isSaving ? 'Saving...' : 'Save Details'}
                        </button>
                    </>
                )}
                 {/* --- End Conditional Rendering --- */}

            </div>
        </div>
    );
};