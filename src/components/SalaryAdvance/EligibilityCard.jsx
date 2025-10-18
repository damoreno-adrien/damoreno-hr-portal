import React from 'react';

const formatCurrency = (num) => num != null ? num.toLocaleString('en-US') : '0';

export const EligibilityCard = ({ eligibility, isLoading }) => (
    <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
        <h3 className="text-lg font-semibold text-white mb-2">Your Eligibility</h3>
        {isLoading ? (
            <p className="text-gray-400">Calculating your maximum advance...</p>
        ) : (
            <div>
                <p className="text-gray-300">You are eligible for a salary advance of up to:</p>
                <p className="text-4xl font-bold text-amber-400 mt-1">{formatCurrency(eligibility.maxAdvance)} THB</p>
                {eligibility.maxTheoreticalAdvance > eligibility.maxAdvance && (
                     <p className="text-sm text-gray-400 mt-1">
                        (Based on {formatCurrency(eligibility.maxTheoreticalAdvance)} THB theoretical max this month)
                    </p>
                )}
            </div>
        )}
    </div>
);