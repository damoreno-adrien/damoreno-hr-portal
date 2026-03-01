import React, { useState, useMemo, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { X, AlertTriangle, Calendar, Info, CheckCircle, Save, Loader2 } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';

export default function OffboardingModal({ db, staff, companyConfig, onClose, onSuccess }) {
    const [endDate, setEndDate] = useState(dateUtils.formatISODate(new Date()));
    const [terminationType, setTerminationType] = useState('resignation'); 
    const [payoutAnnual, setPayoutAnnual] = useState(false);
    const [payoutPH, setPayoutPH] = useState(false);
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    // --- NEW: State to hold the dynamically calculated leave balances ---
    const [leaveBalances, setLeaveBalances] = useState({ annual: 0, ph: 0, loading: true });

    // Calculate Seniority & Eligibility on the fly
    const { monthsOfService, isEligibleForAnnualPayout } = useMemo(() => {
        if (!staff?.startDate) return { monthsOfService: 0, isEligibleForAnnualPayout: false };
        
        let hireDate = new Date();
        if (staff.startDate.toDate) hireDate = staff.startDate.toDate();
        else hireDate = dateUtils.parseISODateString(staff.startDate) || new Date(staff.startDate);

        const endObj = dateUtils.parseISODateString(endDate) || new Date();
        
        const months = (endObj.getFullYear() - hireDate.getFullYear()) * 12 + (endObj.getMonth() - hireDate.getMonth());
        
        return {
            monthsOfService: months,
            isEligibleForAnnualPayout: months >= 12
        };
    }, [staff, endDate]);

    // Auto-toggle Annual Leave payout based on Thai Law
    useEffect(() => {
        if (isEligibleForAnnualPayout && terminationType !== 'dismissed') {
            setPayoutAnnual(true);
        } else {
            setPayoutAnnual(false);
        }
    }, [isEligibleForAnnualPayout, terminationType]);

    // --- NEW: Fetch and calculate remaining leave based on the selected endDate ---
    useEffect(() => {
        const fetchAndCalculateBalances = async () => {
            setLeaveBalances(prev => ({ ...prev, loading: true }));
            try {
                const endObj = dateUtils.parseISODateString(endDate) || new Date();
                const currentYear = endObj.getFullYear();
                
                let hireDate = new Date();
                if (staff.startDate) {
                    if (staff.startDate.toDate) hireDate = staff.startDate.toDate();
                    else hireDate = dateUtils.parseISODateString(staff.startDate) || new Date(staff.startDate);
                }

                // 1. Fetch their used leave for the offboarding year
                const q = query(
                    collection(db, 'leave_requests'), 
                    where('staffId', '==', staff.id), 
                    where('status', 'in', ['approved', 'pending'])
                );
                const snap = await getDocs(q);
                
                let usedAnnual = 0;
                let usedPh = 0;

                snap.docs.forEach(docSnap => {
                    const req = docSnap.data();
                    const reqDate = dateUtils.parseISODateString(req.startDate);
                    if (reqDate && reqDate.getFullYear() === currentYear) {
                        if (req.leaveType === 'Annual Leave') usedAnnual += req.totalDays;
                        if (req.leaveType === 'Public Holiday (In Lieu)') usedPh += req.totalDays;
                    }
                });

                // 2. Calculate Accrued Annual Leave
                const monthsOfServiceLocal = (endObj.getFullYear() - hireDate.getFullYear()) * 12 + (endObj.getMonth() - hireDate.getMonth());
                let annualQuota = 0;
                if (monthsOfServiceLocal >= 12) { 
                    annualQuota = Number(companyConfig.annualLeaveDays) || 0; 
                } else if (monthsOfServiceLocal > 0) {
                    annualQuota = Math.floor((Number(companyConfig.annualLeaveDays) / 12) * monthsOfServiceLocal);
                }

                // 3. Calculate Accrued Public Holidays up to the End Date
                const pastHolidays = (companyConfig.publicHolidays || []).filter(h => {
                    const d = dateUtils.parseISODateString(h.date);
                    return d && d <= endObj && d >= hireDate && d.getFullYear() === currentYear;
                });
                const phQuota = Math.min(pastHolidays.length, Number(companyConfig.publicHolidayCreditCap) || 15);

                // 4. Set final remaining balances
                setLeaveBalances({
                    annual: Math.max(0, annualQuota - usedAnnual),
                    ph: Math.max(0, phQuota - usedPh),
                    loading: false
                });

            } catch (error) {
                console.error("Failed to fetch leave for offboarding calculation:", error);
                setLeaveBalances({ annual: 0, ph: 0, loading: false });
            }
        };

        fetchAndCalculateBalances();
    }, [db, staff, endDate, companyConfig]);

    const handleOffboard = async () => {
        if (!endDate) return alert("Please select a final working date.");
        
        if (!window.confirm(`Are you sure you want to offboard ${staff.firstName || staff.nickname}? This will mark their profile as inactive.`)) return;

        setIsSaving(true);
        try {
            const staffRef = doc(db, 'staff_profiles', staff.id);
            await updateDoc(staffRef, {
                status: 'inactive',
                endDate: endDate,
                offboardingSettings: {
                    terminationType,
                    payoutAnnualLeave: payoutAnnual,
                    payoutPublicHolidays: payoutPH,
                    // Save the calculated balances so the payroll generator has a snapshot!
                    finalBalances: {
                        annual: leaveBalances.annual,
                        ph: leaveBalances.ph
                    },
                    notes,
                    processedAt: serverTimestamp()
                }
            });
            onSuccess();
        } catch (error) {
            console.error("Error offboarding staff:", error);
            alert("Failed to offboard staff member.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700 overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-white">Offboard Staff Member</h2>
                        <p className="text-sm text-gray-400">Process departure for {staff.firstName || staff.nickname}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-6">
                    
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Last Working Day</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input 
                                    type="date" 
                                    value={endDate} 
                                    onChange={(e) => setEndDate(e.target.value)} 
                                    className="w-full bg-gray-900 text-white pl-10 p-2.5 rounded-lg border border-gray-700 focus:border-amber-500 outline-none" 
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Reason for Leaving</label>
                            <select 
                                value={terminationType} 
                                onChange={(e) => setTerminationType(e.target.value)}
                                className="w-full bg-gray-900 text-white p-2.5 rounded-lg border border-gray-700 focus:border-amber-500 outline-none"
                            >
                                <option value="resignation">Resignation</option>
                                <option value="contract_end">End of Contract</option>
                                <option value="dismissed">Dismissed (Terminated)</option>
                            </select>
                        </div>
                    </div>

                    <hr className="border-gray-700" />

                    {/* Leave Payout Toggles */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Final Payroll Settings</h3>
                        
                        {/* Annual Leave Toggle */}
                        <div className={`p-4 rounded-lg border transition-colors ${payoutAnnual ? 'bg-amber-900/20 border-amber-500/50' : 'bg-gray-900/50 border-gray-700'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-white">Pay out unused Annual Leave</span>
                                <div className="flex items-center gap-3">
                                    {/* --- NEW: Display the calculated Annual balance --- */}
                                    {leaveBalances.loading ? (
                                        <span className="text-xs text-gray-500">Calc...</span>
                                    ) : (
                                        <span className="text-sm font-bold text-amber-400">{leaveBalances.annual} Days</span>
                                    )}
                                    <input 
                                        type="checkbox" 
                                        checked={payoutAnnual} 
                                        onChange={(e) => setPayoutAnnual(e.target.checked)}
                                        className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500"
                                    />
                                </div>
                            </div>
                            
                            {isEligibleForAnnualPayout ? (
                                <p className="text-xs text-green-400 flex items-center gap-1 mt-2">
                                    <CheckCircle className="w-3 h-3" /> Staff has {monthsOfService} months seniority. Payout is standard.
                                </p>
                            ) : (
                                <p className="text-xs text-amber-500 flex items-center gap-1 mt-2">
                                    <AlertTriangle className="w-3 h-3" /> Under 1 Year Seniority ({monthsOfService} mos). Payout is not strictly required.
                                </p>
                            )}
                            {terminationType === 'dismissed' && (
                                <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
                                    <Info className="w-3 h-3" /> Staff dismissed. Payout may be forfeited depending on cause.
                                </p>
                            )}
                        </div>

                        {/* Public Holiday Toggle */}
                        <div className={`p-4 rounded-lg border transition-colors ${payoutPH ? 'bg-blue-900/20 border-blue-500/50' : 'bg-gray-900/50 border-gray-700'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-white">Pay out unused Public Holidays</span>
                                <div className="flex items-center gap-3">
                                    {/* --- NEW: Display the calculated PH balance --- */}
                                    {leaveBalances.loading ? (
                                        <span className="text-xs text-gray-500">Calc...</span>
                                    ) : (
                                        <span className="text-sm font-bold text-blue-400">{leaveBalances.ph} Credits</span>
                                    )}
                                    <input 
                                        type="checkbox" 
                                        checked={payoutPH} 
                                        onChange={(e) => setPayoutPH(e.target.checked)}
                                        className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">Includes any accrued holiday credits not yet taken.</p>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Offboarding Notes (Internal)</label>
                        <textarea 
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Return of uniforms, keys, reasons for leaving..."
                            className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-700 focus:border-amber-500 outline-none min-h-[80px] resize-none text-sm"
                        />
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-lg transition-colors border border-gray-700">
                        Cancel
                    </button>
                    <button onClick={handleOffboard} disabled={isSaving || leaveBalances.loading} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-red-900/20">
                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {isSaving ? "Processing..." : "Confirm Offboarding"}
                    </button>
                </div>

            </div>
        </div>
    );
}