import React from 'react';
import * as dateUtils from '../../utils/dateUtils'; // Use new standard

const formatCurrency = (num) => num != null ? num.toLocaleString('en-US') : '0';

const StatusBadge = ({ status }) => {
    const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full capitalize";
    const statusMap = {
        pending: "bg-yellow-500/20 text-yellow-300",
        approved: "bg-green-500/20 text-green-300",
        rejected: "bg-red-500/20 text-red-300",
        paid: "bg-blue-500/20 text-blue-300", // Assuming 'paid' might be a future status
    };
    return <span className={`${baseClasses} ${statusMap[status] || 'bg-gray-500/20 text-gray-300'}`}>{status}</span>;
};

export const RequestHistoryTable = ({ requests, isLoading }) => (
    <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
        <h3 className="text-lg font-semibold text-white p-4">Request History</h3>
        <table className="min-w-full">
            <thead className="bg-gray-700/50">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
                {isLoading ? (
                    <tr><td colSpan="3" className="text-center py-10 text-gray-500">Loading history...</td></tr>
                ) : requests.length === 0 ? (
                    <tr><td colSpan="3" className="text-center py-10 text-gray-500">You have no advance requests.</td></tr>
                ) : (
                    requests.map(req => (
                        <tr key={req.id}>
                            {/* --- Apply standard date formatting here --- */}
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{dateUtils.formatDisplayDate(req.date)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-amber-400">{formatCurrency(req.amount)} THB</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm capitalize"><StatusBadge status={req.status} /></td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
    </div>
);