/* src/components/Settings/FinancialRulesSettings.jsx */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Check } from 'lucide-react';

import { getAuth } from 'firebase/auth';
import { app } from '../../../firebase.js';
import { logSystemAction } from '../../utils/auditLogger';

import FeedbackModal from '../common/FeedbackModal';

export const FinancialRulesSettings = ({ db, config, selectedBranchId }) => {
    const [localConfig, setLocalConfig] = useState({});
    const [originalConfig, setOriginalConfig] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    const [feedbackModal, setFeedbackModal] = useState(null);
    const auth = getAuth(app);

    useEffect(() => {
        if (config) {
            const bonus = config.attendanceBonus || {};
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
                breakDurationMinutes: config.breakDurationMinutes ?? 60,
                
                // --- NOUVEAU : Réglages du Bonus d'Assiduité ---
                bonusMonth1: bonus.month1 || 0,
                bonusMonth2: bonus.month2 || 0,
                bonusMonth3: bonus.month3 || 0,
                allowedLates: bonus.allowedLates ?? 3,
                maxLateMinutesAllowed: bonus.maxLateMinutesAllowed ?? 30,
                allowedAbsences: bonus.allowedAbsences ?? 0,
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
                [`${prefix}breakDurationMinutes`]: Number(localConfig.breakDurationMinutes),
                
                // Sauvegarde sous forme d'objet structuré pour le calculateur
                [`${prefix}attendanceBonus`]: {
                    month1: Number(localConfig.bonusMonth1),
                    month2: Number(localConfig.bonusMonth2),
                    month3: Number(localConfig.bonusMonth3),
                    allowedLates: Number(localConfig.allowedLates),
                    maxLateMinutesAllowed: Number(localConfig.maxLateMinutesAllowed),
                    allowedAbsences: Number(localConfig.allowedAbsences),
                }
            };
            
            await updateDoc(configDocRef, dataToSave);
            
            const changedKeys = Object.keys(localConfig).filter(key => localConfig[key] !== originalConfig[key]);
            const changesDetails = changedKeys.map(key => `${key} (${originalConfig[key]} -> ${localConfig[key]})`).join(', ');
            
            await logSystemAction(
                db, 
                auth.currentUser, 
                selectedBranchId, 
                'UPDATE_FINANCIAL_RULES', 
                `Updated financial parameters: ${changesDetails}`
            );

            setOriginalConfig(localConfig); 
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
        } catch (error) {
            setFeedbackModal({ type: 'error', title: 'Save Failed', message: 'Failed to save settings: ' + error.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div id="financial-rules" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8 border border-gray-700 relative">
            <FeedbackModal isOpen={!!feedbackModal} type={feedbackModal?.type} title={feedbackModal?.title} message={feedbackModal?.message} onClose={() => setFeedbackModal(null)} />

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

            {/* NOUVELLE SECTION : ATTENDANCE BONUS */}
            <div className="mt-8 pt-6 border-t border-gray-700">
                <h4 className="text-lg font-medium text-white mb-2">Attendance Bonus Policy</h4>
                <p className="text-xs text-gray-400 mb-4">Leave amounts at 0 to disable the bonus widget on the staff dashboard.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-indigo-900/20 p-4 rounded-lg border border-indigo-500/20">
                    <div className="space-y-4">
                        <h5 className="text-sm font-bold text-indigo-400 border-b border-indigo-500/20 pb-1">Reward Tiers (THB)</h5>
                        <div>
                            <label htmlFor="bonusMonth1" className="block text-xs font-bold text-gray-400 uppercase mb-1">Month 1 Streak</label>
                            <input type="number" id="bonusMonth1" value={localConfig.bonusMonth1 ?? ''} onChange={handleChange} min="0" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white" />
                        </div>
                        <div>
                            <label htmlFor="bonusMonth2" className="block text-xs font-bold text-gray-400 uppercase mb-1">Month 2 Streak</label>
                            <input type="number" id="bonusMonth2" value={localConfig.bonusMonth2 ?? ''} onChange={handleChange} min="0" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white" />
                        </div>
                        <div>
                            <label htmlFor="bonusMonth3" className="block text-xs font-bold text-gray-400 uppercase mb-1">Month 3+ Streak</label>
                            <input type="number" id="bonusMonth3" value={localConfig.bonusMonth3 ?? ''} onChange={handleChange} min="0" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white" />
                        </div>
                    </div>

                    <div className="space-y-4 md:col-span-2">
                        <h5 className="text-sm font-bold text-amber-400 border-b border-amber-500/20 pb-1">Disqualification Thresholds</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="allowedLates" className="block text-xs font-bold text-gray-400 uppercase mb-1">Max Lates (Count)</label>
                                <input type="number" id="allowedLates" value={localConfig.allowedLates ?? ''} onChange={handleChange} min="0" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white" />
                            </div>
                            <div>
                                <label htmlFor="maxLateMinutesAllowed" className="block text-xs font-bold text-gray-400 uppercase mb-1">Max Total Late Time (Mins)</label>
                                <input type="number" id="maxLateMinutesAllowed" value={localConfig.maxLateMinutesAllowed ?? ''} onChange={handleChange} min="0" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white" />
                            </div>
                            <div>
                                <label htmlFor="allowedAbsences" className="block text-xs font-bold text-gray-400 uppercase mb-1">Max Unexcused Absences</label>
                                <input type="number" id="allowedAbsences" value={localConfig.allowedAbsences ?? ''} onChange={handleChange} min="0" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white" />
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-2 italic">*If a staff member exceeds any of these limits, their streak resets to 0 and they lose the bonus for the current month.</p>
                    </div>
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
                    <div>
                        <label htmlFor="breakDurationMinutes" className="block text-sm font-medium text-gray-300 mb-1">Default Break (Minutes)</label>
                        <input type="number" id="breakDurationMinutes" value={localConfig.breakDurationMinutes ?? ''} onChange={handleChange} step="5" min="0" className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
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