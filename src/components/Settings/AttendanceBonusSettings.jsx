import React from 'react';

export const AttendanceBonusSettings = ({ config, handleConfigChange }) => (
    <div id="attendance-bonus" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8">
        <h3 className="text-xl font-semibold text-white">Attendance Bonus</h3>
        <p className="text-gray-400 mt-2">Define the rules for the gradual monthly attendance bonus.</p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
                <label htmlFor="month1" className="block text-sm font-medium text-gray-300 mb-1">Month 1 Bonus (THB)</label>
                <input type="number" id="month1" value={config.attendanceBonus?.month1 || ''} onChange={(e) => handleConfigChange(e, 'attendanceBonus')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
            <div>
                <label htmlFor="month2" className="block text-sm font-medium text-gray-300 mb-1">Month 2 Bonus (THB)</label>
                <input type="number" id="month2" value={config.attendanceBonus?.month2 || ''} onChange={(e) => handleConfigChange(e, 'attendanceBonus')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
            <div>
                <label htmlFor="month3" className="block text-sm font-medium text-gray-300 mb-1">Month 3+ Bonus (THB)</label>
                <input type="number" id="month3" value={config.attendanceBonus?.month3 || ''} onChange={(e) => handleConfigChange(e, 'attendanceBonus')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
        </div>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
                <label htmlFor="allowedAbsences" className="block text-sm font-medium text-gray-300 mb-1">Max Absences Allowed</label>
                <input type="number" id="allowedAbsences" value={config.attendanceBonus?.allowedAbsences ?? ''} onChange={(e) => handleConfigChange(e, 'attendanceBonus')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
            <div>
                <label htmlFor="allowedLates" className="block text-sm font-medium text-gray-300 mb-1">Max Late Arrivals Allowed</label>
                <input type="number" id="allowedLates" value={config.attendanceBonus?.allowedLates ?? ''} onChange={(e) => handleConfigChange(e, 'attendanceBonus')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
        </div>
    </div>
);