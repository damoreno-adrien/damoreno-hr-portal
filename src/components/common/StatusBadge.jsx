// src/components/common/StatusBadge.jsx
import React from 'react';

export default function StatusBadge({ status }) {
    const safeStatus = (status || '').toLowerCase();

    // Dictionnaire universel des statuts (congés, avances, prêts, etc.)
    const statusMap = {
        // Base
        pending: "bg-yellow-500/20 text-yellow-300",
        approved: "bg-green-500/20 text-green-300",
        rejected: "bg-red-500/20 text-red-300",
        
        // Finances & Paie
        paid: "bg-blue-500/20 text-blue-300",
        active: "bg-emerald-500/20 text-emerald-300",
        paid_off: "bg-gray-500/20 text-gray-400",
        applied: "bg-indigo-500/20 text-indigo-300",
        deducted: "bg-purple-500/20 text-purple-300"
    };

    const badgeClass = statusMap[safeStatus] || "bg-gray-500/20 text-gray-300";

    // Formate joliment le texte (ex: "paid_off" devient "Paid Off")
    const formatText = (str) => {
        if (!str) return 'Unknown';
        return str.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    return (
        <span className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap flex-shrink-0 ${badgeClass}`}>
            {formatText(safeStatus)}
        </span>
    );
}