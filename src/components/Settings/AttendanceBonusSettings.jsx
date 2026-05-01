/* src/components/Settings/AttendanceBonusSettings.jsx */
import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Check, ShieldAlert, Award } from 'lucide-react';

// --- IMPORTS POUR L'AUDIT LOG ---
import { getAuth } from 'firebase/auth';
import { app } from '../../../firebase.js';
import { logSystemAction } from '../../utils/auditLogger';

// --- IMPORT DE LA MODALE DE FEEDBACK ---
import FeedbackModal from '../common/FeedbackModal.jsx';

export const AttendanceBonusSettings = ({ db, config, selectedBranchId }) => {
  const [localData, setLocalData] = useState({
    month1: 0, month2: 0, month3: 0, allowedAbsences: 0, allowedLates: 3, maxLateMinutesAllowed: 30, gracePeriodMinutes: 5,
    tier1Name: "Verbal Warning", tier1Strikes: 1, tier2Name: "Written Warning", tier2Strikes: 2, tier2Window: 1, tier3Name: "1-Day Suspension", tier3Strikes: 3, tier3Window: 3
  });
  const [originalData, setOriginalData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // --- ÉTAT POUR LA MODALE D'ERREUR ---
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackModalTitle, setFeedbackModalTitle] = useState('');
  const [feedbackModalMessage, setFeedbackModalMessage] = useState('');
  const [feedbackModalType, setFeedbackModalType] = useState('error');

  // Initialisation de l'authentification pour le logger
  const auth = getAuth(app);

  useEffect(() => {
    if (config) {
      const branchOverrides = (selectedBranchId && selectedBranchId !== 'global' && config.branchSettings?.[selectedBranchId])
        ? config.branchSettings[selectedBranchId]
        : {};
        
      const bonus = branchOverrides.attendanceBonus || config.attendanceBonus || {};
      const disc = branchOverrides.disciplinaryRules || config.disciplinaryRules || {};
      
      const data = {
        month1: bonus.month1 ?? 0, month2: bonus.month2 ?? 0, month3: bonus.month3 ?? 0,
        allowedAbsences: bonus.allowedAbsences ?? 0, allowedLates: bonus.allowedLates ?? 3, maxLateMinutesAllowed: bonus.maxLateMinutesAllowed ?? 30, gracePeriodMinutes: bonus.gracePeriodMinutes ?? 5,
        tier1Name: disc.tier1?.name ?? "Verbal Warning", tier1Strikes: disc.tier1?.strikes ?? 1,
        tier2Name: disc.tier2?.name ?? "Written Warning", tier2Strikes: disc.tier2?.strikes ?? 2, tier2Window: disc.tier2?.windowMonths ?? 1,
        tier3Name: disc.tier3?.name ?? "1-Day Suspension", tier3Strikes: disc.tier3?.strikes ?? 3, tier3Window: disc.tier3?.windowMonths ?? 3
      };
      setLocalData(data);
      setOriginalData(data);
    }
  }, [config, selectedBranchId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const configRef = doc(db, 'settings', 'company_config');
      
      const prefix = (selectedBranchId && selectedBranchId !== 'global') ? `branchSettings.${selectedBranchId}.` : '';

      const dataToSave = {
          [`${prefix}attendanceBonus`]: {
              month1: localData.month1, month2: localData.month2, month3: localData.month3,
              allowedAbsences: localData.allowedAbsences, allowedLates: localData.allowedLates, 
              maxLateMinutesAllowed: localData.maxLateMinutesAllowed, gracePeriodMinutes: localData.gracePeriodMinutes
          },
          [`${prefix}disciplinaryRules`]: {
              tier1: { name: localData.tier1Name, strikes: localData.tier1Strikes },
              tier2: { name: localData.tier2Name, strikes: localData.tier2Strikes, windowMonths: localData.tier2Window },
              tier3: { name: localData.tier3Name, strikes: localData.tier3Strikes, windowMonths: localData.tier3Window },
          }
      };

      await updateDoc(configRef, dataToSave);

      const changedKeys = Object.keys(localData).filter(key => localData[key] !== originalData[key]);
      const changesDetails = changedKeys.map(key => `${key} (${originalData[key]} -> ${localData[key]})`).join(', ');
      await logSystemAction(db, auth.currentUser, selectedBranchId, 'UPDATE_ATTENDANCE_RULES', `Updated attendance/disciplinary rules: ${changesDetails}`);
      
      setOriginalData(localData);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
      
    } catch (error) {
      setFeedbackModalTitle('Error Saving Settings');
      setFeedbackModalMessage(`Failed to save settings: ${error.message}`);
      setFeedbackModalType('error');
      setFeedbackModalOpen(true);
    } finally {
      setIsSaving(false);
    }
  };

  // --- CORRECTION DU BUG ICI ---
  // On compare de manière simple si les données actuelles diffèrent de celles d'origine
  const hasChanges = JSON.stringify(localData) !== JSON.stringify(originalData);

  return (
    <div id="attendance-bonus" className="bg-gray-800 rounded-lg shadow-lg p-6 scroll-mt-8 space-y-8 border border-gray-700 relative">
      <FeedbackModal
        isOpen={feedbackModalOpen}
        type={feedbackModalType}
        title={feedbackModalTitle}
        message={feedbackModalMessage}
        onClose={() => setFeedbackModalOpen(false)}
      />

      <div>
        <h3 className="text-xl font-semibold text-white flex items-center gap-2"><Award className="h-5 w-5 text-amber-400" /> Attendance Bonus</h3>
        <p className="text-gray-400 text-sm mt-1">Configure bonus amounts for consecutive months of perfect attendance.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Month 1 Bonus</label>
            <input
              type="number"
              value={localData.month1}
              onChange={(e) => setLocalData({ ...localData, month1: parseInt(e.target.value) || 0 })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Month 2 Bonus</label>
            <input
              type="number"
              value={localData.month2}
              onChange={(e) => setLocalData({ ...localData, month2: parseInt(e.target.value) || 0 })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Month 3 Bonus</label>
            <input
              type="number"
              value={localData.month3}
              onChange={(e) => setLocalData({ ...localData, month3: parseInt(e.target.value) || 0 })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Grace Period (Mins)</label>
            <input
              type="number"
              value={localData.gracePeriodMinutes}
              onChange={(e) => setLocalData({ ...localData, gracePeriodMinutes: parseInt(e.target.value) || 0 })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Max Absences</label>
            <input
              type="number"
              value={localData.allowedAbsences}
              onChange={(e) => setLocalData({ ...localData, allowedAbsences: parseInt(e.target.value) || 0 })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Max Late Incidents</label>
            <input
              type="number"
              value={localData.allowedLates}
              onChange={(e) => setLocalData({ ...localData, allowedLates: parseInt(e.target.value) || 0 })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Max Late Time (Mins)</label>
            <input
              type="number"
              value={localData.maxLateMinutesAllowed}
              onChange={(e) => setLocalData({ ...localData, maxLateMinutesAllowed: parseInt(e.target.value) || 0 })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold text-white flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-red-400" /> Disciplinary Rules</h3>
        <p className="text-gray-400 text-sm mt-1">Define the progressive disciplinary system for attendance violations.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Tier 1 Name</label>
            <input
              type="text"
              value={localData.tier1Name}
              onChange={(e) => setLocalData({ ...localData, tier1Name: e.target.value })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Tier 1 Strikes</label>
            <input
              type="number"
              value={localData.tier1Strikes}
              onChange={(e) => setLocalData({ ...localData, tier1Strikes: parseInt(e.target.value) || 0 })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Tier 2 Name</label>
            <input
              type="text"
              value={localData.tier2Name}
              onChange={(e) => setLocalData({ ...localData, tier2Name: e.target.value })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Tier 2 Strikes</label>
            <input
              type="number"
              value={localData.tier2Strikes}
              onChange={(e) => setLocalData({ ...localData, tier2Strikes: parseInt(e.target.value) || 0 })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Tier 2 Window (months)</label>
            <input
              type="number"
              value={localData.tier2Window}
              onChange={(e) => setLocalData({ ...localData, tier2Window: parseInt(e.target.value) || 0 })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Tier 3 Name</label>
            <input
              type="text"
              value={localData.tier3Name}
              onChange={(e) => setLocalData({ ...localData, tier3Name: e.target.value })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Tier 3 Strikes</label>
            <input
              type="number"
              value={localData.tier3Strikes}
              onChange={(e) => setLocalData({ ...localData, tier3Strikes: parseInt(e.target.value) || 0 })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Tier 3 Window (months)</label>
            <input
              type="number"
              value={localData.tier3Window}
              onChange={(e) => setLocalData({ ...localData, tier3Window: parseInt(e.target.value) || 0 })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end items-center gap-4 pt-4 border-t border-gray-700">
        {isSaved && (
          <div className="flex items-center gap-2 text-green-400">
            <Check className="h-5 w-5" />
            <span className="font-medium">Settings saved successfully!</span>
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className={`px-6 py-2 rounded-lg font-semibold flex items-center ${isSaving || !hasChanges ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};