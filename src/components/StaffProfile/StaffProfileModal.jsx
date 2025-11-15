import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from '../../../firebase.js'; 
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { ProfileDetailsView } from './ProfileDetailsView.jsx';
import { ProfileDetailsEdit } from './ProfileDetailsEdit';
import { JobHistoryManager } from './JobHistoryManager';
import { DocumentManager } from './DocumentManager';
import { ProfileActionButtons } from './ProfileActionButtons';
import { Archive, UserCheck, Trash, Key } from 'lucide-react'; 
import * as dateUtils from '../../utils/dateUtils.js';

// Initialize Functions
const functionsDefault = getFunctions(app); // For us-central1 (Auth, Delete)
const functionsAsia = getFunctions(app, "asia-southeast1"); // For asia-southeast1

// Prepare Callable References
// --- FIX: deleteStaff must be 'functionsDefault' to handle Auth delete ---
const deleteStaffFunc = httpsCallable(functionsDefault, 'deleteStaff'); 
const setStaffAuthStatus = httpsCallable(functionsDefault, 'setStaffAuthStatus');
const setStaffPassword = httpsCallable(functionsDefault, 'setStaffPassword');

// Helper to get initial form data, FORMATTING DATES for input
const getInitialFormData = (staff) => {
    // ... (this function is unchanged) ...
    const formattedStartDate = staff.startDate ? dateUtils.formatISODate(dateUtils.fromFirestore(staff.startDate)) : '';
    const formattedBirthdate = staff.birthdate ? dateUtils.formatISODate(dateUtils.fromFirestore(staff.birthdate)) : '';
    let initialData = {
        email: staff.email || '',
        phoneNumber: staff.phoneNumber || '',
        birthdate: formattedBirthdate || '',
        startDate: formattedStartDate || '',
        bankAccount: staff.bankAccount || '',
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
    return { ...initialData, firstName, lastName, nickname: staff.nickname || '' };
};

export default function StaffProfileModal({ staff, db, onClose, departments, userRole }) {
    const [activeTab, setActiveTab] = useState('details');
    const [formData, setFormData] = useState(getInitialFormData(staff));
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [bonusStreak, setBonusStreak] = useState(staff.bonusStreak || 0);
    const [isBonusEligible, setIsBonusEligible] = useState(staff.isAttendanceBonusEligible ?? true);


    useEffect(() => {
        setFormData(getInitialFormData(staff));
        setBonusStreak(staff.bonusStreak || 0);
        setIsBonusEligible(staff.isAttendanceBonusEligible ?? true);
        setIsEditing(false);
        setError('');
    }, [staff]);

    const currentJob = (staff.jobHistory || []).sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB;
    })[0] || {};

    const displayName = staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName;
    const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));

    // --- Action Handlers (Fully Expanded) ---
    const handleSaveDetails = async () => {
        // ... (this function is unchanged) ...
        setIsSaving(true);
        setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            const updateData = {
                firstName: formData.firstName || null,
                lastName: formData.lastName || null,
                nickname: formData.nickname || null,
                email: formData.email || null,
                phoneNumber: formData.phoneNumber || null,
                birthdate: dateUtils.parseISODateString(formData.birthdate) ? formData.birthdate : null,
                startDate: dateUtils.parseISODateString(formData.startDate) ? formData.startDate : null,
                bankAccount: formData.bankAccount || null,
                address: formData.address || null,
                emergencyContactName: formData.emergencyContactName || null,
                emergencyContactPhone: formData.emergencyContactPhone || null,
            };
            if (updateData.firstName) {
                updateData.fullName = null;
            }
            await updateDoc(staffDocRef, updateData);
            setIsEditing(false);
        } catch (err) { setError("Failed to save profile details."); console.error("Save Details Error:", err); }
        finally { setIsSaving(false); }
    };

    const handleAddNewJob = async (newJobData) => {
        // ... (this function is unchanged) ...
        if (!dateUtils.parseISODateString(newJobData.startDate)) {
            alert("Invalid start date provided for new job role.");
            return;
        }
        setIsSaving(true); 
        setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { jobHistory: arrayUnion(newJobData) });
        } catch (err) {
            alert("Failed to add job role.");
            setError("Failed to add job role.");
            console.error("Add Job Error:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteJob = async (jobToDelete) => {
        // ... (this function is unchanged) ...
        const displayStartDate = dateUtils.formatDisplayDate(jobToDelete.startDate);
        if (window.confirm(`Are you sure you want to delete the role "${jobToDelete.position}" started on ${displayStartDate}?`)) {
            setIsSaving(true); 
            setError('');
            try {
                const staffDocRef = doc(db, 'staff_profiles', staff.id);
                await updateDoc(staffDocRef, { jobHistory: arrayRemove(jobToDelete) });
            } catch (err) {
                alert("Failed to delete job history entry.");
                setError("Failed to delete job history entry.");
                console.error("Delete Job Error:", err);
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleDeleteStaff = async () => {
        // ... (this function is unchanged) ...
        if (window.confirm(`DELETE STAFF?\n\nAre you sure you want to permanently delete ${displayName}? This will erase all their data and cannot be undone.`) && window.confirm("Final confirmation: Delete this staff member?")) {
            setIsSaving(true);
            setError('');
            try {
                // This will call the powerful backend function (see part 2)
                await deleteStaffFunc({ staffId: staff.id });
                onClose(); // Close modal on success
            } catch (err) {
                alert(`Error deleting staff: ${err.message}`);
                setError(`Error deleting staff: ${err.message}`);
                console.error("Delete Staff Error:", err);
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleArchiveStaff = async (newStatus) => {
        // ... (this function is unchanged) ...
        setIsSaving(true);
        setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            let updateData = {};
            let authDisabled = false;
            if (newStatus === 'inactive') {
                const todayStr = dateUtils.formatISODate(new Date());
                const endDate = window.prompt(`To archive ${displayName}, enter their last day (YYYY-MM-DD):`, todayStr);
                if (!endDate || !dateUtils.parseISODateString(endDate)) {
                    if (endDate !== null) { alert("Invalid date format. Please use YYYY-MM-DD."); }
                    setIsSaving(false); return;
                }
                updateData = { status: 'inactive', endDate: endDate };
                authDisabled = true;
            } else {
                 if (!window.confirm(`Set ${displayName} as Active? This clears their end date.`)) {
                    setIsSaving(false); return;
                 }
                 updateData = { status: 'active', endDate: null }; // Use 'active'
                 authDisabled = false;
            }
            await Promise.all([
                updateDoc(staffDocRef, updateData),
                setStaffAuthStatus({ staffId: staff.id, disabled: authDisabled })
            ]);
            onClose();
        } catch (err) {
            alert(`Failed to update status: ${err.message}`);
            setError(`Failed to update status: ${err.message}`);
            console.error("Archive/Activate Error:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleUploadFile = async (fileToUpload) => {
        // ... (this function is unchanged) ...
        setIsSaving(true); setError('');
        try {
            const storage = getStorage();
            const safeFileName = fileToUpload.name.replace(/\s+/g, '_');
            const storageRef = ref(storage, `staff_documents/${staff.id}/${Date.now()}_${safeFileName}`);
            await uploadBytes(storageRef, fileToUpload);
            const downloadURL = await getDownloadURL(storageRef);
            const fileMetadata = { name: fileToUpload.name, url: downloadURL, path: storageRef.fullPath, uploadedAt: Timestamp.now() };
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { documents: arrayUnion(fileMetadata) });
        } catch(err) {
             alert(`Failed to upload file: ${err.message}`);
             setError(`Failed to upload file: ${err.message}`);
             console.error("File Upload Error:", err);
        } finally { setIsSaving(false); }
    };

    const handleDeleteFile = async (fileToDelete) => {
        // ... (this function is unchanged) ...
        if (!window.confirm(`Are you sure you want to delete "${fileToDelete.name}"?`)) return;
        setIsSaving(true); setError('');
        try {
            const storage = getStorage();
            if (!fileToDelete.path) { throw new Error("File path is missing."); }
            const fileRef = ref(storage, fileToDelete.path);
            await deleteObject(fileRef);
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { documents: arrayRemove(fileToDelete) });
        } catch (error) {
            console.error("File deletion error:", error);
            alert(`Failed to delete file: ${error.message}`);
            setError(`Failed to delete file: ${error.message}`);
        } finally { setIsSaving(false); }
    };

    const handleResetPassword = async (staffId) => {
        // ... (this function is unchanged) ...
        const newPassword = window.prompt(`Enter a new temporary password for ${displayName} (minimum 6 characters):`);
        if (!newPassword) return;
        if (newPassword.length < 6) { alert("Password must be at least 6 characters long."); return; }
        setIsSaving(true); setError('');
        try {
            const result = await setStaffPassword({ staffId: staffId, newPassword: newPassword });
            alert(result.data.result);
        } catch (err) {
            alert(`Failed to reset password: ${err.message}`);
            setError(`Failed to reset password: ${err.message}`);
            console.error("Password Reset Error:", err);
        } finally { setIsSaving(false); }
    };

    const handleSetBonusStreak = async () => {
        // ... (this function is unchanged) ...
         const staffDocRef = doc(db, 'staff_profiles', staff.id);
         const streakValue = Number(bonusStreak);
         if (isNaN(streakValue) || streakValue < 0) {
             alert("Please enter a valid non-negative number for the bonus streak.");
             return;
         }
         setIsSaving(true); setError('');
         try {
             await updateDoc(staffDocRef, { bonusStreak: streakValue });
             alert(`Bonus streak for ${displayName} has been set to ${streakValue}.`);
         } catch (err) {
             alert("Failed to update bonus streak.");
             setError("Failed to update bonus streak.");
             console.error("Bonus Streak Update Error:", err);
         } finally {
            setIsSaving(false);
         }
     };

    const handleToggleBonusEligibility = async (e) => {
        // ... (this function is unchanged) ...
        const newValue = e.target.checked;
        setIsBonusEligible(newValue); 
        setIsSaving(true);
        setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { isAttendanceBonusEligible: newValue });
        } catch (err) {
            alert("Failed to update bonus eligibility.");
            setError("Failed to update bonus eligibility.");
            console.error("Bonus Eligibility Error:", err);
            setIsBonusEligible(!newValue); 
        } finally {
            setIsSaving(false);
        }
    };
    // --- End Action Handlers ---

    const getTabClasses = (tabName) => {
         return `${activeTab === tabName ? 'border-amber-500 text-amber-500' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`;
     };
    const isActive = staff.status === 'active' || staff.status === undefined || staff.status === null;

    return (
        <div className="space-y-6">
            {/* ... (Tabs are unchanged) ... */}
            <div className="border-b border-gray-700">
                <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                    <button onClick={() => setActiveTab('details')} className={getTabClasses('details')}>
                        Profile Details
                    </button>
                    <button onClick={() => setActiveTab('job')} className={getTabClasses('job')}>
                        Job & Salary
                    </button>
                    <button onClick={() => setActiveTab('documents')} className={getTabClasses('documents')}>
                        Documents
                    </button>
                    {userRole === 'manager' && (
                        <button onClick={() => setActiveTab('settings')} className={getTabClasses('settings')}>
                            Settings & Stats
                        </button>
                    )}
                </nav>
            </div>

            {error && <p className="text-red-400 text-sm bg-red-900/30 p-3 rounded-md">{error}</p>}

            {activeTab === 'details' && (
                <div className="space-y-6">
                    {isEditing ? (
                        <ProfileDetailsEdit formData={formData} handleInputChange={handleInputChange} />
                    ) : (
                        <ProfileDetailsView staff={staff} currentJob={currentJob} />
                    )}
                </div>
            )}

            {activeTab === 'job' && (
                <div className="space-y-6">
                     <JobHistoryManager
                        jobHistory={staff.jobHistory}
                        departments={departments}
                        onAddNewJob={handleAddNewJob}
                        onDeleteJob={handleDeleteJob}
                    />
                </div>
            )}

            {activeTab === 'documents' && (
                <DocumentManager
                    documents={staff.documents}
                    onUploadFile={handleUploadFile}
                    onDeleteFile={handleDeleteFile}
                    isSaving={isSaving}
                />
            )}

             {activeTab === 'settings' && userRole === 'manager' && (
                <div className="space-y-6">
                     {/* --- Bonus Management (unchanged) --- */}
                     <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                           <h4 className="text-base font-semibold text-white">Bonus Management</h4>
                           <div className="mt-4 space-y-4">
                                <div>
                                    <p className="text-sm text-gray-400">Manually set the attendance bonus streak.</p>
                                    <div className="mt-2 flex items-center space-x-4">
                                        <p className="text-sm">Current Streak: <span className="font-bold text-amber-400">{staff.bonusStreak || 0} months</span></p>
                                        <input
                                            type="number"
                                            value={bonusStreak}
                                            onChange={(e) => setBonusStreak(e.target.value)}
                                            className="w-24 bg-gray-700 rounded-md p-1 text-white"
                                            min="0"
                                        />
                                        <button onClick={handleSetBonusStreak} disabled={isSaving} className="px-4 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-sm text-white disabled:opacity-50">Set Streak</button>
                                    </div>
                                </div>
                                <div className="border-t border-gray-700 mt-4 pt-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h5 className="font-medium text-white">Attendance Bonus</h5>
                                            <p className="text-sm text-gray-400">Is this staff member eligible for the attendance bonus?</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            id="bonus-eligible-toggle"
                                            role="switch"
                                            checked={isBonusEligible}
                                            onChange={handleToggleBonusEligibility}
                                            disabled={isSaving}
                                            className="h-5 w-5 rounded bg-gray-700 border-gray-600 text-amber-600 focus:ring-amber-500"
                                        />
                                    </div>
                                </div>
                           </div>
                        </div>

                     {/* --- NEW: Staff UID --- */}
                     <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <h4 className="text-base font-semibold text-white">Staff Information</h4>
                        <div className="mt-4">
                            <label htmlFor="staffUid" className="block text-sm font-medium text-gray-400 mb-1">Staff User ID (UID)</label>
                            <input 
                                type="text" 
                                id="staffUid"
                                readOnly 
                                value={staff.id} 
                                className="w-full mt-1 px-3 py-2 bg-gray-900 text-gray-400 rounded-md border border-gray-700 select-all"
                            />
                            <p className="text-xs text-gray-500 mt-1">For database lookups.</p>
                        </div>
                     </div>
                     
                     {/* --- Staff Actions (unchanged) --- */}
                     <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-4">
                         <h4 className="text-base font-semibold text-white">Staff Actions</h4>
                         <div>
                            {isActive ? (
                                <button onClick={() => handleArchiveStaff('inactive')} disabled={isSaving || isEditing} className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed" title="Archive staff"> <Archive className="h-4 w-4 mr-2" /> Archive Staff Member </button>
                            ) : (
                                <button onClick={() => handleArchiveStaff('active')} disabled={isSaving || isEditing} className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed" title="Reactivate staff"> <UserCheck className="h-4 w-4 mr-2" /> Set Staff Member to Active </button>
                            )}
                         </div>
                         <div>
                             <button onClick={() => handleResetPassword(staff.id)} disabled={isSaving || isEditing} className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed" title="Reset password"> <Key className="h-4 w-4 mr-2" /> Reset Password </button>
                         </div>
                         {!isActive && (
                            <div className="pt-4 border-t border-gray-700">
                                 <button onClick={handleDeleteStaff} disabled={isSaving || isEditing} className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed" title="Delete staff permanently"> <Trash className="h-4 w-4 mr-2" /> Delete Staff Permanently </button>
                                <p className="text-xs text-red-400 mt-2">Warning: Deletion erases all data (attendance, pay, etc.) and cannot be undone.</p>
                             </div>
                         )}
                     </div>
                </div>
             )}

            {/* --- Action Buttons (unchanged) --- */}
            <ProfileActionButtons
                isEditing={isEditing}
                isSaving={isSaving}
                onSetEditing={(editingState) => { setIsEditing(editingState); setError(''); }}
                onSave={handleSaveDetails}
                onClose={onClose}
                activeTab={activeTab}
                showSaveCancel={isEditing && activeTab === 'details'}
            />
        </div>
    );
};