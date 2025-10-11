import React from 'react';

export default function FinancialsDashboardPage({ db, user, staffList }) {
    return (
        <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Financials Dashboard</h2>
            <div className="bg-gray-800 rounded-lg p-6">
                <p className="text-gray-400">This page will soon display a live estimate of your current pay, active loans, and other financial details.</p>
            </div>
        </div>
    );
}