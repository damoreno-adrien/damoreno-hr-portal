import React, { useState, useEffect } from 'react';
import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

// --- GEOLOCATION CONFIGURATION ---
const RESTAURANT_LAT = 7.883420882320325;
const RESTAURANT_LON = 98.38736709999999;
const GEOFENCE_RADIUS_METERS = 50; // 50 meters

export default function DashboardPage({ db, user }) {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [attendanceDoc, setAttendanceDoc] = useState(null);
    const [status, setStatus] = useState('loading');
    const [locationError, setLocationError] = useState('');
    const [isWithinGeofence, setIsWithinGeofence] = useState(false);

    // Effect for the live clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Effect for fetching attendance data
    useEffect(() => {
        if (!db || !user) return;
        const todayStr = new Date().toISOString().split('T')[0];
        const docRef = doc(db, 'attendance', `${user.uid}_${todayStr}`);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setAttendanceDoc(data);
                if (data.checkOutTime) setStatus('checked-out-final');
                else if (data.breakStart && !data.breakEnd) setStatus('on-break');
                else if (data.checkInTime) setStatus('checked-in');
            } else {
                setAttendanceDoc(null);
                setStatus('checked-out');
            }
        });
        return () => unsubscribe();
    }, [db, user]);

    // Effect for checking geolocation
    useEffect(() => {
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
                    case error.PERMISSION_DENIED:
                        setLocationError("Location access was denied. Please enable it in your browser settings to use the time clock.");
                        break;
                    case error.POSITION_UNAVAILABLE:
                        setLocationError("Location information is unavailable.");
                        break;
                    case error.TIMEOUT:
                        setLocationError("The request to get user location timed out.");
                        break;
                    default:
                        setLocationError("An unknown error occurred while getting your location.");
                        break;
                }
            }
        );
    }, []);

    // --- HELPER FUNCTIONS ---
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // in metres
    };
    
    const getDocRef = () => {
        const todayStr = new Date().toISOString().split('T')[0];
        return doc(db, 'attendance', `${user.uid}_${todayStr}`);
    };

    // --- EVENT HANDLERS ---
    const handleCheckIn = async () => await setDoc(getDocRef(), { staffId: user.uid, staffName: user.displayName || user.email, date: new Date().toISOString().split('T')[0], checkInTime: serverTimestamp() });
    const handleToggleBreak = async () => await updateDoc(getDocRef(), status === 'on-break' ? { breakEnd: serverTimestamp() } : { breakStart: serverTimestamp() });
    const handleCheckOut = async () => await updateDoc(getDocRef(), { checkOutTime: serverTimestamp() });

    // --- RENDER LOGIC ---
    const renderButtons = () => {
        const commonButtonClasses = "w-full py-4 text-2xl font-bold rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed";
        
        switch (status) {
            case 'checked-out':
                return <button onClick={handleCheckIn} disabled={!isWithinGeofence} className={`${commonButtonClasses} bg-green-600 hover:bg-green-700`}>Check-In</button>;
            case 'checked-in':
                return (
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={handleToggleBreak} disabled={!isWithinGeofence} className={`${commonButtonClasses} text-xl bg-yellow-500 hover:bg-yellow-600`}>Start Break</button>
                        <button onClick={handleCheckOut} disabled={!isWithinGeofence} className={`${commonButtonClasses} text-xl bg-red-600 hover:bg-red-700`}>Check-Out</button>
                    </div>
                );
            case 'on-break':
                return <button onClick={handleToggleBreak} disabled={!isWithinGeofence} className={`${commonButtonClasses} bg-blue-500 hover:bg-blue-600`}>End Break</button>;
            case 'checked-out-final':
                 return <p className="text-center text-2xl text-gray-400">You have checked out for the day. Thank you!</p>;
            default:
                return <p className="text-center text-gray-400">Loading attendance status...</p>;
        }
    };

    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-4">My Dashboard</h2>
            <div className="bg-gray-800 rounded-lg shadow-lg p-8 max-w-2xl mx-auto">
                <div className="text-center mb-8">
                    <p className="text-xl text-gray-300">{currentTime.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    <p className="text-7xl font-mono font-bold tracking-widest mt-2">{currentTime.toLocaleTimeString('en-US', { hour12: false })}</p>
                </div>
                <div className="mt-10">
                    {renderButtons()}
                </div>
                 <div className="text-center mt-8 text-sm text-gray-500 h-5">
                    {locationError && <p className="text-red-400">{locationError}</p>}
                    {!locationError && !isWithinGeofence && status !== 'checked-out-final' && <p>Checking location...</p>}
                    {!locationError && isWithinGeofence && status !== 'checked-out-final' && <p className="text-green-400">✓ Location verified. You are within the geofence.</p>}
                </div>
            </div>
        </div>
    );
};