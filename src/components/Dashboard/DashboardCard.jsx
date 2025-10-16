import React from 'react';

export const DashboardCard = ({ title, children, className = '' }) => (
    <div className={`bg-gray-800 rounded-lg shadow-lg ${className}`}>
        <h3 className="text-lg font-semibold text-white mb-4 px-4 pt-4">{title}</h3>
        <div className="p-4 pt-0">{children}</div>
    </div>
);