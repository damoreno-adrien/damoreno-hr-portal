/* src/pages/PayrollPage.jsx */

import React, { useState, useMemo, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth'; // <-- Securely grab UID directly
import Modal from '../components/common/Modal';
import PayslipDetailView from '../components/Payroll/PayslipDetailView';
import PayrollHistory from '../components/Payroll/PayrollHistory';
import PayrollGenerator from '../components/Payroll/PayrollGenerator';
import * as dateUtils from '../utils/dateUtils'; 

export default function PayrollPage({ db, staffList, companyConfig, activeBranch }) {
    const [selectedStaffDetails, setSelectedStaffDetails] = useState(null);
    
    const [payPeriod, setPayPeriod] = useState({ 
        month: dateUtils.getMonth(new Date()), 
        year: dateUtils.getYear(new Date()) 
    });

    const [selectedHistoryDetails, setSelectedHistoryDetails] = useState(null);
    const [historyPayPeriod, setHistoryPayPeriod] = useState(null);

    // --- THE SECURITY LAYER: Fetch user's assigned branches ---
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

    // --- THE FILTER LAYER: Enforce "All My Branches" Security ---
    const activeStaffList = useMemo(() => {
        if (activeBranch === 'global') {
            if (localUserRole === 'admin') return staffList.filter(s => adminBranchIds.includes(s.branchId));
            return staffList; // Super admin
        }
        if (activeBranch) {
            return staffList.filter(s => s.branchId === activeBranch);
        }
        return staffList;
    }, [staffList, activeBranch, localUserRole, adminBranchIds]);

    // --- THE FIX FOR THE CRASH: Intelligently merge the branch settings ---
    const resolvedConfig = useMemo(() => {
        if (!companyConfig) return null;
        if (!activeBranch || activeBranch === 'global') return companyConfig; // Global uses root settings

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
        <div>
            {selectedStaffDetails && (
                <Modal isOpen={true} onClose={() => setSelectedStaffDetails(null)} title={`Payslip Details for ${selectedStaffDetails.name}`}>
                    <PayslipDetailView 
                        details={selectedStaffDetails} 
                        companyConfig={resolvedConfig} // <-- Pass resolved config!
                        payPeriod={payPeriod} 
                    />
                </Modal>
            )}

            {selectedHistoryDetails && historyPayPeriod && (
                <Modal isOpen={true} onClose={() => setSelectedHistoryDetails(null)} title={`Payslip for ${selectedHistoryDetails.name || 'Unknown Staff'} (${historyPayPeriod.monthName} ${historyPayPeriod.year})`}>
                     <PayslipDetailView 
                        details={selectedHistoryDetails} 
                        companyConfig={resolvedConfig} // <-- Pass resolved config!
                        payPeriod={historyPayPeriod} 
                    />
                </Modal>
            )}

            <PayrollGenerator 
                db={db}
                staffList={activeStaffList}
                companyConfig={resolvedConfig} // <-- Pass resolved config!
                payPeriod={payPeriod}
                setPayPeriod={setPayPeriod}
                onViewDetails={setSelectedStaffDetails}
                activeBranch={activeBranch}
            />

            <hr className="border-gray-800 my-12" />

            <PayrollHistory 
                db={db} 
                staffList={staffList}
                onViewHistoryDetails={handleViewHistoryDetails}
                companyConfig={resolvedConfig} // <-- Pass resolved config!
                activeBranch={activeBranch}
                userRole={localUserRole}
                adminBranchIds={adminBranchIds}
            />
        </div>
    );
};