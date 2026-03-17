import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Check, Plus, Trash2 } from 'lucide-react';

export const RoleDescriptionsSettings = ({ db, config }) => {
    // We store descriptions as an array of objects for the UI: [{ title: "Waiter", text: "..." }]
    const [roles, setRoles] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        if (config && config.roleDescriptions) {
            // Convert Firestore object { "Waiter": "text" } to array for easy editing
            const rolesArray = Object.entries(config.roleDescriptions).map(([title, text]) => ({
                title,
                text
            }));
            setRoles(rolesArray);
        }
    }, [config]);

    const handleAddRole = () => {
        setRoles([{ title: '', text: '' }, ...roles]);
    };

    const handleRoleChange = (index, field, value) => {
        const newRoles = [...roles];
        newRoles[index][field] = value;
        setRoles(newRoles);
    };

    const handleRemoveRole = (index) => {
        const newRoles = roles.filter((_, i) => i !== index);
        setRoles(newRoles);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setIsSaved(false);
        const configDocRef = doc(db, 'settings', 'company_config');
        try {
            // Convert array back to object for Firestore: { "Waiter": "text" }
            const descriptionsObject = {};
            roles.forEach(role => {
                if (role.title.trim()) {
                    descriptionsObject[role.title.trim()] = role.text;
                }
            });

            await updateDoc(configDocRef, { roleDescriptions: descriptionsObject });
            
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
        } catch (error) {
            alert('Failed to save settings: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div id="role-descriptions" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h3 className="text-xl font-semibold text-white">Job Role Descriptions</h3>
                    <p className="text-gray-400 mt-1 text-sm">These descriptions are automatically injected into Employment Contracts.</p>
                </div>
                <button onClick={handleAddRole} className="flex items-center bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors">
                    <Plus className="h-5 w-5 mr-2" /> Add Role
                </button>
            </div>

            <div className="space-y-6 mt-6">
                {roles.length === 0 && <p className="text-gray-500 italic">No roles defined yet. Contracts will have a blank space for responsibilities.</p>}
                
                {roles.map((role, index) => (
                    <div key={index} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 flex flex-col gap-3 relative">
                        <button onClick={() => handleRemoveRole(index)} className="absolute top-4 right-4 text-gray-500 hover:text-red-400 transition-colors">
                            <Trash2 className="h-5 w-5" />
                        </button>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Exact Job Title (e.g. Waiter)</label>
                            <input 
                                type="text" 
                                value={role.title} 
                                onChange={(e) => handleRoleChange(index, 'title', e.target.value)}
                                className="w-full md:w-1/2 px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:border-indigo-500 outline-none" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Bilingual Description (Appears on Contract)</label>
                            <textarea 
                                value={role.text} 
                                onChange={(e) => handleRoleChange(index, 'text', e.target.value)}
                                rows="3"
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:border-indigo-500 outline-none" 
                                placeholder="Customer Service: Greet guests...&#10;การบริการลูกค้า: ต้อนรับลูกค้า..."
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex justify-end mt-6 pt-4 border-t border-gray-700">
                <button onClick={handleSave} disabled={isSaving} className="flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-500 disabled:cursor-not-allowed">
                    {isSaving ? 'Saving...' : (isSaved ? <><Check className="h-5 w-5 mr-2" /> Saved</> : 'Save Descriptions')}
                </button>
            </div>
        </div>
    );
};