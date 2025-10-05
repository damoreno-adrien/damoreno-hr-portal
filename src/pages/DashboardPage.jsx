import React, { useState, useEffect } from 'react';
import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';

const ANNUAL_LEAVE_ENTITLEMENT = 15; // Days per year

export default function DashboardPage({ db, user }) {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [attendanceDoc, setAttendanceDoc] = useState(null);
    const [status, setStatus] = useState('loading');
    const [locationError, setLocationError] = useState('');
    const [isWithinGeofence, setIsWithinGeofence] = useState(false);
    const [leaveTaken, setLeaveTaken] = useState(0);
    const [isOnLeaveToday, setIsOnLeaveToday] = useState(false);

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
            if (!snapshot.empty) {
                setIsOnLeaveToday(true);
            }
        });
    }, [db, user]);

    useEffect(() => {
        if (!db || !user) return;
        const currentYear = new Date().getFullYear();
        const startOfYear = `${currentYear}-01-01`;
        const endOfYear = `${currentYear}-12-31`;
        const q = query(
            collection(db, 'leave_requests'),
            where('staffId', '==', user.uid),
            where('status', '==', 'approved'),
            where('leaveType', '==', 'Annual Leave'),
            where('startDate', '>=', startOfYear),
            where('startDate', '<=', endOfYear)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let totalDaysTaken = 0;
            snapshot.forEach(doc => { totalDaysTaken += doc.data().totalDays; });
            setLeaveTaken(totalDaysTaken);
        });
        return () => unsubscribe();
    }, [db, user]);

    useEffect(() => {
        const RESTAURANT_LAT = 7.883420882320325;
        const RESTAURANT_LON = 98.38736709999999;
        const GEOFENCE_RADIUS_METERS = 50;
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
                    setLocationError(`You are too far from the restaurant to use the time clock. You are approximately ${Math.round(distance)} meters away.`);
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
    }, []);

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3; // metres
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

        const commonButtonClasses = "w-full py-4 text-2xl font-bold rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed";
        switch (status) {
            case 'checked-out': return <button onClick={handleCheckIn} disabled={!isWithinGeofence} className={`${commonButtonClasses} bg-green-600 hover:bg-green-700`}>Check-In</button>;
            case 'checked-in': return (<div className="grid grid-cols-2 gap-4"><button onClick={handleToggleBreak} disabled={!isWithinGeofence} className={`${commonButtonClasses} text-xl bg-yellow-500 hover:bg-yellow-600`}>Start Break</button><button onClick={handleCheckOut} disabled={!isWithinGeofence} className={`${commonButtonClasses} text-xl bg-red-600 hover:bg-red-700`}>Check-Out</button></div>);
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
                            <p className="text-6xl font-mono font-bold tracking-widest mt-1">{currentTime.toLocaleTimeString('en-US', { hour12: false })}</p>
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
                            <span className="text-3xl font-bold text-amber-400">{ANNUAL_LEAVE_ENTITLEMENT - leaveTaken}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Based on {ANNUAL_LEAVE_ENTITLEMENT} days per year.</p>
                    </DashboardCard>
                    <DashboardCard title="Bonus Status">
                        <p className="text-gray-400 text-sm">The attendance bonus feature is coming soon. Your status will be shown here.</p>
                    </DashboardCard>
                </div>
            </div>
        </div>
    );
};