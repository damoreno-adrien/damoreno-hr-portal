/* src/components/Settings/CompanyInfoSettings.jsx */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Check, Plus, Trash2 } from 'lucide-react';

// --- NOUVEAUX IMPORTS POUR L'AUDIT LOG ---
import { getAuth } from 'firebase/auth';
import { app } from '../../../firebase.js';
import { logSystemAction } from '../../utils/auditLogger';

export const CompanyInfoSettings = ({ db, config, selectedBranchId }) => {
    const [localConfig, setLocalConfig] = useState({ 
        companyName: '', 
        tradingName: '',
        companyAddress: '', 
        companyTaxId: '',
        directors: [] 
    });
    const [originalConfig, setOriginalConfig] = useState({});
    
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState('');
    
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    // Initialisation de l'authentification pour le logger
    const auth = getAuth(app);

    useEffect(() => {
        if (config) {
            const data = {
                companyName: config.companyName || '',
                tradingName: config.tradingName || '',
                companyAddress: config.companyAddress || '',
                companyTaxId: config.companyTaxId || '',
                companyLogoUrl: config.companyLogoUrl || '',
                directors: config.directors || [{ NAME: "John Doe (Change it)" }]
            };
            setLocalConfig(data);
            setOriginalConfig(data);
            setLogoPreview(data.companyLogoUrl);
        }
    }, [config]);

    const handleChange = (e) => {
        setLocalConfig(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleDirectorChange = (index, value) => {
        const newDirectors = [...localConfig.directors];
        newDirectors[index] = { NAME: value };
        setLocalConfig(prev => ({ ...prev, directors: newDirectors }));
    };

    const addDirector = () => {
        setLocalConfig(prev => ({ ...prev, directors: [...prev.directors, { NAME: '' }] }));
    };

    const removeDirector = (index) => {
        const newDirectors = localConfig.directors.filter((_, i) => i !== index);
        setLocalConfig(prev => ({ ...prev, directors: newDirectors }));
    };

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };

    const hasChanges = JSON.stringify(localConfig) !== JSON.stringify(originalConfig) || logoFile !== null;

    const handleSave = async () => {
        setIsSaving(true);
        setIsSaved(false);
        const configDocRef = doc(db, 'settings', 'company_config');
        let newLogoUrl = localConfig.companyLogoUrl;

        try {
            if (logoFile) {
                const storage = getStorage();
                const fileExtension = logoFile.name.split('.').pop();
                const safeBranchName = selectedBranchId ? selectedBranchId : 'global';
                const storageRef = ref(storage, `company_assets/logo_${safeBranchName}.${fileExtension}`);
                await uploadBytes(storageRef, logoFile);
                newLogoUrl = await getDownloadURL(storageRef);
            }

            const prefix = selectedBranchId ? `branchSettings.${selectedBranchId}.` : '';

            const dataToSave = {
                [`${prefix}companyName`]: localConfig.companyName,
                [`${prefix}tradingName`]: localConfig.tradingName,
                [`${prefix}companyAddress`]: localConfig.companyAddress,
                [`${prefix}companyTaxId`]: localConfig.companyTaxId,
                [`${prefix}directors`]: localConfig.directors
            };

            if (newLogoUrl !== originalConfig.companyLogoUrl) {
                dataToSave[`${prefix}companyLogoUrl`] = newLogoUrl;
            }

            await updateDoc(configDocRef, dataToSave);

            // --- NOUVEAU : LE JOURNAL D'AUDIT INTELLIGENT ---
            let changesDetails = [];
            if (localConfig.companyName !== originalConfig.companyName) changesDetails.push(`Company Name`);
            if (localConfig.tradingName !== originalConfig.tradingName) changesDetails.push(`Trading Name`);
            if (localConfig.companyAddress !== originalConfig.companyAddress) changesDetails.push(`Address`);
            if (localConfig.companyTaxId !== originalConfig.companyTaxId) changesDetails.push(`Tax ID`);
            if (JSON.stringify(localConfig.directors) !== JSON.stringify(originalConfig.directors)) changesDetails.push(`Directors List`);
            if (newLogoUrl !== originalConfig.companyLogoUrl) changesDetails.push(`Company Logo`);

            await logSystemAction(
                db, 
                auth.currentUser, 
                selectedBranchId, 
                'UPDATE_COMPANY_INFO', 
                `Updated: ${changesDetails.join(', ')}.`
            );
            // ------------------------------------------------

            setOriginalConfig({ ...localConfig, companyLogoUrl: newLogoUrl });
            setLogoFile(null);
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
        } catch (error) {
            alert('Failed to save settings: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div id="company-info" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8 border border-gray-700">
            <h3 className="text-xl font-semibold text-white">Company Identity & Legal</h3>
            <p className="text-gray-400 mt-2">These details appear on official documents and employment contracts for this specific branch/entity.</p>
            
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-900/50 p-4 rounded-lg">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Legal Company Name (Co., Ltd.)</label>
                    <input type="text" name="companyName" value={localConfig.companyName} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Trading / Branch Name</label>
                    <input type="text" name="tradingName" value={localConfig.tradingName} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-1">HQ / Branch Address</label>
                    <input type="text" name="companyAddress" value={localConfig.companyAddress} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Tax ID</label>
                    <input type="text" name="companyTaxId" value={localConfig.companyTaxId} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-700">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-lg font-medium text-white">Legal Directors</h4>
                    <button onClick={addDirector} className="flex items-center text-sm bg-gray-700 hover:bg-gray-600 text-white py-1 px-3 rounded-lg transition-colors">
                        <Plus className="h-4 w-4 mr-1" /> Add Director
                    </button>
                </div>
                <div className="space-y-3 bg-gray-900/50 p-4 rounded-lg">
                    {localConfig.directors.map((director, index) => (
                        <div key={index} className="flex items-center gap-3">
                            <input type="text" value={director.NAME} onChange={(e) => handleDirectorChange(index, e.target.value)} placeholder="Director Full Name" className="flex-grow px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                            <button onClick={() => removeDirector(index)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Remove Director">
                                <Trash2 className="h-5 w-5" />
                            </button>
                        </div>
                    ))}
                    {localConfig.directors.length === 0 && <p className="text-sm text-gray-500 italic">No directors added. Contracts will not have signature lines.</p>}
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-700">
                <label className="block text-sm font-medium text-gray-300 mb-1">Branch Logo</label>
                <div className="flex items-center space-x-4">
                    {logoPreview && <img src={logoPreview} alt="Logo Preview" className="h-16 w-16 object-contain rounded-md bg-white p-1" />}
                    <input type="file" accept="image/png, image/jpeg" onChange={handleLogoChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-700"/>
                </div>
            </div>

            <div className="flex justify-end mt-6 pt-4 border-t border-gray-700">
                <button
                    onClick={handleSave}
                    disabled={isSaving || !hasChanges}
                    className="flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                    {isSaving ? 'Saving...' : (isSaved ? <><Check className="h-5 w-5 mr-2" /> Saved</> : 'Save Changes')}
                </button>
            </div>
        </div>
    );
};