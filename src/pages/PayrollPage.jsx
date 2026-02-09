import React, { useState } from 'react';
import Modal from '../components/common/Modal';
import PayslipDetailView from '../components/Payroll/PayslipDetailView';
import PayrollHistory from '../components/Payroll/PayrollHistory';
import PayrollGenerator from '../components/Payroll/PayrollGenerator';
import * as dateUtils from '../utils/dateUtils'; // Import new standard

export default function PayrollPage({ db, staffList, companyConfig }) {
    // State for the Payroll Generator's "view details" modal
    const [selectedStaffDetails, setSelectedStaffDetails] = useState(null);
    
    // Use dateUtils for initial state
    const [payPeriod, setPayPeriod] = useState({ 
        month: dateUtils.getMonth(new Date()), 
        year: dateUtils.getYear(new Date()) 
    });

    // --- NEW: State for the Payroll History's "view details" modal ---
    const [selectedHistoryDetails, setSelectedHistoryDetails] = useState(null);
    const [historyPayPeriod, setHistoryPayPeriod] = useState(null);

    const handleViewHistoryDetails = (payslip, period) => {
        setSelectedHistoryDetails(payslip);
        setHistoryPayPeriod(period);
    };

    return (
        <div>
            {/* Modal for the Payroll GENERATOR */}
            {selectedStaffDetails && (
                <Modal isOpen={true} onClose={() => setSelectedStaffDetails(null)} title={`Payslip Details for ${selectedStaffDetails.name}`}>
                    <PayslipDetailView 
                        details={selectedStaffDetails} 
                        companyConfig={companyConfig} 
                        payPeriod={payPeriod} 
                    />
                </Modal>
            )}

            {/* --- NEW: Modal for the Payroll HISTORY --- */}
            {selectedHistoryDetails && historyPayPeriod && (
                <Modal isOpen={true} onClose={() => setSelectedHistoryDetails(null)} title={`Payslip for ${selectedHistoryDetails.staffName} (${historyPayPeriod.monthName} ${historyPayPeriod.year})`}>
                     <PayslipDetailView 
                        details={selectedHistoryDetails} 
                        companyConfig={companyConfig} 
                        payPeriod={historyPayPeriod} 
                    />
                </Modal>
            )}

            <PayrollGenerator 
                db={db}
                staffList={staffList}
                companyConfig={companyConfig}
                payPeriod={payPeriod}
                setPayPeriod={setPayPeriod}
                onViewDetails={setSelectedStaffDetails}
            />

            <hr className="border-gray-700 my-12" />

            {/* --- NEW: Pass the handler function to PayrollHistory --- */}
            <PayrollHistory 
                db={db} 
                staffList={staffList}
                onViewHistoryDetails={handleViewHistoryDetails}
            />
        </div>
    );
};