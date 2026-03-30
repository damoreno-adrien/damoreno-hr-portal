import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { RotateCcw, Filter, Search, ShieldAlert, Clock, CheckCircle, XCircle, Download, Calendar, Loader2 } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils'; 

export default function HRActionLog({ db }) {
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // --- Date Range Default: Last 30 Days to avoid massive data loads ---
    const defaultStart = dateUtils.addDays(new Date(), -30);
    const [startDate, setStartDate] = useState(dateUtils.formatISODate(defaultStart));
    const [endDate, setEndDate] = useState(dateUtils.formatISODate(new Date()));

    // Filters
    const [filterType, setFilterType] = useState('All');
    const [filterStaff, setFilterStaff] = useState('');

    useEffect(() => {
        fetchLogs();
    }, []); // Initial load

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            // Smart Query: Fetch by Date Range to save reads, filter status in memory
            const q = query(collection(db, 'manager_alerts'), 
                where('date', '>=', startDate),
                where('date', '<=', endDate)
            );
            const snap = await getDocs(q);
            
            const fetchedLogs = snap.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                // Filter out pending items locally
                .filter(log => ['approved', 'enforced', 'dismissed', 'revoked'].includes(log.status))
                .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort newest first
            
            setLogs(fetchedLogs);
        } catch (error) {
            console.error("Error fetching HR logs:", error);
            alert("Failed to fetch history logs.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRevoke = async (logId, staffName, type) => {
        if (!window.confirm(`Are you sure you want to revoke this decision for ${staffName}? The database will automatically adjust their payroll/bonus.`)) return;
        
        try {
            const alertRef = doc(db, 'manager_alerts', logId);
            await updateDoc(alertRef, {
                status: 'revoked',
                revokedAt: serverTimestamp()
            });
            setLogs(prev => prev.map(log => log.id === logId ? { ...log, status: 'revoked' } : log));
        } catch (error) {
            alert("Failed to revoke action: " + error.message);
        }
    };

    // --- Filter Logic ---
    const filteredLogs = logs.filter(log => {
        if (filterType !== 'All' && !log.type.includes(filterType.toLowerCase())) return false;
        if (filterStaff && !log.staffName.toLowerCase().includes(filterStaff.toLowerCase())) return false;
        return true;
    });

    // --- NEW: Grouping Logic ---
    const groupedLogs = filteredLogs.reduce((acc, log) => {
        const name = log.staffName || 'Unknown Staff';
        if (!acc[name]) acc[name] = [];
        acc[name].push(log);
        return acc;
    }, {});

    // --- NEW: CSV Export Logic ---
    const handleExportCSV = () => {
        if (filteredLogs.length === 0) {
            alert("No data to export based on current filters.");
            return;
        }

        const headers = ["Date", "Staff Member", "Type", "Original Message", "Status"];
        
        const rows = filteredLogs.map(log => {
            const friendlyType = log.type === 'overtime_request' ? 'Overtime' : log.type.includes('late') ? 'Lateness' : 'Absence';
            return [
                log.date,
                `"${log.staffName}"`, // Quotes prevent CSV breaking if names have commas
                friendlyType,
                `"${log.message || ''}"`, // Quotes prevent CSV breaking on message commas
                log.status.toUpperCase()
            ];
        });

        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n" 
            + rows.map(e => e.join(",")).join("\n");
            
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `DaMoreno_HR_History_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getTypeDetails = (type) => {
        if (type === 'overtime_request') return { icon: <Clock className="h-4 w-4 text-blue-400"/>, label: "Overtime" };
        if (type === 'risk_late' || type === 'risk_absence') return { icon: <ShieldAlert className="h-4 w-4 text-red-400"/>, label: "Disciplinary" };
        return { icon: <Filter className="h-4 w-4 text-gray-400"/>, label: "Other" };
    };

    return (
        <div className="overflow-hidden animate-fadeIn">
            
            {/* TOP CONTROLS: Date Range & Export */}
            <div className="p-4 sm:p-6 border-b border-gray-700 bg-gray-800/50 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-indigo-400" />
                    Action History Log
                </h2>
                
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                    <div className="flex items-center gap-2 bg-gray-900/50 p-1.5 rounded-lg border border-gray-700 w-full sm:w-auto">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-gray-800 text-white rounded p-1.5 text-sm border border-gray-600 focus:border-indigo-500 outline-none w-full sm:w-auto [color-scheme:dark]" />
                        <span className="text-gray-400 text-sm font-medium">to</span>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-gray-800 text-white rounded p-1.5 text-sm border border-gray-600 focus:border-indigo-500 outline-none w-full sm:w-auto [color-scheme:dark]" />
                        <button onClick={fetchLogs} disabled={isLoading} className="w-full sm:w-auto flex items-center justify-center gap-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded transition-colors disabled:opacity-50 whitespace-nowrap">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            Fetch Range
                        </button>
                    </div>

                    <button onClick={handleExportCSV} disabled={isLoading || filteredLogs.length === 0} className="w-full sm:w-auto flex items-center justify-center gap-2 text-sm font-medium bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors border border-green-600 disabled:opacity-50 disabled:cursor-not-allowed">
                        <Download className="h-4 w-4" />
                        Export CSV
                    </button>
                </div>
            </div>

            {/* SECONDARY CONTROLS: Search & Filter */}
            <div className="p-4 sm:p-6 border-b border-gray-700 flex flex-col sm:flex-row justify-between gap-4">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <input type="text" placeholder="Search staff name..." value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)} className="pl-9 pr-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white focus:ring-indigo-500 w-full" />
                </div>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white w-full sm:w-auto">
                    <option value="All">All Actions</option>
                    <option value="overtime">Overtime Only</option>
                    <option value="risk">Disciplinary Only</option>
                </select>
            </div>

            {/* CONTENT: Grouped by Staff */}
            <div className="p-4 sm:p-6 bg-gray-900/20">
                {isLoading ? (
                    <div className="py-12 flex justify-center items-center text-gray-400">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading history data...
                    </div>
                ) : filteredLogs.length > 0 ? (
                    <div className="space-y-6">
                        {Object.keys(groupedLogs).sort().map(staffName => (
                            <div key={staffName} className="bg-gray-800/80 rounded-xl border border-gray-700 overflow-hidden shadow-sm">
                                <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex justify-between items-center">
                                    <h4 className="font-bold text-white text-lg">{staffName}</h4>
                                    <span className="text-xs font-bold bg-gray-700 text-gray-300 px-2.5 py-1 rounded-md border border-gray-600">
                                        {groupedLogs[staffName].length} Record{groupedLogs[staffName].length > 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-700/50">
                                        <thead className="bg-gray-900/30">
                                            <tr>
                                                <th className="px-6 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                                                <th className="px-6 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                                                <th className="px-6 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Original Message</th>
                                                <th className="px-6 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                                                <th className="px-6 py-2.5 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700/50">
                                            {groupedLogs[staffName].map(log => {
                                                const { icon, label } = getTypeDetails(log.type);
                                                return (
                                                    <tr key={log.id} className="hover:bg-gray-700/30 transition-colors">
                                                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-300">{dateUtils.formatDisplayDate(log.date)}</td>
                                                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-300 flex items-center">{icon} <span className="ml-2">{label}</span></td>
                                                        <td className="px-6 py-3 text-sm text-gray-400 max-w-sm truncate" title={log.message}>{log.message}</td>
                                                        <td className="px-6 py-3 whitespace-nowrap">
                                                            {log.status === 'approved' || log.status === 'enforced' ? <span className="px-2 py-1 bg-green-900/30 text-green-400 rounded text-xs border border-green-700/50 flex items-center w-max"><CheckCircle className="w-3 h-3 mr-1"/> {log.status.toUpperCase()}</span> : 
                                                             log.status === 'dismissed' ? <span className="px-2 py-1 bg-gray-800 text-gray-400 rounded text-xs border border-gray-600 flex items-center w-max"><XCircle className="w-3 h-3 mr-1"/> DISMISSED</span> :
                                                             <span className="px-2 py-1 bg-red-900/30 text-red-400 rounded text-xs border border-red-700/50 flex items-center w-max"><RotateCcw className="w-3 h-3 mr-1"/> REVOKED</span>}
                                                        </td>
                                                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium">
                                                            {log.status !== 'revoked' && (
                                                                <button onClick={() => handleRevoke(log.id, log.staffName, log.type)} className="text-gray-400 hover:text-red-400 flex items-center justify-end w-full transition-colors font-bold">
                                                                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Undo
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-12 flex flex-col justify-center items-center text-gray-500 bg-gray-800/30 rounded-lg border border-gray-700/50">
                        <Search className="h-8 w-8 mb-2 opacity-50" />
                        <p>No historical HR actions found for this period/filter.</p>
                    </div>
                )}
            </div>
        </div>
    );
}