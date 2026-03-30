import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { RotateCcw, Filter, Search, ShieldAlert, Clock, CheckCircle, XCircle } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils'; // Adjust path as needed

export default function HRActionLog({ db }) {
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Filters
    const [filterType, setFilterType] = useState('All');
    const [filterStaff, setFilterStaff] = useState('');

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            // Fetch everything that is NOT pending
            const q = query(collection(db, 'manager_alerts'), where('status', 'in', ['approved', 'enforced', 'dismissed', 'revoked']));
            const snap = await getDocs(q);
            
            const fetchedLogs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort newest first
            
            setLogs(fetchedLogs);
        } catch (error) {
            console.error("Error fetching HR logs:", error);
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
            // Update local state to show it was revoked
            setLogs(prev => prev.map(log => log.id === logId ? { ...log, status: 'revoked' } : log));
        } catch (error) {
            alert("Failed to revoke action: " + error.message);
        }
    };

    const filteredLogs = logs.filter(log => {
        if (filterType !== 'All' && !log.type.includes(filterType.toLowerCase())) return false;
        if (filterStaff && !log.staffName.toLowerCase().includes(filterStaff.toLowerCase())) return false;
        return true;
    });

    const getTypeDetails = (type) => {
        if (type === 'overtime_request') return { icon: <Clock className="h-4 w-4 text-blue-400"/>, label: "Overtime" };
        if (type === 'risk_late' || type === 'risk_absence') return { icon: <ShieldAlert className="h-4 w-4 text-red-400"/>, label: "Disciplinary" };
        return { icon: <Filter className="h-4 w-4 text-gray-400"/>, label: "Other" };
    };

    return (
        <div className="overflow-hidden">
            <div className="p-6 border-b border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl font-bold text-white">Central HR Action Log</h2>
                
                <div className="flex space-x-3 w-full sm:w-auto">
                    <div className="relative flex-grow sm:flex-grow-0">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input type="text" placeholder="Search staff..." value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)} className="pl-9 pr-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white focus:ring-indigo-500 w-full" />
                    </div>
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white">
                        <option value="All">All Actions</option>
                        <option value="overtime">Overtime Only</option>
                        <option value="risk">Disciplinary Only</option>
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-900/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Staff Member</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Original Message</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {isLoading ? (
                            <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500">Loading history...</td></tr>
                        ) : filteredLogs.length > 0 ? (
                            filteredLogs.map(log => {
                                const { icon, label } = getTypeDetails(log.type);
                                return (
                                    <tr key={log.id} className="hover:bg-gray-700/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{log.date}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-white">{log.staffName}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 flex items-center">{icon} <span className="ml-2">{label}</span></td>
                                        <td className="px-6 py-4 text-sm text-gray-400 max-w-xs truncate" title={log.message}>{log.message}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {log.status === 'approved' || log.status === 'enforced' ? <span className="px-2 py-1 bg-green-900/50 text-green-400 rounded text-xs border border-green-700/50 flex items-center w-max"><CheckCircle className="w-3 h-3 mr-1"/> {log.status.toUpperCase()}</span> : 
                                             log.status === 'dismissed' ? <span className="px-2 py-1 bg-gray-800 text-gray-400 rounded text-xs border border-gray-600 flex items-center w-max"><XCircle className="w-3 h-3 mr-1"/> DISMISSED</span> :
                                             <span className="px-2 py-1 bg-red-900/50 text-red-400 rounded text-xs border border-red-700/50 flex items-center w-max"><RotateCcw className="w-3 h-3 mr-1"/> REVOKED</span>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {log.status !== 'revoked' && (
                                                <button onClick={() => handleRevoke(log.id, log.staffName, log.type)} className="text-gray-400 hover:text-red-400 flex items-center justify-end w-full transition-colors">
                                                    <RotateCcw className="h-4 w-4 mr-1" /> Undo
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500">No matching HR history found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}