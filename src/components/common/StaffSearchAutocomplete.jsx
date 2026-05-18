/* src/components/common/StaffSearchAutocomplete.jsx */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';

const getStaffCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) return null;
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(a.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(b.startDate) || new Date(0);
        return dateB - dateA;
    })[0];
};

export default function StaffSearchAutocomplete({ staffList, value, onChange, placeholder = "Search staff..." }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        if (!value) {
            setSearchTerm('');
        } else {
            const selectedStaff = staffList.find(s => s.id === value);
            if (selectedStaff) {
                setSearchTerm(selectedStaff.nickname || selectedStaff.firstName || '');
            }
        }
    }, [value, staffList]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredStaff = useMemo(() => {
        const query = searchTerm.toLowerCase().trim();
        return staffList.filter(staff => {
            const firstName = (staff.firstName || '').toLowerCase();
            const lastName = (staff.lastName || '').toLowerCase();
            const nickname = (staff.nickname || '').toLowerCase();
            return firstName.includes(query) || lastName.includes(query) || nickname.includes(query);
        }).sort((a, b) => (a.nickname || a.firstName).localeCompare(b.nickname || b.firstName));
    }, [searchTerm, staffList]);

    return (
        <div ref={containerRef} className="relative w-full sm:w-64">
            <div className="relative flex items-center">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
                <input
                    type="text"
                    className="w-full pl-9 pr-8 p-2 bg-gray-800 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:border-indigo-500 placeholder-gray-400"
                    placeholder={placeholder}
                    value={searchTerm}
                    onFocus={() => setIsOpen(true)}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                        if (!e.target.value) onChange(''); 
                    }}
                />
                {searchTerm && (
                    <button onClick={() => { setSearchTerm(''); onChange(''); setIsOpen(false); }} className="absolute right-2.5 p-0.5 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors">
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {isOpen && filteredStaff.length > 0 && (
                <ul className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-gray-800 border border-gray-700 rounded-md shadow-2xl divide-y divide-gray-700/50 custom-scrollbar">
                    {filteredStaff.map(staff => {
                        const job = getStaffCurrentJob(staff);
                        const dept = job?.department || 'Unassigned';
                        const displayName = staff.nickname
                            ? `${staff.nickname} (${staff.firstName} ${staff.lastName})`
                            : `${staff.firstName} ${staff.lastName}`;

                        return (
                            <li
                                key={staff.id}
                                className="px-4 py-2.5 hover:bg-indigo-600 cursor-pointer flex justify-between items-center text-sm text-white transition-colors"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    onChange(staff.id);
                                    setSearchTerm(staff.nickname || staff.firstName || '');
                                    setIsOpen(false);
                                }}
                            >
                                <span className="font-medium truncate">{displayName}</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-900/40 text-gray-300 ml-2">{dept}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}