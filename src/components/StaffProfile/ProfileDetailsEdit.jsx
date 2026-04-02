import React from 'react';

export const ProfileDetailsEdit = ({ formData, handleInputChange }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 flex-grow">
        <div><label className="text-sm text-gray-400">First Name</label><input id="firstName" value={formData.firstName} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"/></div>
        <div><label className="text-sm text-gray-400">Last Name</label><input id="lastName" value={formData.lastName} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"/></div>
        <div><label className="text-sm text-gray-400">Nickname</label><input id="nickname" value={formData.nickname} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"/></div>
        <div><label className="text-sm text-gray-400">Email</label><input id="email" type="email" value={formData.email} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"/></div>
        <div><label className="text-sm text-gray-400">Phone Number</label><input id="phoneNumber" value={formData.phoneNumber} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"/></div>
        <div><label className="text-sm text-gray-400">Start Date</label><input id="startDate" type="date" value={formData.startDate} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"/></div>
        <div><label className="text-sm text-gray-400">Birthdate</label><input id="birthdate" type="date" value={formData.birthdate} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"/></div>
        <div className="md:col-span-2"><label className="text-sm text-gray-400">Bank Account</label><input id="bankAccount" value={formData.bankAccount} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"/></div>
        
        {/* --- NEW: Identification Section --- */}
        <div className="md:col-span-2 mt-2 bg-gray-800/30 p-4 rounded-lg border border-gray-700 space-y-4">
            <h4 className="text-sm font-bold text-gray-300 border-b border-gray-700 pb-2">Identification Document</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-sm text-gray-400">Document Type</label>
                    <select
                        id="idType"
                        value={formData.idType || 'None'}
                        onChange={handleInputChange}
                        className="w-full mt-1 px-3 py-2 bg-gray-900 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"
                    >
                        <option value="None">None Selected</option>
                        <option value="Thai ID Card">Thai ID Card</option>
                        <option value="Passport">Passport</option>
                        <option value="Certificate of Identity">Certificate of Identity (CI)</option>
                        <option value="Other">Other (Manual Entry)</option>
                    </select>
                </div>
                <div>
                    <label className="text-sm text-gray-400">Document No.</label>
                    <input
                        id="idNumber"
                        value={formData.idNumber || ''}
                        onChange={handleInputChange}
                        placeholder={formData.idType === 'None' ? '' : 'Enter document number...'}
                        className="w-full mt-1 px-3 py-2 bg-gray-900 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"
                    />
                </div>
            </div>
        </div>

        <div className="md:col-span-2">
            <label className="text-sm text-gray-400">Address</label>
            <textarea id="address" value={formData.address || ''} onChange={handleInputChange} rows="3" className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"></textarea>
        </div>
        <div>
            <label className="text-sm text-gray-400">Emergency Contact Name</label>
            <input id="emergencyContactName" value={formData.emergencyContactName || ''} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"/>
        </div>
        <div>
            <label className="text-sm text-gray-400">Emergency Contact Phone</label>
            <input id="emergencyContactPhone" value={formData.emergencyContactPhone || ''} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"/>
        </div>

        {/* --- Grouped Compliance Section --- */}
        <div className="md:col-span-2 mt-4 bg-gray-800/50 p-4 rounded-lg border border-gray-700 space-y-4">
            <label className="flex items-center space-x-3 cursor-pointer">
                <input 
                    id="isSsoRegistered" 
                    type="checkbox" 
                    checked={formData.isSsoRegistered} 
                    onChange={handleInputChange} 
                    className="h-5 w-5 rounded bg-gray-700 border-gray-600 text-amber-600 focus:ring-amber-500" 
                />
                <span className="text-sm font-bold text-white">Enrolled in Social Security (SSO)</span>
            </label>
            
            <div className="border-t border-gray-700 pt-4">
                <label className="block text-sm font-bold text-indigo-400 mb-1">Public Holiday Policy</label>
                <select 
                    id="holidayPolicy" 
                    value={formData.holidayPolicy || 'in_lieu'} 
                    onChange={handleInputChange} 
                    className="w-full px-3 py-2 bg-gray-900 rounded-md text-white border border-gray-600 focus:border-indigo-500 outline-none"
                >
                    <option value="in_lieu">In Lieu (Accrue substitute days off)</option>
                    <option value="paid">Paid (Cash payout on holiday)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1.5">Determines if they earn days off or receive extra cash when working holidays.</p>
            </div>
        </div>
    </div>
);