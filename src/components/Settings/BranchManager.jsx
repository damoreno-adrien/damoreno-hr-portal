/* src/components/Settings/BranchManager.jsx */
import React, { useState } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Building, Plus, MapPin } from 'lucide-react';

export function BranchManager({ db, config }) {
    const [newBranchName, setNewBranchName] = useState('');
    const [newBranchId, setNewBranchId] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const branches = config?.branches || [];

    // Auto-generate a safe ID when typing the name (e.g., "Da Moreno Patong" -> "br_patong")
    const handleNameChange = (e) => {
        const name = e.target.value;
        setNewBranchName(name);
        
        // Only auto-generate if they haven't manually typed an ID yet
        if (!newBranchId || newBranchId.startsWith('br_')) {
            const generatedId = 'br_' + name.toLowerCase().replace(/[^a-z0-9]/g, '');
            setNewBranchId(generatedId);
        }
    };

    const handleAddBranch = async (e) => {
        e.preventDefault();
        if (!newBranchName || !newBranchId) return;

        // Check if ID already exists
        if (branches.some(b => b.id === newBranchId)) {
            alert("This Branch ID already exists! Please use a unique ID.");
            return;
        }

        setIsSaving(true);
        try {
            const configRef = doc(db, 'settings', 'company_config');
            await updateDoc(configRef, {
                branches: arrayUnion({
                    id: newBranchId,
                    name: newBranchName,
                    createdAt: new Date().toISOString()
                })
            });
            setNewBranchName('');
            setNewBranchId('');
        } catch (error) {
            console.error("Error adding branch:", error);
            alert("Failed to add branch.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="bg-gray-900/50 p-6 border-b border-gray-700">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-500/20 p-2 rounded-lg">
                        <Building className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">Company Branches</h3>
                        <p className="text-sm text-gray-400">Register new physical locations and establishments.</p>
                    </div>
                </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Add New Branch Form */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-lg">
                        <h4 className="font-bold text-white mb-4 flex items-center">
                            <Plus className="w-5 h-5 mr-2 text-indigo-400" />
                            Register New Branch
                        </h4>
                        <form onSubmit={handleAddBranch} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Branch Name (UI Display)</label>
                                <input 
                                    type="text" 
                                    required
                                    value={newBranchName} 
                                    onChange={handleNameChange} 
                                    placeholder="e.g., Da Moreno Patong" 
                                    className="w-full bg-gray-900 text-white p-2.5 rounded-lg border border-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Branch ID (Database Key)</label>
                                <input 
                                    type="text" 
                                    required
                                    value={newBranchId} 
                                    onChange={(e) => setNewBranchId(e.target.value)} 
                                    placeholder="e.g., br_patong" 
                                    className="w-full bg-gray-900/50 text-indigo-300 font-mono text-sm p-2.5 rounded-lg border border-gray-600 focus:border-indigo-500 outline-none"
                                />
                                <p className="text-[10px] text-amber-500 mt-1 font-bold">WARNING: This ID is permanent and cannot be changed later.</p>
                            </div>
                            <button 
                                type="submit" 
                                disabled={isSaving || !newBranchName || !newBranchId}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50 flex justify-center items-center"
                            >
                                {isSaving ? 'Registering...' : 'Register Branch'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Registered Branches List */}
                <div className="lg:col-span-2 space-y-4">
                    <h4 className="font-bold text-white flex items-center border-b border-gray-700 pb-2">
                        <MapPin className="w-5 h-5 mr-2 text-emerald-400" />
                        Active Establishments
                    </h4>
                    {branches.length === 0 ? (
                        <div className="bg-gray-800/50 p-8 rounded-xl border border-gray-700 border-dashed text-center">
                            <p className="text-gray-400 italic">No branches registered yet. Add your first location to get started.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {branches.map((branch) => (
                                <div key={branch.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex flex-col relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150"></div>
                                    <h5 className="font-bold text-lg text-white mb-1 relative z-10">{branch.name}</h5>
                                    <p className="text-xs text-gray-400 font-mono relative z-10">ID: {branch.id}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}