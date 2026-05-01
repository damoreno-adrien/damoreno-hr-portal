import React, { useState } from 'react';
import { X } from 'lucide-react';

export default function ApproveLoanDateModal({ isOpen, onClose, onApprove, loanId }) {
    const minDate = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(minDate);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700">
                <div className="flex justify-between items-center p-6 border-b border-gray-700">
                    <h3 className="text-xl font-bold text-white flex items-center">
                        Approve Long-Term Loan
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="h-6 w-6" /></button>
                </div>

                <div className="p-6">
                    <p className="text-sm text-gray-400 mb-4">
                        Please select the effective start date for deductions.
                        The first deduction will occur on the payroll of the chosen month.
                    </p>

                    <div className="mb-2">
                        <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Start Date</label>
                        <input
                            type="date"
                            min={minDate}
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-green-500 focus:border-green-500 outline-none transition-colors"
                        />
                    </div>
                </div>

                <div className="flex justify-end space-x-3 border-t border-gray-700 p-4 bg-gray-800/50 rounded-b-xl">
                    <button onClick={onClose} className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors">
                        Cancel
                    </button>
                    <button onClick={() => onApprove(loanId, startDate)} className="px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold transition-colors shadow-lg">
                        Confirm Approval
                    </button>
                </div>
            </div>
        </div>
    );
}