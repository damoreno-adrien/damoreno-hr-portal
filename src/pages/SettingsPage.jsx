import React, { useState } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { PlusIcon, TrashIcon } from '../components/Icons';

export default function SettingsPage({ db, departments }) {
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
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Settings</h2>
            <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                <h3 className="text-xl font-semibold text-white">Manage Departments</h3>
                <p className="text-gray-400 mt-2">Add or remove departments for your restaurant.</p>

                <form onSubmit={handleAddDepartment} className="mt-6 flex flex-col sm:flex-row items-stretch sm:space-x-4 space-y-2 sm:space-y-0">
                    <input type="text" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} placeholder="New department name" className="flex-grow px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    <button type="submit" disabled={isSaving} className="flex-shrink-0 flex items-center justify-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg">
                        <PlusIcon className="h-5 w-5 mr-2" />
                        <span>Add</span>
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