import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../firebase.js"; // Confirmed path
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'; // Keep these
import { ProfileDetailsView } from './StaffProfile/ProfileDetailsView';
import { ProfileDetailsEdit } from './StaffProfile/ProfileDetailsEdit';
import { JobHistoryManager } from './StaffProfile/JobHistoryManager';
import { DocumentManager } from './StaffProfile/DocumentManager';
import { ProfileActionButtons } from './StaffProfile/ProfileActionButtons';
import * as dateUtils from '../utils/dateUtils';

// Initialize Functions
const functionsDefault = getFunctions(app);
const functionsAsia = getFunctions(app, "asia-southeast1");

// Prepare Callable References
const deleteStaffFunc = httpsCallable(functionsAsia, 'deleteStaff');
const setStaffAuthStatus = httpsCallable(functionsDefault, 'setStaffAuthStatus');
const setStaffPassword = httpsCallable(functionsDefault, 'setStaffPassword');

// Helper to get initial form data
const getInitialFormData = (staff) => {
    const formattedStartDate = staff.startDate ? dateUtils.formatISODate(dateUtils.fromFirestore(staff.startDate)) : '';
    const formattedBirthdate = staff.birthdate ? dateUtils.formatISODate(dateUtils.fromFirestore(staff.birthdate)) : '';
    let initialData = { /* ... same as before ... */ };
    // ... rest of getInitialFormData ...
    return initialData; // Ensure full function is here
};


export default function StaffProfileModal({ staff, db, onClose, departments, userRole }) {
    // *** Default to 'details' tab ***
    const [activeTab, setActiveTab] = useState('details');
    const [formData, setFormData] = useState(getInitialFormData(staff));
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [bonusStreak, setBonusStreak] = useState(staff.bonusStreak || 0);

    useEffect(() => {
        setFormData(getInitialFormData(staff));
        setBonusStreak(staff.bonusStreak || 0);
        setActiveTab('details'); // Reset tab
        setIsEditing(false);
        setError('');
    }, [staff]);

    const currentJob = (staff.jobHistory || []).sort((a, b) => { /* ... sort logic ... */ })[0] || {};
    const displayName = staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName;
    const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));

    // --- Action Handlers (remain the same) ---
    const handleSaveDetails = async () => { /* ... */ };
    const handleAddNewJob = async (newJobData) => { /* ... */ };
    const handleDeleteJob = async (jobToDelete) => { /* ... */ };
    const handleDeleteStaff = async () => { /* ... */ };
    const handleArchiveStaff = async (newStatus) => { /* ... */ };
    const handleUploadFile = async (fileToUpload) => { /* ... */ };
    const handleDeleteFile = async (fileToDelete) => { /* ... */ };
    const handleResetPassword = async (staffId) => { /* ... */ };
    const handleSetBonusStreak = async () => { /* ... */ };
    // --- End Action Handlers ---

    const getTabClasses = (tabName) => {
         return `${activeTab === tabName ? 'border-amber-500 text-amber-500' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`;
     };


    return (
        <div className="space-y-6">
            {/* Tabs - Added Settings & Stats Tab */}
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
                    {/* *** NEW SETTINGS & STATS TAB (Manager Only) *** */}
                    {userRole === 'manager' && (
                        <button onClick={() => setActiveTab('settings')} className={getTabClasses('settings')}>
                            Settings & Stats
                        </button>
                    )}
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
                    {/* Bonus Management Moved */}
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

             {/* *** NEW SETTINGS & STATS TAB CONTENT (Manager Only) *** */}
             {activeTab === 'settings' && userRole === 'manager' && (
                <div className="space-y-6">
                     {/* Bonus Management */}
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
                                <button onClick={handleSetBonusStreak} disabled={isSaving} className="px-4 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-sm text-white disabled:opacity-50">Set Streak</button>
                            </div>
                        </div>
                     {/* Add other stats or settings here later */}
                </div>
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
                // Save/Cancel only show when editing on the details tab
                showSaveCancel={isEditing && activeTab === 'details'}
            />
        </div>
    );
};