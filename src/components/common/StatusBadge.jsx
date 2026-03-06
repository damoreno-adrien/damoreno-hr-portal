// src/components/common/StatusBadge.jsx
import React from 'react';

export default function StatusBadge({ status }) {
    const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full flex-shrink-0";
    if (status === 'approved') return <span className={`${baseClasses} bg-green-600 text-green-100`}>Approved</span>;
    if (status === 'rejected') return <span className={`${baseClasses} bg-red-600 text-red-100`}>Rejected</span>;
    return <span className={`${baseClasses} bg-yellow-600 text-yellow-100`}>Pending</span>;
}