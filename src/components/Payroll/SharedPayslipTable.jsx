// src/components/Payroll/SharedPayslipTable.jsx
import React from 'react';
import { Landmark, Banknote } from 'lucide-react';
import StatusBadge from '../common/StatusBadge'; // <-- IMPORT DU BADGE

const formatCurrency = (num) => num ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

export default function SharedPayslipTable({ 
    data,                // Array of payslips (doit inclure staffName, branchName et department)
    selectedIds,         // Set() des IDs sélectionnés
    sortConfig,          // { key: 'staffName', direction: 'asc' }
    onSort,              // Fonction pour changer le tri
    onToggleSelectAll,   // Fonction pour tout sélectionner/désélectionner
    onToggleSelectOne,   // Fonction pour sélectionner unitairement
    onRowClick           // Fonction pour ouvrir les détails
}) {
    const allSelected = data.length > 0 && selectedIds.size === data.length;

    return (
        <table className="min-w-full text-left">
            <thead className="bg-gray-700 text-xs font-medium text-gray-300 uppercase tracking-wider">
                <tr>
                    <th className="p-4 w-4 text-center">
                        <input 
                            type="checkbox" 
                            checked={allSelected} 
                            onChange={onToggleSelectAll} 
                            className="rounded border-gray-600 bg-gray-900 text-indigo-500 focus:ring-indigo-500"
                        />
                    </th>
                    <th onClick={() => onSort('staffName')} className="px-4 py-3 cursor-pointer hover:text-white">
                        Staff Member {sortConfig.key === 'staffName' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th onClick={() => onSort('totalEarnings')} className="px-4 py-3 cursor-pointer hover:text-white text-right">
                        Total Earnings {sortConfig.key === 'totalEarnings' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th onClick={() => onSort('totalDeductions')} className="px-4 py-3 cursor-pointer hover:text-white text-right">
                        Total Deductions {sortConfig.key === 'totalDeductions' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th onClick={() => onSort('netPay')} className="px-4 py-3 cursor-pointer hover:text-white text-right">
                        Net Pay {sortConfig.key === 'netPay' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </th>
                    <th onClick={() => onSort('paymentMethod')} className="px-4 py-3 cursor-pointer hover:text-white">
                        Method {sortConfig.key === 'paymentMethod' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                    </th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50 bg-gray-800">
                {data.map(p => (
                    <tr key={p.id} onClick={() => onRowClick(p)} className="hover:bg-gray-700 cursor-pointer transition-colors">
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input 
                                type="checkbox" 
                                checked={selectedIds.has(p.id)} 
                                onChange={(e) => {
                                    e.stopPropagation();
                                    onToggleSelectOne(p.id);
                                }} 
                                className="rounded border-gray-600 bg-gray-900 text-indigo-500 focus:ring-indigo-500"
                            />
                        </td>
                        <td className="px-4 py-3 text-sm text-white flex items-center">
                            <div>
                                <div className="font-medium flex items-center">
                                    {p.staffName}
                                    {/* --- UTILISATION DU BADGE DYNAMIQUE --- */}
                                    {p.branchName && (
                                        <StatusBadge type="branch" status={p.branchName} />
                                    )}
                                </div>
                                <div className="text-[10px] text-gray-500 font-normal">{p.department || 'N/A'}</div>
                            </div>
                        </td>
                        
                        <td className="px-4 py-3 text-sm text-gray-300 text-right">{formatCurrency(p.totalEarnings)}</td>
                        <td className="px-4 py-3 text-sm text-gray-300 text-right">{formatCurrency(p.totalDeductions)}</td>
                        <td className={`px-4 py-3 text-sm font-bold text-right ${p.netPay < 0 ? 'text-red-500' : 'text-amber-400'}`}>
                            {formatCurrency(p.netPay)}
                            {p.netPay < 0 && <span className="block text-[9px] text-red-400 font-normal">(Negative)</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                            {p.paymentMethod === 'cash' ? (
                                <span className="flex items-center w-max text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded border border-emerald-500/20">
                                    <Banknote className="w-3 h-3 mr-1" /> CASH
                                </span>
                            ) : (
                                <span className="flex items-center w-max text-[10px] font-bold bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">
                                    <Landmark className="w-3 h-3 mr-1" /> BANK
                                </span>
                            )}
                        </td>
                    </tr>
                ))}
                {data.length === 0 && (
                    <tr>
                        <td colSpan="6" className="px-6 py-10 text-center text-gray-500">No records to display.</td>
                    </tr>
                )}
            </tbody>
        </table>
    );
}