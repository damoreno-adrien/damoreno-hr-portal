import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, onSnapshot, addDoc, serverTimestamp, setDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

// --- Helper Icon Components ---
const LogInIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>);
const UserIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
const BriefcaseIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>);
const LogOutIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>);
const SendIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>);
const CalendarIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>);
const PlusIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>);
const XIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>);
const ChevronLeftIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>);
const ChevronRightIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>);
const SettingsIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>);
const TrashIcon = ({ className }) => (<svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>);

// --- Reusable Modal Component ---
const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl m-4">
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h3 className="text-xl font-semibold text-white">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><XIcon className="h-6 w-6" /></button>
                </div>
                <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

// --- Add New Staff Form Component ---
const AddStaffForm = ({ auth, onClose, departments }) => {
    const [fullName, setFullName] = useState('');
    const [position, setPosition] = useState('');
    const [department, setDepartment] = useState(departments[0] || '');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [baseSalary, setBaseSalary] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!fullName || !position || !department || !startDate || !email || !password || !baseSalary) {
            setError('Please fill out all fields.');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }
        setIsSaving(true);
        setError('');
        setSuccess('');

        try {
            const functionUrl = "https://createuser-3hzcubx72q-uc.a.run.app";
            const token = await auth.currentUser.getIdToken();

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ email, password, fullName, position, department, startDate, baseSalary }),
            });
            
            const responseData = await response.json();
            if (!response.ok) throw new Error(responseData.error || 'Something went wrong');
            
            setSuccess(`Successfully created user for ${email}!`);
            setTimeout(() => onClose(), 2000);

        } catch (err) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Full Name</label>
                    <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Department</label>
                    <select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                        {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                    </select>
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Position</label>
                    <input type="text" value={position} onChange={(e) => setPosition(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Base Salary (THB)</label>
                    <input type="number" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
            </div>
            <div className="border-t border-gray-700 pt-6">
                 <p className="text-sm text-gray-400 mb-4">Create Login Credentials:</p>
                  <div className="grid grid-cols-1">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Temporary Password</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                 </div>
            </div>
            {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
            {success && <p className="text-green-400 text-sm text-center mt-2">{success}</p>}
            <div className="flex justify-end pt-4 space-x-4">
                <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg text-gray-300 bg-gray-600 hover:bg-gray-500">Cancel</button>
                <button type="submit" disabled={isSaving} className="px-6 py-2 rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800">
                    {isSaving ? 'Creating...' : 'Create Staff'}
                </button>
            </div>
        </form>
    );
};

// --- Staff Profile View/Edit Component ---
const StaffProfileModal = ({ staff, db, onClose, departments }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [isAddingJob, setIsAddingJob] = useState(false);
    const [formData, setFormData] = useState({ fullName: staff.fullName, email: staff.email });
    const [newJob, setNewJob] = useState({ position: '', department: departments[0] || '', startDate: new Date().toISOString().split('T')[0], baseSalary: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setFormData({ fullName: staff.fullName, email: staff.email });
    }, [staff]);

    const sortedJobHistory = (staff.jobHistory || []).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    const currentJob = sortedJobHistory[0] || { position: 'N/A', department: 'N/A', baseSalary: 'N/A' };

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
        if (!newJob.position || !newJob.department || !newJob.startDate || !newJob.baseSalary) {
            setError("Please fill all fields for the new job role.");
            return;
        }
        setIsSaving(true);
        setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, {
                jobHistory: arrayUnion({ ...newJob, baseSalary: Number(newJob.baseSalary) })
            });
            setIsAddingJob(false);
            setNewJob({ position: '', department: departments[0] || '', startDate: new Date().toISOString().split('T')[0], baseSalary: '' });
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
                await updateDoc(staffDocRef, {
                    jobHistory: arrayRemove(jobToDelete)
                });
            } catch (err) {
                alert("Failed to delete job history entry.");
            }
        }
    };

    const InfoRow = ({ label, value }) => (<div><p className="text-sm text-gray-400">{label}</p><p className="text-white text-lg">{value || '-'}</p></div>);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-gray-700">
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
                <InfoRow label="Current Base Salary (THB)" value={currentJob.baseSalary?.toLocaleString()} />
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
                        <div><label className="text-sm">Base Salary (THB)</label><input id="baseSalary" type="number" value={newJob.baseSalary} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md"/></div>
                    </div>
                    <div className="flex justify-end space-x-2"><button onClick={() => setIsAddingJob(false)} className="px-4 py-1 rounded-md bg-gray-500">Cancel</button><button onClick={handleAddNewJob} disabled={isSaving} className="px-4 py-1 rounded-md bg-green-600">{isSaving ? 'Saving...' : 'Save Job'}</button></div>
                    {error && <p className="text-red-400 text-sm text-right mt-2">{error}</p>}
                </div>
            ) : (
                 <button onClick={() => setIsAddingJob(true)} className="w-full flex justify-center items-center py-2 px-4 rounded-lg bg-gray-700 hover:bg-gray-600"><PlusIcon className="h-5 w-5 mr-2"/>Add New Job Role</button>
            )}

            <div className="space-y-2">
                {sortedJobHistory.map((job, index) => (
                    <div key={index} className="bg-gray-700 p-3 rounded-lg flex justify-between items-center group">
                        <div>
                            <p className="font-bold">{job.position} <span className="text-sm text-gray-400">({job.department})</span></p>
                            <p className="text-sm text-amber-400">{job.baseSalary?.toLocaleString()} THB</p>
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


// --- Staff Management Page Component ---
const StaffManagementPage = ({ auth, db, staffList, departments }) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState(null);

    const handleViewStaff = (staff) => setSelectedStaff(staff);
    const closeProfileModal = () => setSelectedStaff(null);
    
    const getCurrentPosition = (staff) => {
        if (staff.jobHistory && staff.jobHistory.length > 0) {
            return staff.jobHistory.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0].position;
        }
        return 'N/A';
    };

    useEffect(() => {
        if (selectedStaff) {
            const updatedStaff = staffList.find(staff => staff.id === selectedStaff.id);
            if (updatedStaff) {
                setSelectedStaff(updatedStaff);
            }
        }
    }, [staffList]);

    return (
        <div>
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Invite New Staff Member">
                <AddStaffForm auth={auth} onClose={() => setIsAddModalOpen(false)} departments={departments} />
            </Modal>
            
            {selectedStaff && (
                 <Modal isOpen={true} onClose={closeProfileModal} title="Staff Profile">
                    <StaffProfileModal staff={selectedStaff} db={db} onClose={closeProfileModal} departments={departments} />
                </Modal>
            )}

            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold text-white">Staff Management</h2>
                <button onClick={() => setIsAddModalOpen(true)} className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg">
                    <PlusIcon className="h-5 w-5 mr-2" />
                    Invite New Staff
                </button>
            </div>
            <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                <table className="min-w-full">
                    <thead className="bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Full Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Position</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Start Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {staffList.map(staff => (
                            <tr key={staff.id} onClick={() => handleViewStaff(staff)} className="hover:bg-gray-700 cursor-pointer">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{staff.fullName}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{getCurrentPosition(staff)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{staff.startDate}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className="px-3 py-1 inline-flex text-xs font-semibold rounded-full bg-green-600 text-green-100">Active</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- Planning Page Component ---
const PlanningPage = ({ staffList }) => {
    const getStartOfWeek = (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    };

    const [startOfWeek, setStartOfWeek] = useState(getStartOfWeek(new Date()));

    const changeWeek = (offset) => {
        setStartOfWeek(prevDate => {
            const newDate = new Date(prevDate);
            newDate.setDate(newDate.getDate() + (7 * offset));
            return newDate;
        });
    };
    
    const days = Array.from({ length: 7 }).map((_, i) => {
        const date = new Date(startOfWeek);
        date.setDate(date.getDate() + i);
        return date;
    });

    const formatDate = (date) => {
        const isToday = new Date().toDateString() === date.toDateString();
        return (
            <div className={`text-center py-4 border-b-2 ${isToday ? 'border-amber-500' : 'border-gray-700'} border-r border-gray-700`}>
                <p className={`font-bold ${isToday ? 'text-amber-400' : 'text-white'}`}>{date.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                <p className={`text-2xl font-light ${isToday ? 'text-white' : 'text-gray-300'}`}>{date.getDate()}</p>
            </div>
        );
    };

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    const weekRangeString = `${startOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${endOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold text-white">Weekly Planner</h2>
                <div className="flex items-center space-x-4">
                    <button onClick={() => changeWeek(-1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"><ChevronLeftIcon className="h-6 w-6" /></button>
                    <h3 className="text-xl font-semibold w-64 text-center">{weekRangeString}</h3>
                    <button onClick={() => changeWeek(1)} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"><ChevronRightIcon className="h-6 w-6" /></button>
                </div>
            </div>
            <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                <div className="min-w-[1200px]">
                    <div className="grid grid-cols-[200px_repeat(7,1fr)]">
                        <div className="px-4 py-3 font-medium text-white border-b-2 border-r border-gray-700 flex items-center">STAFF</div>
                        {days.map(day => (<div key={day.toISOString()}>{formatDate(day)}</div>))}
                        {staffList.map(staff => (
                            <div key={staff.id} className="grid grid-cols-subgrid col-span-8 border-t border-gray-700">
                                <div className="px-4 py-3 font-medium text-white border-r border-gray-700 h-16 flex items-center">{staff.fullName}</div>
                                {days.map(day => (
                                    <div key={day.toISOString()} className="border-r border-gray-700 h-16 flex items-center justify-center">
                                        <button className="text-gray-500 hover:text-white"><PlusIcon className="h-6 w-6"/></button>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- Settings Page Component ---
const SettingsPage = ({ db, departments }) => {
    const [newDepartment, setNewDepartment] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const configDocRef = doc(db, 'settings', 'company_config');

    const handleAddDepartment = async (e) => {
        e.preventDefault();
        if (!newDepartment.trim()) return;
        setIsSaving(true);
        setError('');
        try {
            await updateDoc(configDocRef, { departments: arrayUnion(newDepartment.trim()) });
            setNewDepartment('');
        } catch (err) {
            setError("Failed to add department.");
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDeleteDepartment = async (departmentToDelete) => {
        if (window.confirm(`Are you sure you want to delete "${departmentToDelete}"?`)) {
            try {
                await updateDoc(configDocRef, { departments: arrayRemove(departmentToDelete) });
            } catch (err) {
                alert("Failed to delete department.");
            }
        }
    };

    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-8">Settings</h2>
            <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                <h3 className="text-xl font-semibold text-white">Manage Departments</h3>
                <p className="text-gray-400 mt-2">Add or remove departments for your restaurant.</p>

                <form onSubmit={handleAddDepartment} className="mt-6 flex items-center space-x-4">
                    <input type="text" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} placeholder="New department name" className="flex-grow px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    <button type="submit" disabled={isSaving} className="flex items-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg">
                        <PlusIcon className="h-5 w-5 mr-2" />
                        {isSaving ? 'Adding...' : 'Add'}
                    </button>
                </form>
                {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

                <div className="mt-8 space-y-3">
                    {(departments || []).map(dept => (
                        <div key={dept} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg">
                            <span className="text-white">{dept}</span>
                            <button onClick={() => handleDeleteDepartment(dept)} className="text-red-400 hover:text-red-300">
                                <TrashIcon className="h-5 w-5" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};


// --- Main Application Component ---
export default function App() {
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [user, setUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loginError, setLoginError] = useState('');
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [staffList, setStaffList] = useState([]);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [departments, setDepartments] = useState([]);

    useEffect(() => {
        try {
            const firebaseConfigString = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_FIREBASE_CONFIG : (typeof __firebase_config__ !== 'undefined' ? __firebase_config__ : '{}');
            const firebaseConfig = JSON.parse(firebaseConfigString);
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            
            setAuth(authInstance);
            setDb(dbInstance);

            const unsubscribeAuth = onAuthStateChanged(authInstance, async (currentUser) => {
                if (currentUser) {
                    const userDocRef = doc(dbInstance, 'users', currentUser.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    setUser(currentUser);
                    setUserRole(userDocSnap.exists() ? userDocSnap.data().role : null);
                } else {
                    setUser(null);
                    setUserRole(null);
                }
                setIsLoading(false);
            });
            return () => unsubscribeAuth();
        } catch (error) {
            console.error("Firebase Initialization Error:", error);
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!db) return;
        const configDocRef = doc(db, 'settings', 'company_config');
        const unsubscribeSettings = onSnapshot(configDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setDepartments(docSnap.data().departments || []);
            } else {
                const defaultConfig = { departments: ["Management", "Service", "Kitchen", "Pizza Department"] };
                setDoc(configDocRef, defaultConfig);
            }
        });
        
        return () => unsubscribeSettings();
    }, [db]);


    useEffect(() => {
        if (userRole === 'manager' && db) {
            const staffCollectionRef = collection(db, 'staff_profiles');
            const unsubscribeStaff = onSnapshot(staffCollectionRef, (querySnapshot) => {
                const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setStaffList(list);
            }, (error) => console.error("Error fetching staff list:", error));
            return () => unsubscribeStaff();
        } else {
            setStaffList([]);
        }
    }, [userRole, db]);
    
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        if (!auth) return;
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            setLoginError('Invalid email or password. Please try again.');
        }
    };

    const handleLogout = async () => {
        if (!auth) return;
        await signOut(auth);
        setCurrentPage('dashboard');
    };
    
    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white"><div className="text-xl">Loading Da Moreno HR Portal...</div></div>;
    }

    if (!user) {
        return (
             <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
                <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-lg dark:bg-gray-800">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Da Moreno At Town</h1>
                        <p className="mt-2 text-gray-600 dark:text-gray-300">HR Management Portal</p>
                    </div>
                    <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                         <div className="rounded-md shadow-sm">
                            <div>
                                <input id="email-address" name="email" type="email" autoComplete="email" required className="w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
                            </div>
                            <div className="-mt-px">
                                <input id="password" name="password" type="password" autoComplete="current-password" required className="w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                            </div>
                        </div>
                        {loginError && (<p className="mt-2 text-center text-sm text-red-600 dark:text-red-400">{loginError}</p>)}
                        <div>
                            <button type="submit" className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500">
                                <span className="absolute left-0 inset-y-0 flex items-center pl-3"><LogInIcon className="h-5 w-5 text-amber-500 group-hover:text-amber-400" /></span>
                                Sign in
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }
    
    const renderPageContent = () => {
        switch(currentPage) {
            case 'dashboard': return <h2 className="text-3xl font-bold text-white">Welcome, {user.email}!</h2>;
            case 'staff': return <StaffManagementPage auth={auth} db={db} staffList={staffList} departments={departments} />;
            case 'planning': return <PlanningPage staffList={staffList} />;
            case 'leave': return <h2 className="text-3xl font-bold text-white">Leave Management</h2>;
            case 'settings': return <SettingsPage db={db} departments={departments} />;
            default: return <h2 className="text-3xl font-bold text-white">Dashboard</h2>;
        }
    };

    const NavLink = ({ icon, label, page }) => (
        <button onClick={() => setCurrentPage(page)} className={`flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors ${currentPage === page ? 'bg-amber-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`}>
            {icon}
            <span className="ml-3">{label}</span>
        </button>
    );

    return (
        <div className="flex h-screen bg-gray-900 text-white font-sans">
            <aside className="w-64 bg-gray-800 flex flex-col p-4">
                 <div className="text-center py-4 mb-5 border-b border-gray-700">
                    <h1 className="text-2xl font-bold text-white">Da Moreno HR</h1>
                    <p className="text-sm text-amber-400 capitalize">{userRole} Portal</p>
                </div>
                <nav className="flex-1 space-y-2">
                    {userRole === 'manager' && (
                        <>
                           <NavLink page="dashboard" label="Dashboard" icon={<UserIcon className="h-5 w-5"/>} />
                           <NavLink page="staff" label="Manage Staff" icon={<BriefcaseIcon className="h-5 w-5"/>} />
                           <NavLink page="planning" label="Planning" icon={<CalendarIcon className="h-5 w-5"/>} />
                           <NavLink page="leave" label="Leave Management" icon={<SendIcon className="h-5 w-5"/>} />
                           <NavLink page="settings" label="Settings" icon={<SettingsIcon className="h-5 w-5"/>} />
                        </>
                    )}
                     {userRole === 'staff' && (
                        <>
                           <NavLink page="dashboard" label="My Dashboard" icon={<UserIcon className="h-5 w-5"/>} />
                           <NavLink page="planning" label="My Schedule" icon={<CalendarIcon className="h-5 w-5"/>} />
                           <NavLink page="leave" label="My Leave" icon={<SendIcon className="h-5 w-5"/>} />
                        </>
                    )}
                </nav>
                <div className="mt-auto">
                     <div className="py-4 border-t border-gray-700 text-center">
                        <p className="text-sm text-gray-400 truncate">{user.email}</p>
                    </div>
                    <button onClick={() => auth && signOut(auth)} className="flex items-center justify-center w-full px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700">
                        <LogOutIcon className="h-5 w-5"/>
                        <span className="ml-3 font-medium">Logout</span>
                    </button>
                </div>
            </aside>
            <main className="flex-1 p-10 overflow-auto">
                {renderPageContent()}
            </main>
        </div>
    );
}

