import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { PlusIcon, TrashIcon } from './Icons';
import { calculateSeniority, formatDateForDisplay } from '../utils/dateHelpers';

export default function StaffProfileModal({ staff, db, onClose, departments, userRole }) {
    const [activeTab, setActiveTab] = useState('details');
    
    const getInitialFormData = () => {
        let initialData = {
            email: staff.email,
            phoneNumber: staff.phoneNumber || '',
            birthdate: staff.birthdate || '',
            bankAccount: staff.bankAccount || '',
            startDate: staff.startDate || '',
        };

        if (staff.firstName || staff.lastName) {
            return {
                ...initialData,
                firstName: staff.firstName || '',
                lastName: staff.lastName || '',
                nickname: staff.nickname || '',
            };
        }
        
        const nameParts = (staff.fullName || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        return { ...initialData, firstName, lastName, nickname: '' };
    };

    const [formData, setFormData] = useState(getInitialFormData());
    const [isEditing, setIsEditing] = useState(false);
    const [isAddingJob, setIsAddingJob] = useState(false);
    const [newJob, setNewJob] = useState({ position: '', department: departments[0] || '', startDate: new Date().toISOString().split('T')[0], payType: 'Monthly', rate: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [error, setError] = useState('');
    const [bonusStreak, setBonusStreak] = useState(staff.bonusStreak || 0);

    const [fileToUpload, setFileToUpload] = useState(null);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        setFormData(getInitialFormData());
        setBonusStreak(staff.bonusStreak || 0);
    }, [staff]);

    const sortedJobHistory = (staff.jobHistory || []).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    const currentJob = sortedJobHistory[0] || { position: 'N/A', department: 'N/A', rate: 'N/A', payType: 'Monthly' };
    const displayName = staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName;

    const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
    const handleNewJobChange = (e) => setNewJob(prev => ({ ...prev, [e.target.id]: e.target.value }));

    const handleSave = async () => {
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
                fullName: null
            });
            setIsEditing(false);
        } catch (err) { setError("Failed to save changes."); console.error(err); } finally { setIsSaving(false); }
    };
    
    const handleAddNewJob = async () => {
        if (!newJob.position || !newJob.department || !newJob.startDate || !newJob.rate) { setError("Please fill all fields for the new job role."); return; }
        setIsSaving(true);
        setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { jobHistory: arrayUnion({ ...newJob, rate: Number(newJob.rate) }) });
            setIsAddingJob(false);
            setNewJob({ position: '', department: departments[0] || '', startDate: new Date().toISOString().split('T')[0], payType: 'Monthly', rate: '' });
        } catch (err) { setError("Failed to add new job role."); } finally { setIsSaving(false); }
    };
    const handleDeleteJob = async (jobToDelete) => {
        if (window.confirm(`Are you sure you want to delete the role "${jobToDelete.position}"?`)) {
            try {
                const staffDocRef = doc(db, 'staff_profiles', staff.id);
                await updateDoc(staffDocRef, { jobHistory: arrayRemove(jobToDelete) });
            } catch (err) { alert("Failed to delete job history entry."); }
        }
    };
    const handleDeleteStaff = async () => {
        if (window.confirm(`DELETE STAFF?\n\nAre you sure you want to permanently delete ${displayName}? This action is for correcting mistakes only and will erase all their data.`) && window.confirm("This action CANNOT be undone. Please confirm one last time.")) {
            setIsDeleting(true);
            try {
                const functions = getFunctions();
                const deleteStaff = httpsCallable(functions, 'deleteStaff');
                await deleteStaff({ staffId: staff.id });
                onClose();
            } catch (err) { alert(`Error deleting staff: ${err.message}`); } finally { setIsDeleting(false); }
        }
    };
    const handleArchiveStaff = async (newStatus) => {
        setIsArchiving(true);
        try {
            const functions = getFunctions();
            const setStaffAuthStatus = httpsCallable(functions, 'setStaffAuthStatus');
            const staffDocRef = doc(db, 'staff_profiles', staff.id);

            if (newStatus === 'inactive') {
                const endDate = window.prompt(`To archive ${displayName}, please enter their last day of employment (YYYY-MM-DD):`, new Date().toISOString().split('T')[0]);
                
                if (!endDate) {
                    setIsArchiving(false);
                    return;
                }
                
                if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
                    alert("Invalid date format. Please use YYYY-MM-DD.");
                    setIsArchiving(false);
                    return;
                }

                await Promise.all([
                    updateDoc(staffDocRef, { status: 'inactive', endDate: endDate }),
                    setStaffAuthStatus({ staffId: staff.id, disabled: true })
                ]);
            } else {
                 if (window.confirm(`Are you sure you want to set ${displayName} as Active? This will clear their end date.`)) {
                    await Promise.all([
                        updateDoc(staffDocRef, { status: 'active', endDate: null }),
                        setStaffAuthStatus({ staffId: staff.id, disabled: false })
                    ]);
                 } else {
                     setIsArchiving(false);
                     return;
                 }
            }
            onClose();
        } catch (err) {
            const action = newStatus === 'inactive' ? 'Archive' : 'Set as Active';
            alert(`Failed to ${action}. Please try again.`);
            console.error(err);
        } finally {
            setIsArchiving(false);
        }
    };

    const handleSetBonusStreak = async () => {
        const staffDocRef = doc(db, 'staff_profiles', staff.id);
        try {
            await updateDoc(staffDocRef, { bonusStreak: Number(bonusStreak) });
            alert(`Bonus streak for ${displayName} has been set to ${bonusStreak}.`);
        } catch (err) { alert("Failed to update bonus streak."); }
    };

    const handleUploadFile = async () => {
        if (!fileToUpload) return;
        setIsUploading(true);
        try {
            const storage = getStorage();
            const storageRef = ref(storage, `staff_documents/${staff.id}/${fileToUpload.name}`);
            await uploadBytes(storageRef, fileToUpload);
            const downloadURL = await getDownloadURL(storageRef);
            const fileMetadata = { name: fileToUpload.name, url: downloadURL, path: storageRef.fullPath, uploadedAt: new Date().toISOString() };
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { documents: arrayUnion(fileMetadata) });
            setFileToUpload(null);
            document.getElementById('file-upload-input').value = '';
        } catch (error) { console.error("File upload error:", error); alert("Failed to upload file."); } finally { setIsUploading(false); }
    };
    
    const handleDeleteFile = async (fileToDelete) => {
        if (!window.confirm(`Are you sure you want to delete "${fileToDelete.name}"?`)) return;
        try {
            const storage = getStorage();
            const fileRef = ref(storage, fileToDelete.path);
            await deleteObject(fileRef);
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { documents: arrayRemove(fileToDelete) });
        } catch (error) { console.error("File deletion error:", error); alert("Failed to delete file."); }
    };

    const InfoRow = ({ label, value, className = '' }) => (<div className={className}><p className="text-sm text-gray-400">{label}</p><p className="text-white text-lg">{value || '-'}</p></div>);
    const formatRate = (job) => { if (typeof job.rate !== 'number') return 'N/A'; const rateString = job.rate.toLocaleString(); return job.payType === 'Hourly' ? `${rateString} / hr` : `${rateString} / mo`; };

    return (
        <div className="space-y-6">
            <div className="border-b border-gray-700">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <button onClick={() => setActiveTab('details')} className={`${activeTab === 'details' ? 'border-amber-500 text-amber-500' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>Profile Details</button>
                    <button onClick={() => setActiveTab('documents')} className={`${activeTab === 'documents' ? 'border-amber-500 text-amber-500' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>Documents</button>
                </nav>
            </div>

            {activeTab === 'details' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-start">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 flex-grow">
                             {isEditing ? (
                                <>
                                    <div><label className="text-sm text-gray-400">First Name</label><input id="firstName" value={formData.firstName} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md"/></div>
                                    <div><label className="text-sm text-gray-400">Last Name</label><input id="lastName" value={formData.lastName} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md"/></div>
                                    <div><label className="text-sm text-gray-400">Nickname</label><input id="nickname" value={formData.nickname} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md"/></div>
                                    <div><label className="text-sm text-gray-400">Email</label><input id="email" type="email" value={formData.email} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md"/></div>
                                    <div><label className="text-sm text-gray-400">Phone Number</label><input id="phoneNumber" value={formData.phoneNumber} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md"/></div>
                                    <div><label className="text-sm text-gray-400">Start Date</label><input id="startDate" type="date" value={formData.startDate} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md"/></div>
                                    <div><label className="text-sm text-gray-400">Birthdate</label><input id="birthdate" type="date" value={formData.birthdate} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md"/></div>
                                    <div className="md:col-span-2"><label className="text-sm text-gray-400">Bank Account</label><input id="bankAccount" value={formData.bankAccount} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md"/></div>
                                </>
                            ) : (
                                <>
                                    {staff.status === 'inactive' && <InfoRow label="Last Day of Employment" value={formatDateForDisplay(staff.endDate)} className="md:col-span-2 bg-red-900/50 p-3 rounded-lg" />}
                                    <InfoRow label="Legal Name" value={displayName} />
                                    <InfoRow label="Nickname" value={staff.nickname} />
                                    <InfoRow label="Email Address" value={staff.email} />
                                    <InfoRow label="Phone Number" value={staff.phoneNumber} />
                                    <InfoRow label="Start Date" value={formatDateForDisplay(staff.startDate)} />
                                    <InfoRow label="Seniority" value={calculateSeniority(staff.startDate, staff.endDate)} />
                                    <InfoRow label="Birthdate" value={formatDateForDisplay(staff.birthdate)} />
                                    <div className="md:col-span-2"><InfoRow label="Bank Account" value={staff.bankAccount} /></div>
                                    <hr className="md:col-span-2 border-gray-700 my-2" />
                                    <InfoRow label="Current Department" value={currentJob.department} />
                                    <InfoRow label="Current Position" value={currentJob.position} />
                                    <InfoRow label="Current Pay Rate (THB)" value={formatRate(currentJob)} />
                                </>
                            )}
                        </div>
                    </div>
                    <h4 className="text-lg font-semibold text-white">Job & Salary History</h4>
                    {isAddingJob ? (
                        <div className="bg-gray-700 p-4 rounded-lg space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="text-sm">Department</label><select id="department" value={newJob.department} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md">{departments.map(d => <option key={d} value={d}>{d}</option>)}</select></div><div><label className="text-sm">Position</label><input id="position" value={newJob.position} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md"/></div></div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="text-sm">Start Date</label><input id="startDate" type="date" value={newJob.startDate} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md"/></div><div><label className="text-sm">Pay Type</label><select id="payType" value={newJob.payType} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md"><option>Monthly</option><option>Hourly</option></select></div></div>
                            <div><label className="text-sm">{newJob.payType === 'Monthly' ? 'Base Salary (THB)' : 'Hourly Rate (THB)'}</label><input id="rate" type="number" value={newJob.rate} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md"/></div>
                            <div className="flex justify-end space-x-2"><button onClick={() => setIsAddingJob(false)} className="px-4 py-1 rounded-md bg-gray-500">Cancel</button><button onClick={handleAddNewJob} disabled={isSaving} className="px-4 py-1 rounded-md bg-green-600">{isSaving ? 'Saving...' : 'Save Job'}</button></div>
                            {error && <p className="text-red-400 text-sm text-right mt-2">{error}</p>}
                        </div>
                    ) : ( <button onClick={() => setIsAddingJob(true)} className="w-full flex justify-center items-center py-2 px-4 rounded-lg bg-gray-700 hover:bg-gray-600"><PlusIcon className="h-5 w-5 mr-2"/>Add New Job Role</button> )}
                    <div className="space-y-2 max-h-40 overflow-y-auto">{sortedJobHistory.map((job, index) => (<div key={index} className="bg-gray-700 p-3 rounded-lg flex justify-between items-center group"><div><p className="font-bold">{job.position} <span className="text-sm text-gray-400">({job.department})</span></p><p className="text-sm text-amber-400">{formatRate(job)}</p></div><div className="flex items-center space-x-3"><p className="text-sm text-gray-300">{formatDateForDisplay(job.startDate)}</p><button onClick={() => handleDeleteJob(job)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="h-5 w-5"/></button></div></div>))}</div>
                    {userRole === 'manager' && (<div className="bg-gray-800 rounded-lg p-4 border border-gray-700"><h4 className="text-base font-semibold text-white">Bonus Management</h4><p className="text-sm text-gray-400 mt-1">Manually set the bonus streak.</p><div className="mt-4 flex items-center space-x-4"><p className="text-sm">Current Streak: <span className="font-bold text-amber-400">{staff.bonusStreak || 0} months</span></p><input type="number" value={bonusStreak} onChange={(e) => setBonusStreak(e.target.value)} className="w-24 bg-gray-700 rounded-md p-1 text-white" /><button onClick={handleSetBonusStreak} className="px-4 py-1 rounded-md bg-blue-600 text-sm">Set Streak</button></div></div>)}
                </div>
            )}

            {activeTab === 'documents' && (
                <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Document Management</h3>
                    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                        <div className="flex items-center space-x-4">
                            <input type="file" id="file-upload-input" onChange={(e) => setFileToUpload(e.target.files[0])} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"/>
                            <button onClick={handleUploadFile} disabled={!fileToUpload || isUploading} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:bg-gray-500 flex-shrink-0">{isUploading ? 'Uploading...' : 'Upload'}</button>
                        </div>
                    </div>
                    <div className="mt-6 space-y-3 max-h-80 overflow-y-auto">
                        <h4 className="text-md font-semibold text-gray-300">Uploaded Files</h4>
                        {(staff.documents && staff.documents.length > 0) ? staff.documents.map((doc, index) => (<div key={index} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg group"><a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-white hover:text-amber-400 truncate pr-4">{doc.name}</a><button onClick={() => handleDeleteFile(doc)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="h-5 w-5"/></button></div>)) : (<p className="text-gray-500 text-sm mt-4">No documents have been uploaded for this staff member.</p>)}
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-gray-700 mt-6">
                <div>
                     <button onClick={handleDeleteStaff} disabled={isDeleting} className="text-sm text-red-500 hover:text-red-400 disabled:text-gray-500">
                        {isDeleting ? 'Deleting...' : 'Delete Staff Permanently'}
                    </button>
                </div>

                <div className="flex space-x-4">
                    {activeTab === 'details' && (
                        isEditing ? (
                            <>
                                <button onClick={() => { setIsEditing(false); setError(''); }} className="px-6 py-2 rounded-lg bg-gray-600">Cancel</button>
                                <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 rounded-lg bg-amber-600">{isSaving ? 'Saving...' : 'Save Changes'}</button>
                            </>
                        ) : (
                            <>
                                {staff.status === 'inactive' ? (
                                    <button onClick={() => handleArchiveStaff('active')} disabled={isArchiving} className="px-6 py-2 rounded-lg bg-green-600">{isArchiving ? 'Activating...' : 'Set as Active'}</button>
                                ) : (
                                    <button onClick={() => handleArchiveStaff('inactive')} disabled={isArchiving} className="px-6 py-2 rounded-lg bg-yellow-600">{isArchiving ? 'Archiving...' : 'Archive Staff'}</button>
                                )}
                                <button onClick={() => setIsEditing(true)} className="px-6 py-2 rounded-lg bg-blue-600">Edit Basic Info</button>
                            </>
                        )
                    )}
                    <button onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-600">Close</button>
                </div>
            </div>
        </div>
    );
};