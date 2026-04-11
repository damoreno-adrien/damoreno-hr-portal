/* src/components/Settings/PublicHolidaysSettings.jsx */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Plus, Trash2, Check, Save, Loader2 } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';

// Note : onAddHoliday et onDeleteHoliday ne sont plus nécessaires, le composant gère la DB directement
export const PublicHolidaysSettings = ({ db, config, selectedBranchId }) => {
    const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });
    
    const [settings, setSettings] = useState({
        holidayPayMultiplier: 1.0,
        maxHolidayBalance: 15,
        cashOutWindowDays: 60
    });
    const [originalSettings, setOriginalSettings] = useState({});
    
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    // 1. Lecture dynamique
    useEffect(() => {
        if (config) {
            const branchOverrides = (selectedBranchId && selectedBranchId !== 'global' && config.branchSettings?.[selectedBranchId]) 
                ? config.branchSettings[selectedBranchId] 
                : {};

            const vals = {
                holidayPayMultiplier: branchOverrides.holidayPayMultiplier ?? config.holidayPayMultiplier ?? 1.0,
                maxHolidayBalance: branchOverrides.maxHolidayBalance ?? branchOverrides.publicHolidayCreditCap ?? config.maxHolidayBalance ?? config.publicHolidayCreditCap ?? 15, 
                cashOutWindowDays: branchOverrides.cashOutWindowDays ?? config.cashOutWindowDays ?? 60
            };
            setSettings(vals);
            setOriginalSettings(vals);
        }
    }, [config, selectedBranchId]);

    const handleSettingChange = (e) => {
        const { id, value } = e.target;
        setSettings(prev => ({ ...prev, [id]: value }));
    };

    const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

    // 2. Écriture sécurisée des règles
    const handleSaveSettings = async () => {
        setIsSaving(true);
        setIsSaved(false);
        const configDocRef = doc(db, 'settings', 'company_config');
        try {
            const prefix = (selectedBranchId && selectedBranchId !== 'global') ? `branchSettings.${selectedBranchId}.` : '';

            await updateDoc(configDocRef, {
                [`${prefix}holidayPayMultiplier`]: Number(settings.holidayPayMultiplier),
                [`${prefix}maxHolidayBalance`]: Number(settings.maxHolidayBalance),
                [`${prefix}cashOutWindowDays`]: Number(settings.cashOutWindowDays),
                [`${prefix}publicHolidayCreditCap`]: Number(settings.maxHolidayBalance) 
            });
            
            setOriginalSettings(settings);
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
        } catch (error) {
            alert('Failed to save settings: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleHolidayInputChange = (e) => {
        setNewHoliday(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    // 3. Ajout d'un jour férié autonome
    const handleAddSubmit = async (e) => {
        e.preventDefault();
        if (!newHoliday.date || !newHoliday.name.trim()) return;
        
        const prefix = (selectedBranchId && selectedBranchId !== 'global') ? `branchSettings.${selectedBranchId}.publicHolidays` : 'publicHolidays';
        
        try {
            await updateDoc(doc(db, 'settings', 'company_config'), {
                [prefix]: arrayUnion({ date: newHoliday.date, name: newHoliday.name.trim() })
            });
            setNewHoliday({ date: '', name: '' });
        } catch (err) {
            alert("Failed to add holiday: " + err.message);
        }
    };

    // 4. Suppression d'un jour férié autonome
    const handleDeleteHolidayNatively = async (holiday) => {
        if (!window.confirm(`Delete holiday: ${holiday.name}?`)) return;

        const prefix = (selectedBranchId && selectedBranchId !== 'global') ? `branchSettings.${selectedBranchId}.publicHolidays` : 'publicHolidays';
        
        try {
            await updateDoc(doc(db, 'settings', 'company_config'), {
                [prefix]: arrayRemove(holiday)
            });
        } catch (err) {
            alert("Failed to delete holiday: " + err.message);
        }
    };

    // 5. Affichage dynamique
    const branchOverrides = (selectedBranchId && selectedBranchId !== 'global' && config?.branchSettings?.[selectedBranchId]) 
        ? config.branchSettings[selectedBranchId] 
        : {};
    const activeHolidays = branchOverrides.publicHolidays || config?.publicHolidays || [];

    const sortedHolidays = [...activeHolidays].sort((a, b) => {
        const dateA = dateUtils.parseISODateString(a.date);
        const dateB = dateUtils.parseISODateString(b.date);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
    });

    return (
        <div id="public-holidays" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8">
            <h3 className="text-xl font-semibold text-white">Public Holidays</h3>
            
            <div className="mt-6 p-5 bg-gray-900/50 rounded-xl border border-gray-700/50">
                <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Holiday Accrual & Payout Rules</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label htmlFor="holidayPayMultiplier" className="block text-sm font-medium text-gray-300 mb-1">Holiday Pay Multiplier</label>
                        <input type="number" step="0.1" min="0" id="holidayPayMultiplier" value={settings.holidayPayMultiplier} onChange={handleSettingChange} className="w-full px-4 py-2 bg-gray-800 border border-gray-600 focus:border-indigo-500 rounded-lg text-white outline-none transition-colors" />
                        <p className="text-[10px] text-gray-500 mt-1.5 leading-tight">Multiplier for extra pay when working a holiday (e.g., 1.0 = 1 extra daily wage).</p>
                    </div>
                    <div>
                        <label htmlFor="maxHolidayBalance" className="block text-sm font-medium text-gray-300 mb-1">Max Holding Balance</label>
                        <input type="number" min="0" id="maxHolidayBalance" value={settings.maxHolidayBalance} onChange={handleSettingChange} className="w-full px-4 py-2 bg-gray-800 border border-gray-600 focus:border-indigo-500 rounded-lg text-white outline-none transition-colors" />
                        <p className="text-[10px] text-gray-500 mt-1.5 leading-tight">Maximum number of unused In Lieu credits a staff member can hold at once.</p>
                    </div>
                    <div>
                        <label htmlFor="cashOutWindowDays" className="block text-sm font-medium text-gray-300 mb-1">Cash-Out Window (Days)</label>
                        <input type="number" min="0" id="cashOutWindowDays" value={settings.cashOutWindowDays} onChange={handleSettingChange} className="w-full px-4 py-2 bg-gray-800 border border-gray-600 focus:border-indigo-500 rounded-lg text-white outline-none transition-colors" />
                        <p className="text-[10px] text-gray-500 mt-1.5 leading-tight">Number of days a credit is eligible for cash-out before becoming a "Day-Off Only" credit.</p>
                    </div>
                </div>
                
                <div className="mt-5 flex justify-end">
                    <button
                        onClick={handleSaveSettings}
                        disabled={isSaving || !hasChanges}
                        className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-700 disabled:text-gray-500 transition-colors h-10"
                    >
                        {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : (isSaved ? <><Check className="h-4 w-4 mr-2 text-green-400" /> Saved</> : <><Save className="h-4 w-4 mr-2" /> Save Rules</>)}
                    </button>
                </div>
            </div>
            
            <hr className="border-gray-700 my-8" />

            <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Company Calendar</h4>
            <form onSubmit={handleAddSubmit} className="flex flex-col sm:flex-row items-stretch sm:space-x-4 space-y-2 sm:space-y-0">
                <input type="date" id="date" value={newHoliday.date} onChange={handleHolidayInputChange} className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white outline-none focus:border-indigo-500"/>
                <input type="text" id="name" value={newHoliday.name} onChange={handleHolidayInputChange} placeholder="Holiday name (e.g. Songkran)" className="flex-grow px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white outline-none focus:border-indigo-500" />
                <button type="submit" className="flex-shrink-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"><Plus className="h-5 w-5 mr-2" />Add Date</button>
            </form>
            
            <div className="mt-6 space-y-3 max-h-60 overflow-y-auto pr-2">
                {sortedHolidays.map(holiday => (
                    <div key={holiday.date + holiday.name} className="flex justify-between items-center bg-gray-900/50 border border-gray-700 p-3 rounded-lg hover:border-gray-500 transition-colors">
                        <div>
                            <span className="text-white font-semibold">{holiday.name}</span>
                            <span className="text-sm text-gray-400 ml-4 font-mono">{dateUtils.formatDisplayDate(holiday.date)}</span>
                        </div>
                        <button onClick={() => handleDeleteHolidayNatively(holiday)} className="text-red-400 hover:text-red-300 hover:bg-red-400/10 p-2 rounded-lg transition-colors" title="Delete holiday">
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                ))}
                {sortedHolidays.length === 0 && (
                    <div className="text-center bg-gray-900/50 border border-gray-700 rounded-lg py-8">
                        <p className="text-gray-500">No public holidays added yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
};