/* src/components/Dashboard/DataMigration.jsx */

import React, { useState } from 'react';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { Database, Play, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

// --- IMPORTS DES MODALES ---
import ConfirmModal from '../common/ConfirmModal';
import FeedbackModal from '../common/FeedbackModal';

export default function DataMigration({ db }) {
    const [status, setStatus] = useState('idle'); // idle, running, success, error
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    // --- STATES POUR LES MODALES ---
    const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });
    const [feedbackModal, setFeedbackModal] = useState(null);

    const runBreakPolicyMigration = async () => {
        if (!db) {
            setFeedbackModal({ type: 'error', title: 'Database Error', message: "Database connection not found." });
            return;
        }
        
        // --- MODIFIÉ : Remplacement de window.confirm() ---
        setConfirmState({
            isOpen: true,
            title: "Run Data Migration",
            message: "This will update all shifts in the current month with the 7-hour break rule. Proceed?",
            isDestructive: false,
            confirmText: "Run Migration",
            onConfirm: async () => {
                setConfirmState({ isOpen: false });
                setStatus('running');
                try {
                    // Target the current month (or adjust date range as needed)
                    const now = new Date();
                    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                    
                    const q = query(collection(db, "schedules"), where("date", ">=", startOfMonth));
                    const snapshot = await getDocs(q);
                    
                    const batch = writeBatch(db);
                    let count = 0;

                    snapshot.forEach((docSnap) => {
                        const data = docSnap.data();
                        if (data.startTime && data.endTime) {
                            const [startH, startM] = data.startTime.split(':').map(Number);
                            const [endH, endM] = data.endTime.split(':').map(Number);
                            
                            let durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
                            if (durationMinutes < 0) durationMinutes += 24 * 60; // Handle overnight shifts

                            // 7-HOUR RULE (420 minutes)
                            const shouldIncludeBreak = durationMinutes >= 420;

                            batch.update(docSnap.ref, {
                                includesBreak: shouldIncludeBreak,
                                migrationLog: `Auto-set by 7h rule on ${new Date().toLocaleDateString()}`
                            });
                            count++;
                        }
                    });

                    if (count > 0) {
                        await batch.commit();
                    }
                    
                    setProgress({ current: count, total: count });
                    setStatus('success');
                } catch (error) {
                    console.error("Migration failed:", error);
                    setStatus('error');
                }
            },
            onCancel: () => setConfirmState({ isOpen: false })
        });
    };

    return (
        <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 max-w-md relative">
            {/* INJECTION DES MODALES */}
            <FeedbackModal 
                isOpen={!!feedbackModal} 
                type={feedbackModal?.type} 
                title={feedbackModal?.title} 
                message={feedbackModal?.message} 
                onClose={() => setFeedbackModal(null)} 
            />
            <ConfirmModal 
                isOpen={confirmState.isOpen}
                title={confirmState.title}
                message={confirmState.message}
                onConfirm={confirmState.onConfirm}
                onCancel={confirmState.onCancel}
                isDestructive={confirmState.isDestructive}
                confirmText={confirmState.confirmText || "Confirm"}
            />

            <div className="flex items-center gap-3 mb-4">
                <Database className="text-indigo-400 w-6 h-6" />
                <h3 className="text-white font-bold text-lg">Shift Break Migration</h3>
            </div>

            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                Applies the <strong>7-hour break rule</strong> to existing shifts. 
                Shifts &lt; 7h will have breaks disabled.
            </p>

            {status === 'idle' && (
                <button 
                    onClick={runBreakPolicyMigration}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-all"
                >
                    <Play className="w-4 h-4" /> Run 7h Rule Migration
                </button>
            )}

            {status === 'running' && (
                <div className="flex flex-col items-center gap-3 py-4">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    <p className="text-indigo-300 text-sm font-medium">Updating Firestore records...</p>
                </div>
            )}

            {status === 'success' && (
                <div className="bg-green-900/20 border border-green-800 p-4 rounded-lg flex items-center gap-3">
                    <CheckCircle className="text-green-500 w-5 h-5" />
                    <p className="text-green-200 text-sm">Successfully updated {progress.total} shifts.</p>
                </div>
            )}

            {status === 'error' && (
                <div className="bg-red-900/20 border border-red-800 p-4 rounded-lg flex items-center gap-3">
                    <AlertCircle className="text-red-500 w-5 h-5" />
                    <p className="text-red-200 text-sm">Error updating database. Check console.</p>
                </div>
            )}
        </div>
    );
}