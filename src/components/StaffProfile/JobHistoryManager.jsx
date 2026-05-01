/* src/components/StaffProfile/JobHistoryManager.jsx */
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';

const formatRate = (job) => {
    if (!job) return 'N/A';
    if (job.payType === 'Hourly') {
        const r = job.hourlyRate || job.rate;
        return typeof r === 'number' ? `${r.toLocaleString()} THB / hr` : 'N/A';
    } 
    const salary = job.baseSalary || job.rate;
    const hours = job.standardDayHours || 8;
    return typeof salary === 'number' ? `${salary.toLocaleString()} THB / mo (${hours}h/day)` : 'N/A';
};

export const JobHistoryManager = ({ jobHistory = [], departments = [], roleTemplates = [], onAddNewJob, onEditJob, onDeleteJob }) => {
    
    // SÉCURISATION DES ENTRÉES
    const safeJobHistory = Array.isArray(jobHistory) ? jobHistory : [];
    const safeDepartments = Array.isArray(departments) ? departments : [];
    const safeTemplates = Array.isArray(roleTemplates) ? roleTemplates : []; // FIX: Déclaration rétablie

    const [isAddingJob, setIsAddingJob] = useState(false);
    const [originalJobToEdit, setOriginalJobToEdit] = useState(null);
    
    const [newJob, setNewJob] = useState({ 
        position: '', 
        department: '', // Initialisé à vide pour éviter "General"[cite: 13]
        startDate: dateUtils.formatISODate(new Date()), 
        payType: 'Salary', 
        baseSalary: '',    
        standardDayHours: 8,
        hourlyRate: '',
        roleTemplate: ''     
    });

    // MISE À JOUR DYNAMIQUE DU DÉPARTEMENT
    // Dès que la liste des départements de la branche arrive, on prend le premier[cite: 13]
    useEffect(() => {
        if (safeDepartments.length > 0 && !newJob.department) {
            setNewJob(prev => ({ ...prev, department: safeDepartments[0] }));
        }
    }, [safeDepartments]);
    
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const handleNewJobChange = (e) => setNewJob(prev => ({ ...prev, [e.target.id]: e.target.value }));

    const handleEditClick = (job) => {
        setOriginalJobToEdit(job);
        
        let type = job.payType;
        if (type === 'Monthly' || !type) type = 'Salary'; 

        let salary = '';
        let hourly = '';
        if (type === 'Salary') {
            salary = job.baseSalary !== undefined && job.baseSalary !== null ? job.baseSalary : (job.rate || '');
        } else {
            hourly = job.hourlyRate !== undefined && job.hourlyRate !== null ? job.hourlyRate : (job.rate || '');
        }

        setNewJob({
            position: job.position || '',
            department: job.department || (safeDepartments.length > 0 ? safeDepartments[0] : ''),
            startDate: job.startDate ? dateUtils.formatISODate(dateUtils.fromFirestore(job.startDate)) : dateUtils.formatISODate(new Date()),
            payType: type,
            baseSalary: salary,
            standardDayHours: job.standardDayHours || 8, 
            hourlyRate: hourly,
            roleTemplate: job.roleTemplate || '',
        });
        setIsAddingJob(true);
    };

    const handleCancel = () => {
        setIsAddingJob(false);
        setOriginalJobToEdit(null);
        setError('');
        setNewJob({ 
            position: '', 
            department: safeDepartments.length > 0 ? safeDepartments[0] : '', 
            startDate: dateUtils.formatISODate(new Date()), 
            payType: 'Salary', 
            baseSalary: '', 
            standardDayHours: 8,
            hourlyRate: '',
            roleTemplate: '', 
        });
    };

    const handleSaveNewJob = async () => {
        if (!newJob.position || !newJob.department || !newJob.startDate) {
            setError("Please fill in position, department, and start date.");
            return;
        }

        let cleanJobData = {
            position: newJob.position,
            department: newJob.department,
            startDate: newJob.startDate,
            payType: newJob.payType,
            roleTemplate: newJob.roleTemplate || null
        };

        if (newJob.payType === 'Salary') {
            if (!newJob.baseSalary) { setError("Base Salary is required."); return; }
            cleanJobData.baseSalary = parseInt(newJob.baseSalary, 10);
            cleanJobData.standardDayHours = parseInt(newJob.standardDayHours, 10) || 8;
            cleanJobData.hourlyRate = null;
        } else {
            if (!newJob.hourlyRate) { setError("Hourly Rate is required."); return; }
            cleanJobData.hourlyRate = parseInt(newJob.hourlyRate, 10);
            cleanJobData.baseSalary = null;
            cleanJobData.standardDayHours = null;
        }

        setIsSaving(true);
        setError('');
        try {
            if (originalJobToEdit) {
                await onEditJob(originalJobToEdit, cleanJobData);
            } else {
                await onAddNewJob(cleanJobData);
            }
            handleCancel();
        } catch (err) {
            setError(originalJobToEdit ? "Failed to update job role." : "Failed to add new job role.");
            console.error("Error saving job:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const sortedJobHistory = [...safeJobHistory].sort((a, b) => {
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
                            <select id="department" value={newJob.department} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white border border-gray-500 focus:border-indigo-500">
                                {safeDepartments.length === 0 && <option value="">Loading departments...</option>}
                                {safeDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm text-gray-300">Position</label>
                            <input id="position" value={newJob.position} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white border border-gray-500 focus:border-indigo-500"/>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm text-gray-300">Start Date</label>
                            <input id="startDate" type="date" value={newJob.startDate} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white border border-gray-500 focus:border-indigo-500"/>
                        </div>
                        <div>
                            <label className="text-sm text-gray-300">Pay Type</label>
                            <select id="payType" value={newJob.payType} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white border border-gray-500 focus:border-indigo-500">
                                <option value="Salary">Salary (Fixed Monthly)</option>
                                <option value="Hourly">Hourly (Per Hour)</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-800/50 p-3 rounded-md border border-gray-600">
                        {newJob.payType === 'Salary' ? (
                            <>
                                <div>
                                    <label className="text-sm text-amber-400 font-medium">Base Salary (THB/Month)</label>
                                    <input id="baseSalary" type="number" value={newJob.baseSalary} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white border border-gray-500 focus:border-amber-500"/>
                                </div>
                                <div>
                                    <label className="text-sm text-amber-400 font-medium">Standard Daily Hours</label>
                                    <input id="standardDayHours" type="number" value={newJob.standardDayHours} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white border border-gray-500 focus:border-amber-500"/>
                                </div>
                            </>
                        ) : (
                            <div>
                                <label className="text-sm text-blue-400 font-medium">Hourly Rate (THB/Hour)</label>
                                <input id="hourlyRate" type="number" value={newJob.hourlyRate} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white border border-gray-500 focus:border-blue-500"/>
                            </div>
                        )}
                    </div>

                    <div className="mt-4">
                        <label className="text-sm text-gray-300">Contract Template</label>
                        <select id="roleTemplate" value={newJob.roleTemplate || ''} onChange={handleNewJobChange} className="w-full mt-1 px-3 py-2 bg-gray-600 rounded-md text-white border border-gray-500 focus:border-indigo-500">
                            <option value="">-- No template --</option>
                            {safeTemplates.map(template => (
                                <option key={template} value={template}>{template}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-end space-x-2 pt-2">
                        <button onClick={handleCancel} className="px-4 py-1 rounded-md bg-gray-500 hover:bg-gray-400 text-white">Cancel</button>
                        <button onClick={handleSaveNewJob} disabled={isSaving} className="px-4 py-1 rounded-md bg-green-600 hover:bg-green-500 text-white disabled:bg-gray-600">
                            {isSaving ? 'Saving...' : 'Save Job'}
                        </button>
                    </div>
                </div>
            ) : ( 
                <button onClick={() => setIsAddingJob(true)} className="w-full flex justify-center items-center py-2 px-4 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600">
                    <Plus className="h-5 w-5 mr-2"/>Add New Job Role
                </button> 
            )}
            
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {sortedJobHistory.map((job, index) => (
                    <div key={index} className="bg-gray-700 p-3 rounded-lg flex justify-between items-center border border-gray-600">
                        <div>
                            <p className="font-bold text-white">{job.position} <span className="text-sm text-gray-400">({job.department})</span></p>
                            <p className="text-sm text-amber-400 font-mono">{formatRate(job)}</p>
                        </div>
                        <div className="flex items-center space-x-1">
                            <p className="text-sm text-gray-300 mr-2">{dateUtils.formatDisplayDate(job.startDate)}</p>
                            <button onClick={() => handleEditClick(job)} className="text-gray-400 hover:text-blue-400 p-2"><Pencil className="h-4 w-4"/></button>
                            <button onClick={() => onDeleteJob(job)} className="text-gray-400 hover:text-red-400 p-2"><Trash2 className="h-4 w-4"/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};