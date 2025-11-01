/* src/components/Settings/PublicHolidaysSettings.jsx */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { PlusIcon, TrashIcon } from '../common/Icons';
import { Check } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';

export const PublicHolidaysSettings = ({ db, config, onAddHoliday, onDeleteHoliday }) => {
    const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });
    
    // --- NEW STATE for the credit cap ---
    const [cap, setCap] = useState(0);
    const [originalCap, setOriginalCap] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        if (config) {
            const val = config.publicHolidayCreditCap || 0;
            setCap(val);
            setOriginalCap(val);
        }
    }, [config]);

    const handleCapChange = (e) => {
        setCap(e.target.value);
    };

    const hasCapChanges = cap !== originalCap;

    const handleSaveCap = async () => {
        setIsSaving(true);
        setIsSaved(false);
        const configDocRef = doc(db, 'settings', 'company_config');
        try {
            await updateDoc(configDocRef, {
                publicHolidayCreditCap: Number(cap)
            });
            setOriginalCap(cap); // Update original state
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
        } catch (error) {
            alert('Failed to save setting: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    // --- Holiday list logic remains the same ---
    const handleHolidayInputChange = (e) => {
        setNewHoliday(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    const handleAddSubmit = (e) => {
        e.preventDefault();
        if (!newHoliday.date || !newHoliday.name.trim()) return;
        onAddHoliday({ date: newHoliday.date, name: newHoliday.name.trim() });
        setNewHoliday({ date: '', name: '' }); // Reset form
    };

    const sortedHolidays = (config.publicHolidays || []).sort((a, b) => {
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
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label htmlFor="publicHolidayCreditCap" className="block text-sm font-medium text-gray-300 mb-1">Max Holiday Credits / Year</label>
                    <input type="number" id="publicHolidayCreditCap" value={cap} onChange={handleCapChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div className="md:col-span-2 flex items-end">
                    {/* --- NEW SAVE BUTTON for the cap --- */}
                    <button
                        onClick={handleSaveCap}
                        disabled={isSaving || !hasCapChanges}
                        className="flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-500 disabled:cursor-not-allowed h-10"
                    >
                        {isSaving ? 'Saving...' : (isSaved ? <><Check className="h-5 w-5 mr-2" /> Saved</> : 'Save Cap')}
                    </button>
                </div>
            </div>
            
            {/* --- Holiday list management is unchanged --- */}
            <form onSubmit={handleAddSubmit} className="mt-6 flex flex-col sm:flex-row items-stretch sm:space-x-4 space-y-2 sm:space-y-0">
                <input type="date" id="date" value={newHoliday.date} onChange={handleHolidayInputChange} className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"/>
                <input type="text" id="name" value={newHoliday.name} onChange={handleHolidayInputChange} placeholder="Holiday name" className="flex-grow px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                <button type="submit" className="flex-shrink-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"><PlusIcon className="h-5 w-5 mr-2" />Add Holiday</button>
            </form>
            <div className="mt-8 space-y-3 max-h-60 overflow-y-auto">
                {sortedHolidays.map(holiday => (
                    <div key={holiday.date + holiday.name} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg">
                        <div>
                            <span className="text-white font-semibold">{holiday.name}</span>
                            <span className="text-sm text-gray-400 ml-4">{dateUtils.formatDisplayDate(holiday.date)}</span>
                        </div>
                        <button onClick={() => onDeleteHoliday(holiday)} className="text-red-400 hover:text-red-300" title="Delete holiday">
                            <TrashIcon className="h-5 w-5" />
                        </button>
                    </div>
                ))}
                {sortedHolidays.length === 0 && (
                    <p className="text-center text-gray-500 py-4">No public holidays added yet.</p>
                )}
            </div>
        </div>
    );
};