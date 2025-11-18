import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';

// Helper to display rates correctly for both Old (Monthly) and New (Salary/Hourly) formats
const formatRate = (job) => {
    if (!job) return 'N/A';

    if (job.payType === 'Hourly') {
        // Support both new 'hourlyRate' and old 'rate' fields
        const r = job.hourlyRate || job.rate;
        return typeof r === 'number' ? `${r.toLocaleString()} THB / hr` : 'N/A';
    } 
    
    // Handle 'Salary' (or old 'Monthly')
    const salary = job.baseSalary || job.rate;
    // Default to 8 hours if standardDayHours is missing (backward compatibility)
    const hours = job.standardDayHours || 8; 
    
    return typeof salary === 'number' 
        ? `${salary.toLocaleString()} THB / mo (${hours}h/day)` 
        : 'N/A';
};

export const JobHistoryManager = ({ jobHistory = [], departments = [], onAddNewJob, onDeleteJob }) => {
    const [isAddingJob, setIsAddingJob] = useState(false);
    
    // NEW STATE STRUCTURE
    const [newJob, setNewJob] = useState({ 
        position: '', 
        department: departments[0] || '', 
        startDate: dateUtils.formatISODate(new Date()), 
        payType: 'Salary', // Default to Salary
        baseSalary: '',    // For Salary staff
        standardDayHours: 8, // Default standard day
        hourlyRate: ''     // For Hourly staff
    });
    
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const handleNewJobChange = (e) => setNewJob(prev => ({ ...prev, [e.target.id]: e.target.value }));

    const handleSaveNewJob = async () => {
        // Validate based on payType
        if (!newJob.position || !newJob.department || !newJob.startDate) {
            setError("Please fill in position, department, and start date.");
            return;
        }

        let cleanJobData = {
            position: newJob.position,
            department: newJob.department,
            startDate: newJob.startDate,
            payType: newJob.payType
        };

        if (newJob.payType === 'Salary') {
            if (!newJob.baseSalary) { setError("Base Salary is required."); return; }
            cleanJobData.baseSalary = parseInt(newJob.baseSalary, 10);
            cleanJobData.standardDayHours = parseInt(newJob.standardDayHours, 10) || 8;
            cleanJobData.hourlyRate = null; // Clear hourly fields
        } else {
            if (!newJob.hourlyRate) { setError("Hourly Rate is required."); return; }
            cleanJobData.hourlyRate = parseInt(newJob.hourlyRate, 10);
            cleanJobData.baseSalary = null; // Clear salary fields
            cleanJobData.standardDayHours = null;
        }

        setIsSaving(true);
        setError('');
        try {
            await onAddNewJob(cleanJobData);
            setIsAddingJob(false);
            // Reset form
            setNewJob({ 
                position: '', 
                department: departments[0] || '', 
                startDate: dateUtils.formatISODate(new Date()), 
                payType: 'Salary', 
                baseSalary: '', 
                standardDayHours: 8,
                hourlyRate: '' 
            }); 
        } catch (err) {
            setError("Failed to add new job role.");
            console.error("Error adding job:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const sortedJobHistory = [...jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(b.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(a.startDate) || new Date(0);
        return dateA - dateB;
    });

    return (
        <div className="space-y-4">
            <h4 className="text-lg font-semibold text-white">Job & Salary History</h4>
            {isAddingJob ? (
                <div className="bg-gray-700 p-4 rounded-lg space-y-4 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm text-gray-300">Department</label>
                            <select id="department" value={newJob.department} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white">
                                {departments.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm text-gray-300">Position</label>
                            <input id="position" value={newJob.position} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white"/>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm text-gray-300">Start Date</label>
                            <input id="startDate" type="date" value={newJob.startDate} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white"/>
                        </div>
                        <div>
                            <label className="text-sm text-gray-300">Pay Type</label>
                            <select id="payType" value={newJob.payType} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white">
                                <option value="Salary">Salary (Fixed Monthly)</option>
                                <option value="Hourly">Hourly (Per Hour)</option>
                            </select>
                        </div>
                    </div>

                    {/* CONDITIONAL FIELDS based on Pay Type */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-800/50 p-3 rounded-md border border-gray-600">
                        {newJob.payType === 'Salary' ? (
                            <>
                                <div>
                                    <label className="text-sm text-amber-400 font-medium">Base Salary (THB/Month)</label>
                                    <input id="baseSalary" type="number" value={newJob.baseSalary} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white border border-gray-500 focus:border-amber-500" placeholder="e.g. 40000"/>
                                </div>
                                <div>
                                    <label className="text-sm text-amber-400 font-medium">Standard Daily Hours</label>
                                    <input id="standardDayHours" type="number" value={newJob.standardDayHours} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white border border-gray-500 focus:border-amber-500" placeholder="e.g. 8"/>
                                    <p className="text-xs text-gray-400 mt-1">Used for OT calc (Full-time=8, Part-time=4)</p>
                                </div>
                            </>
                        ) : (
                            <div>
                                <label className="text-sm text-blue-400 font-medium">Hourly Rate (THB/Hour)</label>
                                <input id="hourlyRate" type="number" value={newJob.hourlyRate} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white border border-gray-500 focus:border-blue-500" placeholder="e.g. 150"/>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end space-x-2 pt-2">
                        <button onClick={() => { setIsAddingJob(false); setError(''); }} className="px-4 py-1 rounded-md bg-gray-500 hover:bg-gray-400 text-white">Cancel</button>
                        <button onClick={handleSaveNewJob} disabled={isSaving} className="px-4 py-1 rounded-md bg-green-600 hover:bg-green-500 text-white disabled:bg-gray-600">
                            {isSaving ? 'Saving...' : 'Save Job'}
                        </button>
                    </div>
                    {error && <p className="text-red-400 text-sm text-right mt-2">{error}</p>}
                </div>
            ) : ( 
                <button onClick={() => setIsAddingJob(true)} className="w-full flex justify-center items-center py-2 px-4 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors">
                    <Plus className="h-5 w-5 mr-2"/>Add New Job Role
                </button> 
            )}
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
                {sortedJobHistory.length === 0 && !isAddingJob && (
                    <p className="text-center text-gray-500 py-4">No job history recorded.</p>
                )}
                {sortedJobHistory.map((job, index) => (
                    <div key={index} className="bg-gray-700 p-3 rounded-lg flex justify-between items-center group">
                        <div>
                            <p className="font-bold text-white">{job.position} <span className="text-sm text-gray-400">({job.department})</span></p>
                            <p className="text-sm text-amber-400 font-mono">{formatRate(job)}</p>
                        </div>
                        <div className="flex items-center space-x-3">
                            <p className="text-sm text-gray-300">{dateUtils.formatDisplayDate(job.startDate)}</p>
                            <button onClick={() => onDeleteJob(job)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1" title="Delete this entry">
                                <Trash2 className="h-5 w-5"/>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};