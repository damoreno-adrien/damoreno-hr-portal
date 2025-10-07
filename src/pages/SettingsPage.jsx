import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { PlusIcon, TrashIcon } from '../components/Icons';

export default function SettingsPage({ db, companyConfig }) {
    const [config, setConfig] = useState({ 
        departments: [], 
        paidSickDays: 30, 
        paidPersonalDays: 3, 
        geofence: { latitude: 0, longitude: 0, radius: 100 } 
    });
    const [newDepartment, setNewDepartment] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isAddingDept, setIsAddingDept] = useState(false);

    useEffect(() => {
        if (companyConfig) {
            // Ensure config has default fallbacks if fields are missing from DB
            setConfig(prev => ({
                ...prev,
                ...companyConfig
            }));
        }
    }, [companyConfig]);

    const handleConfigChange = (e, section) => {
        const { id, value } = e.target;
        if (section) {
            setConfig(prev => ({ ...prev, [section]: { ...prev[section], [id]: value } }));
        } else {
            setConfig(prev => ({ ...prev, [id]: value }));
        }
    };
    
    const handleSaveSettings = async () => {
        setIsSaving(true);
        const configDocRef = doc(db, 'settings', 'company_config');
        try {
            await updateDoc(configDocRef, {
                ...config,
                paidSickDays: Number(config.paidSickDays),
                paidPersonalDays: Number(config.paidPersonalDays),
                geofence: {
                    latitude: Number(config.geofence.latitude),
                    longitude: Number(config.geofence.longitude),
                    radius: Number(config.geofence.radius),
                }
            });
            alert('Settings saved successfully!');
        } catch (error) {
            alert('Failed to save settings.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddDepartment = async (e) => {
        e.preventDefault();
        if (!newDepartment.trim()) return;
        setIsAddingDept(true);
        const configDocRef = doc(db, 'settings', 'company_config');
        try {
            await updateDoc(configDocRef, { departments: arrayUnion(newDepartment.trim()) });
            setNewDepartment('');
        } catch (err) {
            alert("Failed to add department.");
        } finally {
            setIsAddingDept(false);
        }
    };
    
    const handleDeleteDepartment = async (departmentToDelete) => {
        if (window.confirm(`Are you sure you want to delete "${departmentToDelete}"?`)) {
            const configDocRef = doc(db, 'settings', 'company_config');
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
            
            <div className="space-y-8">
                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white">Leave Entitlements</h3>
                    <p className="text-gray-400 mt-2">Set the number of paid leave days per employee per year.</p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="paidSickDays" className="block text-sm font-medium text-gray-300 mb-1">Paid Sick Days / Year</label>
                            <input type="number" id="paidSickDays" value={config.paidSickDays || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                        </div>
                        <div>
                            <label htmlFor="paidPersonalDays" className="block text-sm font-medium text-gray-300 mb-1">Paid Personal Days / Year</label>
                            <input type="number" id="paidPersonalDays" value={config.paidPersonalDays || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white">Geofence Configuration</h3>
                    <p className="text-gray-400 mt-2">Set the GPS coordinates and radius for the time clock.</p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label htmlFor="latitude" className="block text-sm font-medium text-gray-300 mb-1">Latitude</label>
                            <input type="number" step="any" id="latitude" value={config.geofence?.latitude || ''} onChange={(e) => handleConfigChange(e, 'geofence')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                        </div>
                        <div>
                            <label htmlFor="longitude" className="block text-sm font-medium text-gray-300 mb-1">Longitude</label>
                            <input type="number" step="any" id="longitude" value={config.geofence?.longitude || ''} onChange={(e) => handleConfigChange(e, 'geofence')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                        </div>
                        <div>
                            <label htmlFor="radius" className="block text-sm font-medium text-gray-300 mb-1">Radius (meters)</label>
                            <input type="number" id="radius" value={config.geofence?.radius || ''} onChange={(e) => handleConfigChange(e, 'geofence')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white">Manage Departments</h3>
                    <p className="text-gray-400 mt-2">Add or remove departments for your restaurant.</p>

                    <form onSubmit={handleAddDepartment} className="mt-6 flex flex-col sm:flex-row items-stretch sm:space-x-4 space-y-2 sm:space-y-0">
                        <input type="text" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} placeholder="New department name" className="flex-grow px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                        <button type="submit" disabled={isAddingDept} className="flex-shrink-0 flex items-center justify-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg">
                            <PlusIcon className="h-5 w-5 mr-2" />
                            <span>{isAddingDept ? 'Adding...' : 'Add'}</span>
                        </button>
                    </form>

                    <div className="mt-8 space-y-3">
                        {(config.departments || []).map(dept => (
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

            <div className="mt-8 flex justify-end">
                <button onClick={handleSaveSettings} disabled={isSaving} className="px-8 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold disabled:bg-gray-600">
                    {isSaving ? 'Saving...' : 'Save All Settings'}
                </button>
            </div>
        </div>
    );
};