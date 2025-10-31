/* src/components/Settings/CompanyInfoSettings.jsx */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Check } from 'lucide-react'; // Using lucide-react

export const CompanyInfoSettings = ({ db, companyConfig }) => {
    const [config, setConfig] = useState({ companyName: '', companyAddress: '', companyTaxId: '' });
    const [originalConfig, setOriginalConfig] = useState({});
    
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState('');
    
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    // Load initial config from props
    useEffect(() => {
        if (companyConfig) {
            const data = {
                companyName: companyConfig.companyName || '',
                companyAddress: companyConfig.companyAddress || '',
                companyTaxId: companyConfig.companyTaxId || '',
                companyLogoUrl: companyConfig.companyLogoUrl || '',
            };
            setConfig(data);
            setOriginalConfig(data);
            if (companyConfig.companyLogoUrl) {
                setLogoPreview(companyConfig.companyLogoUrl);
            }
        }
    }, [companyConfig]);

    const handleConfigChange = (e) => {
        setConfig(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    const handleLogoChange = (e) => {
        if (e.target.files[0]) {
            const file = e.target.files[0];
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };

    const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig) || logoFile !== null;

    const handleSave = async () => {
        setIsSaving(true);
        setIsSaved(false);
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
            };

            await updateDoc(configDocRef, configToSave);
            
            // Update original state to new saved state
            setOriginalConfig(configToSave); 
            setLogoFile(null); // Clear the staged file
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);

        } catch (error) {
            alert('Failed to save settings: ' + error.message);
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <div id="company-info" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8">
            <h3 className="text-xl font-semibold text-white">Company Information</h3>
            <p className="text-gray-400 mt-2">These details will be used in official documents like payslips.</p>
            {/* ... (All inputs remain the same, using local 'config' and 'handleConfigChange') ... */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label htmlFor="companyName" className="block text-sm font-medium text-gray-300 mb-1">Company Legal Name</label>
                    <input type="text" id="companyName" value={config.companyName} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div className="md:col-span-2">
                    <label htmlFor="companyAddress" className="block text-sm font-medium text-gray-300 mb-1">Company Address</label>
                    <textarea id="companyAddress" value={config.companyAddress} onChange={handleConfigChange} rows="3" className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"></textarea>
                </div>
                <div>
                    <label htmlFor="companyTaxId" className="block text-sm font-medium text-gray-300 mb-1">Company Tax ID</label>
                    <input type="text" id="companyTaxId" value={config.companyTaxId} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
            </div>
            <div className="mt-6">
                <label className="block text-sm font-medium text-gray-300 mb-1">Company Logo</label>
                <div className="flex items-center space-x-4">
                    {logoPreview && <img src={logoPreview} alt="Logo Preview" className="h-16 w-16 object-contain rounded-md bg-white p-1" />}
                    <input type="file" accept="image/png, image/jpeg" onChange={handleLogoChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-700"/>
                </div>
            </div>

            {/* --- NEW SAVE BUTTON --- */}
            <div className="flex justify-end mt-6 pt-4 border-t border-gray-700">
                <button
                    onClick={handleSave}
                    disabled={isSaving || !hasChanges}
                    className="flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                    {isSaving ? 'Saving...' : (isSaved ? <><Check className="h-5 w-5 mr-2" /> Saved</> : 'Save Changes')}
                </button>
            </div>
        </div>
    );
};