import React from 'react';

export const CompanyInfoSettings = ({ config, handleConfigChange, logoPreview, handleLogoChange }) => (
    <div id="company-info" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8">
        <h3 className="text-xl font-semibold text-white">Company Information</h3>
        <p className="text-gray-400 mt-2">These details will be used in official documents like payslips.</p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
                <label htmlFor="companyName" className="block text-sm font-medium text-gray-300 mb-1">Company Legal Name</label>
                <input type="text" id="companyName" value={config.companyName || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
            <div className="md:col-span-2">
                <label htmlFor="companyAddress" className="block text-sm font-medium text-gray-300 mb-1">Company Address</label>
                <textarea id="companyAddress" value={config.companyAddress || ''} onChange={handleConfigChange} rows="3" className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"></textarea>
            </div>
            <div>
                <label htmlFor="companyTaxId" className="block text-sm font-medium text-gray-300 mb-1">Company Tax ID</label>
                <input type="text" id="companyTaxId" value={config.companyTaxId || ''} onChange={handleConfigChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
        </div>
        <div className="mt-6">
            <label className="block text-sm font-medium text-gray-300 mb-1">Company Logo</label>
            <div className="flex items-center space-x-4">
                {logoPreview && <img src={logoPreview} alt="Logo Preview" className="h-16 w-16 object-contain rounded-md bg-white p-1" />}
                <input type="file" accept="image/png, image/jpeg" onChange={handleLogoChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-700"/>
            </div>
        </div>
    </div>
);