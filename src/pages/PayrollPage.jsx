/* src/pages/PayrollPage.jsx */

import React, { useState, useMemo, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import Modal from '../components/common/Modal';
import PayslipDetailView from '../components/Payroll/PayslipDetailView';
import PayrollHistory from '../components/Payroll/PayrollHistory';
import PayrollGenerator from '../components/Payroll/PayrollGenerator';
import BulkPayslipGenerator from '../components/Payroll/BulkPayslipGenerator'; // <-- IMPORT
import { FilePlus } from 'lucide-react'; // <-- Pour l'icône du bouton
import * as dateUtils from '../utils/dateUtils';

export default function PayrollPage({ db, staffList, companyConfig, activeBranch }) {
    const [selectedStaffDetails, setSelectedStaffDetails] = useState(null);
    const [isBulkGeneratorOpen, setIsBulkGeneratorOpen] = useState(false); // <-- STATE MODALE

    const [payPeriod, setPayPeriod] = useState({
        month: dateUtils.getMonth(new Date()),
        year: dateUtils.getYear(new Date())
    });

    const [selectedHistoryDetails, setSelectedHistoryDetails] = useState(null);
    const [historyPayPeriod, setHistoryPayPeriod] = useState(null);

    const [adminBranchIds, setAdminBranchIds] = useState([]);
    const [localUserRole, setLocalUserRole] = useState(null);

    useEffect(() => {
        const uid = getAuth().currentUser?.uid;
        if (uid && db) {
            getDoc(doc(db, 'users', uid)).then(snap => {
                if (snap.exists()) {
                    setAdminBranchIds(snap.data().branchIds || []);
                    setLocalUserRole(snap.data().role);
                }
            }).catch(err => console.error(err));
        }
    }, [db]);

    const handleViewHistoryDetails = (payslip, period) => {
        setSelectedHistoryDetails(payslip);
        setHistoryPayPeriod(period);
    };

    const activeStaffList = useMemo(() => {
        if (activeBranch === 'global') {
            if (localUserRole === 'admin') return staffList.filter(s => adminBranchIds.includes(s.branchId));
            return staffList;
        }
        if (activeBranch) return staffList.filter(s => s.branchId === activeBranch);
        return staffList;
    }, [staffList, activeBranch, localUserRole, adminBranchIds]);

    const resolvedConfig = useMemo(() => {
        if (!companyConfig) return null;
        if (!activeBranch || activeBranch === 'global') return companyConfig;
        const branchOverrides = companyConfig.branchSettings?.[activeBranch] || {};
        return {
            ...companyConfig,
            ...branchOverrides,
            attendanceBonus: branchOverrides.attendanceBonus || companyConfig.attendanceBonus || {},
            disciplinaryRules: branchOverrides.disciplinaryRules || companyConfig.disciplinaryRules || {},
            geofence: branchOverrides.geofence || companyConfig.geofence || {},
        };
    }, [companyConfig, activeBranch]);

    return (
        <div className="space-y-12">
            {/* MODALE DE DÉTAILS INDIVIDUELS */}
            {selectedStaffDetails && (
                <Modal isOpen={true} onClose={() => setSelectedStaffDetails(null)} title={`Payslip Details for ${selectedStaffDetails.name}`}>
                    <PayslipDetailView
                        details={selectedStaffDetails}
                        companyConfig={resolvedConfig}
                        payPeriod={payPeriod}
                        staffList={staffList}
                        activeBranch={activeBranch}
                    />
                </Modal>
            )}

            {/* MODALE D'HISTORIQUE INDIVIDUELLE */}
            {selectedHistoryDetails && historyPayPeriod && (
                <Modal isOpen={true} onClose={() => setSelectedHistoryDetails(null)} title={`Payslip for ${selectedHistoryDetails.name || 'Unknown Staff'} (${historyPayPeriod.monthName} ${historyPayPeriod.year})`}>
                    <PayslipDetailView
                        details={selectedHistoryDetails}
                        companyConfig={resolvedConfig}
                        payPeriod={historyPayPeriod}
                        staffList={staffList}
                        activeBranch={activeBranch}
                    />
                </Modal>
            )}

            {/* GÉNÉRATEUR DE PAIE (NOUVEAU) */}
            <PayrollGenerator
                db={db}
                staffList={activeStaffList}
                companyConfig={resolvedConfig}
                payPeriod={payPeriod}
                setPayPeriod={setPayPeriod}
                onViewDetails={setSelectedStaffDetails}
                activeBranch={activeBranch}
            />

            {/* --- SECTION BOUTON BULK : RESTREINTE AU SUPER ADMIN --- */}
            {localUserRole === 'super_admin' && (
                <div className="flex flex-col items-center py-6 border-y border-gray-800 bg-gray-900/20 rounded-xl">
                    <div className="text-center mb-4">
                        <h3 className="text-white font-bold">Manual Bulk Creator</h3>
                        <p className="text-xs text-gray-500">Create multiple historical payslips for a single staff member (No DB Sync).</p>
                    </div>
                    <button 
                        onClick={() => setIsBulkGeneratorOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold transition-all shadow-lg hover:shadow-purple-500/20"
                    >
                        <FilePlus className="w-5 h-5" /> Open Bulk Generator
                    </button>
                </div>
            )}

            {/* MODALE DU GÉNÉRATEUR BULK (L'état est géré par isBulkGeneratorOpen) */}
            <BulkPayslipGenerator 
                isOpen={isBulkGeneratorOpen} 
                onClose={() => setIsBulkGeneratorOpen(false)} 
                staffList={staffList} 
                companyConfig={resolvedConfig} 
                userRole={localUserRole} 
            />

            <PayrollHistory
                db={db}
                staffList={staffList}
                onViewHistoryDetails={handleViewHistoryDetails}
                companyConfig={resolvedConfig}
                activeBranch={activeBranch}
                userRole={localUserRole}
                adminBranchIds={adminBranchIds}
            />
        </div>
    );
};