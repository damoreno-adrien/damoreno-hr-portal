// src/components/LeaveManagement/StaffBalanceCard.jsx
import React, { useMemo } from 'react';
import { calculateStaffLeaveBalances } from '../../utils/leaveCalculator';

export default function StaffBalanceCard({ staff, allRequests, companyConfig }) {
    const balances = useMemo(() => calculateStaffLeaveBalances(staff, allRequests, companyConfig), [staff, allRequests, companyConfig]);

    if (!balances) return <p className="text-gray-400 mb-8">Loading balances...</p>;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className={`p-5 rounded-lg border bg-gray-800 shadow-sm flex flex-col justify-between ${balances.annual.isLocked ? 'border-amber-500/20' : 'border-gray-700'}`}>
                <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">Annual Leave</p>
                {balances.annual.isLocked ? (
                    <div>
                        <p className="text-3xl font-bold text-gray-500 mt-1">0</p>
                        <div className="mt-3 flex items-center justify-between">
                            <span className="text-amber-500 text-[11px] font-bold bg-amber-500/10 px-2 py-1 rounded">🔒 Locked (&lt; 1 Yr)</span>
                            <span className="text-gray-400 text-xs font-medium">{balances.annual.accrued} Accrued</span>
                        </div>
                    </div>
                ) : (
                    <div>
                        <p className="text-3xl font-bold text-amber-500 mt-1">{balances.annual.remaining} <span className="text-sm text-gray-400 font-normal">Remaining</span></p>
                        <p className="text-xs text-gray-500 mt-2">{balances.annual.used} Used / {balances.annual.total} Total</p>
                    </div>
                )}
            </div>

            <div className="bg-gray-800 p-5 rounded-lg border border-gray-700 shadow-sm flex flex-col justify-between">
                <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">Paid Sick Leave</p>
                <div>
                    <p className="text-3xl font-bold text-red-400 mt-1">{balances.sick.remaining} <span className="text-sm text-gray-400 font-normal">Remaining</span></p>
                    <p className="text-xs text-gray-500 mt-2">{balances.sick.used} Used / {balances.sick.total} Total</p>
                </div>
            </div>

            <div className="bg-gray-800 p-5 rounded-lg border border-gray-700 shadow-sm flex flex-col justify-between">
                <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">Personal Leave</p>
                <div>
                    <p className="text-3xl font-bold text-purple-400 mt-1">{balances.personal.remaining} <span className="text-sm text-gray-400 font-normal">Remaining</span></p>
                    <p className="text-xs text-gray-500 mt-2">{balances.personal.used} Used / {balances.personal.total} Total</p>
                </div>
            </div>

            <div className="bg-gray-800 p-5 rounded-lg border border-gray-700 shadow-sm flex flex-col justify-between">
                <div>
                    <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">Public Holiday Credits</p>
                    <div>
                        <p className="text-3xl font-bold text-blue-400 mt-1">{balances.ph.remaining} <span className="text-sm text-gray-400 font-normal">Total Remaining</span></p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                            <span className="text-green-400 font-semibold">{balances.ph.cashable} Cashable</span>
                            <span className="text-gray-500">{balances.ph.used} Used</span>
                        </div>
                    </div>
                </div>
                {balances.ph.breakdown && Object.keys(balances.ph.breakdown).length > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-700 space-y-1.5">
                        {Object.keys(balances.ph.breakdown).sort().map((year) => (
                            <div key={year} className="flex justify-between items-center text-xs">
                                <span className="text-gray-400 font-semibold">{year} Bank:</span>
                                <span className="text-blue-400 font-bold bg-blue-900/20 px-2 py-0.5 rounded border border-blue-800/50">
                                    {balances.ph.breakdown[year]} {balances.ph.breakdown[year] === 1 ? 'Day' : 'Days'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}