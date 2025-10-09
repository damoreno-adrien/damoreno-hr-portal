import React, { useState, useEffect } from 'react';
import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';

export default function DashboardPage({ db, user, companyConfig, leaveBalances }) {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [status, setStatus] = useState('loading');
    const [locationError, setLocationError] = useState('');
    const [isWithinGeofence, setIsWithinGeofence] = useState(false);
    const [isOnLeaveToday, setIsOnLeaveToday] = useState(false);
    const [bonusStatus, setBonusStatus] = useState({ text: 'Calculating...', onTrack: true });

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
                if (data.checkOutTime) setStatus('checked-out-final');
                else if (data.breakStart && !data.breakEnd) setStatus('on-break');
                else if (data.checkInTime) setStatus('checked-in');
            } else {
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
            return <p className="text-center text-2xl text-blue-400">You are on approved leave today. Time clock is disabled.</p>;
        }
        const commonButtonClasses = "w-full py-4 text-xl md:text-2xl font-bold rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed";
        switch (status) {
            case 'checked-out': return <button onClick={handleCheckIn} disabled={!isWithinGeofence} className={`${commonButtonClasses} bg-green-600 hover:bg-green-700`}>Check-In</button>;
            case 'checked-in': return (<div className="grid grid-cols-2 gap-4"><button onClick={handleToggleBreak} disabled={!isWithinGeofence} className={`${commonButtonClasses} text-lg md:text-xl bg-yellow-500 hover:bg-yellow-600`}>Start Break</button><button onClick={handleCheckOut} disabled={!isWithinGeofence} className={`${commonButtonClasses} text-lg md:text-xl bg-red-600 hover:bg-red-700`}>Check-Out</button></div>);
            case 'on-break': return <button onClick={handleToggleBreak} disabled={!isWithinGeofence} className={`${commonButtonClasses} bg-blue-500 hover:bg-blue-600`}>End Break</button>;
            case 'checked-out-final': return <p className="text-center text-2xl text-gray-400">You have checked out for the day. Thank you!</p>;
            default: return <p className="text-center text-gray-400">Loading attendance status...</p>;
        }
    };

    const DashboardCard = ({ title, children }) => (
        <div className="bg-gray-800 rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
            {children}
        </div>
    );

    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-8">My Dashboard</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <DashboardCard title="Time Clock">
                        <div className="text-center mb-6">
                            <p className="text-lg text-gray-300">{currentTime.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                            <p className="text-5xl sm:text-6xl font-mono font-bold tracking-widest mt-1">{currentTime.toLocaleTimeString('en-US', { hour12: false })}</p>
                        </div>
                        <div className="mt-6">
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