/* src/components/Settings/SandboxSeeder.jsx */

import React, { useState } from 'react';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { Users, Calendar, Loader2, CheckCircle, AlertCircle, PlaySquare } from 'lucide-react';

export const SandboxSeeder = ({ db }) => {
    const [status, setStatus] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // --- ÉTAPE 1 : L'ÉQUIPE (AVEC LE VRAI EMAIL DE TEST) ---
    const createTeam = async () => {
        setIsLoading(true);
        setStatus('Recrutement en cours...');
        try {
            const team = [
                { id: 'sandbox_mgr_1', uid: 'sandbox_mgr_1', firstName: 'Gordon', lastName: 'Ramsay', nickname: 'Chef G.', email: 'gordon@damoreno.test', phoneNumber: "099-999-0001", address: "Hell's Kitchen", birthdate: "1966-11-08", emergencyContactName: "Kitchen Nightmares", emergencyContactPhone: "099-999-0002", status: 'active', branchId: 'br_sandbox', isAttendanceBonusEligible: true, isSsoRegistered: true, bonusStreak: 0, startDate: '2025-01-01', createdAt: Timestamp.now(), jobHistory: [{ baseSalary: 25000, department: 'Kitchen', hourlyRate: null, payType: 'Salary', position: 'Head Chef', roleTemplate: 'Kitchen Manager', standardDayHours: 8, startDate: '2025-01-01' }] },
                // FIX EMAIL: On injecte damoreno.test1@gmail.com directement en base de données pour contourner le blocage UI !
                { id: 'sandbox_staff_1', uid: 'sandbox_staff_1', firstName: 'SpongeBob', lastName: 'SquarePants', nickname: 'SpongeBob', email: 'damoreno.test1@gmail.com', phoneNumber: "088-888-0001", address: "Bikini Bottom", birthdate: "1999-05-01", emergencyContactName: "Patrick Star", emergencyContactPhone: "088-888-0002", status: 'active', branchId: 'br_sandbox', isAttendanceBonusEligible: true, isSsoRegistered: true, bonusStreak: 2, startDate: '2025-06-15', createdAt: Timestamp.now(), jobHistory: [{ baseSalary: 15000, department: 'Service', hourlyRate: null, payType: 'Salary', position: 'Waiter', roleTemplate: 'Standard Service Staff', standardDayHours: 8, startDate: '2025-06-15' }] },
                { id: 'sandbox_staff_2', uid: 'sandbox_staff_2', firstName: 'Remy', lastName: 'Ratatouille', nickname: 'Little Chef', email: 'remy@damoreno.test', phoneNumber: "077-777-0001", address: "Paris Sewers", birthdate: "2007-06-29", emergencyContactName: "Linguini", emergencyContactPhone: "077-777-0002", status: 'active', branchId: 'br_sandbox', isAttendanceBonusEligible: true, isSsoRegistered: false, bonusStreak: 0, startDate: '2026-01-10', createdAt: Timestamp.now(), jobHistory: [{ baseSalary: 450, department: 'Service', hourlyRate: null, payType: 'Daily', position: 'Runner', roleTemplate: 'Junior Runner', standardDayHours: 8, startDate: '2026-01-10' }] }
            ];

            for (const staff of team) {
                await setDoc(doc(db, 'staff_profiles', staff.id), staff);
                await setDoc(doc(db, 'users', staff.id), { name: `${staff.firstName} ${staff.lastName}`, email: staff.email, role: staff.jobHistory[0].roleTemplate.includes('Manager') ? 'dept_manager' : 'staff', branchIds: ['br_sandbox'] });
            }
            setStatus('Étape 1 terminée : Équipe mise à jour avec l\'email de test !');
        } catch (error) { setStatus('Erreur : ' + error.message); } finally { setIsLoading(false); }
    };

    // --- ÉTAPE 2 : PLANNING (3 SEMAINES) ---
    const generateSchedule = async () => {
        setIsLoading(true);
        setStatus('Génération du planning (3 semaines)...');
        try {
            const team = [
                { id: 'sandbox_mgr_1', name: 'Chef G.', start: '09:00', end: '18:00' },
                { id: 'sandbox_staff_1', name: 'SpongeBob', start: '10:00', end: '19:00' },
                { id: 'sandbox_staff_2', name: 'Little Chef', start: '14:00', end: '23:00' }
            ];

            const dates = [];
            let current = new Date('2026-03-30');
            const end = new Date('2026-04-19');
            while(current <= end) {
                dates.push(current.toISOString().split('T')[0]);
                current.setDate(current.getDate() + 1);
            }

            let count = 0;
            for (const dateStr of dates) {
                const day = new Date(dateStr).getDay();
                if (day === 0) continue; 

                for (const staff of team) {
                    await setDoc(doc(db, 'schedules', `${staff.id}_${dateStr}`), {
                        branchId: 'br_sandbox', date: dateStr, startTime: staff.start, endTime: staff.end,
                        includesBreak: true, staffId: staff.id, staffName: staff.name,
                        type: 'pattern_generated', status: 'published', updatedAt: Timestamp.now()
                    });
                    count++;
                }
            }
            setStatus(`Étape 2 terminée : ${count} shifts créés !`);
        } catch (error) { setStatus('Erreur : ' + error.message); } finally { setIsLoading(false); }
    };

    // --- ÉTAPE 3 : RÉALITÉ AUGMENTÉE (Clean des semaines passées + Scénarios ciblés) ---
    const simulateReality = async () => {
        setIsLoading(true);
        setStatus('Simulation des pointages parfaits et des incidents...');
        try {
            let current = new Date('2026-03-30');
            const end = new Date('2026-04-11'); // Jusqu'au Samedi 11 Avril
            
            while(current <= end) {
                const dateStr = current.toISOString().split('T')[0];
                const day = current.getDay();
                current.setDate(current.getDate() + 1);

                if (day === 0) continue; // Pas de travail le Dimanche

                // --- COMPORTEMENT SEMAINE PASSÉE (30 Mars - 04 Avril) : POINTAGES PARFAITS ---
                if (dateStr < '2026-04-06') {
                    // Chef G (09:00 - 18:00)
                    await setDoc(doc(db, 'attendance', `sandbox_mgr_1_${dateStr}`), { branchId: 'br_sandbox', date: dateStr, staffId: 'sandbox_mgr_1', staffName: 'Chef G.', checkInTime: Timestamp.fromDate(new Date(`${dateStr}T08:55:00`)), checkOutTime: Timestamp.fromDate(new Date(`${dateStr}T18:05:00`)), includesBreak: true, manuallyEdited: false, updatedAt: Timestamp.now() });
                    // SpongeBob (10:00 - 19:00)
                    await setDoc(doc(db, 'attendance', `sandbox_staff_1_${dateStr}`), { branchId: 'br_sandbox', date: dateStr, staffId: 'sandbox_staff_1', staffName: 'SpongeBob', checkInTime: Timestamp.fromDate(new Date(`${dateStr}T09:55:00`)), checkOutTime: Timestamp.fromDate(new Date(`${dateStr}T19:05:00`)), includesBreak: true, manuallyEdited: false, updatedAt: Timestamp.now() });
                    // Little Chef (14:00 - 23:00)
                    await setDoc(doc(db, 'attendance', `sandbox_staff_2_${dateStr}`), { branchId: 'br_sandbox', date: dateStr, staffId: 'sandbox_staff_2', staffName: 'Little Chef', checkInTime: Timestamp.fromDate(new Date(`${dateStr}T13:50:00`)), checkOutTime: Timestamp.fromDate(new Date(`${dateStr}T23:10:00`)), includesBreak: true, manuallyEdited: false, updatedAt: Timestamp.now() });
                } 
                // --- COMPORTEMENT SEMAINE CIBLE (06 Avril - 11 Avril) : LES SCÉNARIOS DE TEST ---
                else {
                    // 1. CHEF G : Parfait + OT le Samedi 11
                    let outTimeG = new Date(`${dateStr}T18:05:00`);
                    if (dateStr === '2026-04-11') outTimeG = new Date(`${dateStr}T20:00:00`); 
                    await setDoc(doc(db, 'attendance', `sandbox_mgr_1_${dateStr}`), { branchId: 'br_sandbox', date: dateStr, staffId: 'sandbox_mgr_1', staffName: 'Chef G.', checkInTime: Timestamp.fromDate(new Date(`${dateStr}T08:55:00`)), checkOutTime: Timestamp.fromDate(outTimeG), includesBreak: true, manuallyEdited: false, updatedAt: Timestamp.now() });

                    // 2. SPONGEBOB : Les fameux retards
                    let inSom = new Date(`${dateStr}T09:58:00`);
                    if (dateStr === '2026-04-06') inSom = new Date(`${dateStr}T10:45:00`); 
                    if (dateStr === '2026-04-08') inSom = new Date(`${dateStr}T10:15:00`); 
                    if (dateStr === '2026-04-10') inSom = new Date(`${dateStr}T10:20:00`); 
                    await setDoc(doc(db, 'attendance', `sandbox_staff_1_${dateStr}`), { branchId: 'br_sandbox', date: dateStr, staffId: 'sandbox_staff_1', staffName: 'SpongeBob', checkInTime: Timestamp.fromDate(inSom), checkOutTime: Timestamp.fromDate(new Date(`${dateStr}T19:02:00`)), includesBreak: true, manuallyEdited: false, updatedAt: Timestamp.now() });

                    // 3. LITTLE CHEF : No-Show le Mardi 07, Leave le Jeudi 09
                    if (dateStr !== '2026-04-07' && dateStr !== '2026-04-09') {
                        await setDoc(doc(db, 'attendance', `sandbox_staff_2_${dateStr}`), { branchId: 'br_sandbox', date: dateStr, staffId: 'sandbox_staff_2', staffName: 'Little Chef', checkInTime: Timestamp.fromDate(new Date(`${dateStr}T13:55:00`)), checkOutTime: Timestamp.fromDate(new Date(`${dateStr}T23:05:00`)), includesBreak: true, manuallyEdited: false, updatedAt: Timestamp.now() });
                    }
                }
            }

            // AJUSTEMENTS FINANCIERS
            await setDoc(doc(db, 'salary_advances', 'adv_mgr1_april'), { amount: 3000, branchId: 'br_sandbox', staffId: 'sandbox_mgr_1', date: '2026-04-08', payPeriodMonth: 4, payPeriodYear: 2026, status: 'approved', requestedBy: 'staff', createdAt: Timestamp.now() });
            await setDoc(doc(db, 'leave_requests', 'leave_nong_april'), { branchId: 'br_sandbox', staffId: 'sandbox_staff_2', staffName: 'Little Chef', staffDepartment: 'Service', startDate: '2026-04-09', endDate: '2026-04-09', totalDays: 1, leaveType: 'Personal Leave', status: 'approved', requestedAt: Timestamp.now() });

            setStatus('Étape 3 terminée : Planning propre, retards et absences injectés !');
        } catch (error) { setStatus('Erreur : ' + error.message); } finally { setIsLoading(false); }
    };

    return (
        <div className="bg-gray-900/80 p-6 rounded-xl border-2 border-dashed border-amber-600/50 mt-12 mb-8 animate-fadeIn">
            <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-amber-500" />
                <h3 className="text-xl font-bold text-amber-500">Laboratoire d'Injection (Sandbox Seeder)</h3>
            </div>
            
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button onClick={createTeam} disabled={isLoading} className="flex flex-col items-center justify-center p-4 bg-amber-600/10 border border-amber-600/50 rounded-xl hover:bg-amber-600/20 transition-all group">
                        <Users className="w-8 h-8 text-amber-500 mb-2 group-hover:scale-110 transition-transform" />
                        <span className="text-white font-bold text-sm">Étape 1 : Équipe</span>
                        <span className="text-[10px] text-gray-400 mt-1">Générer profils et Emails</span>
                    </button>

                    <button onClick={generateSchedule} disabled={isLoading} className="flex flex-col items-center justify-center p-4 bg-indigo-600/10 border border-indigo-600/50 rounded-xl hover:bg-indigo-600/20 transition-all group">
                        <Calendar className="w-8 h-8 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
                        <span className="text-white font-bold text-sm">Étape 2 : Planning</span>
                        <span className="text-[10px] text-gray-400 mt-1">3 semaines (Mars/Avril)</span>
                    </button>

                    <button onClick={simulateReality} disabled={isLoading} className="flex flex-col items-center justify-center p-4 bg-teal-600/10 border border-teal-600/50 rounded-xl hover:bg-teal-600/20 transition-all group">
                        <PlaySquare className="w-8 h-8 text-teal-500 mb-2 group-hover:scale-110 transition-transform" />
                        <span className="text-white font-bold text-sm">Étape 3 : Simuler</span>
                        <span className="text-[10px] text-gray-400 mt-1">Nettoyer les "No Show" passés</span>
                    </button>
                </div>

                {status && (
                    <div className={`p-4 rounded-xl text-sm flex items-center font-bold border ${status.includes('Erreur') ? 'bg-red-900/40 text-red-400 border-red-800' : 'bg-green-900/40 text-green-400 border-green-800'}`}>
                        <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0" /> {status}
                    </div>
                )}
            </div>
        </div>
    );
};