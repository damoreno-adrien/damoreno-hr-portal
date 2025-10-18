import React, { useState } from 'react';
import { PlusIcon, TrashIcon } from '../Icons';

export const DepartmentManager = ({ departments = [], onAddDepartment, onDeleteDepartment }) => {
    const [newDepartment, setNewDepartment] = useState('');

    const handleAddSubmit = (e) => {
        e.preventDefault();
        if (!newDepartment.trim()) return;
        onAddDepartment(newDepartment.trim());
        setNewDepartment(''); // Reset form
    };

    return (
        <div id="manage-departments" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8">
            <h3 className="text-xl font-semibold text-white">Manage Departments</h3>
            <form onSubmit={handleAddSubmit} className="mt-6 flex flex-col sm:flex-row items-stretch sm:space-x-4 space-y-2 sm:space-y-0">
                <input 
                    type="text" 
                    value={newDepartment} 
                    onChange={(e) => setNewDepartment(e.target.value)} 
                    placeholder="New department name" 
                    className="flex-grow px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" 
                />
                <button 
                    type="submit" 
                    className="flex-shrink-0 flex items-center justify-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg"
                >
                    <PlusIcon className="h-5 w-5 mr-2" />
                    <span>Add</span>
                </button>
            </form>
            <div className="mt-8 space-y-3">
                {departments.length === 0 && (
                     <p className="text-center text-gray-500 py-4">No departments added yet.</p>
                )}
                {departments.map(dept => (
                    <div key={dept} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg">
                        <span className="text-white">{dept}</span>
                        <button onClick={() => onDeleteDepartment(dept)} className="text-red-400 hover:text-red-300" title={`Delete ${dept}`}>
                            <TrashIcon className="h-5 w-5" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};