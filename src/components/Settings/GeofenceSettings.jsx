/* src/components/Settings/GeofenceSettings.jsx */

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Check } from 'lucide-react';

// --- NOUVEAUX IMPORTS POUR L'AUDIT LOG ---
import { getAuth } from 'firebase/auth';
import { app } from '../../../firebase.js';
import { logSystemAction } from '../../utils/auditLogger';

export const GeofenceSettings = ({ db, config, selectedBranchId }) => {
    const [localGeofence, setLocalGeofence] = useState({});
    const [originalGeofence, setOriginalGeofence] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    // Initialisation de l'authentification pour le logger
    const auth = getAuth(app);

    useEffect(() => {
        if (config && config.geofence) {
            const data = {
                latitude: config.geofence.latitude || 0,
                longitude: config.geofence.longitude || 0,
                radius: config.geofence.radius || 100,
            };
            setLocalGeofence(data);
            setOriginalGeofence(data);
        }
    }, [config]);

    const handleChange = (e) => {
        setLocalGeofence(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    const hasChanges = JSON.stringify(localGeofence) !== JSON.stringify(originalGeofence);

    const handleSave = async () => {
        setIsSaving(true);
        setIsSaved(false);
        const configDocRef = doc(db, 'settings', 'company_config');
        try {
            // --- THE STAMP: Save to branchSettings.[branchId].geofence ---
            const prefix = selectedBranchId ? `branchSettings.${selectedBranchId}.geofence` : 'geofence';
            
            const dataToSave = {
                [prefix]: {
                    latitude: Number(localGeofence.latitude),
                    longitude: Number(localGeofence.longitude),
                    radius: Number(localGeofence.radius)
                }
            };
            await updateDoc(configDocRef, dataToSave);
            
            // --- NOUVEAU : LE JOURNAL D'AUDIT INTELLIGENT ---
            // On détecte exactement quels champs (latitude, longitude, radius) ont été modifiés
            const changedKeys = Object.keys(localGeofence).filter(key => localGeofence[key] !== originalGeofence[key]);
            const changesDetails = changedKeys.map(key => `${key} (${originalGeofence[key]} -> ${localGeofence[key]})`).join(', ');
            
            await logSystemAction(
                db, 
                auth.currentUser, 
                selectedBranchId, 
                'UPDATE_GEOFENCE', 
                `Updated geofence parameters: ${changesDetails}`
            );
            // ------------------------------------------------

            setOriginalGeofence(localGeofence); 
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
        } catch (error) {
            alert('Failed to save settings: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div id="geofence-config" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8 border border-gray-700">
            <h3 className="text-xl font-semibold text-white">Geofence Configuration</h3>
            <p className="text-gray-400 mt-2">Set the location and radius for clock-in/out verification for this location.</p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-900/50 p-4 rounded-lg">
                <div>
                    <label htmlFor="latitude" className="block text-sm font-medium text-gray-300 mb-1">Latitude</label>
                    <input type="number" step="any" id="latitude" value={localGeofence.latitude || ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div>
                    <label htmlFor="longitude" className="block text-sm font-medium text-gray-300 mb-1">Longitude</label>
                    <input type="number" step="any" id="longitude" value={localGeofence.longitude || ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
                <div>
                    <label htmlFor="radius" className="block text-sm font-medium text-gray-300 mb-1">Radius (meters)</label>
                    <input type="number" id="radius" value={localGeofence.radius || ''} onChange={handleChange} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                </div>
            </div>

            <div className="flex justify-end mt-6 pt-4 border-t border-gray-700">
                <button
                    onClick={handleSave}
                    disabled={isSaving || !hasChanges}
                    className="flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                    {isSaving ? 'Saving...' : (isSaved ? <><Check className="h-5 w-5 mr-2" /> Saved</> : 'Save Changes')}
                </button>
            </div>
        </div>
    );
};