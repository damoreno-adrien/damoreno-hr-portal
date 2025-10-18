import React from 'react';

export const FinancialRulesSettings = ({ config, handleConfigChange }) => (
    <div id="financial-rules" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8">
        <h3 className="text-xl font-semibold text-white">Financial & Payroll Rules</h3>
        <p className="text-gray-400 mt-2">Set percentages and caps for various financial calculations.</p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
                <label htmlFor="advanceEligibilityPercentage" className="block text-sm font-medium text-gray-300 mb-1">Advance Eligibility (% of salary)</label>
                <input type="number" id="advanceEligibilityPercentage" value={config.advanceEligibilityPercentage || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
            <div>
                <label htmlFor="ssoRate" className="block text-sm font-medium text-gray-300 mb-1">Social Security Rate (%)</label>
                <input type="number" id="ssoRate" value={config.ssoRate || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
            <div>
                <label htmlFor="ssoCap" className="block text-sm font-medium text-gray-300 mb-1">SSO Max Contribution (THB)</label>
                <input type="number" id="ssoCap" value={config.ssoCap || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
        </div>
    </div>
);