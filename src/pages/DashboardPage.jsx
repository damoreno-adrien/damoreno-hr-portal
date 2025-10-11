import React, { useState, useEffect } from 'react';
import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';

export default function DashboardPage({ db, user, companyConfig, leaveBalances }) {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [status, setStatus] = useState('loading');
    const [locationError, setLocationError] = useState('');
    const [isWithinGeofence, setIsWithinGeofence] = useState(false);
    const [isOnLeaveToday, setIsOnLeaveToday] = useState(false);
    const [bonusStatus, setBonusStatus] = useState({ text: 'Calculating...', onTrack: true });
    const [todaysAttendance, setTodaysAttendance] = useState(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!db || !user) return;
        const todayStr = new Date().toISOString().split('T')[0];
        const docRef = doc(db, 'attendance', `${user.uid}_${todayStr}`);
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
        const todayStr = new Date().toISOString().split('T')[0];
        const q = query(
            collection(db, 'leave_requests'),
            where('staffId', '==', user.uid),
            where('status', '==', 'approved'),
            where('startDate', '<=', todayStr),
            where('endDate', '>=', todayStr)
        );
        getDocs(q).then(snapshot => {
            setIsOnLeaveToday(!snapshot.empty);
        });
    }, [db, user]);
    
    useEffect(() => {
        if (!db || !user || !companyConfig?.attendanceBonus) return;

        const checkBonusStatus = async () => {
            const { allowedAbsences, allowedLates } = companyConfig.attendanceBonus;
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const startDate = new Date(year, month, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

            const schedulesQuery = query(collection(db, "schedules"), where("staffId", "==", user.uid), where("date", ">=", startDate), where("date", "<=", endDate));
            const attendanceQuery = query(collection(db, "attendance"), where("staffId", "==", user.uid), where("date", ">=", startDate), where("date", "<=", endDate));

            const [schedulesSnapshot, attendanceSnapshot] = await Promise.all([getDocs(schedulesQuery), getDocs(attendanceQuery)]);
            const schedules = schedulesSnapshot.docs.map(doc => doc.data());
            const attendanceRecords = new Map(attendanceSnapshot.docs.map(doc => [doc.data().date, doc.data()]));

            let lateCount = 0;
            let absenceCount = 0;
            
            schedules.forEach(schedule => {
                if (new Date(schedule.date) > new Date()) return;
                const attendance = attendanceRecords.get(schedule.date);
                if (!attendance) {
                    absenceCount++;
                } else {
                    const scheduledStart = new Date(`${schedule.date}T${schedule.startTime}`);
                    const actualCheckIn = attendance.checkInTime.toDate();
                    if (actualCheckIn > scheduledStart) {
                        lateCount++;
                    }
                }
            });

            if (absenceCount > allowedAbsences || lateCount > allowedLates) {
                setBonusStatus({ text: 'Bonus Lost for this Month', onTrack: false });
            } else {
                setBonusStatus({ text: 'On Track for Bonus', onTrack: true });
            }
        };
        checkBonusStatus();
    }, [db, user, companyConfig]);

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
            (position) => {
                const { latitude, longitude } = position.coords;
                const distance = calculateDistance(latitude, longitude, RESTAURANT_LAT, RESTAURANT_LON);
                if (distance <= GEOFENCE_RADIUS_METERS) {
                    setIsWithinGeofence(true);
                    setLocationError('');
                } else {
                    setIsWithinGeofence(false);
                    setLocationError(`You are too far from the restaurant. Approx. ${Math.round(distance)}m away.`);
                }
            },
            (error) => {
                switch (error.code) {
                    case error.PERMISSION_DENIED: setLocationError("Location access was denied. Please enable it in your browser settings."); break;
                    case error.POSITION_UNAVAILABLE: setLocationError("Location information is unavailable."); break;
                    case error.TIMEOUT: setLocationError("The request to get user location timed out."); break;
                    default: setLocationError("An unknown error occurred while getting your location."); break;
                }
            }
        );
    }, [companyConfig]);

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI / 180; const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180; const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };
    
    const getDocRef = () => { const todayStr = new Date().toISOString().split('T')[0]; return doc(db, 'attendance', `${user.uid}_${todayStr}`); };
    const handleCheckIn = async () => await setDoc(getDocRef(), { staffId: user.uid, staffName: user.displayName || user.email, date: new Date().toISOString().split('T')[0], checkInTime: serverTimestamp() });
    const handleToggleBreak = async () => await updateDoc(getDocRef(), status === 'on-break' ? { breakEnd: serverTimestamp() } : { breakStart: serverTimestamp() });
    const handleCheckOut = async () => await updateDoc(getDocRef(), { checkOutTime: serverTimestamp() });

    const renderButtons = () => {
        if (isOnLeaveToday) {
            return <p className="text-center text-xl md:text-2xl text-blue-400">You are on approved leave today. Time clock is disabled.</p>;
        }
        const commonButtonClasses = "w-full py-4 text-xl md:text-2xl font-bold rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed";
        switch (status) {
            case 'checked-out': return <button onClick={handleCheckIn} disabled={!isWithinGeofence} className={`${commonButtonClasses} bg-green-600 hover:bg-green-700`}>Check-In</button>;
            case 'checked-in': return (<div className="grid grid-cols-2 gap-4"><button onClick={handleToggleBreak} disabled={!isWithinGeofence} className={`${commonButtonClasses} text-lg md:text-xl bg-yellow-500 hover:bg-yellow-600`}>Start Break</button><button onClick={handleCheckOut} disabled={!isWithinGeofence} className={`${commonButtonClasses} text-lg md:text-xl bg-red-600 hover:bg-red-700`}>Check-Out</button></div>);
            
            // --- UPDATED 'on-break' CASE ---
            case 'on-break': {
                const breakStartTime = todaysAttendance?.breakStart?.toDate();
                let minutesOnBreak = 0;
                if (breakStartTime) {
                    minutesOnBreak = (currentTime - breakStartTime) / 60000;
                }
                const canEndBreak = minutesOnBreak >= 50; // Minimum 50 min rule
                const remainingBreakMinutes = Math.max(0, 60 - minutesOnBreak); // Countdown from 60 min

                return (
                    <div>
                        <div className="text-center mb-4 space-y-1">
                            {breakStartTime && (
                                <p className="text-sm text-gray-400">Break started at: <span className="font-semibold text-gray-200">{breakStartTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></p>
                            )}
                            <p className="text-lg font-bold text-yellow-300">{Math.floor(remainingBreakMinutes)} minutes remaining</p>
                        </div>
                        <button onClick={handleToggleBreak} disabled={!isWithinGeofence || !canEndBreak} className={`${commonButtonClasses} bg-blue-500 hover:bg-blue-600`}>End Break</button>
                        {!canEndBreak && breakStartTime && (
                            <p className="text-center text-xs text-gray-500 mt-2">(You can end your break in {Math.ceil(50 - minutesOnBreak)} minute(s))</p>
                        )}
                    </div>
                );
            }

            case 'checked-out-final': return <p className="text-center text-xl md:text-2xl text-gray-400">You have checked out for the day. Thank you!</p>;
            default: return <p className="text-center text-gray-400">Loading attendance status...</p>;
        }
    };

    const DashboardCard = ({ title, children, className }) => (
        <div className={`bg-gray-800 rounded-lg shadow-lg ${className}`}>
            <h3 className="text-lg font-semibold text-white mb-4 px-4 pt-4">{title}</h3>
            <div className="p-4">{children}</div>
        </div>
    );

    return (
        <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">My Dashboard</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <DashboardCard title="Time Clock" className="p-2 sm:p-6">
                        <div className="text-center mb-6">
                            <p className="text-base sm:text-lg text-gray-300">{currentTime.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                            <p className="text-4xl sm:text-5xl lg:text-6xl font-mono font-bold tracking-tight sm:tracking-widest mt-1">{currentTime.toLocaleTimeString('en-US', { hour12: false })}</p>
                        </div>
                        <div className="mt-6 px-2 sm:px-0">
                            {renderButtons()}
                        </div>
                        <div className="text-center mt-6 text-sm text-gray-500 h-5">
                            {locationError && <p className="text-red-400">{locationError}</p>}
                            {!locationError && !isWithinGeofence && status !== 'checked-out-final' && !isOnLeaveToday && <p>Checking location...</p>}
                            {!locationError && isWithinGeofence && status !== 'checked-out-final' && !isOnLeaveToday && <p className="text-green-400">✓ Location verified.</p>}
                        </div>
                    </DashboardCard>
                </div>
                <div className="space-y-8">
                    <DashboardCard title="Leave Balance">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-300">Annual Leave Remaining</span>
                            <span className="text-3xl font-bold text-amber-400">{leaveBalances.annual}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Days available for the rest of the year.</p>
                    </DashboardCard>
                    
                    <DashboardCard title="Public Holiday Credit">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-300">Credits Remaining</span>
                            <span className="text-3xl font-bold text-blue-400">{leaveBalances.publicHoliday}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Earned from working on public holidays.</p>
                    </DashboardCard>

                    <DashboardCard title="Bonus Status">
                         <div className={`flex justify-between items-center p-4 rounded-lg ${bonusStatus.onTrack ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                            <span className={`font-bold ${bonusStatus.onTrack ? 'text-green-400' : 'text-red-400'}`}>{bonusStatus.text}</span>
                            <div className={`w-3 h-3 rounded-full ${bonusStatus.onTrack ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Based on monthly attendance.</p>
                    </DashboardCard>
                </div>
            </div>
        </div>
    );
};