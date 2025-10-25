import React from 'react';
// *** Import icons from lucide-react instead of local file ***
import { Save, Edit, X, Archive, UserCheck, Trash, Key } from 'lucide-react';
// import { SaveIcon, EditIcon, XIcon, ArchiveIcon, UserCheckIcon, TrashIcon, KeyIcon } from '../Icons'; // Remove this line

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
                        {/* *** Use correct icon component name *** */}
                        <Archive className="h-4 w-4 mr-2" />
                        Archive
                    </button>
                ) : (
                    <button
                        onClick={() => onArchiveStaff('active')}
                        disabled={isSaving || isEditing}
                        className="flex items-center px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Reactivate this staff member"
                    >
                        {/* *** Use correct icon component name *** */}
                        <UserCheck className="h-4 w-4 mr-2" />
                        Set Active
                    </button>
                )}
                {!isActive && (
                     <button
                        onClick={onDeleteStaff}
                        disabled={isSaving || isEditing}
                        className="flex items-center px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Permanently delete this staff member"
                    >
                        {/* *** Use correct icon component name *** */}
                        <Trash className="h-4 w-4 mr-2" />
                        Delete Permanently
                    </button>
                )}
                 <button
                    onClick={() => onResetPassword(staffId)}
                    disabled={isSaving || isEditing}
                    className="flex items-center px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Reset staff member's password"
                >
                    {/* *** Use correct icon component name *** */}
                    <Key className="h-4 w-4 mr-2" />
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
                {!isEditing && activeTab === 'details' && (
                    <button
                        type="button"
                        onClick={() => onSetEditing(true)}
                        disabled={isSaving}
                        className="flex items-center px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                    >
                        {/* *** Use correct icon component name *** */}
                        <Edit className="h-5 w-5 mr-2"/>
                        Edit Details
                    </button>
                )}

                {showSaveCancel && (
                    <>
                        <button
                            type="button"
                            onClick={() => onSetEditing(false)}
                            disabled={isSaving}
                            className="flex items-center px-6 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white disabled:opacity-50"
                        >
                             {/* *** Use correct icon component name *** */}
                             <X className="h-5 w-5 mr-2"/>
                             Cancel
                        </button>
                        <button
                            type="button"
                            onClick={onSave}
                            disabled={isSaving}
                            className="flex items-center px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                        >
                            {/* *** Use correct icon component name *** */}
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