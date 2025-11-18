/* src/components/Settings/AttendanceBonusSettings.jsx */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Check } from 'lucide-react';

export const AttendanceBonusSettings = ({ db, config }) => {
    const [localBonus, setLocalBonus] = useState({});
    const [originalBonus, setOriginalBonus] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        if (config) {
            // Use default empty object if attendanceBonus is missing
            const bonusConfig = config.attendanceBonus || {};
            
            const data = {
                month1: bonusConfig.month1 || 0,
                month2: bonusConfig.month2 || 0,
                month3: bonusConfig.month3 || 0,
                allowedAbsences: bonusConfig.allowedAbsences ?? 0,
                allowedLates: bonusConfig.allowedLates ?? 1,
                // "maxLateMinutesAllowed" is for the Bonus rule (e.g. lose bonus if > 30 mins late total)
                maxLateMinutesAllowed: bonusConfig.maxLateMinutesAllowed ?? 30, 
                
                // --- NEW: Grace Period Setting ---
                // This defines "Am I Late?". Default to 5 minutes.
                // We read this from the root 'config', not 'attendanceBonus', for global access.
                gracePeriodMinutes: config.gracePeriodMinutes ?? 5, 
            };
            setLocalBonus(data);
            setOriginalBonus(data);
        }
    }, [config]);

    const handleChange = (e) => {
        setLocalBonus(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    const hasChanges = JSON.stringify(localBonus) !== JSON.stringify(originalBonus);

    const handleSave = async () => {
        setIsSaving(true);
        setIsSaved(false);
        const configDocRef = doc(db, 'settings', 'company_config');
        try {
            const dataToSave = {
                // Save Bonus-specific rules in the nested object
                'attendanceBonus.month1': Number(localBonus.month1),
                'attendanceBonus.month2': Number(localBonus.month2),
                'attendanceBonus.month3': Number(localBonus.month3),
                'attendanceBonus.allowedAbsences': Number(localBonus.allowedAbsences),
                'attendanceBonus.allowedLates': Number(localBonus.allowedLates),
                'attendanceBonus.maxLateMinutesAllowed': Number(localBonus.maxLateMinutesAllowed),
                
                // --- NEW: Save Grace Period at the ROOT level ---
                // This allows statusUtils.js to find it easily as config.gracePeriodMinutes
                'gracePeriodMinutes': Number(localBonus.gracePeriodMinutes), 
            };
            await updateDoc(configDocRef, dataToSave);
            
            setOriginalBonus(localBonus); 
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
        } catch (error) {
            alert('Failed to save settings: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div id="attendance-bonus" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8">
            <h3 className="text-xl font-semibold text-white">Attendance Rules & Bonus</h3>
            <p className="text-gray-400 mt-2">Define when a staff is considered "Late" and the rules for the attendance bonus.</p>
            
            {/* --- NEW SECTION: Operational Rules --- */}
            <div className="mt-6 pt-4 border-t border-gray-700">
                <h4 className="text-lg font-medium text-white mb-4">Late Policy</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label htmlFor="gracePeriodMinutes" className="block text-sm font-medium text-amber-400 mb-1">Late Check-In Grace Period (Minutes)</label>
                        <input 
                            type="number" 
                            id="gracePeriodMinutes" 
                            value={localBonus.gracePeriodMinutes ?? ''} 
                            onChange={handleChange} 
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-amber-500" 
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Staff checking in within this window (e.g. 14:05 for 14:00 start) are marked "Present". After this, they are "Late".
                        </p>
                    </div>
                </div>
            </div>

            {/* --- Bonus Amounts --- */}
            <div className="mt-6 pt-6 border-t border-gray-700">
                <h4 className="text-lg font-medium text-white mb-4">Bonus Amounts</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label htmlFor="month1" className="block text-sm font-medium text-gray-300 mb-1">Month 1 Bonus (THB)</label>
                        <input type="number" id="month1" value={localBonus.month1 || ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                    <div>
                        <label htmlFor="month2" className="block text-sm font-medium text-gray-300 mb-1">Month 2 Bonus (THB)</label>
                        <input type="number" id="month2" value={localBonus.month2 || ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                    <div>
                        <label htmlFor="month3" className="block text-sm font-medium text-gray-300 mb-1">Month 3+ Bonus (THB)</label>
                        <input type="number" id="month3" value={localBonus.month3 || ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                </div>
            </div>

            {/* --- Bonus Eligibility Rules --- */}
            <div className="mt-6 pt-6 border-t border-gray-700">
                <h4 className="text-lg font-medium text-white mb-4">Disqualification Rules</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label htmlFor="allowedAbsences" className="block text-sm font-medium text-gray-300 mb-1">Max Absences (Days)</label>
                        <input type="number" id="allowedAbsences" value={localBonus.allowedAbsences ?? ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                    <div>
                        <label htmlFor="allowedLates" className="block text-sm font-medium text-gray-300 mb-1">Max Late Incidents (Count)</label>
                        <input type="number" id="allowedLates" value={localBonus.allowedLates ?? ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                    <div>
                        <label htmlFor="maxLateMinutesAllowed" className="block text-sm font-medium text-gray-300 mb-1">Max Total Late Time (Minutes)</label>
                        <input type="number" id="maxLateMinutesAllowed" value={localBonus.maxLateMinutesAllowed ?? ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                    </div>
                </div>
            </div>
            
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