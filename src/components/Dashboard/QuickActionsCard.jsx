import React from 'react';
import { Plane, CalendarDays, FileText } from 'lucide-react';

// A small helper component for the buttons
const ActionButton = ({ onClick, icon, label }) => {
    const Icon = icon;
    return (
        <button 
            onClick={onClick} 
            className="w-full flex items-center p-4 bg-gray-700 rounded-lg transition-colors hover:bg-gray-600 text-left"
        >
            <Icon className="w-5 h-5 text-amber-400 mr-3" />
            <span className="text-white font-medium">{label}</span>
        </button>
    );
};

export const QuickActionsCard = ({ setCurrentPage }) => (
    <div className="bg-gray-800 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4 px-4 pt-4">Quick Actions</h3>
        <div className="p-4 pt-0">
            <div className="space-y-3">
                <ActionButton onClick={() => setCurrentPage('leave')} icon={Plane} label="Request Leave" />
                <ActionButton onClick={() => setCurrentPage('planning')} icon={CalendarDays} label="View My Schedule" />
                <ActionButton onClick={() => setCurrentPage('my-payslips')} icon={FileText} label="View My Payslips" />
            </div>
        </div>
    </div>
);