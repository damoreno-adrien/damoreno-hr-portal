/* src/components/Planning/PlanningExportModal.jsx */
import React, { useState, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { X, Download, FileText, Loader2, Calendar } from 'lucide-react';
import { generatePlanningExport } from '../../utils/planningExport';
import { getCurrentJob } from '../../utils/staffUtils';
import * as dateUtils from '../../utils/dateUtils';

export default function PlanningExportModal({ 
    isOpen, 
    onClose, 
    db, 
    staffList, 
    activeBranch, 
    currentWeekDates, 
    companyConfig 
}) {
    const [timeframe, setTimeframe] = useState('current_week');
    const [startDate, setStartDate] = useState(currentWeekDates?.[0]?.dateString || '');
    const [endDate, setEndDate] = useState(currentWeekDates?.[6]?.dateString || '');
    
    const [targetType, setTargetType] = useState('all');
    const [targetId, setTargetId] = useState('');
    
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');

    const departments = useMemo(() => {
        const depts = new Set(companyConfig?.departments || []);
        staffList.forEach(s => {
            const job = getCurrentJob(s);
            if (job.department) depts.add(job.department);
        });
        return Array.from(depts);
    }, [staffList, companyConfig]);

    const activeStaff = useMemo(() => {
        let filtered = staffList.filter(s => s.status !== 'inactive' && s.status !== 'archived');
        if (activeBranch && activeBranch !== 'global') {
            filtered = filtered.filter(s => s.branchId === activeBranch);
        }
        return filtered.sort((a, b) => (a.nickname || a.firstName || '').localeCompare(b.nickname || b.firstName || ''));
    }, [staffList, activeBranch]);

    if (!isOpen) return null;

    const handleTimeframeChange = (val) => {
        setTimeframe(val);
        if (val === 'current_week') {
            setStartDate(currentWeekDates[0].dateString);
            setEndDate(currentWeekDates[6].dateString);
        }
    };

    const handleGenerate = async (format) => {
        setIsGenerating(true);
        setError('');

        if (startDate > endDate) {
            setError("Start date must be before end date.");
            setIsGenerating(false);
            return;
        }

        try {
            let filteredStaff = activeStaff;
            let filterContext = "All_Staff";

            if (targetType === 'department') {
                filteredStaff = activeStaff.filter(s => getCurrentJob(s).department === targetId);
                filterContext = `Dept_${targetId}`;
            } else if (targetType === 'staff') {
                filteredStaff = activeStaff.filter(s => s.id === targetId);
                const s = filteredStaff[0];
                filterContext = `Staff_${s?.nickname || s?.firstName}`;
            }

            if (filteredStaff.length === 0) {
                setError("No active staff found for this selection.");
                setIsGenerating(false);
                return;
            }

            const staffIds = filteredStaff.map(s => s.id);

            const schedQ = query(collection(db, 'schedules'), where('date', '>=', startDate), where('date', '<=', endDate));
            const schedSnap = await getDocs(schedQ);
            const allSchedules = schedSnap.docs.map(d => d.data()).filter(s => staffIds.includes(s.staffId));

            const leaveQ = query(collection(db, 'leave_requests'), where('status', '==', 'approved'));
            const leaveSnap = await getDocs(leaveQ);
            const allLeaves = leaveSnap.docs.map(d => d.data()).filter(l => 
                staffIds.includes(l.staffId) && l.startDate <= endDate && l.endDate >= startDate
            );

            // On passe targetType au générateur
            generatePlanningExport({
                staffList: filteredStaff,
                schedules: allSchedules,
                leaves: allLeaves,
                startDateStr: startDate,
                endDateStr: endDate,
                format,
                branchName: activeBranch === 'global' ? 'All Branches' : activeBranch,
                filterContext,
                targetType
            });

            onClose();
        } catch (err) {
            console.error("Export Error: ", err);
            setError("Failed to fetch data for export.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[200] p-4 animate-fadeIn">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700 flex flex-col">
                
                <div className="flex justify-between items-center p-5 border-b border-gray-700">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-indigo-400" /> Export Schedule Matrix
                        </h3>
                    </div>
                    <button onClick={onClose} disabled={isGenerating} className="text-gray-400 hover:text-white transition-colors p-1 bg-gray-700/50 rounded-lg disabled:opacity-50">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Timeframe</label>
                        <select value={timeframe} onChange={(e) => handleTimeframeChange(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500">
                            <option value="current_week">Currently Displayed Week</option>
                            <option value="custom">Custom Date Range</option>
                        </select>

                        {timeframe === 'custom' && (
                            <div className="flex items-center gap-2 pt-2">
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-1/2 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white outline-none [color-scheme:dark]" />
                                <span className="text-gray-500">-</span>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-1/2 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white outline-none [color-scheme:dark]" />
                            </div>
                        )}
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Target Scope</label>
                        <select value={targetType} onChange={(e) => { setTargetType(e.target.value); setTargetId(''); }} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500">
                            <option value="all">Entire Team</option>
                            <option value="department">Specific Department</option>
                            <option value="staff">Specific Staff Member</option>
                        </select>

                        {targetType === 'department' && (
                            <select value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white outline-none mt-2">
                                <option value="">Select Department...</option>
                                {departments.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        )}

                        {targetType === 'staff' && (
                            <select value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white outline-none mt-2">
                                <option value="">Select Staff...</option>
                                {activeStaff.map(s => {
                                    // CORRECTION: Affichage propre du Full Name dans le dropdown
                                    const fullName = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.fullName || '';
                                    return (
                                        <option key={s.id} value={s.id}>
                                            {s.nickname ? `${s.nickname} (${fullName})` : fullName}
                                        </option>
                                    );
                                })}
                            </select>
                        )}
                    </div>

                    {error && <p className="text-red-400 text-sm bg-red-900/30 p-2 rounded-md">{error}</p>}
                </div>

                <div className="flex justify-between items-center p-4 border-t border-gray-700 bg-gray-800/50 rounded-b-xl shrink-0">
                    <button onClick={onClose} disabled={isGenerating} className="px-4 py-2 text-sm text-gray-400 hover:text-white font-medium transition-colors border border-transparent hover:border-gray-700 rounded-lg disabled:opacity-50">Cancel</button>
                    <div className="flex gap-2">
                        <button onClick={() => handleGenerate('csv')} disabled={isGenerating || (targetType !== 'all' && !targetId)} className="flex items-center px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg font-bold text-sm transition-all shadow-lg active:scale-95">
                            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />} CSV
                        </button>
                        <button onClick={() => handleGenerate('pdf')} disabled={isGenerating || (targetType !== 'all' && !targetId)} className="flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg font-bold text-sm transition-all shadow-lg active:scale-95">
                            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} PDF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}