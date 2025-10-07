import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { PlusIcon, TrashIcon } from '../components/Icons';

export default function SettingsPage({ db, companyConfig }) {
    // Default structure for the config object to prevent errors on first load
    const defaultConfig = { 
        departments: [], 
        paidSickDays: 30, 
        paidPersonalDays: 3,
        annualLeaveDays: 6,
        publicHolidays: [],
        publicHolidayCreditCap: 13,
        geofence: { latitude: 0, longitude: 0, radius: 100 } 
    };

    const [config, setConfig] = useState(defaultConfig);
    const [newDepartment, setNewDepartment] = useState('');
    const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [isAddingDept, setIsAddingDept] = useState(false);

    useEffect(() => {
        if (companyConfig) {
            // Merge fetched config with defaults to ensure all fields exist
            setConfig(prev => ({
                ...prev,
                ...companyConfig,
                geofence: { ...prev.geofence, ...companyConfig.geofence },
                publicHolidays: companyConfig.publicHolidays || []
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
            // Ensure all values are correctly typed as numbers before saving
            const configToSave = {
                ...config,
                paidSickDays: Number(config.paidSickDays),
                paidPersonalDays: Number(config.paidPersonalDays),
                annualLeaveDays: Number(config.annualLeaveDays),
                publicHolidayCreditCap: Number(config.publicHolidayCreditCap),
                geofence: {
                    latitude: Number(config.geofence.latitude),
                    longitude: Number(config.geofence.longitude),
                    radius: Number(config.geofence.radius),
                }
            };
            await updateDoc(configDocRef, configToSave);
            alert('Settings saved successfully!');
        } catch (error) {
            alert('Failed to save settings.');
            console.error(error);
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

    const handleAddHoliday = async (e) => {
        e.preventDefault();
        if (!newHoliday.date || !newHoliday.name.trim()) return;
        const holidayToAdd = { date: newHoliday.date, name: newHoliday.name.trim() };
        const configDocRef = doc(db, 'settings', 'company_config');
        try {
            await updateDoc(configDocRef, { publicHolidays: arrayUnion(holidayToAdd) });
            setNewHoliday({ date: '', name: '' });
        } catch (err) {
            alert('Failed to add holiday.');
        }
    };

    const handleDeleteHoliday = async (holidayToDelete) => {
        if (window.confirm(`Are you sure you want to delete "${holidayToDelete.name}"?`)) {
            const configDocRef = doc(db, 'settings', 'company_config');
            try {
                await updateDoc(configDocRef, { publicHolidays: arrayRemove(holidayToDelete) });
            } catch(err) {
                alert('Failed to delete holiday.');
            }
        }
    };

    return (
        <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Advanced Settings</h2>
            
            <div className="space-y-8">
                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white">Leave Entitlements</h3>
                    <p className="text-gray-400 mt-2">Set the number of paid leave days per employee per year according to your contract.</p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label htmlFor="annualLeaveDays" className="block text-sm font-medium text-gray-300 mb-1">Paid Annual Leave Days</label>
                            <input type="number" id="annualLeaveDays" value={config.annualLeaveDays || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                        </div>
                        <div>
                            <label htmlFor="paidSickDays" className="block text-sm font-medium text-gray-300 mb-1">Paid Sick Days</label>
                            <input type="number" id="paidSickDays" value={config.paidSickDays || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                        </div>
                        <div>
                            <label htmlFor="paidPersonalDays" className="block text-sm font-medium text-gray-300 mb-1">Paid Personal Days</label>
                            <input type="number" id="paidPersonalDays" value={config.paidPersonalDays || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white">Public Holidays</h3>
                    <p className="text-gray-400 mt-2">Manage the list of official public holidays for the year and set the credit limit.</p>
                     <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label htmlFor="publicHolidayCreditCap" className="block text-sm font-medium text-gray-300 mb-1">Max Holiday Credits / Year</label>
                            <input type="number" id="publicHolidayCreditCap" value={config.publicHolidayCreditCap || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                        </div>
                    </div>
                    <form onSubmit={handleAddHoliday} className="mt-6 flex flex-col sm:flex-row items-stretch sm:space-x-4 space-y-2 sm:space-y-0">
                        <input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday(p => ({...p, date: e.target.value}))} className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"/>
                        <input type="text" value={newHoliday.name} onChange={(e) => setNewHoliday(p => ({...p, name: e.target.value}))} placeholder="Holiday name (e.g., New Year's Day)" className="flex-grow px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                        <button type="submit" className="flex-shrink-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><PlusIcon className="h-5 w-5 mr-2" />Add Holiday</button>
                    </form>
                    <div className="mt-8 space-y-3 max-h-60 overflow-y-auto">
                        {(config.publicHolidays || []).sort((a,b) => a.date.localeCompare(b.date)).map(holiday => (
                            <div key={holiday.date} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg">
                                <div>
                                    <span className="text-white font-semibold">{holiday.name}</span>
                                    <span className="text-sm text-gray-400 ml-4">{new Date(holiday.date + 'T00:00:00').toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'})}</span>
                                </div>
                                <button onClick={() => handleDeleteHoliday(holiday)} className="text-red-400 hover:text-red-300"><TrashIcon className="h-5 w-5" /></button>
                            </div>
                        ))}
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