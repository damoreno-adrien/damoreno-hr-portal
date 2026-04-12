/* src/components/Settings/SystemLogsViewer.jsx */

import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { Activity, Search, Clock, User, ShieldAlert, Filter } from 'lucide-react';

export const SystemLogsViewer = ({ db, activeBranch, branches = [] }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchLogs = async () => {
            setLoading(true);
            try {
                // Astuce : On récupère les 200 derniers logs globaux puis on filtre en JavaScript
                // Cela évite de devoir créer un "Composite Index" complexe dans Firebase pour le moment.
                const logsQuery = query(collection(db, 'system_logs'), orderBy('timestamp', 'desc'), limit(200));
                const snapshot = await getDocs(logsQuery);
                
                let fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Filtrage par succursale si on n'est pas en vue globale
                if (activeBranch !== 'global') {
                    fetchedLogs = fetchedLogs.filter(log => log.branchId === activeBranch || log.branchId === 'global');
                }

                setLogs(fetchedLogs);
            } catch (error) {
                console.error("Error fetching system logs:", error);
            } finally {
                setLoading(false);
            }
        };

        if (db) {
            fetchLogs();
        }
    }, [db, activeBranch]);

    const formatTime = (timestamp) => {
        if (!timestamp) return 'Unknown Date';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return new Intl.DateTimeFormat('en-GB', { 
            day: '2-digit', month: 'short', year: 'numeric', 
            hour: '2-digit', minute: '2-digit', second: '2-digit' 
        }).format(date);
    };

    const getBranchName = (branchId) => {
        if (!branchId || branchId === 'global') return 'Global System';
        const branch = branches.find(b => b.id === branchId);
        return branch ? branch.name.replace('Da Moreno ', '') : branchId;
    };

    const filteredLogs = logs.filter(log => {
        const searchLower = searchTerm.toLowerCase();
        return (
            (log.actionType && log.actionType.toLowerCase().includes(searchLower)) ||
            (log.userEmail && log.userEmail.toLowerCase().includes(searchLower)) ||
            (log.details && log.details.toLowerCase().includes(searchLower))
        );
    });

    return (
        <div id="system-logs" className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="bg-gray-900/50 p-6 border-b border-gray-700">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                            <Activity className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Audit Trail & System Logs</h3>
                            <p className="text-sm text-gray-400">Read-only history of critical administrative actions.</p>
                        </div>
                    </div>
                    
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Search logs..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white focus:border-indigo-500 outline-none w-full md:w-64"
                        />
                    </div>
                </div>
            </div>

            <div className="p-0">
                {loading ? (
                    <div className="flex justify-center items-center p-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="text-center p-12 border-b border-gray-700">
                        <ShieldAlert className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium">No system logs found for this branch.</p>
                        <p className="text-sm text-gray-500 mt-1">Critical actions will appear here once performed.</p>
                    </div>
                ) : (
                    <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-900/80 sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Date & Time</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">User</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Action</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700 bg-gray-800">
                                {filteredLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-700/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center text-sm text-gray-300">
                                                <Clock className="w-4 h-4 mr-2 text-gray-500" />
                                                {formatTime(log.timestamp)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center text-sm text-gray-300">
                                                <User className="w-4 h-4 mr-2 text-gray-500" />
                                                {log.userEmail}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="px-2.5 py-1 inline-flex text-[10px] leading-5 font-bold rounded-full bg-blue-900/40 text-blue-400 border border-blue-800/50">
                                                {log.actionType}
                                            </span>
                                            {activeBranch === 'global' && (
                                                <div className="mt-1 flex items-center text-[10px] text-gray-500">
                                                    <Filter className="w-3 h-3 mr-1" /> {getBranchName(log.branchId)}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-300 min-w-[300px]">
                                            {log.details}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};