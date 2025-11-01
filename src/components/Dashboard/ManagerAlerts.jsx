import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, db } from "../../../firebase"; // Ensure firebase.js exports db and app
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { AlertTriangle, Clock, Loader2, CheckCircle } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils'; // Assuming you have this

// Get the callable function reference
const autoFixShiftFunc = httpsCallable(getFunctions(app, "asia-southeast1"), 'autoFixSingleShift');

/**
 * A single alert item component
 */
const AlertItem = ({ alert, onManualFix }) => {
    const [isFixing, setIsFixing] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const checkInTime = alert.checkInTime?.toDate();
    const formattedCheckIn = checkInTime 
        ? dateUtils.formatTime(checkInTime) 
        : 'Unknown';

    const handleAutoFix = async () => {
        setIsFixing(true);
        setError(null);
        setSuccess(null);

        try {
            const result = await autoFixShiftFunc({ 
                attendanceDocId: alert.attendanceDocId, 
                alertId: alert.id 
            });
            setSuccess(result.data.result || "Shift fixed!");
            // The onSnapshot listener will automatically remove this item
        } catch (err) {
            console.error("Error auto-fixing shift:", err);
            setError(err.message || "Failed to fix shift.");
            setIsFixing(false);
        }
    };

    // Placeholder for manual fix
    const handleManualFix = () => {
        onManualFix(alert);
    };

    if (success) {
        return (
            <li className="flex items-center justify-between p-3 bg-green-900/50 rounded-lg">
                <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                    <p className="text-sm text-gray-300">
                        <span className="font-semibold text-white">{alert.staffName}</span>
                        's shift on {alert.date} is now fixed.
                    </p>
                </div>
            </li>
        );
    }

    return (
        <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-800 rounded-lg gap-3">
            <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                <div>
                    <p className="text-sm text-white">
                        <span className="font-semibold">{alert.staffName}</span> missed check-out
                    </p>
                    <p className="text-xs text-gray-400">
                        On {alert.date} (Checked in at {formattedCheckIn})
                    </p>
                </div>
            </div>
            
            <div className="flex items-center justify-end gap-2 flex-shrink-0">
                <button
                    onClick={handleManualFix}
                    disabled={isFixing}
                    className="px-3 py-1 text-xs font-medium bg-gray-600 hover:bg-gray-500 text-white rounded-md disabled:opacity-50"
                >
                    Fix Manually
                </button>
                <button
                    onClick={handleAutoFix}
                    disabled={isFixing}
                    className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-md disabled:opacity-50 flex items-center gap-1.5"
                >
                    {isFixing ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Fixing...
                        </>
                    ) : (
                        "Auto-Fix (+9h)"
                    )}
                </button>
            </div>
            {error && <p className="text-xs text-red-400 text-center sm:text-left sm:col-span-2">{error}</p>}
        </li>
    );
};

/**
 * Main component to display all manager alerts
 */
export default function ManagerAlerts({ onManualFix }) {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const q = query(
            collection(db, "manager_alerts"), 
            where("status", "==", "pending"),
            orderBy("date", "desc")
        );

        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const pendingAlerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setAlerts(pendingAlerts);
                setLoading(false);
            }, 
            (err) => {
                console.error("Error fetching manager alerts:", err);
                setError("Could not load alerts.");
                setLoading(false);
            }
        );

        // Cleanup listener on unmount
        return () => unsubscribe();
    }, []);

    if (loading) {
        return (
            <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
                <p className="text-sm text-gray-300 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading pending actions...
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-red-700">
                <p className="text-sm text-red-400">{error}</p>
            </div>
        );
    }

    if (!loading && alerts.length === 0) {
        // Render nothing if there are no alerts
        return null; 
    }

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700">
            <div className="p-4 border-b border-gray-700">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Clock className="h-5 w-5 text-amber-400" />
                    Pending Actions
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                    The following shifts are missing a check-out time from yesterday.
                </p>
            </div>
            <ul className="space-y-3 p-4">
                {alerts.map(alert => (
                    <AlertItem key={alert.id} alert={alert} onManualFix={onManualFix} />
                ))}
            </ul>
        </div>
    );
}