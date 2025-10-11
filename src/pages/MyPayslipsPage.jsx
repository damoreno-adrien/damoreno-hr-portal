import React from 'react';

export default function MyPayslipsPage({ db, user, companyConfig }) {
    return (
        <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">My Payslips</h2>
            <div className="bg-gray-800 rounded-lg p-6">
                <p className="text-gray-400">This page will soon display a history of all your past payslips.</p>
            </div>
        </div>
    );
}