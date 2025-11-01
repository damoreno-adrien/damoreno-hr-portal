import React, { useState, useEffect } from 'react';
// Added 'collection', 'query', 'where', 'limit'
import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore'; 
// --- NEW: Import 'Calendar' from lucide-react ---
import { Clock, Moon, AlertTriangle, CheckCircle, Award, LogIn, LogOut, Calendar } from 'lucide-react';

import { useMonthlyStats } from '../hooks/useMonthlyStats';
import { DashboardCard } from '../components/Dashboard/DashboardCard';
import { StatItem } from '../components/Dashboard/StatItem';
import { DailySummary } from '../components/Dashboard/DailySummary';
import * as dateUtils from '../utils/dateUtils';
import { UpcomingShiftsCard } from '../components/Dashboard/UpcomingShiftsCard';
import { QuickActionsCard } from '../components/Dashboard/QuickActionsCard';

// --- NEW: Import Modal, EditAttendanceModal, and ManagerAlerts ---
import Modal from '../components/Modal';
import EditAttendanceModal from '../components/EditAttendanceModal';
import ManagerAlerts from '../components/Dashboard/ManagerAlerts';

export default function DashboardPage({ db, user, companyConfig, leaveBalances, staffList, setCurrentPage }) {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [status, setStatus] = useState('loading');
    const [locationError, setLocationError] = useState('');
    const [isWithinGeofence, setIsWithinGeofence] = useState(false);
    const [todaysAttendance, setTodaysAttendance] = useState(null);

    const [todaysSchedule, setTodaysSchedule] = useState(null); // Will be 'null' (loading), 'undefined' (off), or {object} (shift)
    const [tomorrowsSchedule, setTomorrowsSchedule] = useState(null);
    const [isOnLeaveToday, setIsOnLeaveToday] = useState(false);
    const [upcomingLeave, setUpcomingLeave] = useState(null); // For the next upcoming leave
    
    // --- NEW: State for the manual fix modal ---
    const [alertToFix, setAlertToFix] = useState(null); // Will hold the alert data

    const { monthlyStats, bonusStatus } = useMonthlyStats(db, user, companyConfig);

    const isMyBirthday = checkBirthday(staffList.find(s => s.id === user.uid)?.birthdate);
    const colleaguesWithBirthday = staffList.filter(s => s.id !== user.uid && checkBirthday(s.birthdate));

    // --- NEW: Get user role from the user object (assuming it's there from useAuth) ---
    const userRole = user?.role;

    function checkBirthday(birthdate) {
        if (!birthdate) return false;
        const birthDateStr = dateUtils.formatCustom(birthdate, 'MM-dd');
        const todayStr = dateUtils.formatCustom(new Date(), 'MM-dd');
        return birthDateStr === todayStr;
    }
    const getDisplayName = (staff) => staff.nickname || staff.firstName || staff.fullName;

    // --- NEW: Handlers for the manual fix modal ---
    
    /**
     * Prepares the data for the EditAttendanceModal.
     * The modal expects a specific 'record' object format.
     * We also add the 'alertId' so the modal can delete the alert on save.
     */
    const handleOpenManualFix = (alert) => {
        const recordForModal = {
            id: alert.attendanceDocId, // The ID of the attendance doc
            staffName: alert.staffName,
            date: alert.date,
            // Pre-fill the modal with the known check-in time
            fullRecord: { 
                checkInTime: alert.checkInTime.toDate() // convert Firestore Timestamp to JS Date
            },
            alertId: alert.id // Pass the alert ID for deletion on save
        };
        setAlertToFix(recordForModal);
    };

    const handleCloseManualFix = () => {
        setAlertToFix(null);
    };
    // --- END NEW HANDLERS ---


    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const getDocRef = () => doc(db, 'attendance', `${user.uid}_${dateUtils.formatISODate(new Date())}`);

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
    
    // --- UPDATED: Fetch today's AND tomorrow's schedule ---
    useEffect(() => {
        if (!db || !user) return;
        
        const todayStr = dateUtils.formatISODate(new Date());
        const tomorrowStr = dateUtils.formatISODate(dateUtils.addDays(new Date(), 1));

        setTodaysSchedule(null); // Set to loading
        setTomorrowsSchedule(null); // Set to loading
        
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

            // If no doc was found, it means it's a day off
            if (!foundToday) setTodaysSchedule(undefined); 
            if (!foundTomorrow) setTomorrowsSchedule(undefined);

        }, (error) => { 
            console.error("Error fetching today's/tomorrow's schedule:", error);
            setTodaysSchedule(undefined); // Set to Day Off on error
            setTomorrowsSchedule(undefined);
        });

        return () => unsubscribe(); 

    }, [db, user]); 

    // --- UPDATED: Fetch upcoming leave ---
    useEffect(() => {
        if (!db || !user) return;
        const todayStr = dateUtils.formatISODate(new Date()); 
        
        const q = query(
            collection(db, 'leave_requests'), 
            where('staffId', '==', user.uid), 
            where('status', '==', 'approved'), 
            where('startDate', '>=', todayStr), // Only get future leave
            orderBy('startDate', 'asc'), // Get the *next* one
            limit(1)
        );
        
        getDocs(q).then(snapshot => {
            if (!snapshot.empty) {
                const firstLeave = snapshot.docs[0].data();
                setUpcomingLeave(firstLeave);
                // Check if this upcoming leave starts today
                if (firstLeave.startDate === todayStr) {
                    setIsOnLeaveToday(true);
                } else {
                    setIsOnLeaveToday(false);
                }
            } else {
                // No future leave found
                setUpcomingLeave(null);
                setIsOnLeaveToday(false);
            }
        });
    }, [db, user]);
    
    // Geofence check
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
                    [error.PERMISSION_DENIED]: "Location access was denied. Please enable it in your browser settings.",
                    [error.POSITION_UNAVAILABLE]: "Location information is unavailable.",
                    [error.TIMEOUT]: "The request to get user location timed out."
                };
                setLocationError(messages[error.code] || "An unknown error occurred while getting your location.");
            }
        );
    }, [companyConfig]);

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI / 180; const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - 1) * Math.PI / 180; const Δλ = (lon2 - 1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };
    
    const handleCheckIn = async () => {
        const localDateString = dateUtils.formatISODate(new Date());
        await setDoc(getDocRef(), { 
            staffId: user.uid, 
            staffName: user.displayName || user.email, 
            date: localDateString, 
            checkInTime: serverTimestamp(), 
            checkOutTime: null 
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
                    proceedCheckout = window.confirm("Your shift isn't scheduled to end yet. Are you sure you want to check out early?");
                }
            } catch (e) {
                console.error("Error parsing schedule end time:", e);
            }
        }

        if (proceedCheckout) {
            await updateDoc(getDocRef(), { checkOutTime: serverTimestamp() });
        }
     };

    const renderButtons = () => {
        if (isOnLeaveToday) return <p className="text-center text-xl md:text-2xl text-blue-400">You are on approved leave today. Time clock is disabled.</p>;
        
        const commonButtonClasses = "w-full py-4 text-xl md:text-2xl font-bold rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed";
        
        switch (status) {
            case 'checked-out': return <button onClick={handleCheckIn} disabled={!isWithinGeofence} className={`${commonButtonClasses} bg-green-600 hover:bg-green-700`}>Check-In</button>;
            case 'checked-in':
                if (todaysAttendance?.breakEnd) return <button onClick={handleCheckOut} disabled={!isWithinGeofence} className={`${commonButtonClasses} bg-red-600 hover:bg-red-700`}>Check-Out</button>;
                return (
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={handleToggleBreak} disabled={!isWithinGeofence} className={`${commonButtonClasses} text-lg md:text-xl bg-yellow-500 hover:bg-yellow-600`}>Start Break</button>
                        <button onClick={handleCheckOut} disabled={!isWithinGeofence} className={`${commonButtonClasses} text-lg md:text-xl bg-red-600 hover:bg-red-700`}>Check-Out</button>
                    </div>
                );
            case 'on-break': {
                const breakStartTime = dateUtils.fromFirestore(todaysAttendance?.breakStart);
                const minutesOnBreak = breakStartTime ? (currentTime - breakStartTime) / 60000 : 0;
                const canEndBreak = minutesOnBreak >= 50;
                const remainingBreakMinutes = Math.max(0, 60 - minutesOnBreak);
                return (
                    <div>
                        <div className="text-center mb-4 space-y-1">
                            {breakStartTime && <p className="text-sm text-gray-400">Break started at: <span className="font-semibold text-gray-200">{dateUtils.formatCustom(breakStartTime, 'HH:mm')}</span></p>}
                            <p className="text-lg font-bold text-yellow-300">{Math.floor(remainingBreakMinutes)} minutes remaining</p>
                        </div>
                        <button onClick={handleToggleBreak} disabled={!isWithinGeofence || !canEndBreak} className={`${commonButtonClasses} bg-blue-500 hover:bg-blue-600`}>End Break</button>
                        {!canEndBreak && breakStartTime && <p className="text-center text-xs text-gray-500 mt-2">(You can end your break in {Math.ceil(50 - minutesOnBreak)} minute(s))</p>}
                    </div>
                );
            }
            case 'checked-out-final': return <p className="text-center text-xl md:text-2xl text-gray-400">You have checked out for the day. Thank you!</p>;
            default: return <p className="text-center text-gray-400">Loading attendance status...</p>;
        }
    };

    return (
        <div>
            {/* --- NEW: Manual Fix Modal --- */}
            {alertToFix && (
                <Modal isOpen={!!alertToFix} onClose={handleCloseManualFix} title="Manually Fix Shift">
                    <EditAttendanceModal
                        db={db}
                        record={alertToFix}
                        onClose={handleCloseManualFix}
                    />
                </Modal>
            )}

            {isMyBirthday && <div className="bg-gradient-to-r from-amber-500 to-yellow-400 text-white p-4 rounded-lg mb-8 text-center font-bold text-lg shadow-lg">🎉 Happy Birthday to you! We wish you all the best! 🎂</div>}
            {colleaguesWithBirthday.length > 0 && <div className="bg-blue-500/20 border border-blue-400 text-blue-200 p-4 rounded-lg mb-8"><p className="font-semibold">🎈 Today is a special day for your colleague(s)!</p><p>Don't forget to wish a happy birthday to: {colleaguesWithBirthday.map(getDisplayName).join(', ')}!</p></div>}

            {/* --- NEW: Manager Alerts Section --- */}
            {userRole === 'manager' && (
                <div className="mb-8">
                    <ManagerAlerts onManualFix={handleOpenManualFix} />
                </div>
            )}

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">My Dashboard</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <DashboardCard title="Time Clock" className="p-2 sm:p-6">
                        <div className="text-center mb-6">
                            <p className="text-base sm:text-lg text-gray-300">{dateUtils.formatCustom(currentTime, 'EEEE, dd MMMM')}</p>
                            <p className="text-4xl sm:text-5xl lg:text-6xl font-mono font-bold tracking-tight sm:tracking-widest mt-1">{dateUtils.formatCustom(currentTime, 'HH:mm:ss')}</p>
                        </div>
                        <div className="mt-6 px-2 sm:px-0">{renderButtons()}</div>
                        <DailySummary todaysAttendance={todaysAttendance} />
                        <div className="text-center mt-6 text-sm text-gray-500 h-5">
                            {locationError && <p className="text-red-400">{locationError}</p>}
                            {!locationError && !isWithinGeofence && status !== 'checked-out-final' && !isOnLeaveToday && <p>Checking location...</p>}
                            {!locationError && isWithinGeofence && status !== 'checked-out-final' && !isOnLeaveToday && <p className="text-green-400">✓ Location verified.</p>}
                        </div>
                    </DashboardCard>
                </div>
                <div className="space-y-8">
                    <DashboardCard title="Bonus Status">
                         <div className={`flex justify-between items-center p-4 rounded-lg ${bonusStatus.onTrack ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                            <span className={`font-bold ${bonusStatus.onTrack ? 'text-green-400' : 'text-red-400'}`}>{bonusStatus.text}</span>
                            {bonusStatus.onTrack ? <CheckCircle className="w-5 h-5 text-green-400"/> : <Award className="w-5 h-5 text-red-400"/>}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Based on monthly attendance.</p>
                    </DashboardCard>
                    <UpcomingShiftsCard todaysSchedule={todaysSchedule} tomorrowsSchedule={tomorrowsSchedule} />
                    <QuickActionsCard setCurrentPage={setCurrentPage} />
                    <DashboardCard title="This Month's Summary">
                        <div className="space-y-4">
                           <StatItem 
                                icon={Clock} 
                                label="Total Hours Worked" 
                                value={monthlyStats.totalHoursWorked} 
                                colorClass="blue"
                                caption={`On total scheduled of ${monthlyStats.totalHoursScheduled}`}
                           />
                           <StatItem icon={LogIn} label="Days Worked" value={monthlyStats.workedDays} colorClass="green" />
                           <StatItem icon={Moon} label="Absences" value={monthlyStats.absences} colorClass="red" />
                           <StatItem icon={AlertTriangle} label="Total Time Late" value={monthlyStats.totalTimeLate} colorClass="yellow" />
                           <StatItem icon={LogOut} label="Total Early Departures" value={monthlyStats.totalEarlyDepartures} colorClass="purple" />
                        </div>
                    </DashboardCard>
                    <DashboardCard title="Leave Balance">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-300">Annual Leave Remaining</span>
                            <span className="text-3xl font-bold text-amber-400">{leaveBalances.annual}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Days available for the rest of the year.</p>
                        
                        {/* --- NEW: Upcoming Leave Section --- */}
                        {upcomingLeave && (
                            <div className="mt-4 border-t border-gray-700 pt-3">
                                <p className="text-xs text-gray-400 mb-1">Your next approved leave:</p>
                                <div className="flex items-center text-sm">
                                    <Calendar className="w-4 h-4 text-blue-400 mr-2 flex-shrink-0" />
                                    <div>
                                        <span className="font-semibold text-blue-300">{upcomingLeave.leaveType}</span>
                                        <span className="text-gray-300 ml-2">({upcomingLeave.startDate} to {upcomingLeave.endDate})</span>
                                    </div>
                                 </div>
                            </div>
                        )}
                    </DashboardCard>
                </div>
            </div>
        </div>
    );
}