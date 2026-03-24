import React, { useState, useRef } from 'react';
import { Trash2, UploadCloud, FileText, AlertCircle, Eye, EyeOff, Loader2, CheckCircle2, XCircle, Calendar, Tag, Edit } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';

const MAX_FILE_SIZE_MB = 5;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];

const THAI_REQS = ['Thai ID Card', 'Tambian Baan', 'Employment Contract'];
const FOREIGN_REQS = ['Passport', 'Visa', 'Work Permit', 'Employment Contract'];
const ALL_CATEGORIES = ['Thai ID Card', 'Tambian Baan', 'Social Security Card', 'Passport', 'Certificate Of Identity', 'Non Thai Identification Card','Worker Identification Card', 'Visa', 'Work Permit', 'Employment Contract', 'Certificate', 'Warning Letter', 'Other'];

export const DocumentManager = ({ documents = [], onUploadFile, onDeleteFile, onEditDocument }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [formError, setFormError] = useState('');
    const [complianceMode, setComplianceMode] = useState('thai'); 
    
    // --- Shared Form State (Used for both Uploading and Editing) ---
    const [activeFormMode, setActiveFormMode] = useState(null); // 'upload', 'edit', or null
    const [stagedFile, setStagedFile] = useState(null); // Only used in 'upload' mode
    const [editingDocPath, setEditingDocPath] = useState(null); // Only used in 'edit' mode
    
    // Form Fields
    const [metaName, setMetaName] = useState('');
    const [metaCategory, setMetaCategory] = useState('Other');
    const [metaExpiry, setMetaExpiry] = useState('');
    const [metaVisible, setMetaVisible] = useState(true);

    const fileInputRef = useRef(null);

    const activeChecklist = complianceMode === 'thai' ? THAI_REQS : FOREIGN_REQS;
    const isMet = (req) => documents.some(d => d.category === req);

    const handleDrop = (e) => {
        e.preventDefault(); setIsDragging(false);
        if (activeFormMode) return; // Prevent drop if already editing/uploading
        const files = e.dataTransfer.files;
        if (files && files.length > 0) handleStageNewFile(files[0]);
    };
    
    const handleFileSelect = (e) => {
        const files = e.target.files;
        if (files && files.length > 0) handleStageNewFile(files[0]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleStageNewFile = (file) => {
        setFormError('');
        if (!ALLOWED_TYPES.includes(file.type)) { setFormError('Only PDF, JPG, and PNG are allowed.'); return; }
        if (file.size / (1024 * 1024) > MAX_FILE_SIZE_MB) { setFormError(`File is too large. Max ${MAX_FILE_SIZE_MB}MB.`); return; }
        
        setStagedFile(file);
        setMetaName(file.name.replace(/\.[^/.]+$/, "")); 
        setMetaCategory('Other');
        setMetaExpiry('');
        setMetaVisible(true);
        setActiveFormMode('upload');
    };

    // --- NEW: Open the Edit Form ---
    const openEditForm = (doc) => {
        setFormError('');
        setEditingDocPath(doc.path);
        setMetaName(doc.name || '');
        setMetaCategory(doc.category || 'Other');
        setMetaExpiry(doc.expiryDate || '');
        setMetaVisible(doc.isVisibleToStaff !== false);
        setActiveFormMode('edit');
    };

    const cancelForm = () => {
        setActiveFormMode(null);
        setStagedFile(null);
        setEditingDocPath(null);
        setFormError('');
    };

    const handleSubmitForm = async () => {
        if (!metaName.trim()) { setFormError('Please provide a document name.'); return; }
        setIsProcessing(true);
        try {
            const metadata = {
                customName: metaName.trim(),
                category: metaCategory,
                expiryDate: metaExpiry || null,
                isVisibleToStaff: metaVisible
            };

            if (activeFormMode === 'upload') {
                await onUploadFile(stagedFile, metadata);
            } else if (activeFormMode === 'edit') {
                await onEditDocument(editingDocPath, metadata);
            }
            cancelForm();
        } catch (error) {
            setFormError('Failed to save document details. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    const getDocDate = (doc) => doc.uploadedAt ? dateUtils.fromFirestore(doc.uploadedAt).getTime() : 0;
    
    const checkExpiryStatus = (expiryDateString) => {
        if (!expiryDateString) return null;
        const expiry = new Date(expiryDateString);
        const today = new Date();
        const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
        
        if (daysLeft < 0) return <span className="text-red-400 font-bold ml-2">(EXPIRED)</span>;
        if (daysLeft <= 30) return <span className="text-amber-400 font-bold ml-2">(Expiring in {daysLeft} days)</span>;
        return null;
    };

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-bold text-white border-b border-gray-700 pb-4">Secure Document Vault</h3>
            
            <div className="bg-gray-800/80 p-5 rounded-xl border border-gray-700">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                    <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Compliance Checklist</h4>
                    <div className="flex bg-gray-900 rounded-lg p-1 mt-2 sm:mt-0">
                        <button onClick={() => setComplianceMode('thai')} className={`px-3 py-1 text-xs rounded-md transition-colors ${complianceMode === 'thai' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>Thai National</button>
                        <button onClick={() => setComplianceMode('foreign')} className={`px-3 py-1 text-xs rounded-md transition-colors ${complianceMode === 'foreign' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>Foreigner</button>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {activeChecklist.map(req => (
                        <div key={req} className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium border ${isMet(req) ? 'bg-green-900/30 border-green-500/50 text-green-400' : 'bg-red-900/30 border-red-500/50 text-red-400'}`}>
                            {isMet(req) ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <XCircle className="h-4 w-4 flex-shrink-0" />}
                            <span>{req}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- UPLOAD ZONE OR ACTIVE FORM --- */}
            {!activeFormMode ? (
                <div 
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} 
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }} 
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-600 bg-gray-800/50 hover:border-gray-500 hover:bg-gray-800'}`}
                >
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".pdf,.jpg,.jpeg,.png" className="hidden" />
                    <div className="flex flex-col items-center space-y-3">
                        <div className={`p-4 rounded-full ${isDragging ? 'bg-indigo-500/20' : 'bg-gray-700'}`}><UploadCloud className={`h-8 w-8 ${isDragging ? 'text-indigo-400' : 'text-gray-400'}`} /></div>
                        <div>
                            <p className="text-white font-medium text-lg">Click or drag document here</p>
                            <p className="text-gray-400 text-sm mt-1">PDF, JPG, or PNG (Max {MAX_FILE_SIZE_MB}MB)</p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-gray-800 border border-indigo-500/50 rounded-xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500"></div>
                    <h4 className="text-lg font-bold text-white mb-4 flex items-center">
                        {activeFormMode === 'upload' ? <><UploadCloud className="h-5 w-5 mr-2 text-indigo-400"/> Register New Document</> : <><Edit className="h-5 w-5 mr-2 text-indigo-400"/> Edit Document Details</>}
                    </h4>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Display Name</label>
                            <input type="text" value={metaName} onChange={(e) => setMetaName(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Document Category</label>
                                <select value={metaCategory} onChange={(e) => setMetaCategory(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white outline-none">
                                    {ALL_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Expiration Date (Optional)</label>
                                <input type="date" value={metaExpiry} onChange={(e) => setMetaExpiry(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white outline-none [color-scheme:dark]" />
                            </div>
                        </div>

                        {/* VISIBILITY TOGGLE MOVED HERE */}
                        <div className="pt-2 flex items-center justify-between border-t border-gray-700">
                            <label className="text-sm text-gray-300 cursor-pointer flex items-center">
                                <input type="checkbox" checked={metaVisible} onChange={(e) => setMetaVisible(e.target.checked)} className="rounded border-gray-600 text-indigo-500 mr-2 bg-gray-700" />
                                Staff can view this document
                            </label>
                        </div>
                    </div>

                    {formError && <div className="mt-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-center"><AlertCircle className="h-4 w-4 mr-2"/> {formError}</div>}

                    <div className="mt-6 flex justify-end space-x-3">
                        <button onClick={cancelForm} disabled={isProcessing} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors disabled:opacity-50">Cancel</button>
                        <button onClick={handleSubmitForm} disabled={isProcessing} className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors flex items-center disabled:opacity-50">
                            {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin"/> Saving...</> : (activeFormMode === 'upload' ? 'Save Document to Vault' : 'Update Document')}
                        </button>
                    </div>
                </div>
            )}

            <div className="mt-8">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Files on Record</h4>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {documents.length > 0 ? (
                        documents.sort((a, b) => getDocDate(b) - getDocDate(a)).map((doc, index) => (
                            <div key={index} className="flex items-center justify-between bg-gray-800 border border-gray-700 p-4 rounded-xl group hover:border-gray-500 transition-colors">
                                <div className="flex items-center space-x-4 overflow-hidden">
                                    <div className="bg-gray-700 p-3 rounded-lg flex-shrink-0">
                                        <FileText className="h-6 w-6 text-gray-300" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center space-x-2">
                                            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-white font-bold hover:text-indigo-400 truncate block text-lg" title={doc.name}>{doc.name}</a>
                                            {doc.category && doc.category !== 'Other' && (
                                                <span className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded flex items-center"><Tag className="h-3 w-3 mr-1"/>{doc.category}</span>
                                            )}
                                        </div>
                                        
                                        <div className="flex flex-wrap items-center text-xs text-gray-400 mt-2 gap-y-2 gap-x-4">
                                            <span>Uploaded: {doc.uploadedAt ? dateUtils.formatDisplayDate(dateUtils.fromFirestore(doc.uploadedAt)) : 'Unknown'}</span>
                                            {doc.expiryDate && (
                                                <span className="flex items-center text-gray-300 bg-gray-900/50 px-2 py-0.5 rounded">
                                                    <Calendar className="h-3 w-3 mr-1 text-amber-500"/> Exp: {dateUtils.formatDisplayDate(new Date(doc.expiryDate))}
                                                    {checkExpiryStatus(doc.expiryDate)}
                                                </span>
                                            )}
                                            <span className="flex items-center">
                                                {doc.isVisibleToStaff !== false ? <><Eye className="h-3 w-3 mr-1 text-green-400" /> Visible</> : <><EyeOff className="h-3 w-3 mr-1 text-amber-400" /> Hidden</>}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {/* --- NEW: The Edit Button --- */}
                                    <button onClick={() => openEditForm(doc)} className="p-2 text-gray-400 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-colors" title="Edit details"><Edit className="h-5 w-5"/></button>
                                    <button onClick={() => onDeleteFile(doc)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Delete forever"><Trash2 className="h-5 w-5"/></button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-8 bg-gray-800/50 rounded-xl border border-dashed border-gray-700">
                            <FileText className="h-10 w-10 text-gray-600 mx-auto mb-3" />
                            <p className="text-gray-400">The vault is currently empty.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};