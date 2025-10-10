import React, { useState } from 'react';
import { PlusIcon, PencilIcon, TrashIcon } from '../components/Icons';

export default function FinancialsPage({ staffList, db }) {
    const [selectedStaffId, setSelectedStaffId] = useState('');

    // TODO: We will replace these with real data from Firestore later.
    const loans = [];
    const advances = [];
    const adjustments = [];

    const handleStaffChange = (e) => {
        setSelectedStaffId(e.target.value);
        // TODO: When a staff member is selected, we will fetch their financial data.
    };

    // Placeholder functions for future implementation
    const handleAddLoan = () => alert("Add Loan modal will open here.");
    const handleAddAdvance = () => alert("Add Advance modal will open here.");
    const handleAddAdjustment = () => alert("Add Adjustment modal will open here.");


    const selectedStaffName = staffList.find(s => s.id === selectedStaffId)?.fullName;

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-8 gap-4">
                <h2 className="text-2xl md:text-3xl font-bold text-white">Financials Management</h2>
                <div className="w-full md:w-72">
                    <label htmlFor="staff-select" className="sr-only">Select Staff</label>
                    <select
                        id="staff-select"
                        value={selectedStaffId}
                        onChange={handleStaffChange}
                        className="w-full p-2 bg-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                        <option value="">-- Select a Staff Member --</option>
                        {staffList.sort((a, b) => a.fullName.localeCompare(b.fullName)).map(staff => (
                            <option key={staff.id} value={staff.id}>{staff.fullName}</option>
                        ))}
                    </select>
                </div>
            </div>

            {selectedStaffId ? (
                <div className="space-y-10">
                    {/* Section for Long-Term Loans */}
                    <section>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-white">Long-Term Loans</h3>
                            <button onClick={handleAddLoan} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
                                <PlusIcon className="h-5 w-5 mr-2" />
                                Add Loan
                            </button>
                        </div>
                        <div className="bg-gray-800 rounded-lg shadow-lg p-4 min-h-[100px] flex items-center justify-center">
                            {loans.length === 0 ? (
                                <p className="text-gray-500">No active loans for {selectedStaffName}.</p>
                            ) : (
                                // TODO: Map over and display loan data here in a table.
                                <p>Loan data will be displayed here.</p>
                            )}
                        </div>
                    </section>

                    {/* Section for Salary Advances */}
                    <section>
                         <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-white">Salary Advances</h3>
                            <button onClick={handleAddAdvance} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
                                <PlusIcon className="h-5 w-5 mr-2" />
                                Add Advance
                            </button>
                        </div>
                        <div className="bg-gray-800 rounded-lg shadow-lg p-4 min-h-[100px] flex items-center justify-center">
                            {advances.length === 0 ? (
                                <p className="text-gray-500">No salary advances this period for {selectedStaffName}.</p>
                            ) : (
                                // TODO: Map over and display advance data here in a table.
                                <p>Advance data will be displayed here.</p>
                            )}
                        </div>
                    </section>

                    {/* Section for Other Monthly Adjustments */}
                    <section>
                         <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-white">Other Monthly Adjustments</h3>
                            <button onClick={handleAddAdjustment} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
                                <PlusIcon className="h-5 w-5 mr-2" />
                                Add Adjustment
                            </button>
                        </div>
                        <div className="bg-gray-800 rounded-lg shadow-lg p-4 min-h-[100px] flex items-center justify-center">
                            {adjustments.length === 0 ? (
                                <p className="text-gray-500">No earnings or deductions this period for {selectedStaffName}.</p>
                            ) : (
                                // TODO: Map over and display adjustment data here in a table.
                                <p>Adjustment data will be displayed here.</p>
                            )}
                        </div>
                    </section>
                </div>
            ) : (
                <div className="text-center py-20 bg-gray-800 rounded-lg">
                    <p className="text-gray-400">Please select a staff member to view and manage their financial records.</p>
                </div>
            )}
        </div>
    );
}