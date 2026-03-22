import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Check, Plus, Trash2, ChevronDown, ChevronRight, Save, AlertCircle, Download, Upload } from 'lucide-react';

export const RoleDescriptionsSettings = ({ db, config }) => {
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

    const handleRemoveRole = (index, e) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this template?")) {
            const newRoles = roles.filter((_, i) => i !== index);
            setRoles(newRoles);
            if (expandedIndex === index) setExpandedIndex(null);
            setHasUnsavedChanges(true); 
            setError(''); 
        }
    };

    const toggleExpand = (index) => {
        setExpandedIndex(expandedIndex === index ? null : index);
    };

    const handleExportCSV = () => {
        let csvContent = "Template Name,Bilingual Description\n";
        
        roles.forEach(role => {
            const safeTitle = `"${(role.title || '').replace(/"/g, '""')}"`;
            const safeText = `"${(role.text || '').replace(/"/g, '""')}"`;
            csvContent += `${safeTitle},${safeText}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "Da_Moreno_Job_Templates.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // --- NEW: Strict Warning Prompt ---
        const confirmMessage = "WARNING: Importing a new CSV will completely replace your current list of templates.\n\nAny templates currently on your screen that are NOT in the CSV file will be removed.\n\nAre you sure you want to proceed?";
        if (!window.confirm(confirmMessage)) {
            event.target.value = null; // Reset the input so they can try again later
            return; 
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            try {
                const result = [];
                let row = [];
                let inQuotes = false;
                let currentVal = '';
                
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    if (inQuotes) {
                        if (char === '"') {
                            if (i + 1 < text.length && text[i + 1] === '"') {
                                currentVal += '"'; i++; 
                            } else {
                                inQuotes = false;
                            }
                        } else {
                            currentVal += char;
                        }
                    } else {
                        if (char === '"') {
                            inQuotes = true;
                        } else if (char === ',') {
                            row.push(currentVal); currentVal = '';
                        } else if (char === '\n' || char === '\r') {
                            row.push(currentVal);
                            result.push(row);
                            row = []; currentVal = '';
                            if (char === '\r' && text[i+1] === '\n') i++; 
                        } else {
                            currentVal += char;
                        }
                    }
                }
                if (currentVal || row.length > 0) {
                    row.push(currentVal); result.push(row);
                }

                const importedRoles = [];
                for (let i = 1; i < result.length; i++) {
                    if (result[i].length >= 2) {
                        const title = result[i][0].trim();
                        const text = result[i][1].trim();
                        if (title || text) {
                            importedRoles.push({ title, text });
                        }
                    }
                }

                setRoles(importedRoles);
                setHasUnsavedChanges(true);
                setError('');
                alert(`Successfully imported ${importedRoles.length} templates. Don't forget to click Save Changes to make this permanent!`);
            } catch (err) {
                setError("Failed to parse CSV file. Please ensure it follows the standard format.");
            }
        };
        reader.readAsText(file);
        
        event.target.value = null; 
    };

    const handleSave = async () => {
        const invalidIndex = roles.findIndex(role => !role.title.trim() || !role.text.trim());
        if (invalidIndex !== -1) {
            setError('All templates must have both a Template Name and a Description. Please complete or delete empty templates.');
            setExpandedIndex(invalidIndex); 
            return;
        }

        setError(''); 
        setIsSaving(true);
        setIsSaved(false);
        const configDocRef = doc(db, 'settings', 'company_config');
        try {
            const descriptionsObject = {};
            roles.forEach(role => {
                descriptionsObject[role.title.trim()] = role.text.trim();
            });

            await updateDoc(configDocRef, { roleDescriptions: descriptionsObject });
            
            setIsSaved(true);
            setHasUnsavedChanges(false); 
            setTimeout(() => setIsSaved(false), 2000);
        } catch (error) {
            setError('Failed to save settings: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div id="role-descriptions" className={`bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8 border transition-colors duration-300 ${hasUnsavedChanges && !error ? 'border-amber-500/50' : (error ? 'border-red-500/50' : 'border-gray-700')}`}>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-gray-700 pb-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-semibold text-white">Job Role Templates</h3>
                        {hasUnsavedChanges && !error && (
                            <span className="flex items-center text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full animate-pulse border border-amber-500/50">
                                <AlertCircle className="h-3 w-3 mr-1" /> Unsaved Changes
                            </span>
                        )}
                    </div>
                    <p className="text-gray-400 mt-1 text-sm">Create responsibility templates to inject into HR documents.</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    
                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                    
                    <button onClick={() => fileInputRef.current.click()} className="flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-2 rounded-lg transition-colors text-sm font-medium" title="Import from CSV">
                        <Upload className="h-4 w-4" />
                    </button>
                    
                    <button onClick={handleExportCSV} className="flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-2 rounded-lg transition-colors text-sm font-medium" title="Export to CSV">
                        <Download className="h-4 w-4" />
                    </button>

                    <button onClick={handleAddRole} className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium">
                        <Plus className="h-4 w-4 mr-1" /> Add
                    </button>
                    
                    <button onClick={handleSave} disabled={isSaving || (!hasUnsavedChanges && !isSaved && !error)} className={`flex items-center justify-center px-4 py-2 rounded-lg transition-all text-sm font-medium disabled:opacity-50 ${error ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_10px_rgba(220,38,38,0.5)]' : (hasUnsavedChanges ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-[0_0_10px_rgba(217,119,6,0.5)]' : 'bg-green-600 hover:bg-green-500 text-white')}`}>
                        {isSaving ? <><Save className="h-4 w-4 mr-2 animate-pulse" /> Saving...</> : (isSaved ? <><Check className="h-4 w-4 mr-2" /> Saved</> : <><Save className="h-4 w-4 mr-2" /> Save</>)}
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded-lg flex items-start text-red-400 text-sm animate-fadeIn">
                    <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0 mt-0.5" />
                    <p>{error}</p>
                </div>
            )}

            <div className="space-y-3">
                {roles.length === 0 && <p className="text-gray-500 italic text-center py-6 bg-gray-900/30 rounded-lg border border-dashed border-gray-700">No templates defined yet. Contracts will have a blank space for responsibilities.</p>}
                
                {roles.map((role, index) => {
                    const isExpanded = expandedIndex === index;
                    const isInvalid = error && (!role.title.trim() || !role.text.trim());
                    
                    return (
                        <div key={index} className={`bg-gray-900/50 rounded-lg border transition-all duration-200 ${isExpanded ? 'border-indigo-500' : (isInvalid ? 'border-red-500/70' : 'border-gray-700 hover:border-gray-500')}`}>
                            
                            <div onClick={() => toggleExpand(index)} className="flex justify-between items-center p-4 cursor-pointer group">
                                <div className="flex items-center gap-3">
                                    {isExpanded ? <ChevronDown className={`h-5 w-5 ${isInvalid ? 'text-red-400' : 'text-indigo-400'}`} /> : <ChevronRight className={`h-5 w-5 ${isInvalid ? 'text-red-400' : 'text-gray-500 group-hover:text-gray-300'}`} />}
                                    <h4 className={`font-medium ${role.title ? (isInvalid ? 'text-red-400' : 'text-white') : 'text-gray-500 italic'}`}>
                                        {role.title || "Untitled Template"}
                                    </h4>
                                    {isInvalid && !isExpanded && <span className="text-xs text-red-400 bg-red-900/40 px-2 py-0.5 rounded border border-red-500/30 ml-2">Missing Data</span>}
                                </div>
                                <button onClick={(e) => handleRemoveRole(index, e)} className="text-gray-500 hover:text-red-400 p-1 rounded transition-colors" title="Delete Template">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>

                            {isExpanded && (
                                <div className="p-4 pt-0 border-t border-gray-800 mt-2 space-y-4 animate-fadeIn">
                                    <div className="pt-3">
                                        <label className={`block text-xs font-medium mb-1 ${!role.title.trim() && error ? 'text-red-400' : 'text-gray-400'}`}>
                                            Template Name (e.g. Standard Service Staff, Kitchen Staff)
                                        </label>
                                        <input 
                                            type="text" 
                                            value={role.title} 
                                            onChange={(e) => handleRoleChange(index, 'title', e.target.value)}
                                            className={`w-full md:w-1/2 px-3 py-2 bg-gray-800 border rounded-md text-white outline-none transition-colors ${!role.title.trim() && error ? 'border-red-500 focus:border-red-400' : 'border-gray-600 focus:border-indigo-500'}`} 
                                            placeholder="Enter a short, descriptive name..."
                                        />
                                    </div>
                                    <div>
                                        <label className={`block text-xs font-medium mb-1 ${!role.text.trim() && error ? 'text-red-400' : 'text-gray-400'}`}>
                                            Bilingual Description (Appears on Contract)
                                        </label>
                                        <textarea 
                                            value={role.text} 
                                            onChange={(e) => handleRoleChange(index, 'text', e.target.value)}
                                            rows="5"
                                            className={`w-full px-3 py-2 bg-gray-800 border rounded-md text-white outline-none transition-colors resize-y ${!role.text.trim() && error ? 'border-red-500 focus:border-red-400' : 'border-gray-600 focus:border-indigo-500'}`} 
                                            placeholder="Customer Service: Greet guests...&#10;การบริการลูกค้า: ต้อนรับลูกค้า..."
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};