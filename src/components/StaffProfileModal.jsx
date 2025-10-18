import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { ProfileDetailsView } from './StaffProfile/ProfileDetailsView';
import { ProfileDetailsEdit } from './StaffProfile/ProfileDetailsEdit';
import { JobHistoryManager } from './StaffProfile/JobHistoryManager';
import { DocumentManager } from './StaffProfile/DocumentManager';
import { ProfileActionButtons } from './StaffProfile/ProfileActionButtons';

// Helper to get initial form data (remains here as it depends on `staff` prop)
const getInitialFormData = (staff) => {
    let initialData = {
        email: staff.email || '', // Ensure email is always present
        phoneNumber: staff.phoneNumber || '',
        birthdate: staff.birthdate || '',
        bankAccount: staff.bankAccount || '',
        startDate: staff.startDate || '',
    };
    if (staff.firstName || staff.lastName) {
        return { ...initialData, firstName: staff.firstName || '', lastName: staff.lastName || '', nickname: staff.nickname || '' };
    }
    const nameParts = (staff.fullName || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    return { ...initialData, firstName, lastName, nickname: '' };
};

export default function StaffProfileModal({ staff, db, onClose, departments, userRole }) {
    const [activeTab, setActiveTab] = useState('details');
    const [formData, setFormData] = useState(getInitialFormData(staff));
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false); // Used for multiple save operations
    const [error, setError] = useState(''); // General error state

    // Recalculate initial form data if the staff prop changes (e.g., parent updates list)
    useEffect(() => {
        setFormData(getInitialFormData(staff));
    }, [staff]);

    const currentJob = (staff.jobHistory || []).sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0] || {};
    const displayName = staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName;

    const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));

    // --- Action Handlers ---
    // These now mostly handle the Firestore/backend interaction logic
    // They are passed down as props to the relevant components

    const handleSaveDetails = async () => {
        setIsSaving(true);
        setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { 
                firstName: formData.firstName,
                lastName: formData.lastName,
                nickname: formData.nickname,
                email: formData.email,
                phoneNumber: formData.phoneNumber,
                birthdate: formData.birthdate,
                bankAccount: formData.bankAccount,
                startDate: formData.startDate,
                fullName: null // Clear legacy field if necessary
            });
            setIsEditing(false); // Exit edit mode on success
        } catch (err) { setError("Failed to save profile details."); console.error("Save Details Error:", err); } 
        finally { setIsSaving(false); }
    };
    
    const handleAddNewJob = async (newJobData) => {
        // Validation is done in JobHistoryManager, error handling is passed up
        const staffDocRef = doc(db, 'staff_profiles', staff.id);
        await updateDoc(staffDocRef, { jobHistory: arrayUnion(newJobData) });
        // Let JobHistoryManager handle UI state reset
    };
    
    const handleDeleteJob = async (jobToDelete) => {
        if (window.confirm(`Are you sure you want to delete the role "${jobToDelete.position}" started on ${jobToDelete.startDate}?`)) {
            try {
                const staffDocRef = doc(db, 'staff_profiles', staff.id);
                await updateDoc(staffDocRef, { jobHistory: arrayRemove(jobToDelete) });
            } catch (err) { alert("Failed to delete job history entry."); console.error("Delete Job Error:", err); }
        }
    };
    
    const handleDeleteStaff = async () => {
        if (window.confirm(`DELETE STAFF?\n\nAre you sure you want to permanently delete ${displayName}? This will erase all their data and cannot be undone.`) && window.confirm("Final confirmation: Delete this staff member?")) {
            setIsSaving(true); // Reuse isSaving state for delete operation
            try {
                const functions = getFunctions();
                const deleteStaffFunc = httpsCallable(functions, 'deleteStaff');
                await deleteStaffFunc({ staffId: staff.id });
                onClose(); // Close modal on success
            } catch (err) { alert(`Error deleting staff: ${err.message}`); console.error("Delete Staff Error:", err); } 
            finally { setIsSaving(false); }
        }
    };
    
    const handleArchiveStaff = async (newStatus) => {
        setIsSaving(true); // Reuse isSaving state
        try {
            const functions = getFunctions();
            const setStaffAuthStatus = httpsCallable(functions, 'setStaffAuthStatus');
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            let updateData = {};
            let authDisabled = false;

            if (newStatus === 'inactive') {
                const endDate = window.prompt(`To archive ${displayName}, enter their last day (YYYY-MM-DD):`, new Date().toISOString().split('T')[0]);
                if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
                    if (endDate) alert("Invalid date format. Please use YYYY-MM-DD.");
                    setIsSaving(false);
                    return;
                }
                updateData = { status: 'inactive', endDate: endDate };
                authDisabled = true;
            } else { // Setting back to active
                 if (!window.confirm(`Set ${displayName} as Active? This clears their end date.`)) {
                    setIsSaving(false);
                    return;
                 }
                 updateData = { status: undefined, endDate: null }; // Use undefined to potentially remove the field
                 authDisabled = false;
            }

            await Promise.all([
                updateDoc(staffDocRef, updateData),
                setStaffAuthStatus({ staffId: staff.id, disabled: authDisabled })
            ]);
            onClose(); // Close modal on success
        } catch (err) {
            alert(`Failed to update status: ${err.message}`);
            console.error("Archive/Activate Error:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleUploadFile = async (fileToUpload) => {
        // Validation happens in DocumentManager
        const storage = getStorage();
        const storageRef = ref(storage, `staff_documents/${staff.id}/${fileToUpload.name}`);
        await uploadBytes(storageRef, fileToUpload);
        const downloadURL = await getDownloadURL(storageRef);
        const fileMetadata = { name: fileToUpload.name, url: downloadURL, path: storageRef.fullPath, uploadedAt: new Date().toISOString() };
        const staffDocRef = doc(db, 'staff_profiles', staff.id);
        await updateDoc(staffDocRef, { documents: arrayUnion(fileMetadata) });
        // Let DocumentManager handle UI state reset
    };
    
    const handleDeleteFile = async (fileToDelete) => {
        if (!window.confirm(`Delete "${fileToDelete.name}"?`)) return;
        try {
            const storage = getStorage();
            const fileRef = ref(storage, fileToDelete.path);
            await deleteObject(fileRef);
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { documents: arrayRemove(fileToDelete) });
        } catch (error) { console.error("File deletion error:", error); alert("Failed to delete file."); }
    };

    return (
        <div className="space-y-6">
            {/* Tabs */}
            <div className="border-b border-gray-700">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <button onClick={() => setActiveTab('details')} className={`${activeTab === 'details' ? 'border-amber-500 text-amber-500' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>Profile Details</button>
                    <button onClick={() => setActiveTab('documents')} className={`${activeTab === 'documents' ? 'border-amber-500 text-amber-500' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>Documents</button>
                </nav>
            </div>

            {/* General Error Display */}
            {error && <p className="text-red-400 text-sm bg-red-900/30 p-3 rounded-md">{error}</p>}

            {/* Conditional Rendering based on Tab */}
            {activeTab === 'details' && (
                <div className="space-y-6">
                    {isEditing ? (
                        <ProfileDetailsEdit formData={formData} handleInputChange={handleInputChange} />
                    ) : (
                        <ProfileDetailsView staff={staff} currentJob={currentJob} />
                    )}
                    <JobHistoryManager 
                        jobHistory={staff.jobHistory} 
                        departments={departments} 
                        onAddNewJob={handleAddNewJob} 
                        onDeleteJob={handleDeleteJob} 
                    />
                     {/* Bonus Management (Optional: Could be its own component too) */}
                     {userRole === 'manager' && (
                        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                            {/* ... Bonus streak logic remains here for now ... */}
                        </div>
                     )}
                </div>
            )}

            {activeTab === 'documents' && (
                <DocumentManager 
                    documents={staff.documents}
                    onUploadFile={handleUploadFile}
                    onDeleteFile={handleDeleteFile}
                />
            )}

            {/* Action Buttons */}
            <ProfileActionButtons
                isEditing={isEditing}
                isSaving={isSaving}
                staffStatus={staff.status}
                onSetEditing={(editingState) => { setIsEditing(editingState); setError(''); }} // Clear error when switching modes
                onSave={handleSaveDetails}
                onArchiveStaff={handleArchiveStaff}
                onDeleteStaff={handleDeleteStaff}
                onClose={onClose}
                activeTab={activeTab}
            />
        </div>
    );
};