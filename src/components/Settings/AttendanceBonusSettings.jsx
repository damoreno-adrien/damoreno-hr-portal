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
        if (config && config.attendanceBonus) {
            const data = {
                month1: config.attendanceBonus.month1 || 0,
                month2: config.attendanceBonus.month2 || 0,
                month3: config.attendanceBonus.month3 || 0,
                allowedAbsences: config.attendanceBonus.allowedAbsences ?? 0,
                allowedLates: config.attendanceBonus.allowedLates ?? 1,
                maxLateMinutesAllowed: config.attendanceBonus.maxLateMinutesAllowed ?? 30,
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
                'attendanceBonus.month1': Number(localBonus.month1),
                'attendanceBonus.month2': Number(localBonus.month2),
                'attendanceBonus.month3': Number(localBonus.month3),
                'attendanceBonus.allowedAbsences': Number(localBonus.allowedAbsences),
                'attendanceBonus.allowedLates': Number(localBonus.allowedLates),
                'attendanceBonus.maxLateMinutesAllowed': Number(localBonus.maxLateMinutesAllowed),
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
            <h3 className="text-xl font-semibold text-white">Attendance Bonus</h3>
            <p className="text-gray-400 mt-2">Define the rules for the gradual monthly attendance bonus.</p>
            
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
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
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
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