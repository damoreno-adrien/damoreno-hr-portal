/* src/components/Attendance/FinancialAdjustmentsCalculator.jsx */
import React, { useMemo } from 'react';
import { X, Calculator, AlertTriangle, Clock, TrendingUp } from 'lucide-react';

const getStaffCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) return null;
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = a.startDate ? new Date(a.startDate) : new Date(0);
        const dateB = b.startDate ? new Date(b.startDate) : new Date(0);
        return dateB - dateA;
    })[0];
};

const getDisplayName = (staff) => {
    if (!staff) return 'Unknown Staff';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName && staff.lastName) return `${staff.firstName} ${staff.lastName}`;
    return staff.firstName || staff.fullName || 'Unknown Staff';
};

const formatCurrency = (num) => {
    const safeNum = Number(num) || 0;
    return safeNum.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

// --- FALLBACK CONSTANTS (used ONLY when the contract is missing this info) ---
const DEFAULT_HOURS_PER_DAY = 8;
const DEFAULT_DAYS_PER_MONTH = 30;

/**
 * Derives { dailyRate, hourlyRate, hasContractInfo, payTypeLabel } from a job's
 * actual contract terms, instead of hardcoding 30 days / 8 hours.
 *
 * Supported payType values: 'Salary' (monthly), 'Daily', 'Hourly'.
 * Falls back gracefully (and safely, avoiding NaN/Infinity) when fields are missing.
 */
const deriveRatesFromJob = (currentJob) => {
    if (!currentJob) {
        return { dailyRate: 0, hourlyRate: 0, hasContractInfo: false, payTypeLabel: 'N/A' };
    }

    const payType = currentJob.payType || 'Salary';

    // Hours worked per standard day. Multiple possible field names supported for robustness.
    const hoursPerDay = Number(currentJob.standardDayHours ?? currentJob.hoursPerDay) || DEFAULT_HOURS_PER_DAY;

    // Days used to convert a monthly salary into a daily rate.
    const daysPerMonth = Number(currentJob.daysPerMonth ?? currentJob.workingDaysPerMonth) || DEFAULT_DAYS_PER_MONTH;

    let dailyRate = 0;
    let hourlyRate = 0;
    let hasContractInfo = true;

    if (payType === 'Hourly') {
        // baseSalary is unreliable here; prefer explicit hourlyRate/payRate fields.
        hourlyRate = Number(currentJob.hourlyRate ?? currentJob.payRate ?? currentJob.rate) || 0;
        dailyRate = hourlyRate * hoursPerDay;
        if (hourlyRate === 0) hasContractInfo = false;
    } else if (payType === 'Daily') {
        // baseSalary (or equivalent) already represents the daily rate for this contract.
        dailyRate = Number(currentJob.dailyRate ?? currentJob.baseSalary ?? currentJob.payRate ?? currentJob.rate) || 0;
        hourlyRate = hoursPerDay > 0 ? dailyRate / hoursPerDay : 0;
        if (dailyRate === 0) hasContractInfo = false;
    } else {
        // Default: 'Salary' / Monthly contracts.
        const baseSalary = Number(currentJob.baseSalary ?? currentJob.rate) || 0;
        dailyRate = daysPerMonth > 0 ? baseSalary / daysPerMonth : 0;
        hourlyRate = hoursPerDay > 0 ? dailyRate / hoursPerDay : 0;
        if (baseSalary === 0) hasContractInfo = false;
    }

    return { dailyRate, hourlyRate, hasContractInfo, payTypeLabel: payType };
};

export default function FinancialAdjustmentsCalculator({ isOpen, onClose, reportData = [], staffList = [] }) {

    const adjustmentsByStaff = useMemo(() => {
        if (!reportData || reportData.length === 0) return [];

        // 1. Group reportData by staffId
        const grouped = new Map();
        reportData.forEach(row => {
            if (!grouped.has(row.staffId)) grouped.set(row.staffId, []);
            grouped.get(row.staffId).push(row);
        });

        const OT_MULTIPLIER = 1.5;

        const results = [];
        grouped.forEach((rows, staffId) => {
            const staff = staffList.find(s => s.id === staffId);
            const currentJob = getStaffCurrentJob(staff);

            const { dailyRate, hourlyRate, hasContractInfo, payTypeLabel } = deriveRatesFromJob(currentJob);
            const minuteRate = hourlyRate / 60;

            let totalLateMinutes = 0;
            let totalOtMinutes = 0;
            let absenceCount = 0;

            rows.forEach(row => {
                totalLateMinutes += Number(row.rawLateMinutes) || 0;
                totalOtMinutes += Number(row.rawOtMinutes) || 0;
                if (row.status === 'Absent') absenceCount += 1;
            });

            const totalOtHours = totalOtMinutes / 60;

            const latenessDeduction = minuteRate * totalLateMinutes;
            const absenceDeduction = dailyRate * absenceCount;
            const otAddition = hourlyRate * totalOtHours * OT_MULTIPLIER;

            const netAdjustment = otAddition - latenessDeduction - absenceDeduction;

            results.push({
                staffId,
                staffName: getDisplayName(staff),
                payTypeLabel,
                dailyRate,
                hourlyRate,
                hasContractInfo,
                totalLateMinutes,
                totalOtHours,
                absenceCount,
                latenessDeduction,
                absenceDeduction,
                otAddition,
                netAdjustment
            });
        });

        // Sort alphabetically by staff name for a stable, readable list
        results.sort((a, b) => a.staffName.localeCompare(b.staffName));

        return results;
    }, [reportData, staffList]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[200] p-4 animate-fadeIn">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] border border-gray-700 flex flex-col">

                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-gray-700 shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Calculator className="h-5 w-5 text-purple-400" /> Financial Adjustments Calculator
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Recommended pay adjustments based on the currently filtered attendance report.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 bg-gray-700/50 rounded-lg">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1 bg-gray-800/40">
                    {adjustmentsByStaff.length === 0 ? (
                        <div className="text-center py-10 text-gray-500 italic text-sm">
                            No attendance data available to calculate adjustments. Generate a report first.
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-700">
                            <table className="min-w-full">
                                <thead className="bg-gray-900/60">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-300 uppercase">Staff Member</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-300 uppercase">Pay Rate</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-300 uppercase">Lateness</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-300 uppercase">Absences</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-300 uppercase">Overtime</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-300 uppercase">Net Adjustment</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700 bg-gray-800/60">
                                    {adjustmentsByStaff.map(item => (
                                        <tr key={item.staffId} className="hover:bg-gray-700/40 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">
                                                {item.staffName}
                                                {!item.hasContractInfo && (
                                                    <span
                                                        title="No pay rate found on record for this contract type. Amounts default to 0."
                                                        className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase text-amber-400 bg-amber-900/30 border border-amber-700/40 px-1.5 py-0.5 rounded"
                                                    >
                                                        <AlertTriangle className="h-3 w-3" /> No Rate
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400 font-mono">
                                                <div className="flex flex-col">
                                                    <span>{formatCurrency(item.dailyRate)} THB / day</span>
                                                    <span className="text-gray-500">{formatCurrency(item.hourlyRate)} THB / hr &middot; {item.payTypeLabel}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-xs">
                                                {item.totalLateMinutes > 0 ? (
                                                    <span className="text-yellow-400 font-medium flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {item.totalLateMinutes}m Late
                                                        <span className="text-gray-500 ml-1">
                                                            (-{formatCurrency(item.latenessDeduction)} THB)
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-xs">
                                                {item.absenceCount > 0 ? (
                                                    <span className="text-red-400 font-medium flex items-center gap-1">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        {item.absenceCount} Absence{item.absenceCount > 1 ? 's' : ''}
                                                        <span className="text-gray-500 ml-1">
                                                            (-{formatCurrency(item.absenceDeduction)} THB)
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-xs">
                                                {item.totalOtHours > 0 ? (
                                                    <span className="text-green-400 font-medium flex items-center gap-1">
                                                        <TrendingUp className="h-3 w-3" />
                                                        {item.totalOtHours.toFixed(1)}h OT
                                                        <span className="text-gray-500 ml-1">
                                                            (+{formatCurrency(item.otAddition)} THB)
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500">-</span>
                                                )}
                                            </td>
                                            <td className={`px-4 py-3 whitespace-nowrap text-sm font-bold text-right ${
                                                item.netAdjustment > 0 ? 'text-green-400' :
                                                item.netAdjustment < 0 ? 'text-red-400' : 'text-gray-400'
                                            }`}>
                                                {item.netAdjustment > 0 ? '+' : ''}{formatCurrency(item.netAdjustment)} THB
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end p-4 border-t border-gray-700 bg-gray-800/50 rounded-b-xl shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-300 hover:text-white font-medium transition-colors border border-gray-600 hover:border-gray-500 rounded-lg"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
