/* src/components/StaffProfile/StaffProfileModal.jsx */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove, Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from '../../../firebase.js';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { ProfileDetailsView } from './ProfileDetailsView.jsx';
import { ProfileDetailsEdit } from './ProfileDetailsEdit';
import { JobHistoryManager } from './JobHistoryManager';
import { DocumentManager } from './DocumentManager';
import { ProfileActionButtons } from './ProfileActionButtons';
import OffboardingModal from '../ManageStaff/OffboardingModal.jsx';
import { Archive, UserCheck, Trash, Key, FileText, Loader2, FileBadge, PlaneTakeoff, ShieldAlert, Shirt, LogOut, History, Clock, AlertOctagon, CheckCircle, XCircle, RotateCcw, Download, EyeOff, Eye } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils.js';
import { generateDocument, translateNumber } from '../../utils/documentGenerator';

const functionsDefault = getFunctions(app);
const functionsAsia = getFunctions(app, "asia-southeast1");

const deleteStaffFunc = httpsCallable(functionsDefault, 'deleteStaff');
const setStaffAuthStatus = httpsCallable(functionsDefault, 'setStaffAuthStatus');
const setStaffPassword = httpsCallable(functionsDefault, 'setStaffPassword');

// --- NEW: Import our Email Sync Function ---
const updateStaffEmailFunc = httpsCallable(functionsDefault, 'updateStaffEmail');

const getInitialFormData = (staff) => {
    const formattedStartDate = staff.startDate ? dateUtils.formatISODate(dateUtils.fromFirestore(staff.startDate)) : '';
    const formattedBirthdate = staff.birthdate ? dateUtils.formatISODate(dateUtils.fromFirestore(staff.birthdate)) : '';
    let initialData = {
        email: staff.email || '', phoneNumber: staff.phoneNumber || '', birthdate: formattedBirthdate || '',
        startDate: formattedStartDate || '', bankAccount: staff.bankAccount || '', address: staff.address || '',
        emergencyContactName: staff.emergencyContactName || '', emergencyContactPhone: staff.emergencyContactPhone || '',
        isSsoRegistered: staff.isSsoRegistered ?? true,
        idType: staff.idType || 'None',
        idNumber: staff.idNumber || '',
    };
    if (staff.firstName || staff.lastName) return { ...initialData, firstName: staff.firstName || '', lastName: staff.lastName || '', nickname: staff.nickname || '' };
    const nameParts = (staff.fullName || '').split(' ');
    return { ...initialData, firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' ') || '', nickname: staff.nickname || '' };
};

// ============================================================================
// HR Records Dashboard
// ============================================================================
const StaffHRRecords = ({ db, staffId, staffName }) => {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [filterType, setFilterType] = useState('All');
    const [showRevoked, setShowRevoked] = useState(false);

    useEffect(() => {
        const fetchRecords = async () => {
            try {
                const q = query(collection(db, 'manager_alerts'), where('staffId', '==', staffId));
                const snap = await getDocs(q);
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                data.sort((a, b) => new Date(b.date) - new Date(a.date));
                setRecords(data);
            } catch (error) {
                console.error("Failed to fetch HR records", error);
            } finally {
                setLoading(false);
            }
        };
        fetchRecords();
    }, [db, staffId]);

    if (loading) return <div className="p-8 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2"/> Loading HR history...</div>;

    const filteredRecords = records.filter(r => {
        if (!showRevoked && r.status === 'revoked') return false;
        if (filterType !== 'All' && !r.type.includes(filterType.toLowerCase())) return false;
        return true;
    });

    const validRecords = records.filter(r => r.status !== 'revoked');
    const lates = validRecords.filter(r => r.type === 'risk_late');
    const absences = validRecords.filter(r => r.type === 'risk_absence');
    const overtimes = validRecords.filter(r => r.type === 'overtime_request');

    const stats = {
        totalLateFlags: lates.length,
        totalLateMins: lates.reduce((sum, r) => sum + (r.minutesLate || 0), 0),
        enforcedLates: lates.filter(r => r.status === 'enforced').length,
        totalAbsenceFlags: absences.length,
        enforcedAbsences: absences.filter(r => r.status === 'enforced').length,
        totalOTRequests: overtimes.length,
        approvedOTMins: overtimes.filter(r => r.status === 'approved').reduce((sum, r) => sum + (r.extraMinutes || 0), 0)
    };

    const handleExportCSV = () => {
        if (filteredRecords.length === 0) return alert("No records to export.");
        const headers = ["Date", "Type", "Original Message", "Status"];
        const rows = filteredRecords.map(r => {
            const friendlyType = r.type === 'overtime_request' ? 'Overtime' : r.type.includes('late') ? 'Lateness' : 'Absence';
            return [ r.date, friendlyType, `"${r.message || ''}"`, r.status.toUpperCase() ];
        });
        const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${staffName.replace(/\s+/g, '_')}_HR_History.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center"><History className="mr-2 text-indigo-400"/> Lifetime Punctuality & HR Stats</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-800 border border-gray-700 p-4 rounded-xl shadow-lg">
                    <div className="flex items-center gap-2 mb-2"><ShieldAlert className="h-5 w-5 text-amber-400" /><h4 className="font-bold text-gray-300">Lateness</h4></div>
                    <p className="text-2xl font-bold text-white mb-1">{stats.totalLateFlags} <span className="text-sm font-normal text-gray-400">times flagged</span></p>
                    <p className="text-sm text-gray-400 mb-2">Total Time: <span className="font-bold text-amber-400">{Math.floor(stats.totalLateMins / 60)}h {stats.totalLateMins % 60}m</span></p>
                    <div className="text-xs bg-gray-900/50 p-2 rounded text-gray-400 border border-gray-700/50">Manager Enforced: <span className="font-bold text-white">{stats.enforcedLates}</span></div>
                </div>

                <div className="bg-gray-800 border border-gray-700 p-4 rounded-xl shadow-lg">
                    <div className="flex items-center gap-2 mb-2"><AlertOctagon className="h-5 w-5 text-red-400" /><h4 className="font-bold text-gray-300">Absences</h4></div>
                    <p className="text-2xl font-bold text-white mb-1">{stats.totalAbsenceFlags} <span className="text-sm font-normal text-gray-400">times flagged</span></p>
                    <p className="text-sm text-gray-400 mb-2 invisible">Placeholder</p>
                    <div className="text-xs bg-gray-900/50 p-2 rounded text-gray-400 border border-gray-700/50 mt-auto">Manager Enforced: <span className="font-bold text-white">{stats.enforcedAbsences}</span></div>
                </div>

                <div className="bg-gray-800 border border-gray-700 p-4 rounded-xl shadow-lg">
                    <div className="flex items-center gap-2 mb-2"><Clock className="h-5 w-5 text-green-400" /><h4 className="font-bold text-gray-300">Overtime</h4></div>
                    <p className="text-2xl font-bold text-white mb-1">{stats.totalOTRequests} <span className="text-sm font-normal text-gray-400">requests</span></p>
                    <p className="text-sm text-gray-400 mb-2">Total Paid: <span className="font-bold text-green-400">{Math.floor(stats.approvedOTMins / 60)}h {stats.approvedOTMins % 60}m</span></p>
                    <div className="text-xs bg-gray-900/50 p-2 rounded text-gray-400 border border-gray-700/50">Manager Approved: <span className="font-bold text-white">{overtimes.filter(r => r.status === 'approved').length}</span></div>
                </div>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mt-6">
                <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white focus:ring-indigo-500 w-full sm:w-auto">
                            <option value="All">All Events</option>
                            <option value="overtime">Overtime Only</option>
                            <option value="risk">Disciplinary Only</option>
                        </select>
                        <button onClick={() => setShowRevoked(!showRevoked)} className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${showRevoked ? 'bg-indigo-900/40 text-indigo-300 border-indigo-700' : 'bg-gray-800 text-gray-400 border-gray-600 hover:text-white'}`}>
                            {showRevoked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            {showRevoked ? "Showing Revoked" : "Hide Revoked"}
                        </button>
                    </div>
                    <button onClick={handleExportCSV} disabled={filteredRecords.length === 0} className="w-full sm:w-auto flex items-center justify-center gap-2 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white px-4 py-1.5 rounded-lg transition-colors border border-gray-600 disabled:opacity-50">
                        <Download className="h-4 w-4" /> Export CSV
                    </button>
                </div>

                <div className="overflow-y-auto max-h-96">
                    {filteredRecords.length > 0 ? (
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-800 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Date</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Event</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Details</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Final Decision</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700 bg-gray-800/50">
                                {filteredRecords.map(r => (
                                    <tr key={r.id} className={`hover:bg-gray-700/50 transition-colors ${r.status === 'revoked' ? 'opacity-50' : ''}`}>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{r.date}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                                            {r.type === 'risk_late' && <span className="text-amber-400 flex items-center"><ShieldAlert className="h-4 w-4 mr-1"/> Late</span>}
                                            {r.type === 'risk_absence' && <span className="text-red-400 flex items-center"><AlertOctagon className="h-4 w-4 mr-1"/> Absence</span>}
                                            {r.type === 'overtime_request' && <span className="text-green-400 flex items-center"><Clock className="h-4 w-4 mr-1"/> Overtime</span>}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-400 max-w-xs truncate" title={r.message}>{r.message}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {r.status === 'approved' || r.status === 'enforced' ? <span className="px-2 py-1 bg-green-900/50 text-green-400 rounded text-xs border border-green-700/50 flex items-center w-max"><CheckCircle className="w-3 h-3 mr-1"/> {r.status.toUpperCase()}</span> : 
                                             r.status === 'dismissed' ? <span className="px-2 py-1 bg-gray-800 text-gray-400 rounded text-xs border border-gray-600 flex items-center w-max"><XCircle className="w-3 h-3 mr-1"/> DISMISSED</span> :
                                             r.status === 'revoked' ? <span className="px-2 py-1 bg-red-900/50 text-red-400 rounded text-xs border border-red-700/50 flex items-center w-max"><RotateCcw className="w-3 h-3 mr-1"/> REVOKED</span> :
                                             <span className="px-2 py-1 bg-yellow-900/50 text-yellow-400 rounded text-xs border border-yellow-700/50">PENDING</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="p-8 text-center text-gray-500 italic">No HR events on record for this filter.</div>
                    )}
                </div>
            </div>
        </div>
    );
};
// ============================================================================


export default function StaffProfileModal({ staff, db, companyConfig, onClose, departments, userRole }) {
    const [activeTab, setActiveTab] = useState('details');
    const [formData, setFormData] = useState(getInitialFormData(staff));
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [bonusStreak, setBonusStreak] = useState(staff.bonusStreak || 0);
    const [isBonusEligible, setIsBonusEligible] = useState(staff.isAttendanceBonusEligible ?? true);

    const [isOffboardingModalOpen, setIsOffboardingModalOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        setFormData(getInitialFormData(staff));
        setBonusStreak(staff.bonusStreak || 0);
        setIsBonusEligible(staff.isAttendanceBonusEligible ?? true);
        setIsEditing(false); setError('');
    }, [staff]);

    const currentJob = [...(staff.jobHistory || [])].sort((a, b) => {
        const dateA = new Date(b.startDate || 0);
        const dateB = new Date(a.startDate || 0);
        return dateA - dateB;
    })[0] || {};

    const displayName = staff.firstName ? `${staff.firstName} ${staff.lastName}` : staff.fullName;

    const handleInputChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setFormData(prev => ({ ...prev, [e.target.id]: value }));
    };

    // --- UPDATED: The Save Details logic with Email Sync ---
    const handleSaveDetails = async () => {
        setIsSaving(true); setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            const updateData = {
                firstName: formData.firstName || null, lastName: formData.lastName || null, nickname: formData.nickname || null,
                email: formData.email || null, phoneNumber: formData.phoneNumber || null,
                birthdate: dateUtils.parseISODateString(formData.birthdate) ? formData.birthdate : null,
                startDate: dateUtils.parseISODateString(formData.startDate) ? formData.startDate : null,
                bankAccount: formData.bankAccount || null, address: formData.address || null,
                emergencyContactName: formData.emergencyContactName || null, emergencyContactPhone: formData.emergencyContactPhone || null,
                isSsoRegistered: formData.isSsoRegistered,
                idType: formData.idType || null,
                idNumber: formData.idNumber || null,
            };
            if (updateData.firstName) updateData.fullName = null;

            // --- THE SMART EMAIL SYNC CHECK ---
            const oldEmail = staff.email || '';
            const newEmail = formData.email || '';

            if (newEmail && newEmail !== oldEmail) {
                const confirmAuthUpdate = window.confirm(
                    `You changed the email from ${oldEmail || 'None'} to ${newEmail}.\n\nDo you want to securely update their actual LOGIN email to match? (Highly Recommended)`
                );

                if (confirmAuthUpdate) {
                    try {
                        // Call our new Cloud Function
                        await updateStaffEmailFunc({ targetUid: staff.id, newEmail: newEmail });
                    } catch (funcError) {
                        console.error(funcError);
                        // If it fails (e.g., email already exists), stop everything and show the error.
                        throw new Error(funcError.message || 'Failed to update login email. Profile was not changed.');
                    }
                }
            }

            // If the sync succeeded (or if they declined it), update the Profile database.
            await updateDoc(staffDocRef, updateData);
            setIsEditing(false);
            
        } catch (err) { 
            setError(err.message || "Failed to save profile details."); 
        } finally { 
            setIsSaving(false); 
        }
    };

    const handleAddNewJob = async (newJobData) => {
        if (!dateUtils.parseISODateString(newJobData.startDate)) { alert("Invalid start date provided."); return; }

        if (newJobData.baseSalary) {
            newJobData.baseSalary = Math.round(Number(String(newJobData.baseSalary).replace(/,/g, '')));
        }

        setIsSaving(true); setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { jobHistory: arrayUnion(newJobData) });

            const oldTitle = currentJob.position || currentJob.title || "";
            const oldDept = currentJob.department || "";
            const newTitle = newJobData.position || newJobData.title || "";
            const isPromotion = (newTitle !== oldTitle || newJobData.department !== oldDept);
            const docType = isPromotion ? 'promotion' : 'salary_increase';

            if (window.confirm(`Job role saved! Would you like to generate the ${isPromotion ? 'Promotion' : 'Salary Increase'} Addendum document for them to sign?`)) {
                const newSalaryNum = Number(newJobData.baseSalary || 0);
                const extraData = {
                    NEW_JOB_TITLE: newTitle,
                    NEW_DEPARTMENT: newJobData.department,
                    NEW_START_DATE: dateUtils.formatCustom(new Date(newJobData.startDate), 'dd MMMM yyyy'),
                    NEW_SALARY: newSalaryNum.toLocaleString(),
                    NEW_SALARY_EN: translateNumber(newSalaryNum, 'EN'),
                    NEW_SALARY_TH: translateNumber(newSalaryNum, 'TH'),
                };
                await handleGenerate(docType, extraData);
            }
        } catch (err) { alert("Failed to add job role."); } finally { setIsSaving(false); }
    };

    const handleEditJob = async (oldJob, updatedJob) => {
        if (!dateUtils.parseISODateString(updatedJob.startDate)) { alert("Invalid start date provided."); return; }

        if (updatedJob.baseSalary) {
            updatedJob.baseSalary = Math.round(Number(String(updatedJob.baseSalary).replace(/,/g, '')));
        }

        setIsSaving(true); setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { jobHistory: arrayRemove(oldJob) });
            await updateDoc(staffDocRef, { jobHistory: arrayUnion(updatedJob) });
        } catch (err) { alert("Failed to update job role."); } finally { setIsSaving(false); }
    };

    const handleDeleteJob = async (jobToDelete) => {
        if (window.confirm(`Are you sure you want to delete this role?`)) {
            setIsSaving(true); setError('');
            try {
                const staffDocRef = doc(db, 'staff_profiles', staff.id);
                await updateDoc(staffDocRef, { jobHistory: arrayRemove(jobToDelete) });
            } catch (err) { alert("Failed to delete job."); } finally { setIsSaving(false); }
        }
    };

    const handleDeleteStaff = async () => {
        if (window.confirm(`DELETE STAFF?`) && window.confirm("Final confirmation: Delete this staff member?")) {
            setIsSaving(true); setError('');
            try { await deleteStaffFunc({ staffId: staff.id }); onClose(); } catch (err) { alert(`Error deleting staff.`); } finally { setIsSaving(false); }
        }
    };

    const handleReactivateStaff = async () => {
        setIsSaving(true); setError('');
        try {
            if (!window.confirm(`Set ${displayName} as Active?`)) return;
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await Promise.all([updateDoc(staffDocRef, { status: 'active', endDate: null }), setStaffAuthStatus({ staffId: staff.id, disabled: false })]);
            onClose();
        } catch (err) { alert(`Failed to activate staff.`); } finally { setIsSaving(false); }
    };

    const handleUploadFile = async (fileToUpload, metadata) => {
        setIsSaving(true); setError('');
        try {
            const storage = getStorage();
            const safeFileName = fileToUpload.name.replace(/\s+/g, '_');
            const storageRef = ref(storage, `staff_documents/${staff.id}/${Date.now()}_${safeFileName}`);
            await uploadBytes(storageRef, fileToUpload);
            const downloadURL = await getDownloadURL(storageRef);
            const fileMetadata = { 
                name: metadata.customName, 
                category: metadata.category, 
                expiryDate: metadata.expiryDate, 
                isVisibleToStaff: metadata.isVisibleToStaff,
                url: downloadURL, 
                path: storageRef.fullPath, 
                uploadedAt: Timestamp.now()
            };
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { documents: arrayUnion(fileMetadata) });
        } catch (err) {
            alert(`Failed to upload file: ${err.message}`);
        } finally { setIsSaving(false); }
    };

    const handleDeleteFile = async (fileToDelete) => {
        if (!window.confirm(`Are you sure you want to delete "${fileToDelete.name}"?`)) return;
        setIsSaving(true); setError('');
        try {
            const storage = getStorage();
            if (!fileToDelete.path) throw new Error("File path is missing.");
            const fileRef = ref(storage, fileToDelete.path);
            await deleteObject(fileRef);
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { documents: arrayRemove(fileToDelete) });
        } catch (error) {
            alert(`Failed to delete file: ${error.message}`);
        } finally { setIsSaving(false); }
    };
    
    const handleEditDocument = async (docPath, updatedMetadata) => {
        setIsSaving(true); setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            const updatedDocuments = staff.documents.map(d => {
                if (d.path === docPath) {
                    return { ...d, name: updatedMetadata.customName, category: updatedMetadata.category, expiryDate: updatedMetadata.expiryDate, isVisibleToStaff: updatedMetadata.isVisibleToStaff };
                }
                return d;
            });
            await updateDoc(staffDocRef, { documents: updatedDocuments });
        } catch (error) {
            alert(`Failed to update document: ${error.message}`);
        } finally { setIsSaving(false); }
    };

    const handleResetPassword = async (staffId) => {
        const newPassword = window.prompt(`Enter a new temporary password for ${displayName} (minimum 6 characters):`);
        if (!newPassword) return;
        if (newPassword.length < 6) { alert("Password must be at least 6 characters long."); return; }
        setIsSaving(true); setError('');
        try {
            const result = await setStaffPassword({ staffId: staffId, newPassword: newPassword });
            alert(result.data.result);
        } catch (err) {
            alert(`Failed to reset password: ${err.message}`);
        } finally { setIsSaving(false); }
    };

    const handleSetBonusStreak = async () => {
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
        } finally { setIsSaving(false); }
    };

    const handleToggleBonusEligibility = async (e) => {
        const newValue = e.target.checked;
        setIsBonusEligible(newValue);
        setIsSaving(true); setError('');
        try {
            const staffDocRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffDocRef, { isAttendanceBonusEligible: newValue });
        } catch (err) {
            alert("Failed to update bonus eligibility.");
            setIsBonusEligible(!newValue);
        } finally { setIsSaving(false); }
    };

    const handleGenerate = async (docType, extraData = {}) => {
        setIsGenerating(true);
        const result = await generateDocument(docType, staff, companyConfig, extraData);
        if (!result.success) alert("Failed to generate document: " + result.error);
        setIsGenerating(false);
    };

    const triggerDocumentForm = (docType) => {
        let extraData = {};

        if (docType === 'promotion' || docType === 'salary_increase') {
            const sortedJobs = [...(staff.jobHistory || [])].sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));

            if (sortedJobs.length < 2) {
                alert("Cannot generate automatically: Staff needs at least 2 job history entries (an old one and a new one) to calculate the changes.");
                return;
            }

            const newJob = sortedJobs[0];
            const oldJob = sortedJobs[1];

            const newSalaryNum = Number(newJob.baseSalary || newJob.rate || 0);

            extraData = {
                NEW_JOB_TITLE: newJob.position || newJob.title || "",
                NEW_DEPARTMENT: newJob.department || "",
                NEW_START_DATE: dateUtils.formatCustom(new Date(newJob.startDate), 'dd MMMM yyyy'),
                NEW_SALARY: newSalaryNum.toLocaleString(),
                NEW_SALARY_EN: translateNumber(newSalaryNum, 'EN'),
                NEW_SALARY_TH: translateNumber(newSalaryNum, 'TH'),
                ORIGINAL_START_DATE: dateUtils.formatCustom(new Date(oldJob.startDate), 'dd MMMM yyyy')
            };
        }

        if (docType === 'warning') {
            const level = window.prompt("What level is this warning? (e.g., 1st Warning, Final Warning)"); if (!level) return;
            const incident = window.prompt("Date of the incident? (e.g., 15 March 2026)"); if (!incident) return;
            const reason = window.prompt("Reason for warning? (e.g., Late arrival by 2 hours without notice)"); if (!reason) return;
            const consequence = window.prompt("Consequence? (e.g., 1-day suspension without pay)"); if (!consequence) return;
            extraData = { WARNING_LEVEL: level, INCIDENT_DATE: incident, REASON: reason, CONSEQUENCE: consequence };
        }
        if (docType === 'leave') {
            const start = window.prompt("Leave Start Date? (e.g., 10 April 2026)"); if (!start) return;
            const end = window.prompt("Leave End Date? (e.g., 15 April 2026)"); if (!end) return;
            const reason = window.prompt("Reason for special leave?"); if (!reason) return;
            extraData = { LEAVE_START_DATE: start, LEAVE_END_DATE: end, LEAVE_REASON: reason };
        }
        handleGenerate(docType, extraData);
    };

    const getTabClasses = (tabName) => {
        return `${activeTab === tabName ? 'border-amber-500 text-amber-500' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none`;
    };
    const isActive = staff.status === 'active' || staff.status === undefined || staff.status === null;

    return (
        <div className="space-y-6 relative">

            {isOffboardingModalOpen && (
                <OffboardingModal
                    db={db} staff={staff} companyConfig={companyConfig}
                    onClose={() => setIsOffboardingModalOpen(false)}
                    onSuccess={async (shouldDisableImmediately) => {
                        setIsOffboardingModalOpen(false);
                        if (shouldDisableImmediately) { try { await setStaffAuthStatus({ staffId: staff.id, disabled: true }); } catch (e) { } }
                        if (window.confirm("Staff member archived! Would you like to print the Resignation Letter for them to sign?")) {
                            await handleGenerate('resignation', { RESIGNATION_NOTICE_DATE: dateUtils.formatCustom(new Date(), 'dd MMMM yyyy'), LAST_WORKING_DAY: dateUtils.formatCustom(new Date(staff.endDate || new Date()), 'dd MMMM yyyy') });
                        }
                        onClose();
                    }}
                />
            )}

            <div className="border-b border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2">
                <nav className="-mb-px flex flex-wrap gap-x-4 sm:gap-x-6 gap-y-1 w-full" aria-label="Tabs">
                    <button onClick={() => setActiveTab('details')} className={getTabClasses('details')}>Profile Details</button>
                    <button onClick={() => setActiveTab('job')} className={getTabClasses('job')}>Job & Salary</button>
                    <button onClick={() => setActiveTab('documents')} className={getTabClasses('documents')}>Documents</button>
                    
                    {userRole === 'manager' && (
                        <button onClick={() => setActiveTab('hr-records')} className={getTabClasses('hr-records')}>
                            <span className="flex items-center gap-2"><History className="h-4 w-4" /> HR Records</span>
                        </button>
                    )}
                    
                    {userRole === 'manager' && (
                        <button onClick={() => setActiveTab('forms')} className={getTabClasses('forms')}>
                            <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> HR Forms</span>
                        </button>
                    )}
                    {userRole === 'manager' && <button onClick={() => setActiveTab('settings')} className={getTabClasses('settings')}>Settings & Stats</button>}
                </nav>
            </div>

            {error && <p className="text-red-400 text-sm bg-red-900/30 p-3 rounded-md">{error}</p>}

            {/* --- HR Dashboard --- */}
            {activeTab === 'hr-records' && userRole === 'manager' && (
                <StaffHRRecords db={db} staffId={staff.id} staffName={displayName} />
            )}

            {/* --- HR Forms Tab --- */}
            {activeTab === 'forms' && userRole === 'manager' && (
                <div className="space-y-8">
                    <div>
                        <h3 className="text-xl font-semibold text-white">Official HR Documents</h3>
                        <p className="text-sm text-gray-400 mt-1">Select a document to automatically populate it with this staff member's data.</p>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b border-gray-700 pb-2">Employment & Legal</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button onClick={() => handleGenerate('contract')} disabled={isGenerating} className="flex items-center p-4 bg-gray-800 border border-gray-700 rounded-xl hover:border-indigo-500 hover:bg-gray-700 transition-all text-left group disabled:opacity-50">
                                <div className="bg-indigo-900/50 p-3 rounded-lg mr-4 group-hover:bg-indigo-600 transition-colors">
                                    {isGenerating ? <Loader2 className="h-6 w-6 text-indigo-300 animate-spin" /> : <FileBadge className="h-6 w-6 text-indigo-300 group-hover:text-white transition-colors" />}
                                </div>
                                <div><h4 className="text-white font-medium">Main Employment Contract</h4><p className="text-xs text-gray-400 mt-1">Standard bilingual contract & rules</p></div>
                            </button>
                            <button onClick={() => handleGenerate('certificate')} disabled={isGenerating} className="flex items-center p-4 bg-gray-800 border border-gray-700 rounded-xl hover:border-blue-500 hover:bg-gray-700 transition-all text-left group disabled:opacity-50">
                                <div className="bg-blue-900/50 p-3 rounded-lg mr-4 group-hover:bg-blue-600 transition-colors"><FileText className="h-6 w-6 text-blue-300 group-hover:text-white transition-colors" /></div>
                                <div><h4 className="text-white font-medium">Certificate of Employment</h4><p className="text-xs text-gray-400 mt-1">Proof of employment letter for visas/loans</p></div>
                            </button>
                            <button onClick={() => triggerDocumentForm('salary_increase')} disabled={isGenerating} className="flex items-center p-4 bg-gray-800 border border-gray-700 rounded-xl hover:border-emerald-500 hover:bg-gray-700 transition-all text-left group disabled:opacity-50">
                                <div className="bg-emerald-900/50 p-3 rounded-lg mr-4 group-hover:bg-emerald-600 transition-colors"><FileText className="h-6 w-6 text-emerald-300 group-hover:text-white transition-colors" /></div>
                                <div><h4 className="text-white font-medium">Salary Increase Addendum</h4><p className="text-xs text-gray-400 mt-1">For raises without title changes</p></div>
                            </button>
                            <button onClick={() => triggerDocumentForm('promotion')} disabled={isGenerating} className="flex items-center p-4 bg-gray-800 border border-gray-700 rounded-xl hover:border-yellow-500 hover:bg-gray-700 transition-all text-left group disabled:opacity-50">
                                <div className="bg-yellow-900/50 p-3 rounded-lg mr-4 group-hover:bg-yellow-600 transition-colors"><FileBadge className="h-6 w-6 text-yellow-300 group-hover:text-white transition-colors" /></div>
                                <div><h4 className="text-white font-medium">Promotion Addendum</h4><p className="text-xs text-gray-400 mt-1">For new job titles & responsibilities</p></div>
                            </button>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b border-gray-700 pb-2">Operations & Requests</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button onClick={() => triggerDocumentForm('leave')} disabled={isGenerating} className="flex items-center p-4 bg-gray-800 border border-gray-700 rounded-xl hover:border-green-500 hover:bg-gray-700 transition-all text-left group disabled:opacity-50">
                                <div className="bg-green-900/50 p-3 rounded-lg mr-4 group-hover:bg-green-600 transition-colors"><PlaneTakeoff className="h-6 w-6 text-green-300 group-hover:text-white transition-colors" /></div>
                                <div><h4 className="text-white font-medium">Special Leave Request</h4><p className="text-xs text-gray-400 mt-1">Form for extended or unpaid leave</p></div>
                            </button>
                            <button onClick={() => handleGenerate('uniform')} disabled={isGenerating} className="flex items-center p-4 bg-gray-800 border border-gray-700 rounded-xl hover:border-purple-500 hover:bg-gray-700 transition-all text-left group disabled:opacity-50">
                                <div className="bg-purple-900/50 p-3 rounded-lg mr-4 group-hover:bg-purple-600 transition-colors"><Shirt className="h-6 w-6 text-purple-300 group-hover:text-white transition-colors" /></div>
                                <div><h4 className="text-white font-medium">Uniform Deduction Form</h4><p className="text-xs text-gray-400 mt-1">Authorization for lost/extra uniform costs</p></div>
                            </button>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b border-gray-700 pb-2">Performance & Offboarding</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button onClick={() => triggerDocumentForm('warning')} disabled={isGenerating} className="flex items-center p-4 bg-gray-800 border border-gray-700 rounded-xl hover:border-amber-500 hover:bg-gray-700 transition-all text-left group disabled:opacity-50">
                                <div className="bg-amber-900/50 p-3 rounded-lg mr-4 group-hover:bg-amber-600 transition-colors"><ShieldAlert className="h-6 w-6 text-amber-300 group-hover:text-white transition-colors" /></div>
                                <div><h4 className="text-white font-medium">Disciplinary Warning</h4><p className="text-xs text-gray-400 mt-1">Issue official 1st, 2nd, or Final warnings</p></div>
                            </button>
                            <button onClick={() => handleGenerate('resignation')} disabled={isGenerating} className="flex items-center p-4 bg-gray-800 border border-gray-700 rounded-xl hover:border-red-500 hover:bg-gray-700 transition-all text-left group disabled:opacity-50">
                                <div className="bg-red-900/50 p-3 rounded-lg mr-4 group-hover:bg-red-600 transition-colors"><LogOut className="h-6 w-6 text-red-300 group-hover:text-white transition-colors" /></div>
                                <div><h4 className="text-white font-medium">Resignation Letter</h4><p className="text-xs text-gray-400 mt-1">Voluntary resignation and waiver form</p></div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'details' && (<div className="space-y-6"> {isEditing ? <ProfileDetailsEdit formData={formData} handleInputChange={handleInputChange} /> : <ProfileDetailsView staff={staff} currentJob={currentJob} />} </div>)}
            {activeTab === 'job' && (
                <div className="space-y-6">
                    <JobHistoryManager
                        jobHistory={staff.jobHistory}
                        departments={departments}
                        roleTemplates={Object.keys(companyConfig?.roleDescriptions || {})}
                        onAddNewJob={handleAddNewJob}
                        onEditJob={handleEditJob}
                        onDeleteJob={handleDeleteJob}
                    />
                </div>
            )}
            
            {activeTab === 'documents' && (
                <DocumentManager 
                    documents={staff.documents} 
                    onUploadFile={handleUploadFile} 
                    onDeleteFile={handleDeleteFile}
                    onEditDocument={handleEditDocument}
                />
            )}

            {activeTab === 'settings' && userRole === 'manager' && (
                <div className="space-y-6">
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <h4 className="text-base font-semibold text-white">Bonus Management</h4>
                        <div className="mt-4 space-y-4">
                            <div>
                                <p className="text-sm text-gray-400">Manually set the attendance bonus streak.</p>
                                <div className="mt-2 flex items-center space-x-4">
                                    <p className="text-sm">Current Streak: <span className="font-bold text-amber-400">{staff.bonusStreak || 0} months</span></p>
                                    <input type="number" value={bonusStreak} onChange={(e) => setBonusStreak(e.target.value)} className="w-24 bg-gray-700 rounded-md p-1 text-white" min="0" />
                                    <button onClick={handleSetBonusStreak} disabled={isSaving} className="px-4 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-sm text-white disabled:opacity-50">Set Streak</button>
                                </div>
                            </div>
                            <div className="border-t border-gray-700 mt-4 pt-4">
                                <div className="flex items-center justify-between">
                                    <div><h5 className="font-medium text-white">Attendance Bonus</h5><p className="text-sm text-gray-400">Is this staff member eligible for the attendance bonus?</p></div>
                                    <input type="checkbox" id="bonus-eligible-toggle" role="switch" checked={isBonusEligible} onChange={handleToggleBonusEligibility} disabled={isSaving} className="h-5 w-5 rounded bg-gray-700 border-gray-600 text-amber-600 focus:ring-amber-500" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <h4 className="text-base font-semibold text-white">Staff Information</h4>
                        <div className="mt-4">
                            <label htmlFor="staffUid" className="block text-sm font-medium text-gray-400 mb-1">Staff User ID (UID)</label>
                            <input type="text" id="staffUid" readOnly value={staff.id} className="w-full mt-1 px-3 py-2 bg-gray-900 text-gray-400 rounded-md border border-gray-700 select-all" />
                        </div>
                    </div>

                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-4">
                        <h4 className="text-base font-semibold text-white">Staff Actions</h4>
                        <div>
                            {isActive ? (<button onClick={() => setIsOffboardingModalOpen(true)} disabled={isSaving || isEditing} className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-sm text-white disabled:opacity-50" title="Archive staff"> <Archive className="h-4 w-4 mr-2" /> Archive Staff Member </button>) : (<button onClick={handleReactivateStaff} disabled={isSaving || isEditing} className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-sm text-white disabled:opacity-50" title="Reactivate staff"> <UserCheck className="h-4 w-4 mr-2" /> Set Staff Member to Active </button>)}
                        </div>
                        <div><button onClick={() => handleResetPassword(staff.id)} disabled={isSaving || isEditing} className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-sm text-white disabled:opacity-50" title="Reset password"> <Key className="h-4 w-4 mr-2" /> Reset Password </button></div>
                        {!isActive && (
                            <div className="pt-4 border-t border-gray-700">
                                <button onClick={handleDeleteStaff} disabled={isSaving || isEditing} className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-sm text-white disabled:opacity-50" title="Delete staff permanently"> <Trash className="h-4 w-4 mr-2" /> Delete Staff Permanently </button>
                                <p className="text-xs text-red-400 mt-2">Warning: Deletion erases all data (attendance, pay, etc.) and cannot be undone.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ProfileActionButtons
                isEditing={isEditing}
                isSaving={isSaving}
                onSetEditing={(editingState) => { setIsEditing(editingState); setError(''); }}
                onSave={handleSaveDetails}
                onClose={onClose}
                activeTab={activeTab}
                showSaveCancel={isEditing && activeTab === 'details'}
                staffProfile={staff}
            />
        </div>
    );
};