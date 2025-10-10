import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { PlusIcon, TrashIcon } from '../components/Icons';

export default function SettingsPage({ db, companyConfig }) {
    const defaultConfig = { 
        companyName: '',
        companyAddress: '',
        companyTaxId: '',
        companyLogoUrl: '',
        departments: [], 
        paidSickDays: 30, 
        paidPersonalDays: 3,
        annualLeaveDays: 6,
        publicHolidays: [],
        publicHolidayCreditCap: 13,
        geofence: { latitude: 0, longitude: 0, radius: 100 },
        attendanceBonus: { month1: 400, month2: 800, month3: 1200, allowedAbsences: 0, allowedLates: 1 },
        ssoRate: 5,
        ssoCap: 750
    };

    const [config, setConfig] = useState(defaultConfig);
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState('');
    const [newDepartment, setNewDepartment] = useState('');
    const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (companyConfig) {
            const mergedConfig = {
                ...defaultConfig,
                ...companyConfig,
                geofence: { ...defaultConfig.geofence, ...companyConfig.geofence },
                attendanceBonus: { ...defaultConfig.attendanceBonus, ...companyConfig.attendanceBonus },
                publicHolidays: companyConfig.publicHolidays || []
            };
            setConfig(mergedConfig);
            if (mergedConfig.companyLogoUrl) {
                setLogoPreview(mergedConfig.companyLogoUrl);
            }
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

    const handleLogoChange = (e) => {
        if (e.target.files[0]) {
            const file = e.target.files[0];
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };
    
    const handleSaveSettings = async () => {
        setIsSaving(true);
        const configDocRef = doc(db, 'settings', 'company_config');
        try {
            let logoUrl = config.companyLogoUrl;
            if (logoFile) {
                const storage = getStorage();
                const storageRef = ref(storage, `company_assets/logo`); // Use a consistent name for easier management
                await uploadBytes(storageRef, logoFile);
                logoUrl = await getDownloadURL(storageRef);
            }

            const configToSave = {
                ...config,
                companyLogoUrl: logoUrl,
                paidSickDays: Number(config.paidSickDays),
                paidPersonalDays: Number(config.paidPersonalDays),
                annualLeaveDays: Number(config.annualLeaveDays),
                publicHolidayCreditCap: Number(config.publicHolidayCreditCap),
                geofence: { latitude: Number(config.geofence.latitude), longitude: Number(config.geofence.longitude), radius: Number(config.geofence.radius) },
                attendanceBonus: { month1: Number(config.attendanceBonus.month1), month2: Number(config.attendanceBonus.month2), month3: Number(config.attendanceBonus.month3), allowedAbsences: Number(config.attendanceBonus.allowedAbsences), allowedLates: Number(config.attendanceBonus.allowedLates) },
                ssoRate: Number(config.ssoRate),
                ssoCap: Number(config.ssoCap)
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

    const handleAddDepartment = async (e) => { e.preventDefault(); if (!newDepartment.trim()) return; await updateDoc(doc(db, 'settings', 'company_config'), { departments: arrayUnion(newDepartment.trim()) }); setNewDepartment(''); };
    const handleDeleteDepartment = async (dept) => { if (window.confirm(`Delete "${dept}"?`)) { await updateDoc(doc(db, 'settings', 'company_config'), { departments: arrayRemove(dept) }); } };
    const handleAddHoliday = async (e) => { e.preventDefault(); if (!newHoliday.date || !newHoliday.name.trim()) return; await updateDoc(doc(db, 'settings', 'company_config'), { publicHolidays: arrayUnion({ date: newHoliday.date, name: newHoliday.name.trim() }) }); setNewHoliday({ date: '', name: '' }); };
    const handleDeleteHoliday = async (holiday) => { if (window.confirm(`Delete "${holiday.name}"?`)) { await updateDoc(doc(db, 'settings', 'company_config'), { publicHolidays: arrayRemove(holiday) }); } };

    return (
        <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Advanced Settings</h2>
            <div className="space-y-8">
                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white">Company Information</h3>
                    <p className="text-gray-400 mt-2">These details will be used in official documents like payslips.</p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2"><label htmlFor="companyName" className="block text-sm font-medium text-gray-300 mb-1">Company Legal Name</label><input type="text" id="companyName" value={config.companyName || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                        <div className="md:col-span-2"><label htmlFor="companyAddress" className="block text-sm font-medium text-gray-300 mb-1">Company Address</label><textarea id="companyAddress" value={config.companyAddress || ''} onChange={handleConfigChange} rows="3" className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"></textarea></div>
                        <div><label htmlFor="companyTaxId" className="block text-sm font-medium text-gray-300 mb-1">Company Tax ID</label><input type="text" id="companyTaxId" value={config.companyTaxId || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                    </div>
                    <div className="mt-6"><label className="block text-sm font-medium text-gray-300 mb-1">Company Logo</label><div className="flex items-center space-x-4">{logoPreview && <img src={logoPreview} alt="Logo Preview" className="h-16 w-16 object-contain rounded-md bg-white p-1" />}<input type="file" accept="image/png, image/jpeg" onChange={handleLogoChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-700"/></div></div>
                </div>

                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white">Attendance Bonus</h3>
                    <p className="text-gray-400 mt-2">Define the rules for the gradual monthly attendance bonus.</p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div><label htmlFor="month1" className="block text-sm font-medium text-gray-300 mb-1">Month 1 Bonus (THB)</label><input type="number" id="month1" value={config.attendanceBonus?.month1 || ''} onChange={(e) => handleConfigChange(e, 'attendanceBonus')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                        <div><label htmlFor="month2" className="block text-sm font-medium text-gray-300 mb-1">Month 2 Bonus (THB)</label><input type="number" id="month2" value={config.attendanceBonus?.month2 || ''} onChange={(e) => handleConfigChange(e, 'attendanceBonus')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                        <div><label htmlFor="month3" className="block text-sm font-medium text-gray-300 mb-1">Month 3+ Bonus (THB)</label><input type="number" id="month3" value={config.attendanceBonus?.month3 || ''} onChange={(e) => handleConfigChange(e, 'attendanceBonus')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                    </div>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div><label htmlFor="allowedAbsences" className="block text-sm font-medium text-gray-300 mb-1">Max Absences Allowed</label><input type="number" id="allowedAbsences" value={config.attendanceBonus?.allowedAbsences ?? ''} onChange={(e) => handleConfigChange(e, 'attendanceBonus')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                        <div><label htmlFor="allowedLates" className="block text-sm font-medium text-gray-300 mb-1">Max Late Arrivals Allowed</label><input type="number" id="allowedLates" value={config.attendanceBonus?.allowedLates ?? ''} onChange={(e) => handleConfigChange(e, 'attendanceBonus')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white">Leave Entitlements</h3>
                    <p className="text-gray-400 mt-2">Set the number of paid leave days per employee per year.</p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div><label htmlFor="annualLeaveDays" className="block text-sm font-medium text-gray-300 mb-1">Paid Annual Leave Days</label><input type="number" id="annualLeaveDays" value={config.annualLeaveDays || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                        <div><label htmlFor="paidSickDays" className="block text-sm font-medium text-gray-300 mb-1">Paid Sick Days</label><input type="number" id="paidSickDays" value={config.paidSickDays || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                        <div><label htmlFor="paidPersonalDays" className="block text-sm font-medium text-gray-300 mb-1">Paid Personal Days</label><input type="number" id="paidPersonalDays" value={config.paidPersonalDays || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white">Public Holidays</h3>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div><label htmlFor="publicHolidayCreditCap" className="block text-sm font-medium text-gray-300 mb-1">Max Holiday Credits / Year</label><input type="number" id="publicHolidayCreditCap" value={config.publicHolidayCreditCap || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                    </div>
                    <form onSubmit={handleAddHoliday} className="mt-6 flex flex-col sm:flex-row items-stretch sm:space-x-4 space-y-2 sm:space-y-0">
                        <input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday(p => ({...p, date: e.target.value}))} className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"/>
                        <input type="text" value={newHoliday.name} onChange={(e) => setNewHoliday(p => ({...p, name: e.target.value}))} placeholder="Holiday name" className="flex-grow px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                        <button type="submit" className="flex-shrink-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><PlusIcon className="h-5 w-5 mr-2" />Add Holiday</button>
                    </form>
                    <div className="mt-8 space-y-3 max-h-60 overflow-y-auto">
                        {(config.publicHolidays || []).sort((a,b) => a.date.localeCompare(b.date)).map(holiday => (<div key={holiday.date} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg"><div><span className="text-white font-semibold">{holiday.name}</span><span className="text-sm text-gray-400 ml-4">{new Date(holiday.date + 'T00:00:00').toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'})}</span></div><button onClick={() => handleDeleteHoliday(holiday)} className="text-red-400 hover:text-red-300"><TrashIcon className="h-5 w-5" /></button></div>))}
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white">Geofence Configuration</h3>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div><label htmlFor="latitude" className="block text-sm font-medium text-gray-300 mb-1">Latitude</label><input type="number" step="any" id="latitude" value={config.geofence?.latitude || ''} onChange={(e) => handleConfigChange(e, 'geofence')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                        <div><label htmlFor="longitude" className="block text-sm font-medium text-gray-300 mb-1">Longitude</label><input type="number" step="any" id="longitude" value={config.geofence?.longitude || ''} onChange={(e) => handleConfigChange(e, 'geofence')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                        <div><label htmlFor="radius" className="block text-sm font-medium text-gray-300 mb-1">Radius (meters)</label><input type="number" id="radius" value={config.geofence?.radius || ''} onChange={(e) => handleConfigChange(e, 'geofence')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-white">Manage Departments</h3>
                    <form onSubmit={handleAddDepartment} className="mt-6 flex flex-col sm:flex-row items-stretch sm:space-x-4 space-y-2 sm:space-y-0">
                        <input type="text" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} placeholder="New department name" className="flex-grow px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                        <button type="submit" className="flex-shrink-0 flex items-center justify-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg"><PlusIcon className="h-5 w-5 mr-2" /><span>Add</span></button>
                    </form>
                    <div className="mt-8 space-y-3">
                        {(config.departments || []).map(dept => (<div key={dept} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg"><span className="text-white">{dept}</span><button onClick={() => handleDeleteDepartment(dept)} className="text-red-400 hover:text-red-300"><TrashIcon className="h-5 w-5" /></button></div>))}
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