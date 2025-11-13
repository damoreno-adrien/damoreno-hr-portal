/* src/components/Settings/FinancialRulesSettings.jsx */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Check } from 'lucide-react';

export const FinancialRulesSettings = ({ db, config }) => {
    const [localConfig, setLocalConfig] = useState({});
    const [originalConfig, setOriginalConfig] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        if (config) {
            const data = {
                advanceEligibilityPercentage: config.advanceEligibilityPercentage || 0,
                ssoRate: config.ssoRate || 0,
                ssoCap: config.ssoCap || 0,
                overtimeRate: config.overtimeRate || 1.0,
                overtimeThreshold: config.overtimeThreshold || 30,
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
            const dataToSave = {
                advanceEligibilityPercentage: Number(localConfig.advanceEligibilityPercentage),
                ssoRate: Number(localConfig.ssoRate),
                ssoCap: Number(localConfig.ssoCap),
                overtimeRate: Number(localConfig.overtimeRate),
                overtimeThreshold: Number(localConfig.overtimeThreshold),
            };
            await updateDoc(configDocRef, dataToSave);
            
            setOriginalConfig(localConfig); // Update original state
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
        } catch (error) {
            alert('Failed to save settings: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div id="financial-rules" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8">
            <h3 className="text-xl font-semibold text-white">Financial & Payroll Rules</h3>
            <p className="text-gray-400 mt-2">Set percentages and caps for various financial calculations.</p>
            
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label htmlFor="advanceEligibilityPercentage" className="block text-sm font-medium text-gray-300 mb-1">Advance Eligibility (% of salary)</label>
                    <input type="number" id="advanceEligibilityPercentage" value={localConfig.advanceEligibilityPercentage || ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div>
                    <label htmlFor="ssoRate" className="block text-sm font-medium text-gray-300 mb-1">Social Security Rate (%)</label>
                    <input type="number" id="ssoRate" value={localConfig.ssoRate || ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div>
                    <label htmlFor="ssoCap" className="block text-sm font-medium text-gray-300 mb-1">SSO Max Contribution (THB)</label>
                    <input type="number" id="ssoCap" value={localConfig.ssoCap || ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
            </div>

            {/* --- NEW SECTION: Overtime Rules --- */}
            <div className="mt-8 pt-6 border-t border-gray-700">
                <h4 className="text-lg font-medium text-white mb-4">Overtime Rules</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="overtimeRate" className="block text-sm font-medium text-gray-300 mb-1">
                            Standard OT Rate (Multiplier)
                        </label>
                        <input 
                            type="number" 
                            id="overtimeRate" 
                            value={localConfig.overtimeRate || ''} 
                            onChange={handleChange} 
                            step="0.1" 
                            min="1.0"
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" 
                            placeholder="e.g. 1.0 or 1.5"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Default multiplier for approved overtime hours (1.0 = Normal Rate, 1.5 = Time and a half).
                        </p>
                    </div>
                    <div>
                        <label htmlFor="overtimeThreshold" className="block text-sm font-medium text-gray-300 mb-1">
                            Minimum OT Threshold (Minutes)
                        </label>
                        <input 
                            type="number" 
                            id="overtimeThreshold" 
                            value={localConfig.overtimeThreshold || ''} 
                            onChange={handleChange} 
                            min="0"
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" 
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Staff must work at least this many minutes over their schedule to flag as "Potential OT".
                        </p>
                    </div>
                </div>
            </div>

            {/* --- SAVE BUTTON --- */}
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