import React from 'react';
import { KeyIcon } from '../Icons'; // Assuming you have a Key icon or similar

export const ProfileActionButtons = ({
    isEditing, isSaving, staffStatus, staffId, // Added staffId
    onSetEditing, onSave, onArchiveStaff, onDeleteStaff, onResetPassword, onClose, // Added onResetPassword
    activeTab
}) => (
    <div className="flex justify-between items-center pt-4 border-t border-gray-700 mt-6">
        <div>
             <button onClick={onDeleteStaff} disabled={isSaving} className="text-sm text-red-500 hover:text-red-400 disabled:text-gray-500">
                {isSaving ? 'Processing...' : 'Delete Staff Permanently'}
            </button>
        </div>

        <div className="flex flex-wrap gap-2 justify-end"> {/* Use flex-wrap and gap */}
            {activeTab === 'details' && (
                isEditing ? (
                    <>
                        <button onClick={() => onSetEditing(false)} className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-sm">Cancel</button>
                        <button onClick={onSave} disabled={isSaving} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 text-sm">{isSaving ? 'Saving...' : 'Save Changes'}</button>
                    </>
                ) : (
                    <>
                        {/* --- NEW Reset Password Button --- */}
                        <button
                            onClick={() => onResetPassword(staffId)}
                            disabled={isSaving}
                            className="flex items-center px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-sm text-white"
                            title="Set a new password for this user"
                        >
                           <KeyIcon className="h-4 w-4 mr-2"/> Reset Password
                        </button>

                        {staffStatus === 'inactive' ? (
                            <button onClick={() => onArchiveStaff('active')} disabled={isSaving} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-sm">{isSaving ? 'Processing...' : 'Set Active'}</button>
                        ) : (
                            <button onClick={() => onArchiveStaff('inactive')} disabled={isSaving} className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 text-sm">{isSaving ? 'Processing...' : 'Archive'}</button>
                        )}
                        <button onClick={() => onSetEditing(true)} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm">Edit Info</button>
                    </>
                )
            )}
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-sm">Close</button>
        </div>
    </div>
);