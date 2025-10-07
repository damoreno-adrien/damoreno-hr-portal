import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { PlusIcon, TrashIcon } from './Icons';

export default function StaffProfileModal({ staff, db, onClose, departments, userRole }) {
    const [isEditing, setIsEditing] = useState(false);
    const [isAddingJob, setIsAddingJob] = useState(false);
    const [formData, setFormData] = useState({ fullName: staff.fullName, email: staff.email });
    const [newJob, setNewJob] = useState({ position: '', department: departments[0] || '', startDate: new Date().toISOString().split('T')[0], payType: 'Monthly', rate: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setFormData({ fullName: staff.fullName, email: staff.email });
    }, [staff]);

    const sortedJobHistory = (staff.jobHistory || []).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    const currentJob = sortedJobHistory[0] || { position: 'N/A', department: 'N/A', rate: 'N/A', payType: 'Monthly' };

    const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
    const handleNewJobChange = (e) => setNewJob(prev => ({ ...prev, [e.target.id]: e.target.value }));

    const handleSave = async () => {
        setIsSaving(true);
        setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { fullName: formData.fullName, email: formData.email });
            setIsEditing(false);
        } catch (err) { 
            setError("Failed to save changes."); 
        } finally { 
            setIsSaving(false); 
        }
    };
    
    const handleAddNewJob = async () => {
        if (!newJob.position || !newJob.department || !newJob.startDate || !newJob.rate) {
            setError("Please fill all fields for the new job role.");
            return;
        }
        setIsSaving(true);
        setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, {
                jobHistory: arrayUnion({ ...newJob, rate: Number(newJob.rate) })
            });
            setIsAddingJob(false);
            setNewJob({ position: '', department: departments[0] || '', startDate: new Date().toISOString().split('T')[0], payType: 'Monthly', rate: '' });
        } catch (err) { 
            setError("Failed to add new job role."); 
        } finally { 
            setIsSaving(false); 
        }
    };
    
    const handleDeleteJob = async (jobToDelete) => {
        if (window.confirm(`Are you sure you want to delete the role "${jobToDelete.position}"?`)) {
            try {
                const staffDocRef = doc(db, 'staff_profiles', staff.id);
                await updateDoc(staffDocRef, { jobHistory: arrayRemove(jobToDelete) });
            } catch (err) { 
                alert("Failed to delete job history entry."); 
            }
        }
    };

    const handleDeleteStaff = async () => {
        if (window.confirm(`Are you sure you want to permanently delete ${staff.fullName}? This will remove their login, profile, shifts, and all associated data.`) &&
            window.confirm("This action is permanent and cannot be undone. Please confirm one last time.")) {
            
            setIsDeleting(true);
            try {
                const functions = getFunctions();
                const deleteStaff = httpsCallable(functions, 'deleteStaff');
                await deleteStaff({ staffId: staff.id });
                alert(`${staff.fullName} has been successfully deleted.`);
                onClose();
            } catch (err) {
                alert(`Error deleting staff: ${err.message}`);
            } finally {
                setIsDeleting(false);
            }
        }
    };

    const InfoRow = ({ label, value }) => (<div><p className="text-sm text-gray-400">{label}</p><p className="text-white text-lg">{value || '-'}</p></div>);
    const formatRate = (job) => {
        if (typeof job.rate !== 'number') return 'N/A';
        const rateString = job.rate.toLocaleString();
        return job.payType === 'Hourly' ? `${rateString} / hr` : `${rateString} / mo`;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-start pb-6 border-b border-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-grow">
                    {isEditing ? (
                        <>
                            <div><label className="text-sm text-gray-400">Full Name</label><input id="fullName" value={formData.fullName} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md"/></div>
                            <div><label className="text-sm text-gray-400">Email</label><input id="email" type="email" value={formData.email} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md"/></div>
                        </>
                    ) : (
                        <>
                            <InfoRow label="Full Name" value={staff.fullName} />
                            <InfoRow label="Email Address" value={staff.email} />
                        </>
                    )}
                    <InfoRow label="Current Department" value={currentJob.department} />
                    <InfoRow label="Current Position" value={currentJob.position} />
                    <InfoRow label="Current Pay Rate (THB)" value={formatRate(currentJob)} />
                </div>
                {userRole === 'manager' && !isEditing && (
                    <div className="ml-6 flex-shrink-0">
                         <button onClick={handleDeleteStaff} disabled={isDeleting} className="flex items-center text-sm text-red-400 hover:text-red-300 disabled:text-gray-500">
                            <TrashIcon className="h-4 w-4 mr-1"/>
                            {isDeleting ? 'Deleting...' : 'Delete Staff'}
                        </button>
                    </div>
                )}
            </div>

            <h4 className="text-lg font-semibold text-white">Job & Salary History</h4>
            {isAddingJob ? (
                 <div className="bg-gray-700 p-4 rounded-lg space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="text-sm">Department</label><select id="department" value={newJob.department} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md">{departments.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                        <div><label className="text-sm">Position</label><input id="position" value={newJob.position} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md"/></div>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="text-sm">Start Date</label><input id="startDate" type="date" value={newJob.startDate} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md"/></div>
                        <div>
                            <label className="text-sm">Pay Type</label>
                            <select id="payType" value={newJob.payType} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md">
                                <option>Monthly</option>
                                <option>Hourly</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm">{newJob.payType === 'Monthly' ? 'Base Salary (THB)' : 'Hourly Rate (THB)'}</label>
                        <input id="rate" type="number" value={newJob.rate} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md"/>
                    </div>
                    <div className="flex justify-end space-x-2"><button onClick={() => setIsAddingJob(false)} className="px-4 py-1 rounded-md bg-gray-500">Cancel</button><button onClick={handleAddNewJob} disabled={isSaving} className="px-4 py-1 rounded-md bg-green-600">{isSaving ? 'Saving...' : 'Save Job'}</button></div>
                    {error && <p className="text-red-400 text-sm text-right mt-2">{error}</p>}
                </div>
            ) : (
                 <button onClick={() => setIsAddingJob(true)} className="w-full flex justify-center items-center py-2 px-4 rounded-lg bg-gray-700 hover:bg-gray-600"><PlusIcon className="h-5 w-5 mr-2"/>Add New Job Role</button>
            )}

            <div className="space-y-2 max-h-40 overflow-y-auto">
                {sortedJobHistory.map((job, index) => (
                    <div key={index} className="bg-gray-700 p-3 rounded-lg flex justify-between items-center group">
                        <div>
                            <p className="font-bold">{job.position} <span className="text-sm text-gray-400">({job.department})</span></p>
                            <p className="text-sm text-amber-400">{formatRate(job)}</p>
                        </div>
                        <div className="flex items-center space-x-3">
                             <p className="text-sm text-gray-300">{job.startDate}</p>
                             <button onClick={() => handleDeleteJob(job)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                <TrashIcon className="h-5 w-5"/>
                             </button>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="flex justify-end pt-4 space-x-4 border-t border-gray-700 mt-6">
                {isEditing ? (
                    <><button onClick={() => { setIsEditing(false); setError(''); }} className="px-6 py-2 rounded-lg bg-gray-600">Cancel</button><button onClick={handleSave} disabled={isSaving} className="px-6 py-2 rounded-lg bg-amber-600">{isSaving ? 'Saving...' : 'Save Changes'}</button></>
                ) : (
                    <><button onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-600">Close</button><button onClick={() => setIsEditing(true)} className="px-6 py-2 rounded-lg bg-blue-600">Edit Basic Info</button></>
                )}
            </div>
        </div>
    );
};