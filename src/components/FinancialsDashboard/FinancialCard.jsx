import React from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

export const FinancialCard = ({ title, isVisible, onToggle, children, className = '', onClick }) => (
    <div 
        className={`bg-gray-800 rounded-lg shadow-lg ${className} ${onClick ? 'cursor-pointer hover:bg-gray-700 transition-colors' : ''}`}
        onClick={onClick}
    >
        <div className="flex justify-between items-center px-4 pt-4 mb-4">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {onToggle && (
                <button
                    onClick={(e) => { if (onClick) e.stopPropagation(); onToggle(); }}
                    className="text-gray-400 hover:text-white transition-colors"
                    title={isVisible ? 'Hide amounts' : 'Show amounts'}
                >
                    {isVisible ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
            )}
        </div>
        <div className="p-4 pt-0">{children}</div>
    </div>
);