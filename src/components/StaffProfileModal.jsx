import React, { useState, useEffect } from 'react';
// Correct import (FieldValue removed)
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { ProfileDetailsView } from './StaffProfile/ProfileDetailsView';
import { ProfileDetailsEdit } from './StaffProfile/ProfileDetailsEdit';
import { JobHistoryManager } from './StaffProfile/JobHistoryManager';
import { DocumentManager } from './StaffProfile/DocumentManager';
import { ProfileActionButtons } from './StaffProfile/ProfileActionButtons';
import { KeyIcon } from './Icons'; // Assuming KeyIcon is in Icons.jsx

// Helper to get initial form data
const getInitialFormData = (staff) => {
    let initialData = {
        email: staff.email || '',
        phoneNumber: staff.phoneNumber || '',
        birthdate: staff.birthdate || '',
        bankAccount: staff.bankAccount || '',
        startDate: staff.startDate || '',
        address: staff.address || '',
        emergencyContactName: staff.emergencyContactName || '',
        emergencyContactPhone: staff.emergencyContactPhone || '',
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
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [bonusStreak, setBonusStreak] = useState(staff.bonusStreak || 0);

    useEffect(() => {
        setFormData(getInitialFormData(staff));
        setBonusStreak(staff.bonusStreak || 0);
    }, [staff]);

    const currentJob = (staff.jobHistory || []).sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0] || {};
    const displayName = staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName;

    const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));

    // --- Action Handlers ---
    const handleSaveDetails = async () => {
        setIsSaving(true);
        setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            // Include new fields in the update
            await updateDoc(staffDocRef, {
                firstName: formData.firstName,
                lastName: formData.lastName,
                nickname: formData.nickname,
                email: formData.email,
                phoneNumber: formData.phoneNumber,
                birthdate: formData.birthdate,
                bankAccount: formData.bankAccount,
                startDate: formData.startDate,
                // --- NEW ---
                address: formData.address,
                emergencyContactName: formData.emergencyContactName,
                emergencyContactPhone: formData.emergencyContactPhone,
                // --- END NEW ---
                fullName: null // Clear legacy field if necessary
            });
            setIsEditing(false); // Exit edit mode on success
        } catch (err) { setError("Failed to save profile details."); console.error("Save Details Error:", err); }
        finally { setIsSaving(false); }
    };

    const handleAddNewJob = async (newJobData) => {
        const staffDocRef = doc(db, 'staff_profiles', staff.id);
        await updateDoc(staffDocRef, { jobHistory: arrayUnion(newJobData) });
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
            setIsSaving(true);
            try {
                const functions = getFunctions();
                const deleteStaffFunc = httpsCallable(functions, 'deleteStaff');
                await deleteStaffFunc({ staffId: staff.id });
                onClose();
            } catch (err) { alert(`Error deleting staff: ${err.message}`); console.error("Delete Staff Error:", err); }
            finally { setIsSaving(false); }
        }
    };

    const handleArchiveStaff = async (newStatus) => {
        setIsSaving(true);
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
                 // --- Use null to effectively clear the status ---
                 updateData = { status: null, endDate: null };
                 authDisabled = false;
            }

            await Promise.all([
                updateDoc(staffDocRef, updateData),
                setStaffAuthStatus({ staffId: staff.id, disabled: authDisabled })
            ]);
            onClose();
        } catch (err) {
            alert(`Failed to update status: ${err.message}`);
            console.error("Archive/Activate Error:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleUploadFile = async (fileToUpload) => {
        const storage = getStorage();
        const storageRef = ref(storage, `staff_documents/${staff.id}/${fileToUpload.name}`);
        await uploadBytes(storageRef, fileToUpload);
        const downloadURL = await getDownloadURL(storageRef);
        const fileMetadata = { name: fileToUpload.name, url: downloadURL, path: storageRef.fullPath, uploadedAt: new Date().toISOString() };
        const staffDocRef = doc(db, 'staff_profiles', staff.id);
        await updateDoc(staffDocRef, { documents: arrayUnion(fileMetadata) });
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

    const handleResetPassword = async (staffId) => {
        const newPassword = window.prompt(`Enter a new temporary password for ${displayName} (minimum 6 characters):`);

        if (!newPassword) return;
        if (newPassword.length < 6) {
            alert("Password must be at least 6 characters long.");
            return;
        }

        setIsSaving(true);
        setError('');
        try {
            const functions = getFunctions();
            const setStaffPassword = httpsCallable(functions, 'setStaffPassword');
            const result = await setStaffPassword({ staffId: staffId, newPassword: newPassword });
            alert(result.data.result);
        } catch (err) {
            alert(`Failed to reset password: ${err.message}`);
            setError(`Failed to reset password: ${err.message}`);
            console.error("Password Reset Error:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSetBonusStreak = async () => {
        const staffDocRef = doc(db, 'staff_profiles', staff.id);
        try {
            await updateDoc(staffDocRef, { bonusStreak: Number(bonusStreak) });
            alert(`Bonus streak for ${displayName} has been set to ${bonusStreak}.`);
        } catch (err) { alert("Failed to update bonus streak."); }
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
                     {/* Bonus Management */}
                     {userRole === 'manager' && (
                        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                           <h4 className="text-base font-semibold text-white">Bonus Management</h4>
                           <p className="text-sm text-gray-400 mt-1">Manually set the attendance bonus streak.</p>
                           <div className="mt-4 flex items-center space-x-4">
                                <p className="text-sm">Current Streak: <span className="font-bold text-amber-400">{staff.bonusStreak || 0} months</span></p>
                                <input
                                    type="number"
                                    value={bonusStreak}
                                    onChange={(e) => setBonusStreak(e.target.value)}
                                    className="w-24 bg-gray-700 rounded-md p-1 text-white"
                                    min="0"
                                />
                                <button onClick={handleSetBonusStreak} className="px-4 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-sm text-white">Set Streak</button>
                            </div>
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
                staffId={staff.id}
                onSetEditing={(editingState) => { setIsEditing(editingState); setError(''); }}
                onSave={handleSaveDetails}
                onArchiveStaff={handleArchiveStaff}
                onDeleteStaff={handleDeleteStaff}
                onResetPassword={handleResetPassword}
                onClose={onClose}
                activeTab={activeTab}
            />
        </div>
    );
};