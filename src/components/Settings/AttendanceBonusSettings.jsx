/* src/components/Settings/AttendanceBonusSettings.jsx */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Check, ShieldAlert, Award } from 'lucide-react';

export const AttendanceBonusSettings = ({ db, config, selectedBranchId }) => {
    const [localData, setLocalData] = useState({
        month1: 0, month2: 0, month3: 0, allowedAbsences: 0, allowedLates: 3, maxLateMinutesAllowed: 30, gracePeriodMinutes: 5,
        tier1Name: "Verbal Warning", tier1Strikes: 1, tier2Name: "Written Warning", tier2Strikes: 2, tier2Window: 1, tier3Name: "1-Day Suspension", tier3Strikes: 3, tier3Window: 3
    });
    const [originalData, setOriginalData] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        if (config) {
            // --- FIX : Charger les données spécifiques à la branche si elles existent ---
            const branchOverrides = (selectedBranchId && selectedBranchId !== 'global' && config.branchSettings?.[selectedBranchId]) 
                ? config.branchSettings[selectedBranchId] 
                : {};

            const bonus = branchOverrides.attendanceBonus || config.attendanceBonus || {};
            const disc = branchOverrides.disciplinaryRules || config.disciplinaryRules || {};
            
            const data = {
                month1: bonus.month1 ?? 0, month2: bonus.month2 ?? 0, month3: bonus.month3 ?? 0,
                allowedAbsences: bonus.allowedAbsences ?? 0, allowedLates: bonus.allowedLates ?? 3, maxLateMinutesAllowed: bonus.maxLateMinutesAllowed ?? 30, gracePeriodMinutes: bonus.gracePeriodMinutes ?? 5,
                tier1Name: disc.tier1?.name || "Verbal Warning", tier1Strikes: disc.tier1?.strikes ?? 1,
                tier2Name: disc.tier2?.name || "Written Warning", tier2Strikes: disc.tier2?.strikes ?? 2, tier2Window: disc.tier2?.windowMonths ?? 1,
                tier3Name: disc.tier3?.name || "1-Day Suspension", tier3Strikes: disc.tier3?.strikes ?? 3, tier3Window: disc.tier3?.windowMonths ?? 3,
            };
            setLocalData(data); 
            setOriginalData(data);
        }
    }, [config, selectedBranchId]); // <-- IMPORTANT : Se met à jour quand on change de branche dans le menu

    const handleChange = (e) => {
        const { id, value } = e.target;
        const parsedValue = id.includes('Name') ? value : (Number(value) || 0);
        setLocalData(prev => ({ ...prev, [id]: parsedValue }));
    };

    const hasChanges = JSON.stringify(localData) !== JSON.stringify(originalData);

    const handleSave = async () => {
        setIsSaving(true); 
        setIsSaved(false);
        try {
            // --- THE STAMP: Sauvegarde isolée (empêche le bug du dossier 'global') ---
            const prefix = (selectedBranchId && selectedBranchId !== 'global') ? `branchSettings.${selectedBranchId}.` : '';

            const dataToSave = {
                [`${prefix}attendanceBonus`]: {
                    month1: localData.month1, month2: localData.month2, month3: localData.month3,
                    allowedAbsences: localData.allowedAbsences, allowedLates: localData.allowedLates, 
                    maxLateMinutesAllowed: localData.maxLateMinutesAllowed, gracePeriodMinutes: localData.gracePeriodMinutes
                },
                [`${prefix}disciplinaryRules`]: {
                    tier1: { name: localData.tier1Name, strikes: localData.tier1Strikes },
                    tier2: { name: localData.tier2Name, strikes: localData.tier2Strikes, windowMonths: localData.tier2Window },
                    tier3: { name: localData.tier3Name, strikes: localData.tier3Strikes, windowMonths: localData.tier3Window },
                }
            };

            await updateDoc(doc(db, 'settings', 'company_config'), dataToSave);
            
            setOriginalData(localData); 
            setIsSaved(true); 
            setTimeout(() => setIsSaved(false), 2000);
        } catch (error) { 
            alert('Failed to save settings: ' + error.message); 
        } finally { 
            setIsSaving(false); 
        }
    };

    return (
        <div id="attendance-bonus" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8 space-y-8 border border-gray-700">
            <div>
                <h3 className="text-xl font-semibold text-white flex items-center gap-2"><Award className="h-5 w-5 text-amber-400" /> Attendance Bonus</h3>
                <p className="text-gray-400 mt-2 text-sm">Configure attendance rewards for this location.</p>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
                    <div><label htmlFor="month1" className="block text-sm font-medium text-gray-300 mb-1">Month 1 Bonus (THB)</label><input type="number" id="month1" value={localData.month1} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                    <div><label htmlFor="month2" className="block text-sm font-medium text-gray-300 mb-1">Month 2 Bonus (THB)</label><input type="number" id="month2" value={localData.month2} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                    <div><label htmlFor="month3" className="block text-sm font-medium text-gray-300 mb-1">Month 3+ Bonus (THB)</label><input type="number" id="month3" value={localData.month3} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
                    <div><label htmlFor="gracePeriodMinutes" className="block text-sm font-medium text-gray-300 mb-1">Grace Period (Mins)</label><input type="number" id="gracePeriodMinutes" value={localData.gracePeriodMinutes} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                    <div><label htmlFor="allowedAbsences" className="block text-sm font-medium text-gray-300 mb-1">Max Absences</label><input type="number" id="allowedAbsences" value={localData.allowedAbsences} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                    <div><label htmlFor="allowedLates" className="block text-sm font-medium text-gray-300 mb-1">Max Late Incidents</label><input type="number" id="allowedLates" value={localData.allowedLates} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                    <div><label htmlFor="maxLateMinutesAllowed" className="block text-sm font-medium text-gray-300 mb-1">Max Late Time (Mins)</label><input type="number" id="maxLateMinutesAllowed" value={localData.maxLateMinutesAllowed} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" /></div>
                </div>
            </div>
            <div>
                <h3 className="text-xl font-semibold text-white flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-red-400" /> Disciplinary Actions</h3>
                <div className="space-y-3 mt-4">
                    <div className="flex items-end gap-3 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                        <div className="flex-1"><label className="block text-xs text-gray-400 mb-1">Tier 1 Action</label><input type="text" id="tier1Name" value={localData.tier1Name} onChange={handleChange} className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2 text-sm" /></div>
                        <div className="w-24"><label className="block text-xs text-gray-400 mb-1">At Strike</label><input type="number" id="tier1Strikes" value={localData.tier1Strikes} onChange={handleChange} className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2 text-sm" /></div>
                        <div className="w-32 text-xs text-gray-500 pb-2">Anytime</div>
                    </div>
                    <div className="flex items-end gap-3 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                        <div className="flex-1"><label className="block text-xs text-gray-400 mb-1">Tier 2 Action</label><input type="text" id="tier2Name" value={localData.tier2Name} onChange={handleChange} className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2 text-sm" /></div>
                        <div className="w-24"><label className="block text-xs text-gray-400 mb-1">At Strike</label><input type="number" id="tier2Strikes" value={localData.tier2Strikes} onChange={handleChange} className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2 text-sm" /></div>
                        <div className="w-32 flex items-center gap-2"><span className="text-xs text-gray-400 pb-2">within</span><div><label className="block text-xs text-gray-400 mb-1">Months</label><input type="number" id="tier2Window" value={localData.tier2Window} onChange={handleChange} className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2 text-sm" /></div></div>
                    </div>
                    <div className="flex items-end gap-3 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                        <div className="flex-1"><label className="block text-xs text-gray-400 mb-1">Tier 3 Action</label><input type="text" id="tier3Name" value={localData.tier3Name} onChange={handleChange} className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2 text-sm" /></div>
                        <div className="w-24"><label className="block text-xs text-gray-400 mb-1">At Strike</label><input type="number" id="tier3Strikes" value={localData.tier3Strikes} onChange={handleChange} className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2 text-sm" /></div>
                        <div className="w-32 flex items-center gap-2"><span className="text-xs text-gray-400 pb-2">within</span><div><label className="block text-xs text-gray-400 mb-1">Months</label><input type="number" id="tier3Window" value={localData.tier3Window} onChange={handleChange} className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2 text-sm" /></div></div>
                    </div>
                </div>
            </div>
             <div className="flex justify-end pt-4 border-t border-gray-700">
                <button onClick={handleSave} disabled={isSaving || !hasChanges} className="flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors">
                    {isSaving ? 'Saving...' : (isSaved ? <><Check className="h-5 w-5 mr-2" /> Saved</> : 'Save Changes')}
                </button>
            </div>
        </div>
    );
};