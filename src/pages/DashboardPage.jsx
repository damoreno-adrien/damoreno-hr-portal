/* src/pages/DashboardPage.jsx */

import React, { useState, useEffect } from 'react';
import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore'; 
import { Clock, Moon, AlertTriangle, CheckCircle, Award, LogIn, Calendar, Slash, Flame } from 'lucide-react'; 
import { useMonthlyStats } from '../hooks/useMonthlyStats';
import { DashboardCard } from '../components/Dashboard/DashboardCard';
import { StatItem } from '../components/Dashboard/StatItem';
import { DailySummary } from '../components/Dashboard/DailySummary';
import { formatCustom, formatISODate, addDays, fromFirestore } from '../utils/dateUtils';
import { UpcomingShiftsCard } from '../components/Dashboard/UpcomingShiftsCard';
import { QuickActionsCard } from '../components/Dashboard/QuickActionsCard';

export default function DashboardPage({ db, user, companyConfig, leaveBalances, staffList, setCurrentPage }) {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [status, setStatus] = useState('loading');
    const [locationError, setLocationError] = useState('');
    const [isWithinGeofence, setIsWithinGeofence] = useState(false);
    const [todaysAttendance, setTodaysAttendance] = useState(null);
    const [todaysSchedule, setTodaysSchedule] = useState(null);
    const [tomorrowsSchedule, setTomorrowsSchedule] = useState(null);
    const [isOnLeaveToday, setIsOnLeaveToday] = useState(false);
    const [upcomingLeave, setUpcomingLeave] = useState(null);
    
    // Safety check for stats to prevent app crash or NaN display
    const rawStats = useMonthlyStats(db, user, companyConfig);
    const monthlyStats = rawStats.monthlyStats || { totalHoursWorked: "0h 0m", workedDays: 0, absences: 0, totalTimeLate: "0h 0m" };
    const bonusStatus = rawStats.bonusStatus || { notEligible: true };

    const isMyBirthday = checkBirthday(staffList.find(s => s.id === user.uid)?.birthdate);
    const colleaguesWithBirthday = staffList.filter(s => s.id !== user.uid && checkBirthday(s.birthdate));

    function checkBirthday(birthdate) {
        if (!birthdate) return false;
        const birthDateStr = formatCustom(birthdate, 'MM-dd');
        const todayStr = formatCustom(new Date(), 'MM-dd');
        return birthDateStr === todayStr;
    }
    const getDisplayName = (staff) => staff.nickname || staff.firstName || staff.fullName;

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const getDocRef = () => doc(db, 'attendance', `${user.uid}_${formatISODate(new Date())}`);

    useEffect(() => {
        if (!db || !user) return;
        const docRef = getDocRef(); 
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setTodaysAttendance(data);
                if (data.checkOutTime) setStatus('checked-out-final');
                else if (data.breakStart && !data.breakEnd) setStatus('on-break');
                else if (data.checkInTime) setStatus('checked-in');
            } else {
                setTodaysAttendance(null);
                setStatus('checked-out');
            }
        });
        return () => unsubscribe();
    }, [db, user]);
    
    useEffect(() => {
        if (!db || !user) return;
        const todayStr = formatISODate(new Date());
        const tomorrowStr = formatISODate(addDays(new Date(), 1));
        setTodaysSchedule(null);
        setTomorrowsSchedule(null);
        const q = query(
            collection(db, 'schedules'),
            where('staffId', '==', user.uid),
            where('date', 'in', [todayStr, tomorrowStr])
        );
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            let foundToday = false;
            let foundTomorrow = false;
            querySnapshot.forEach(doc => {
                const data = doc.data();
                if (data.date === todayStr) {
                    setTodaysSchedule(data);
                    foundToday = true;
                } else if (data.date === tomorrowStr) {
                    setTomorrowsSchedule(data);
                    foundTomorrow = true;
                }
            });
            if (!foundToday) setTodaysSchedule(undefined); 
            if (!foundTomorrow) setTomorrowsSchedule(undefined);
        }, (error) => { 
            console.error("Error fetching schedules:", error);
        });
        return () => unsubscribe(); 
    }, [db, user]); 

    useEffect(() => {
        if (!db || !user) return;
        const todayStr = formatISODate(new Date()); 
        const q = query(
            collection(db, 'leave_requests'), 
            where('staffId', '==', user.uid), 
            where('status', '==', 'approved'), 
            where('startDate', '>=', todayStr),
            orderBy('startDate', 'asc'),
            limit(1)
        );
        getDocs(q).then(snapshot => {
            if (!snapshot.empty) {
                const firstLeave = snapshot.docs[0].data();
                setUpcomingLeave(firstLeave);
                if (firstLeave.startDate === todayStr) setIsOnLeaveToday(true);
                else setIsOnLeaveToday(false);
            } else {
                setUpcomingLeave(null);
                setIsOnLeaveToday(false);
            }
        });
    }, [db, user]);
    
    useEffect(() => {
        if (!companyConfig?.geofence) {
            setLocationError("Geofence settings are not configured.");
            return;
        }
        const { latitude: RESTAURANT_LAT, longitude: RESTAURANT_LON, radius: GEOFENCE_RADIUS_METERS } = companyConfig.geofence;
        if (!("geolocation" in navigator)) {
            setLocationError("Geolocation is not supported by your browser.");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
                const distance = calculateDistance(coords.latitude, coords.longitude, RESTAURANT_LAT, RESTAURANT_LON);
                if (distance <= GEOFENCE_RADIUS_METERS) {
                    setIsWithinGeofence(true);
                    setLocationError('');
                } else {
                    setIsWithinGeofence(false);
                    setLocationError(`You are too far from the restaurant. Approx. ${Math.round(distance)}m away.`);
                }
            },
            (error) => {
                const messages = {
                    [error.PERMISSION_DENIED]: "Location access was denied. Enable in settings.",
                    [error.POSITION_UNAVAILABLE]: "Location unavailable.",
                    [error.TIMEOUT]: "Location request timed out."
                };
                setLocationError(messages[error.code] || "Error getting location.");
            }
        );
    }, [companyConfig]);

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI / 180; const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };
    
    const handleCheckIn = async () => {
        const localDateString = formatISODate(new Date());
        await setDoc(getDocRef(), { 
            staffId: user.uid, 
            staffName: user.displayName || user.email, 
            date: localDateString, 
            checkInTime: serverTimestamp(), 
            checkOutTime: null,
            // Automatically set includesBreak from schedule preference
            includesBreak: todaysSchedule?.includesBreak !== false 
        });
    };

    const handleToggleBreak = async () => await updateDoc(getDocRef(), status === 'on-break' ? { breakEnd: serverTimestamp() } : { breakStart: serverTimestamp() });
    
    const handleCheckOut = async () => {
        const now = new Date();
        let proceedCheckout = true; 
        if (todaysSchedule && todaysSchedule.endTime) {
            try {
                const [endHours, endMinutes] = todaysSchedule.endTime.split(':');
                const scheduledEndTime = new Date(now); 
                scheduledEndTime.setHours(parseInt(endHours, 10), parseInt(endMinutes, 10), 0, 0);
                if (now < scheduledEndTime) {
                    proceedCheckout = window.confirm("Checking out early?");
                }
            } catch (e) { console.error("Error parsing time", e); }
        }
        if (proceedCheckout) await updateDoc(getDocRef(), { checkOutTime: serverTimestamp() });
     };

    // --- FIX: Dynamic Buttons based on Shift Type ---
    const renderButtons = () => {
        if (isOnLeaveToday) return <p className="text-center text-xl md:text-2xl text-blue-400">On Leave. Clock disabled.</p>;
        const commonButtonClasses = "w-full py-4 text-xl md:text-2xl font-bold rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed";
        
        // Detect Continuous Shift (No Break)
        const isContinuousShift = todaysSchedule && todaysSchedule.includesBreak === false;

        switch (status) {
            case 'checked-out': 
                return <button onClick={handleCheckIn} disabled={!isWithinGeofence} className={`${commonButtonClasses} bg-green-600 hover:bg-green-700`}>Check-In</button>;
            
            case 'checked-in':
                if (todaysAttendance?.breakEnd) return <button onClick={handleCheckOut} disabled={!isWithinGeofence} className={`${commonButtonClasses} bg-red-600 hover:bg-red-700`}>Check-Out</button>;
                
                // If Continuous Shift, HIDE Start Break button
                if (isContinuousShift) {
                    return (
                        <div className="space-y-2">
                            <button onClick={handleCheckOut} disabled={!isWithinGeofence} className={`${commonButtonClasses} text-lg md:text-xl bg-red-600 hover:bg-red-700`}>Check-Out</button>
                            <p className="text-center text-xs text-amber-500 flex items-center justify-center gap-1">
                                <Flame className="w-3 h-3" /> Continuous Shift (No Break)
                            </p>
                        </div>
                    );
                }

                // Standard Shift (Show Both)
                return (
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={handleToggleBreak} disabled={!isWithinGeofence} className={`${commonButtonClasses} text-lg md:text-xl bg-yellow-500 hover:bg-yellow-600`}>Start Break</button>
                        <button onClick={handleCheckOut} disabled={!isWithinGeofence} className={`${commonButtonClasses} text-lg md:text-xl bg-red-600 hover:bg-red-700`}>Check-Out</button>
                    </div>
                );

            case 'on-break': {
                const breakStartTime = fromFirestore(todaysAttendance?.breakStart);
                const minutesOnBreak = breakStartTime ? (currentTime - breakStartTime) / 60000 : 0;
                const canEndBreak = minutesOnBreak >= 50;
                const remainingBreakMinutes = Math.max(0, 60 - minutesOnBreak);
                return (
                    <div>
                        <div className="text-center mb-4 space-y-1">
                            {breakStartTime && <p className="text-sm text-gray-400">Started: <span className="font-semibold text-gray-200">{formatCustom(breakStartTime, 'HH:mm')}</span></p>}
                            <p className="text-lg font-bold text-yellow-300">{Math.floor(remainingBreakMinutes)} mins remaining</p>
                        </div>
                        <button onClick={handleToggleBreak} disabled={!isWithinGeofence || !canEndBreak} className={`${commonButtonClasses} bg-blue-500 hover:bg-blue-600`}>End Break</button>
                        {!canEndBreak && <p className="text-center text-xs text-gray-500 mt-2">Wait {Math.ceil(50 - minutesOnBreak)}m to end break</p>}
                    </div>
                );
            }
            case 'checked-out-final': return <p className="text-center text-xl md:text-2xl text-gray-400">Shift Ended. See you tomorrow!</p>;
            default: return <p className="text-center text-gray-400">Loading...</p>;
        }
    };

    let bonusContent;
    let bonusBgClass;
    if (bonusStatus.notEligible) {
        bonusContent = <><span className="font-bold text-gray-400">Not Eligible</span><Slash className="w-5 h-5 text-gray-500" /></>;
        bonusBgClass = "bg-gray-700/40 border border-gray-600";
    } else if (bonusStatus.onTrack) {
        bonusContent = <><span className="font-bold text-green-400">{bonusStatus.text}</span><CheckCircle className="w-5 h-5 text-green-400" /></>;
        bonusBgClass = "bg-green-500/20";
    } else {
        bonusContent = <><span className="font-bold text-red-400">{bonusStatus.text}</span><Award className="w-5 h-5 text-red-400" /></>;
        bonusBgClass = "bg-red-500/20";
    }

    // --- FIX: Sanitize NaN values for display ---
    const sanitizeTime = (val) => (val && !val.includes('NaN') ? val : "0h 0m");

    return (
        <div>
            {isMyBirthday && <div className="bg-gradient-to-r from-amber-500 to-yellow-400 text-white p-4 rounded-lg mb-8 text-center font-bold text-lg shadow-lg">🎉 Happy Birthday! 🎂</div>}
            {colleaguesWithBirthday.length > 0 && <div className="bg-blue-500/20 border border-blue-400 text-blue-200 p-4 rounded-lg mb-8"><p>🎈 It's {colleaguesWithBirthday.map(getDisplayName).join(', ')}'s Birthday!</p></div>}
            
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">My Dashboard</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <DashboardCard title="Time Clock" className="p-2 sm:p-6">
                        <div className="text-center mb-6">
                            <p className="text-base sm:text-lg text-gray-300">{formatCustom(currentTime, 'EEEE, dd MMMM')}</p>
                            <p className="text-4xl sm:text-5xl lg:text-6xl font-mono font-bold tracking-tight sm:tracking-widest mt-1">{formatCustom(currentTime, 'HH:mm:ss')}</p>
                        </div>
                        <div className="mt-6 px-2 sm:px-0">{renderButtons()}</div>
                        <DailySummary todaysAttendance={todaysAttendance} />
                        <div className="text-center mt-6 text-sm text-gray-500 h-5">
                            {locationError ? <p className="text-red-400">{locationError}</p> : isWithinGeofence ? <p className="text-green-400">✓ Location verified.</p> : <p>Checking location...</p>}
                        </div>
                    </DashboardCard>
                </div>
                <div className="space-y-8">
                    <DashboardCard title="Bonus Status">
                         <div className={`flex justify-between items-center p-4 rounded-lg ${bonusBgClass}`}>{bonusContent}</div>
                    </DashboardCard>
                    <UpcomingShiftsCard todaysSchedule={todaysSchedule} tomorrowsSchedule={tomorrowsSchedule} />
                    <QuickActionsCard setCurrentPage={setCurrentPage} />
                    <DashboardCard title="This Month's Summary">
                        <div className="space-y-4">
                           <StatItem icon={Clock} label="Total Hours Worked" value={sanitizeTime(monthlyStats.totalHoursWorked)} colorClass="blue" caption={`Target: ${sanitizeTime(monthlyStats.totalHoursScheduled)}`} />
                           <StatItem icon={LogIn} label="Days Worked" value={monthlyStats.workedDays || 0} colorClass="green" />
                           <StatItem icon={Moon} label="Absences" value={monthlyStats.absences || 0} colorClass="red" />
                           {/* --- FIX: Safely display Late Time --- */}
                           <StatItem icon={AlertTriangle} label="Total Time Late" value={sanitizeTime(monthlyStats.totalTimeLate)} colorClass="yellow" />
                        </div>
                    </DashboardCard>
                    <DashboardCard title="Leave Balance">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-300">Annual Leave</span>
                            <span className="text-3xl font-bold text-amber-400">{leaveBalances.annual}</span>
                        </div>
                        {upcomingLeave && <div className="mt-4 border-t border-gray-700 pt-3"><p className="text-xs text-gray-400">Next: {upcomingLeave.leaveType} ({upcomingLeave.startDate})</p></div>}
                    </DashboardCard>
                </div>
            </div>
        </div>
    );
}