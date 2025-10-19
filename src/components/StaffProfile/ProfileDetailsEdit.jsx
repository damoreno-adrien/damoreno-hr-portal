import React from 'react';

export const ProfileDetailsEdit = ({ formData, handleInputChange }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 flex-grow">
        <div><label className="text-sm text-gray-400">First Name</label><input id="firstName" value={formData.firstName} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white"/></div>
        <div><label className="text-sm text-gray-400">Last Name</label><input id="lastName" value={formData.lastName} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white"/></div>
        <div><label className="text-sm text-gray-400">Nickname</label><input id="nickname" value={formData.nickname} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white"/></div>
        <div><label className="text-sm text-gray-400">Email</label><input id="email" type="email" value={formData.email} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white"/></div>
        <div><label className="text-sm text-gray-400">Phone Number</label><input id="phoneNumber" value={formData.phoneNumber} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white"/></div>
        <div><label className="text-sm text-gray-400">Start Date</label><input id="startDate" type="date" value={formData.startDate} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white"/></div>
        <div><label className="text-sm text-gray-400">Birthdate</label><input id="birthdate" type="date" value={formData.birthdate} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white"/></div>
        <div className="md:col-span-2"><label className="text-sm text-gray-400">Bank Account</label><input id="bankAccount" value={formData.bankAccount} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white"/></div>
        
        {/* --- NEW FIELDS --- */}
        <div className="md:col-span-2">
            <label className="text-sm text-gray-400">Address</label>
            <textarea id="address" value={formData.address || ''} onChange={handleInputChange} rows="3" className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white"></textarea>
        </div>
        <div>
            <label className="text-sm text-gray-400">Emergency Contact Name</label>
            <input id="emergencyContactName" value={formData.emergencyContactName || ''} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white"/>
        </div>
        <div>
            <label className="text-sm text-gray-400">Emergency Contact Phone</label>
            <input id="emergencyContactPhone" value={formData.emergencyContactPhone || ''} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 bg-gray-700 rounded-md text-white"/>
        </div>
        {/* --- END NEW FIELDS --- */}
    </div>
);