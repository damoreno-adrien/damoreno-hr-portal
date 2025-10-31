import React from 'react';

export const StatItem = ({ icon, label, value, colorClass }) => (
    <div className="flex items-start space-x-3">
        <div className={`p-2 rounded-full bg-${colorClass}-500/20`}>
            {React.createElement(icon, { className: `w-5 h-5 text-${colorClass}-400` })}
        </div>
        <div>
            <p className="text-sm text-gray-400">{label}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
    </div>
);