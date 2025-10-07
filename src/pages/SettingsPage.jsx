import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove, getDoc } from 'firebase/firestore';
import { PlusIcon, TrashIcon } from '../components/Icons';

export default function SettingsPage({ db, companyConfig }) {
    const [config, setConfig] = useState({ departments: [], paidSickDays: 30, paidPersonalDays: 3, geofence: { latitude: 0, longitude: 0, radius: 100 } });
    const [newDepartment, setNewDepartment] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (companyConfig) {
            setConfig(companyConfig);
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

    const handleAddDepartment = async (e) => { /* ... unchanged ... */ };
    const handleDeleteDepartment = async (departmentToDelete) => { /* ... unchanged ... */ };

    return (
        <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Settings</h2>
            
            <div className="space-y-8">
                {/* --- LEAVE ENTITLEMENTS SECTION --- */}
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

                {/* --- GEOFENCE CONFIGURATION SECTION --- */}
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

                 {/* --- DEPARTMENTS SECTION --- */}
                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white">Manage Departments</h3>
                    {/* ... (form and list for departments remain the same) ... */}
                </div>
            </div>

            {/* --- SAVE BUTTON --- */}
            <div className="mt-8 flex justify-end">
                <button onClick={handleSaveSettings} disabled={isSaving} className="px-8 py-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:bg-gray-600">
                    {isSaving ? 'Saving...' : 'Save All Settings'}
                </button>
            </div>
        </div>
    );
};