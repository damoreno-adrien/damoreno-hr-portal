/* src/pages/SettingsPage.jsx */

import React from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

// Import the setting components
import { CompanyInfoSettings } from '../components/Settings/CompanyInfoSettings';
import { AttendanceBonusSettings } from '../components/Settings/AttendanceBonusSettings';
import { FinancialRulesSettings } from '../components/Settings/FinancialRulesSettings';
import { LeaveEntitlementsSettings } from '../components/Settings/LeaveEntitlementsSettings';
import { PublicHolidaysSettings } from '../components/Settings/PublicHolidaysSettings';
import { GeofenceSettings } from '../components/Settings/GeofenceSettings';
import { DepartmentManager } from '../components/Settings/DepartmentManager';

export default function SettingsPage({ db, companyConfig }) {
        const handleAddDepartment = async (deptName) => { 
        await updateDoc(doc(db, 'settings', 'company_config'), { departments: arrayUnion(deptName) }); 
    };
    const handleDeleteDepartment = async (dept) => { 
        if (window.confirm(`Delete department "${dept}"?`)) { 
            await updateDoc(doc(db, 'settings', 'company_config'), { departments: arrayRemove(dept) }); 
        } 
    };
    const handleAddHoliday = async (holiday) => { 
        await updateDoc(doc(db, 'settings', 'company_config'), { publicHolidays: arrayUnion(holiday) }); 
    };
    const handleDeleteHoliday = async (holiday) => { 
        if (window.confirm(`Delete holiday "${holiday.name}" (${holiday.date})?`)) { 
            await updateDoc(doc(db, 'settings', 'company_config'), { publicHolidays: arrayRemove(holiday) }); 
        } 
    };

    return (
        <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Advanced Settings</h2>
            
            <div className="space-y-8">
                <CompanyInfoSettings 
                    db={db}
                    companyConfig={companyConfig} 
                />
                <AttendanceBonusSettings 
                    db={db}
                    config={companyConfig} 
                />
                <FinancialRulesSettings 
                    db={db}
                    config={companyConfig} 
                />
                <LeaveEntitlementsSettings 
                    db={db}
                    config={companyConfig} 
                />
                <PublicHolidaysSettings 
                    db={db}
                    config={companyConfig} 
                    onAddHoliday={handleAddHoliday}
                    onDeleteHoliday={handleDeleteHoliday}
                />
                <GeofenceSettings 
                    db={db}
                    config={companyConfig} 
                />
                <DepartmentManager 
                    departments={companyConfig?.departments || []} 
                    onAddDepartment={handleAddDepartment}
                    onDeleteDepartment={handleDeleteDepartment}
                />
            </div>
        </div>
    );
};