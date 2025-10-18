import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Import the new setting components
import { CompanyInfoSettings } from '../components/Settings/CompanyInfoSettings';
import { AttendanceBonusSettings } from '../components/Settings/AttendanceBonusSettings';
import { FinancialRulesSettings } from '../components/Settings/FinancialRulesSettings';
import { LeaveEntitlementsSettings } from '../components/Settings/LeaveEntitlementsSettings';
import { PublicHolidaysSettings } from '../components/Settings/PublicHolidaysSettings';
import { GeofenceSettings } from '../components/Settings/GeofenceSettings';
import { DepartmentManager } from '../components/Settings/DepartmentManager';


export default function SettingsPage({ db, companyConfig }) {
    // Default config remains the same
    const defaultConfig = { 
        companyName: '', companyAddress: '', companyTaxId: '', companyLogoUrl: '',
        departments: [], paidSickDays: 30, paidPersonalDays: 3, annualLeaveDays: 6,
        publicHolidays: [], publicHolidayCreditCap: 13,
        geofence: { latitude: 0, longitude: 0, radius: 100 },
        attendanceBonus: { month1: 400, month2: 800, month3: 1200, allowedAbsences: 0, allowedLates: 1 },
        ssoRate: 5, ssoCap: 750, advanceEligibilityPercentage: 50,
    };

    // State remains mostly the same, but form-specific state is moved to components
    const [config, setConfig] = useState(defaultConfig);
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // useEffect for loading initial config remains the same
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

    // Handlers remain mostly the same, but form-specific state changes are handled via props
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
            setLogoPreview(URL.createObjectURL(file)); // Show preview immediately
        }
    };
    
    // handleSaveSettings remains the same
    const handleSaveSettings = async () => {
        setIsSaving(true);
        const configDocRef = doc(db, 'settings', 'company_config');
        try {
            let logoUrl = config.companyLogoUrl;
            if (logoFile) {
                const storage = getStorage();
                const storageRef = ref(storage, `company_assets/logo`);
                await uploadBytes(storageRef, logoFile);
                logoUrl = await getDownloadURL(storageRef);
            }

            const configToSave = {
                ...config,
                companyLogoUrl: logoUrl,
                // Ensure numbers are saved as numbers
                paidSickDays: Number(config.paidSickDays),
                paidPersonalDays: Number(config.paidPersonalDays),
                annualLeaveDays: Number(config.annualLeaveDays),
                publicHolidayCreditCap: Number(config.publicHolidayCreditCap),
                geofence: { 
                    latitude: Number(config.geofence.latitude), 
                    longitude: Number(config.geofence.longitude), 
                    radius: Number(config.geofence.radius) 
                },
                attendanceBonus: { 
                    month1: Number(config.attendanceBonus.month1), 
                    month2: Number(config.attendanceBonus.month2), 
                    month3: Number(config.attendanceBonus.month3), 
                    allowedAbsences: Number(config.attendanceBonus.allowedAbsences), 
                    allowedLates: Number(config.attendanceBonus.allowedLates) 
                },
                ssoRate: Number(config.ssoRate),
                ssoCap: Number(config.ssoCap),
                advanceEligibilityPercentage: Number(config.advanceEligibilityPercentage),
            };
            // Ensure publicHolidays is an array before saving
            configToSave.publicHolidays = configToSave.publicHolidays || []; 
            configToSave.departments = configToSave.departments || []; 

            await updateDoc(configDocRef, configToSave);
            alert('Settings saved successfully!');
        } catch (error) {
            alert('Failed to save settings: ' + error.message);
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    // --- Handlers for array updates (Departments, Holidays) ---
    // These now live in the main page and are passed down
    const handleAddDepartment = async (deptName) => { 
        await updateDoc(doc(db, 'settings', 'company_config'), { departments: arrayUnion(deptName) }); 
    };
    const handleDeleteDepartment = async (dept) => { 
        if (window.confirm(`Delete department "${dept}"?`)) { 
            await updateDoc(doc(db, 'settings', 'company_config'), { departments: arrayRemove(dept) }); 
        } 
    };
    const handleAddHoliday = async (holiday) => { 
        await updateDoc(doc(db, 'settings', 'company_config'), { publicHolidays: arrayUnion(holiday) }); 
    };
    const handleDeleteHoliday = async (holiday) => { 
        if (window.confirm(`Delete holiday "${holiday.name}" (${holiday.date})?`)) { 
            await updateDoc(doc(db, 'settings', 'company_config'), { publicHolidays: arrayRemove(holiday) }); 
        } 
    };

    return (
        <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Advanced Settings</h2>
            
            {/* Render the new components, passing down props */}
            <div className="space-y-8">
                <CompanyInfoSettings 
                    config={config} 
                    handleConfigChange={handleConfigChange} 
                    logoPreview={logoPreview} 
                    handleLogoChange={handleLogoChange} 
                />
                <AttendanceBonusSettings 
                    config={config} 
                    handleConfigChange={handleConfigChange} 
                />
                <FinancialRulesSettings 
                    config={config} 
                    handleConfigChange={handleConfigChange} 
                />
                <LeaveEntitlementsSettings 
                    config={config} 
                    handleConfigChange={handleConfigChange} 
                />
                <PublicHolidaysSettings 
                    config={config} 
                    handleConfigChange={handleConfigChange}
                    onAddHoliday={handleAddHoliday}
                    onDeleteHoliday={handleDeleteHoliday}
                />
                <GeofenceSettings 
                    config={config} 
                    handleConfigChange={handleConfigChange} 
                />
                <DepartmentManager 
                    departments={config.departments} 
                    onAddDepartment={handleAddDepartment}
                    onDeleteDepartment={handleDeleteDepartment}
                />
            </div>

            {/* Save button remains the same */}
            <div className="mt-8 flex justify-end">
                <button onClick={handleSaveSettings} disabled={isSaving} className="px-8 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold disabled:bg-gray-600">
                    {isSaving ? 'Saving...' : 'Save All Settings'}
                </button>
            </div>
        </div>
    );
};