import React, { useState, useEffect } from 'react';
import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

export default function DashboardPage({ db, user }) {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [attendanceDoc, setAttendanceDoc] = useState(null);
    const [status, setStatus] = useState('loading'); // loading, checked-out, checked-in, on-break

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
                setAttendanceDoc(data);
                if (data.checkOutTime) {
                    setStatus('checked-out-final');
                } else if (data.breakStart && !data.breakEnd) {
                    setStatus('on-break');
                } else if (data.checkInTime) {
                    setStatus('checked-in');
                }
            } else {
                setAttendanceDoc(null);
                setStatus('checked-out');
            }
        });

        return () => unsubscribe();
    }, [db, user]);
    
    const getDocRef = () => {
        const todayStr = new Date().toISOString().split('T')[0];
        return doc(db, 'attendance', `${user.uid}_${todayStr}`);
    };

    const handleCheckIn = async () => {
        const docRef = getDocRef();
        await setDoc(docRef, {
            staffId: user.uid,
            staffName: user.displayName || user.email,
            date: new Date().toISOString().split('T')[0],
            checkInTime: serverTimestamp()
        });
    };

    const handleToggleBreak = async () => {
        const docRef = getDocRef();
        if (status === 'on-break') {
            // Ending the break
            await updateDoc(docRef, { breakEnd: serverTimestamp() });
        } else {
            // Starting a break
            await updateDoc(docRef, { breakStart: serverTimestamp() });
        }
    };
    
    const handleCheckOut = async () => {
        const docRef = getDocRef();
        await updateDoc(docRef, { checkOutTime: serverTimestamp() });
    };

    const renderButtons = () => {
        switch (status) {
            case 'checked-out':
                return <button onClick={handleCheckIn} className="w-full py-4 text-2xl font-bold rounded-lg bg-green-600 hover:bg-green-700 transition-colors">Check-In</button>;
            case 'checked-in':
                return (
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={handleToggleBreak} className="w-full py-4 text-xl font-bold rounded-lg bg-yellow-500 hover:bg-yellow-600 transition-colors">Start Break</button>
                        <button onClick={handleCheckOut} className="w-full py-4 text-xl font-bold rounded-lg bg-red-600 hover:bg-red-700 transition-colors">Check-Out</button>
                    </div>
                );
            case 'on-break':
                return <button onClick={handleToggleBreak} className="w-full py-4 text-2xl font-bold rounded-lg bg-blue-500 hover:bg-blue-600 transition-colors">End Break</button>;
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
                 <div className="text-center mt-8 text-sm text-gray-500">
                    <p>Location verification will be added soon.</p>
                </div>
            </div>
        </div>
    );
};