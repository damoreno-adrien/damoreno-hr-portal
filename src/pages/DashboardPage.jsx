import React, { useState, useEffect } from 'react';
import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { Clock, Moon, AlertTriangle, CheckCircle, Award, LogIn } from 'lucide-react';

import { useMonthlyStats } from '../hooks/useMonthlyStats';
import { DashboardCard } from '../components/Dashboard/DashboardCard';
import { StatItem } from '../components/Dashboard/StatItem';
import { DailySummary } from '../components/Dashboard/DailySummary';

const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function DashboardPage({ db, user, companyConfig, leaveBalances, staffList }) {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [status, setStatus] = useState('loading');
    const [locationError, setLocationError] = useState('');
    const [isWithinGeofence, setIsWithinGeofence] = useState(false);
    const [isOnLeaveToday, setIsOnLeaveToday] = useState(false);
    const [todaysAttendance, setTodaysAttendance] = useState(null);
    const [todaysSchedule, setTodaysSchedule] = useState(null); // State for today's schedule
    
    const { monthlyStats, bonusStatus } = useMonthlyStats(db, user, companyConfig);

    const today = new Date();
    const isMyBirthday = checkBirthday(staffList.find(s => s.id === user.uid)?.birthdate);
    const colleaguesWithBirthday = staffList.filter(s => s.id !== user.uid && checkBirthday(s.birthdate));

    function checkBirthday(birthdate) {
        if (!birthdate) return false;
        const birthDateObj = new Date(birthdate);
        return birthDateObj.getMonth() === today.getMonth() && birthDateObj.getDate() === today.getDate();
    }
    const getDisplayName = (staff) => staff.nickname || staff.firstName || staff.fullName;

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const getDocRef = () => doc(db, 'attendance', `${user.uid}_${getLocalDateString()}`);

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
    
    // Fetch today's schedule
    useEffect(() => {
        if (!db || !user) return;
        const todayStr = getLocalDateString();
        const scheduleDocRef = doc(db, 'schedules', `${user.uid}_${todayStr}`);
        
        getDoc(scheduleDocRef).then((docSnap) => {
            if (docSnap.exists()) {
                setTodaysSchedule(docSnap.data());
            } else {
                setTodaysSchedule(null); // No schedule found for today
            }
        }).catch(error => {
            console.error("Error fetching today's schedule:", error);
            setTodaysSchedule(null); // Handle potential errors
        });

    }, [db, user]);

    // Check if on leave today
    useEffect(() => {
        if (!db || !user) return;
        const todayStr = getLocalDateString(); 
        const q = query(collection(db, 'leave_requests'), where('staffId', '==', user.uid), where('status', '==', 'approved'), where('startDate', '<=', todayStr), where('endDate', '>=', todayStr));
        getDocs(q).then(snapshot => setIsOnLeaveToday(!snapshot.empty));
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
        const Δφ = (lat2 - lat1) * Math.PI / 180; const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };
    
    const handleCheckIn = async () => {
        const localDateString = getLocalDateString();
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
                const breakStartTime = todaysAttendance?.breakStart?.toDate();
                const minutesOnBreak = breakStartTime ? (currentTime - breakStartTime) / 60000 : 0;
                const canEndBreak = minutesOnBreak >= 50;
                const remainingBreakMinutes = Math.max(0, 60 - minutesOnBreak);
                return (
                    <div>
                        <div className="text-center mb-4 space-y-1">
                            {breakStartTime && <p className="text-sm text-gray-400">Break started at: <span className="font-semibold text-gray-200">{breakStartTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></p>}
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
            {isMyBirthday && <div className="bg-gradient-to-r from-amber-500 to-yellow-400 text-white p-4 rounded-lg mb-8 text-center font-bold text-lg shadow-lg">🎉 Happy Birthday to you! We wish you all the best! 🎂</div>}
            {colleaguesWithBirthday.length > 0 && <div className="bg-blue-500/20 border border-blue-400 text-blue-200 p-4 rounded-lg mb-8"><p className="font-semibold">🎈 Today is a special day for your colleague(s)!</p><p>Don't forget to wish a happy birthday to: {colleaguesWithBirthday.map(getDisplayName).join(', ')}!</p></div>}

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">My Dashboard</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <DashboardCard title="Time Clock" className="p-2 sm:p-6">
                        <div className="text-center mb-6">
                            <p className="text-base sm:text-lg text-gray-300">{currentTime.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                            <p className="text-4xl sm:text-5xl lg:text-6xl font-mono font-bold tracking-tight sm:tracking-widest mt-1">{currentTime.toLocaleTimeString('en-US', { hour12: false })}</p>
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
                    <DashboardCard title="This Month's Summary">
                        <div className="space-y-4">
                           <StatItem icon={Clock} label="Total Hours Worked" value={monthlyStats.totalHours} colorClass="blue" />
                           <StatItem icon={LogIn} label="Days Worked" value={monthlyStats.workedDays} colorClass="green" />
                           <StatItem icon={Moon} label="Absences" value={monthlyStats.absences} colorClass="red" />
                           <StatItem icon={AlertTriangle} label="Late Arrivals" value={monthlyStats.lates} colorClass="yellow" />
                        </div>
                    </DashboardCard>
                    <DashboardCard title="Leave Balance">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-300">Annual Leave Remaining</span>
                            <span className="text-3xl font-bold text-amber-400">{leaveBalances.annual}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Days available for the rest of the year.</p>
                    </DashboardCard>
                    <DashboardCard title="Bonus Status">
                         <div className={`flex justify-between items-center p-4 rounded-lg ${bonusStatus.onTrack ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                            <span className={`font-bold ${bonusStatus.onTrack ? 'text-green-400' : 'text-red-400'}`}>{bonusStatus.text}</span>
                            {bonusStatus.onTrack ? <CheckCircle className="w-5 h-5 text-green-400"/> : <Award className="w-5 h-5 text-red-400"/>}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Based on monthly attendance.</p>
                    </DashboardCard>
                </div>
            </div>
        </div>
    );
};