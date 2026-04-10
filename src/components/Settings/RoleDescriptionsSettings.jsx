/* src/components/Settings/RoleDescriptionsSettings.jsx */

import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Check, Plus, Trash2, ChevronDown, ChevronRight, Save, AlertCircle, Download, Upload } from 'lucide-react';

export const RoleDescriptionsSettings = ({ db, config, selectedBranchId }) => {
    const [roles, setRoles] = useState([]);
    const [expandedIndex, setExpandedIndex] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [error, setError] = useState('');
    
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (config && config.roleDescriptions) {
            const rolesArray = Object.entries(config.roleDescriptions).map(([title, text]) => ({
                title,
                text
            }));
            setRoles(rolesArray);
            setHasUnsavedChanges(false); 
            setError(''); 
        } else {
            setRoles([]);
        }
    }, [config]);

    const handleAddRole = () => {
        setRoles([{ title: '', text: '' }, ...roles]);
        setExpandedIndex(0);
        setHasUnsavedChanges(true); 
        setError(''); 
    };

    const handleRoleChange = (index, field, value) => {
        const newRoles = [...roles];
        newRoles[index][field] = value;
        setRoles(newRoles);
        setHasUnsavedChanges(true);
        setError(''); 
    };

    const handleDeleteRole = (index) => {
        if (window.confirm('Are you sure you want to delete this role description?')) {
            const newRoles = roles.filter((_, i) => i !== index);
            setRoles(newRoles);
            setHasUnsavedChanges(true);
            if (expandedIndex === index) setExpandedIndex(null);
        }
    };

    const handleSave = async () => {
        const invalidRole = roles.find(r => !r.title.trim() || !r.text.trim());
        if (invalidRole) {
            setError('All roles must have a title and a description.');
            setExpandedIndex(roles.indexOf(invalidRole));
            return;
        }

        setIsSaving(true);
        setError('');
        
        try {
            const rolesObject = roles.reduce((acc, curr) => {
                acc[curr.title.trim()] = curr.text.trim();
                return acc;
            }, {});

            // --- THE STAMP: Save to branchSettings.[branchId].roleDescriptions ---
            const fieldPath = selectedBranchId ? `branchSettings.${selectedBranchId}.roleDescriptions` : 'roleDescriptions';

            await updateDoc(doc(db, 'settings', 'company_config'), {
                [fieldPath]: rolesObject
            });

            setIsSaved(true);
            setHasUnsavedChanges(false);
            setTimeout(() => setIsSaved(false), 2000);
        } catch (error) {
            setError('Failed to save roles: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleExport = () => {
        const dataStr = JSON.stringify(roles, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportFileDefaultName = `RoleDescriptions_${selectedBranchId || 'Global'}.json`;
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    };

    const handleImportClick = () => { fileInputRef.current?.click(); };

    const handleFileImport = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedRoles = JSON.parse(e.target.result);
                if (Array.isArray(importedRoles)) {
                    setRoles(importedRoles);
                    setHasUnsavedChanges(true);
                    setExpandedIndex(null);
                } else { setError('Invalid file format. Must be a JSON array.'); }
            } catch (err) { setError('Failed to parse JSON file.'); }
        };
        reader.readAsText(file);
        event.target.value = ''; 
    };

    return (
        <div id="role-descriptions" className="bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700 flex flex-col h-[calc(100vh-12rem)]">
            <div className="flex flex-col md:flex-row justify-between md:items-start gap-4 mb-6 flex-shrink-0">
                <div>
                    <h3 className="text-xl font-semibold text-white">Role Descriptions</h3>
                    <p className="text-gray-400 mt-1 text-sm max-w-2xl">
                        Define job responsibilities for roles at this location. These descriptions are automatically injected into Staff Contracts.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={handleExport} disabled={roles.length === 0} className="flex items-center px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </button>
                    <button onClick={handleImportClick} className="flex items-center px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium rounded-lg transition-colors">
                        <Upload className="w-4 h-4 mr-2" /> Import
                        <input type="file" ref={fileInputRef} onChange={handleFileImport} accept=".json" className="hidden" />
                    </button>
                    <button onClick={handleAddRole} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors shadow-md">
                        <Plus className="h-4 w-4 mr-2" /> Add Role
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg flex items-center text-sm flex-shrink-0">
                    <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" /> {error}
                </div>
            )}

            <div className="flex-grow overflow-y-auto space-y-3 custom-scrollbar pr-2 pb-4">
                {roles.length === 0 ? (
                    <div className="text-center py-12 bg-gray-900/30 rounded-lg border border-dashed border-gray-700">
                        <p className="text-gray-500">No roles defined for this branch.</p>
                    </div>
                ) : (
                    roles.map((role, index) => {
                        const isExpanded = expandedIndex === index;
                        return (
                            <div key={index} className={`bg-gray-900/80 rounded-lg border transition-colors ${isExpanded ? 'border-indigo-500' : 'border-gray-700 hover:border-gray-600'}`}>
                                <div className="flex items-center justify-between p-3 cursor-pointer select-none" onClick={() => setExpandedIndex(isExpanded ? null : index)}>
                                    <div className="flex items-center space-x-3 flex-grow overflow-hidden">
                                        {isExpanded ? <ChevronDown className="w-5 h-5 text-indigo-400 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0" />}
                                        <h4 className={`font-bold truncate ${role.title ? 'text-gray-200' : 'text-gray-500 italic'}`}>
                                            {role.title || 'Untitled Role'}
                                        </h4>
                                    </div>
                                    <div className="flex items-center space-x-2 flex-shrink-0">
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteRole(index); }} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="p-4 border-t border-gray-800 space-y-4 bg-gray-900">
                                        <div>
                                            <label className={`block text-xs font-medium mb-1 ${!role.title.trim() && error ? 'text-red-400' : 'text-gray-400'}`}>Job Title</label>
                                            <input 
                                                type="text" 
                                                value={role.title} 
                                                onChange={(e) => handleRoleChange(index, 'title', e.target.value)}
                                                className={`w-full px-3 py-2 bg-gray-800 border rounded-md text-white outline-none transition-colors ${!role.title.trim() && error ? 'border-red-500 focus:border-red-400' : 'border-gray-600 focus:border-indigo-500'}`} 
                                                placeholder="e.g. Waiter / Service Staff"
                                            />
                                        </div>
                                        <div>
                                            <label className={`block text-xs font-medium mb-1 ${!role.text.trim() && error ? 'text-red-400' : 'text-gray-400'}`}>Bilingual Description</label>
                                            <textarea 
                                                value={role.text} 
                                                onChange={(e) => handleRoleChange(index, 'text', e.target.value)}
                                                rows="5"
                                                className={`w-full px-3 py-2 bg-gray-800 border rounded-md text-white outline-none transition-colors resize-y ${!role.text.trim() && error ? 'border-red-500 focus:border-red-400' : 'border-gray-600 focus:border-indigo-500'}`} 
                                                placeholder="Description in English and Thai..."
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-700 flex-shrink-0">
                <span className="text-sm text-gray-500 italic">
                    {hasUnsavedChanges ? "You have unsaved changes." : "All changes are saved."}
                </span>
                <button
                    onClick={handleSave}
                    disabled={isSaving || !hasUnsavedChanges}
                    className="flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-6 rounded-lg disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-md"
                >
                    {isSaving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : (isSaved ? <Check className="h-5 w-5 mr-2" /> : <Save className="w-5 h-5 mr-2" />)}
                    {isSaving ? 'Saving...' : (isSaved ? 'Saved!' : 'Save Roles')}
                </button>
            </div>
        </div>
    );
};