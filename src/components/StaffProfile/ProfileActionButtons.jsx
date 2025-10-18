import React from 'react';

export const ProfileActionButtons = ({
    isEditing, isSaving, staffStatus,
    onSetEditing, onSave, onArchiveStaff, onDeleteStaff, onClose, 
    activeTab // Need activeTab to hide edit/save buttons on Documents tab
}) => (
    <div className="flex justify-between items-center pt-4 border-t border-gray-700 mt-6">
        <div>
             <button onClick={onDeleteStaff} disabled={isSaving} className="text-sm text-red-500 hover:text-red-400 disabled:text-gray-500">
                {isSaving ? 'Processing...' : 'Delete Staff Permanently'}
            </button>
        </div>

        <div className="flex space-x-4">
            {activeTab === 'details' && (
                isEditing ? (
                    <>
                        <button onClick={() => onSetEditing(false)} className="px-6 py-2 rounded-lg bg-gray-600 hover:bg-gray-500">Cancel</button>
                        <button onClick={onSave} disabled={isSaving} className="px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600">{isSaving ? 'Saving...' : 'Save Changes'}</button>
                    </>
                ) : (
                    <>
                        {staffStatus === 'inactive' ? (
                            <button onClick={() => onArchiveStaff('active')} disabled={isSaving} className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:bg-gray-600">{isSaving ? 'Processing...' : 'Set as Active'}</button>
                        ) : (
                            <button onClick={() => onArchiveStaff('inactive')} disabled={isSaving} className="px-6 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600">{isSaving ? 'Processing...' : 'Archive Staff'}</button>
                        )}
                        <button onClick={() => onSetEditing(true)} className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500">Edit Basic Info</button>
                    </>
                )
            )}
            <button onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-600 hover:bg-gray-500">Close</button>
        </div>
    </div>
);