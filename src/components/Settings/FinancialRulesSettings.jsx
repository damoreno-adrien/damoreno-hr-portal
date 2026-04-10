/* src/components/Settings/FinancialRulesSettings.jsx */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Check } from 'lucide-react';

export const FinancialRulesSettings = ({ db, config, selectedBranchId }) => {
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
                probationMonths: config.probationMonths ?? 3,
                dailyAllowanceTHB: config.dailyAllowanceTHB ?? 50,
                mealDiscountPercent: config.mealDiscountPercent ?? 50,
                staffUniforms: config.staffUniforms ?? 3,
                standardStartTime: config.standardStartTime || '14:00',
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
                [`${prefix}advanceEligibilityPercentage`]: Number(localConfig.advanceEligibilityPercentage),
                [`${prefix}ssoRate`]: Number(localConfig.ssoRate),
                [`${prefix}ssoCap`]: Number(localConfig.ssoCap),
                [`${prefix}overtimeRate`]: Number(localConfig.overtimeRate),
                [`${prefix}overtimeThreshold`]: Number(localConfig.overtimeThreshold),
                [`${prefix}probationMonths`]: Number(localConfig.probationMonths),
                [`${prefix}dailyAllowanceTHB`]: Number(localConfig.dailyAllowanceTHB),
                [`${prefix}mealDiscountPercent`]: Number(localConfig.mealDiscountPercent),
                [`${prefix}staffUniforms`]: Number(localConfig.staffUniforms),
                [`${prefix}standardStartTime`]: localConfig.standardStartTime, 
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
        <div id="financial-rules" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8 border border-gray-700">
            <h3 className="text-xl font-semibold text-white">Financial & Payroll Rules</h3>
            <p className="text-gray-400 mt-2">Set percentages and caps for various financial calculations for this location.</p>
            
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-900/50 p-4 rounded-lg">
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

            <div className="mt-8 pt-6 border-t border-gray-700">
                <h4 className="text-lg font-medium text-white mb-4">Overtime Rules</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-900/50 p-4 rounded-lg">
                    <div>
                        <label htmlFor="overtimeRate" className="block text-sm font-medium text-gray-300 mb-1">
                            Standard OT Rate (Multiplier)
                        </label>
                        <input type="number" id="overtimeRate" value={localConfig.overtimeRate || ''} onChange={handleChange} step="0.1" min="1.0" className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                    <div>
                        <label htmlFor="overtimeThreshold" className="block text-sm font-medium text-gray-300 mb-1">
                            Minimum OT Threshold (Minutes)
                        </label>
                        <input type="number" id="overtimeThreshold" value={localConfig.overtimeThreshold || ''} onChange={handleChange} min="0" className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-700">
                <h4 className="text-lg font-medium text-white mb-2">Operational & Contract Rules</h4>
                <p className="text-xs text-gray-400 mb-4">These variables are automatically injected when generating Staff Employment Contracts.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-900/50 p-4 rounded-lg">
                    <div>
                        <label htmlFor="probationMonths" className="block text-sm font-medium text-gray-300 mb-1">Probation Period (Months)</label>
                        <input type="number" id="probationMonths" value={localConfig.probationMonths ?? ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                    <div>
                        <label htmlFor="dailyAllowanceTHB" className="block text-sm font-medium text-gray-300 mb-1">Daily Allowance (THB)</label>
                        <input type="number" id="dailyAllowanceTHB" value={localConfig.dailyAllowanceTHB ?? ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                    <div>
                        <label htmlFor="mealDiscountPercent" className="block text-sm font-medium text-gray-300 mb-1">Staff Meal Discount (%)</label>
                        <input type="number" id="mealDiscountPercent" value={localConfig.mealDiscountPercent ?? ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                    <div>
                        <label htmlFor="staffUniforms" className="block text-sm font-medium text-gray-300 mb-1">Provided Uniforms (Count)</label>
                        <input type="number" id="staffUniforms" value={localConfig.staffUniforms ?? ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                    <div>
                        <label htmlFor="standardStartTime" className="block text-sm font-medium text-gray-300 mb-1">Standard Start Time</label>
                        <input type="time" id="standardStartTime" value={localConfig.standardStartTime || ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white [color-scheme:dark]" />
                    </div>
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