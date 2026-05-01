import React from 'react';

export default function FinancialSummaryCard({ title, value, subText, icon: Icon, color = "blue", isActive, onClick, isCurrency = true }) {
    const colorClasses = { 
        blue: "bg-blue-500/10 border-blue-500/50 text-blue-400", 
        green: "bg-green-500/10 border-green-500/50 text-green-400", 
        red: "bg-red-500/10 border-red-500/50 text-red-400", 
        amber: "bg-amber-500/10 border-amber-500/50 text-amber-400", 
        purple: "bg-purple-500/10 border-purple-500/50 text-purple-400", 
        inactive: "bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500" 
    };

    return (
        <div onClick={onClick} className={`p-6 rounded-lg border backdrop-blur-sm cursor-pointer transition-all duration-200 transform hover:-translate-y-1 ${isActive ? colorClasses[color] : colorClasses.inactive}`}>
            <div className="flex items-center justify-between mb-2">
                <h4 className={`text-sm font-medium ${isActive ? 'text-gray-200' : 'text-gray-500'}`}>{title}</h4>
                <Icon className="h-5 w-5" />
            </div>
            <div className={`text-2xl font-bold mb-1 ${isActive ? 'text-white' : 'text-gray-300'}`}>
                {isCurrency ? (typeof value === 'number' ? value.toLocaleString('en-US', { style: 'currency', currency: 'THB' }) : value) : value}
            </div>
            {subText && <div className={`text-xs font-medium ${isActive ? 'text-gray-400' : 'text-gray-500'}`}>{subText}</div>}
        </div>
    );
}