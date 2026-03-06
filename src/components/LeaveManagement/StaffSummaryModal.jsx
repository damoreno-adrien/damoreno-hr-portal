// src/components/LeaveManagement/StaffSummaryModal.jsx
import React, { useMemo } from 'react';
import { calculateStaffLeaveBalances } from '../../utils/leaveCalculator';

export default function StaffSummaryModal({ staff, allRequests, companyConfig }) {
    const balances = useMemo(() => calculateStaffLeaveBalances(staff, allRequests, companyConfig), [staff, allRequests, companyConfig]);
    if (!balances) return <p className="text-gray-400 p-4">Loading data...</p>;

    const StatCard = ({ title, data, color, isPH }) => (
        <div className={`p-5 rounded-xl border bg-gray-800 shadow-md flex flex-col justify-between ${color.border}`}>
            <div>
                <h4 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-3">{title}</h4>
                <div className="flex justify-between items-end">
                    <div>
                        <p className="text-3xl font-black text-white">{data.remaining}</p>
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-1">Remaining</p>
                    </div>
                    <div className="text-right">
                        {data.isLocked ? (
                            <div className="flex flex-col items-end">
                                <span className="text-amber-500 text-[11px] font-bold bg-amber-500/10 px-2 py-1 rounded">🔒 Locked (&lt; 1 Yr)</span>
                                <span className="text-gray-400 text-[10px] mt-1 font-medium">{data.accrued} Days Accrued</span>
                            </div>
                        ) : isPH ? (
                            <div className="flex flex-col items-end">
                                <span className="text-green-400 font-bold text-sm">{data.cashable} Cashable</span>
                                <p className="text-xs text-gray-500 mt-0.5">{data.used} Used Lifetime</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-sm font-bold text-gray-300">{data.used} Used</p>
                                <p className="text-xs text-gray-500 mt-0.5">/ {data.total} Total</p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* --- NEW: The Year-by-Year Breakdown UI --- */}
            {isPH && data.breakdown && Object.keys(data.breakdown).length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-700 space-y-1.5">
                    {Object.keys(data.breakdown).sort().map((year) => (
                        <div key={year} className="flex justify-between items-center text-xs">
                            <span className="text-gray-400 font-semibold">{year} Bank:</span>
                            <span className="text-blue-400 font-bold bg-blue-900/20 px-2 py-0.5 rounded border border-blue-800/50">
                                {data.breakdown[year]} {data.breakdown[year] === 1 ? 'Day' : 'Days'}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatCard title="Annual Leave" data={balances.annual} color={{ border: 'border-amber-500/40' }} />
                <StatCard title="Paid Sick Leave" data={balances.sick} color={{ border: 'border-red-500/40' }} />
                <StatCard title="Personal Leave" data={balances.personal} color={{ border: 'border-purple-500/40' }} />
                <StatCard title="Public Holiday Credits" data={balances.ph} color={{ border: 'border-blue-500/40' }} isPH={true} />
            </div>
        </div>
    );
}