/* src/components/Settings/LeaveEntitlementsSettings.jsx */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Check } from 'lucide-react';

export const LeaveEntitlementsSettings = ({ db, config, selectedBranchId }) => {
    const [localConfig, setLocalConfig] = useState({});
    const [originalConfig, setOriginalConfig] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        if (config) {
            const data = {
                annualLeaveDays: config.annualLeaveDays || 0,
                paidSickDays: config.paidSickDays || 0,
                paidPersonalDays: config.paidPersonalDays || 0,
            };
            setLocalConfig(data);
            setOriginalConfig(data);
        }
    }, [config]);

    const handleChange = (e) => {
        setLocalConfig(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    const hasChanges = JSON.stringify(localConfig) !== JSON.stringify(originalConfig);

    const handleSave = async () => {
        setIsSaving(true);
        setIsSaved(false);
        const configDocRef = doc(db, 'settings', 'company_config');
        try {
            // --- THE STAMP: Save to branchSettings.[branchId] ---
            const prefix = selectedBranchId ? `branchSettings.${selectedBranchId}.` : '';
            
            const dataToSave = {
                [`${prefix}annualLeaveDays`]: Number(localConfig.annualLeaveDays),
                [`${prefix}paidSickDays`]: Number(localConfig.paidSickDays),
                [`${prefix}paidPersonalDays`]: Number(localConfig.paidPersonalDays),
            };

            await updateDoc(configDocRef, dataToSave);
            
            setOriginalConfig(localConfig); 
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
        } catch (error) {
            alert('Failed to save settings: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div id="leave-entitlements" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8 border border-gray-700">
            <h3 className="text-xl font-semibold text-white">Leave Entitlements (Yearly)</h3>
            <p className="text-gray-400 mt-2">Define the number of paid days off allowed per year for staff at this location.</p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-900/50 p-4 rounded-lg">
                <div>
                    <label htmlFor="annualLeaveDays" className="block text-sm font-medium text-gray-300 mb-1">Annual Leave Days</label>
                    <input type="number" id="annualLeaveDays" value={localConfig.annualLeaveDays || ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div>
                    <label htmlFor="paidSickDays" className="block text-sm font-medium text-gray-300 mb-1">Paid Sick Days</label>
                    <input type="number" id="paidSickDays" value={localConfig.paidSickDays || ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div>
                    <label htmlFor="paidPersonalDays" className="block text-sm font-medium text-gray-300 mb-1">Paid Personal Days</label>
                    <input type="number" id="paidPersonalDays" value={localConfig.paidPersonalDays || ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
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