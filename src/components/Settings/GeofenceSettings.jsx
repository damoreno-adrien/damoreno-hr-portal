import React from 'react';

export const GeofenceSettings = ({ config, handleConfigChange }) => (
    <div id="geofence-config" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8">
        <h3 className="text-xl font-semibold text-white">Geofence Configuration</h3>
        <p className="text-gray-400 mt-2">Set the location and radius for clock-in/out verification.</p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
                <label htmlFor="latitude" className="block text-sm font-medium text-gray-300 mb-1">Latitude</label>
                <input type="number" step="any" id="latitude" value={config.geofence?.latitude || ''} onChange={(e) => handleConfigChange(e, 'geofence')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
            <div>
                <label htmlFor="longitude" className="block text-sm font-medium text-gray-300 mb-1">Longitude</label>
                <input type="number" step="any" id="longitude" value={config.geofence?.longitude || ''} onChange={(e) => handleConfigChange(e, 'geofence')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
            <div>
                <label htmlFor="radius" className="block text-sm font-medium text-gray-300 mb-1">Radius (meters)</label>
                <input type="number" id="radius" value={config.geofence?.radius || ''} onChange={(e) => handleConfigChange(e, 'geofence')} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
            </div>
        </div>
    </div>
);