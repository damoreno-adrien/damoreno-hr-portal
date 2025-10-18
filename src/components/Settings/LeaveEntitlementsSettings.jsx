import React from 'react';

export const LeaveEntitlementsSettings = ({ config, handleConfigChange }) => (
    <div id="leave-entitlements" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8">
        <h3 className="text-xl font-semibold text-white">Leave Entitlements</h3>
        <p className="text-gray-400 mt-2">Set the number of paid leave days per employee per year.</p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
                <label htmlFor="annualLeaveDays" className="block text-sm font-medium text-gray-300 mb-1">Paid Annual Leave Days</label>
                <input type="number" id="annualLeaveDays" value={config.annualLeaveDays || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
            <div>
                <label htmlFor="paidSickDays" className="block text-sm font-medium text-gray-300 mb-1">Paid Sick Days</label>
                <input type="number" id="paidSickDays" value={config.paidSickDays || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
            <div>
                <label htmlFor="paidPersonalDays" className="block text-sm font-medium text-gray-300 mb-1">Paid Personal Days</label>
                <input type="number" id="paidPersonalDays" value={config.paidPersonalDays || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
        </div>
    </div>
);