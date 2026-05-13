/* src/pages/TeamSchedulePage.jsx */

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Flame, Coffee } from 'lucide-react'; 
import * as dateUtils from '../utils/dateUtils';
import { calculateAttendanceStatus } from '../utils/statusUtils';
import { DateTime } from 'luxon'; 

const THAILAND_TIMEZONE = 'Asia/Bangkok';

// --- HELPER FUNCTIONS ---
const getDisplayName = (staff) => {
    if (staff && staff.nickname) return staff.nickname;
    if (staff && staff.firstName) return `${staff.firstName} ${staff.lastName}`;
    if (staff && staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

const getStaffCurrentJob = (staff) => {
    if (!staff || !staff.jobHistory || staff.jobHistory.length === 0) return null;
    return [...staff.jobHistory].sort((a, b) => {
        const dateA = dateUtils.fromFirestore(a.startDate) || new Date(0);
        const dateB = dateUtils.fromFirestore(b.startDate) || new Date(0);
        return dateB - dateA; // Le plus récent en premier
    })[0];
};

const getDynamicDeptColor = (dept) => {
    if (!dept || dept === 'Unassigned') return 'text-gray-400';
    const palettes = [
        'text-blue-400', 'text-emerald-400', 'text-amber-400', 
        'text-purple-400', 'text-pink-400', 'text-cyan-400', 'text-rose-400'
    ];
    let hash = 0;
    for (let i = 0; i < dept.length; i++) hash = dept.charCodeAt(i) + ((hash << 5) - hash);
    return palettes[Math.abs(hash) % palettes.length];
};

// On ajoute 'role' dans la destructuration au cas où le parent l'envoie sous ce nom
export default function TeamSchedulePage({ db, user, userRole, role, activeRole, activeBranch }) {
    const [staffList, setStaffList] = useState([]);
    
    // Contexte utilisateur sécurisé
    const [contextLoaded, setContextLoaded] = useState(false);
    const [isStaffView, setIsStaffView] = useState(false);
    const [myDepartment, setMyDepartment] = useState('');
    const [myBranchId, setMyBranchId] = useState('');
    
    const [selectedDeptFilter, setSelectedDeptFilter] = useState('All');
    const [startOfWeek, setStartOfWeek] = useState(DateTime.now().setZone(THAILAND_TIMEZONE).startOf('week').toJSDate());
    const [weekData, setWeekData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // 1. LECTURE AUTONOME DU CONTEXTE (Rôle + Profil)
    useEffect(() => {
        if (!db || !user?.uid) return;
        
        // On interroge Firebase simultanément pour le profil (département) ET le compte (rôle)
        Promise.all([
            getDoc(doc(db, 'staff_profiles', user.uid)),
            getDoc(doc(db, 'users', user.uid))
        ]).then(([profileSnap, userSnap]) => {
            let currentBranch = '';
            
            if (profileSnap.exists()) {
                const data = profileSnap.data();
                currentBranch = data.branchId;
                setMyBranchId(currentBranch);
                const currentJob = getStaffCurrentJob(data);
                setMyDepartment(currentJob?.department || 'Unassigned');
            }

            let dbRole = 'staff'; // Sécurité : on suppose "staff" par défaut si le document n'existe pas
            if (userSnap.exists()) {
                dbRole = userSnap.data().role;
            }

            // Détermination finale du rôle : UI Switch > Props Parent > Database
            const effectiveRole = activeRole || userRole || role || dbRole;
            setIsStaffView(String(effectiveRole).toLowerCase() === 'staff');
            
            setContextLoaded(true);
        }).catch(err => {
            console.error("Error loading secure context:", err);
            setIsStaffView(true); // Fail-safe: si erreur, on limite l'accès au statut Staff
            setContextLoaded(true);
        });
    }, [db, user?.uid, activeRole, userRole, role]);

    // 2. Fetch Staff List (Filtered by Branch)
    useEffect(() => {
        if (!db || !contextLoaded) return;
        
        const branchToDisplay = (isStaffView || activeBranch === 'global' || !activeBranch) 
            ? myBranchId 
            : activeBranch;

        if (!branchToDisplay) return; 

        const staffCollectionRef = collection(db, 'staff_profiles');
        const unsubStaff = onSnapshot(staffCollectionRef, (querySnapshot) => {
            const list = querySnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(staff => staff.branchId === branchToDisplay); // Isolation stricte
            
            setStaffList(list);
        });
        
        return () => unsubStaff();
    }, [db, contextLoaded, activeBranch, myBranchId, isStaffView]);
    
    // 3. Main Schedule Logic
    useEffect(() => {
        if (!db || !contextLoaded || staffList.length === 0) return;
        
        setIsLoading(true);

        const departmentStaff = staffList.filter(staff => {
            const currentJob = getStaffCurrentJob(staff);
            const isActive = dateUtils.isStaffActiveOnDate(staff, startOfWeek);
            
            if (!isActive) return false;

            const staffDept = currentJob?.department || 'Unassigned';

            // --- FILTRAGE BLINDÉ PAR RÔLE ---
            if (isStaffView) {
                return staffDept === myDepartment; 
            } else {
                if (selectedDeptFilter !== 'All') return staffDept === selectedDeptFilter;
                return true; 
            }
        });

        const endOfWeek = dateUtils.addDays(startOfWeek, 6);
        const startStr = dateUtils.formatISODate(startOfWeek);
        const endStr = dateUtils.formatISODate(endOfWeek);

        const shiftsQuery = query(collection(db, "schedules"), where("date", ">=", startStr), where("date", "<=", endStr));
        const leaveQuery = query(collection(db, "leave_requests"), where("status", "==", "approved"), where("endDate", ">=", startStr));
        
        // Bloque la lecture des pointages en direct pour les employés
        const attendanceQuery = !isStaffView 
            ? query(collection(db, "attendance"), where("date", ">=", startStr), where("date", "<=", endStr))
            : null;

        const unsubShifts = onSnapshot(shiftsQuery, (shiftsSnapshot) => {
            const shiftsMap = new Map();
            shiftsSnapshot.forEach(doc => {
                const data = doc.data();
                shiftsMap.set(`${data.staffId}_${data.date}`, data);
            });

            const unsubLeaves = onSnapshot(leaveQuery, (leavesSnapshot) => {
                const leaveMap = new Map();
                const reportEndDt = DateTime.fromISO(endStr, { zone: THAILAND_TIMEZONE });
                
                leavesSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (!data.staffId || !data.startDate || !data.endDate) return;
                    if (data.startDate > endStr) return; 

                    let current = DateTime.fromISO(data.startDate, { zone: THAILAND_TIMEZONE });
                    const leaveEnd = DateTime.fromISO(data.endDate, { zone: THAILAND_TIMEZONE });
                    
                    while (current <= leaveEnd && current <= reportEndDt) {
                        if (current.toISODate() >= startStr) {
                            leaveMap.set(`${data.staffId}_${current.toISODate()}`, data);
                        }
                        current = current.plus({ days: 1 });
                    }
                });

                const processScheduleData = (attendanceMap = new Map()) => {
                    const days = Array.from({ length: 7 }).map((_, i) => {
                        const date = dateUtils.addDays(startOfWeek, i);
                        const dateStr = dateUtils.formatISODate(date);
                        
                        const dailyEntries = departmentStaff.map(staff => {
                            const key = `${staff.id}_${dateStr}`;
                            const shift = shiftsMap.get(key);
                            const attendance = attendanceMap.get(key);
                            const leave = leaveMap.get(key);
                            const job = getStaffCurrentJob(staff);

                            const { status } = calculateAttendanceStatus(shift, attendance, leave, date);
                            
                            if (leave) return { staffId: staff.id, name: getDisplayName(staff), dept: job?.department, leave: leave, status };
                            if (shift) return { staffId: staff.id, name: getDisplayName(staff), dept: job?.department, sched: shift, status };
                            
                            return null;
                        }).filter(Boolean);

                        dailyEntries.sort((a, b) => {
                            const timeA = a.sched ? a.sched.startTime : '23:59';
                            const timeB = b.sched ? b.sched.startTime : '23:59';
                            return timeA.localeCompare(timeB);
                        });

                        return { date, entries: dailyEntries };
                    });

                    setWeekData(days);
                    setIsLoading(false);
                };

                let unsubAttendance = () => {};
                if (attendanceQuery) {
                     unsubAttendance = onSnapshot(attendanceQuery, (attendanceSnapshot) => {
                        const attendanceMap = new Map();
                        attendanceSnapshot.forEach(doc => {
                            const data = doc.data();
                            attendanceMap.set(`${data.staffId}_${data.date}`, data);
                        });
                        processScheduleData(attendanceMap);
                    }, (err) => { processScheduleData(); });
                } else {
                    processScheduleData(); 
                }

                return () => unsubAttendance();
            });
            return unsubLeaves;
        });
        return () => unsubShifts();
    }, [db, contextLoaded, startOfWeek, staffList, myDepartment, isStaffView, selectedDeptFilter]); 

    const changeWeek = (offset) => setStartOfWeek(prev => dateUtils.addDays(prev, 7 * offset));
    const endOfWeek = dateUtils.addDays(startOfWeek, 6);
    const weekRangeString = `${dateUtils.formatCustom(startOfWeek, 'MMM d')} - ${dateUtils.formatCustom(endOfWeek, 'MMM d')}`;

    const allUniqueDepartments = [...new Set(staffList.map(s => getStaffCurrentJob(s)?.department || 'Unassigned'))].sort();

    // On évite un clignotement de l'UI pendant le chargement sécurisé
    if (!contextLoaded) {
        return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div></div>;
    }

    return (
        <div className="pb-20 animate-fadeIn">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 space-y-4 sm:space-y-0">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Team Schedule</h2>
                    <p className="text-sm text-gray-400 mt-1">
                        {isStaffView ? `Viewing ${myDepartment} department` : 'See who is working this week.'}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {!isStaffView && (
                         <select
                            value={selectedDeptFilter}
                            onChange={(e) => setSelectedDeptFilter(e.target.value)}
                            className="bg-gray-800 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500 shadow-inner"
                        >
                            <option value="All">All Departments</option>
                            {allUniqueDepartments.map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    )}

                    <div className="flex items-center space-x-2 bg-gray-800 p-1.5 rounded-lg border border-gray-700 shadow-sm">
                        <button onClick={() => changeWeek(-1)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                        <h3 className="text-sm font-bold w-32 text-center text-gray-200">{weekRangeString}</h3>
                        <button onClick={() => changeWeek(1)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"><ChevronRight className="w-5 h-5" /></button>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500"></div></div>
            ) : (
                <div className="space-y-6">
                    {weekData.map(({ date, entries }) => {
                        const isToday = dateUtils.formatISODate(new Date()) === dateUtils.formatISODate(date);
                        return (
                            <div key={date.toISOString()} className={`rounded-xl border p-4 shadow-sm transition-all duration-300 ${isToday ? 'bg-gray-800 border-indigo-500/50 ring-1 ring-indigo-500/20' : 'bg-gray-800/60 border-gray-700/50'}`}>
                                <h3 className={`font-bold mb-4 flex items-center gap-2 ${isToday ? 'text-indigo-400' : 'text-gray-300'}`}>
                                    {dateUtils.formatCustom(date, 'EEEE, dd MMMM')}
                                    {isToday && <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-500 text-white px-2 py-0.5 rounded border border-indigo-400 shadow-sm">TODAY</span>}
                                </h3>
                                
                                {entries.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                        {entries.map(entry => {
                                            const includesBreak = entry.sched?.includesBreak !== false;
                                            const dynamicColor = getDynamicDeptColor(entry.dept);
                                            
                                            return (
                                                <div key={`${entry.staffId}-${date.toISOString()}`} className="bg-gray-900 border border-gray-700 rounded-lg p-3 flex items-center justify-between hover:border-gray-500 transition-colors shadow-sm">
                                                    <div className="flex items-center gap-3 overflow-hidden pr-2">
                                                        <div className="min-w-0">
                                                            <p className="font-bold text-sm text-gray-200 truncate" title={entry.name}>{entry.name}</p>
                                                            <p className={`text-[10px] uppercase font-bold tracking-wider truncate ${dynamicColor}`}>{entry.dept}</p>
                                                        </div>
                                                    </div>
                                                    
                                                    {entry.leave ? (
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-900/30 border border-blue-800/50 px-2 py-1 rounded">Leave</span>
                                                    ) : (
                                                        <div className="text-right flex-shrink-0">
                                                            <p className="text-sm font-bold text-white tabular-nums">{entry.sched.startTime}-{entry.sched.endTime}</p>
                                                            <div className="flex justify-end mt-0.5">
                                                                {includesBreak ? (
                                                                    <Coffee className="w-3.5 h-3.5 text-gray-500" title="Break Included" />
                                                                ) : (
                                                                    <Flame className="w-3.5 h-3.5 text-orange-500" title="Continuous Shift" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="bg-gray-900/50 rounded-lg border border-gray-800 border-dashed p-4 text-center">
                                         <p className="text-sm text-gray-500 italic">No shifts scheduled for this day.</p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}