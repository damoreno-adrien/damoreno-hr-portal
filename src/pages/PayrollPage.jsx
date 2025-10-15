import React, { useState } from 'react';
import Modal from '../components/Modal';
import PayslipDetailView from '../components/PayslipDetailView';
import PayrollHistory from '../components/PayrollHistory';
import PayrollGenerator from '../components/PayrollGenerator';

export default function PayrollPage({ db, staffList, companyConfig }) {
    const [selectedStaffDetails, setSelectedStaffDetails] = useState(null);
    const [payPeriod, setPayPeriod] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });

    return (
        <div>
            {selectedStaffDetails && (
                <Modal isOpen={true} onClose={() => setSelectedStaffDetails(null)} title={`Payslip Details for ${selectedStaffDetails.name}`}>
                    <PayslipDetailView 
                        details={selectedStaffDetails} 
                        companyConfig={companyConfig} 
                        payPeriod={payPeriod} 
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

            <PayrollHistory db={db} staffList={staffList} />
        </div>
    );
};