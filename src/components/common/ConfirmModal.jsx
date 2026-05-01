import React from 'react';
import { AlertTriangle, X, HelpCircle } from 'lucide-react';

export default function ConfirmModal({ 
    isOpen, 
    title, 
    message, 
    onConfirm, 
    onCancel, 
    isDestructive = false, 
    confirmText = "Confirm", 
    cancelText = "Cancel" 
}) {
    if (!isOpen) return null;

    return (
        // z-[200] s'assure que la modale passe au-dessus de tout le reste de l'application
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
            <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl transform transition-all scale-100">
                
                {/* Header dynamique basé sur isDestructive */}
                <div className={`p-4 border-b flex justify-between items-center ${isDestructive ? 'border-red-900/50 bg-red-900/20' : 'border-gray-700 bg-gray-900/50'}`}>
                    <div className="flex items-center gap-3">
                        {isDestructive ? (
                            <AlertTriangle className="text-red-500 w-6 h-6" />
                        ) : (
                            <HelpCircle className="text-indigo-400 w-6 h-6" />
                        )}
                        <h3 className="text-white font-bold">{title}</h3>
                    </div>
                    <button onClick={onCancel} className="text-gray-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Le whitespace-pre-line permet de respecter les retours à la ligne (\n) dans le message */}
                    <p className="text-gray-300 text-sm whitespace-pre-line leading-relaxed">
                        {message}
                    </p>

                    <div className="flex gap-3 pt-2">
                        <button 
                            onClick={onCancel}
                            className="flex-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white font-bold py-2.5 rounded-xl transition-all"
                        >
                            {cancelText}
                        </button>
                        <button 
                            onClick={onConfirm}
                            className={`flex-1 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 ${
                                isDestructive 
                                ? 'bg-red-600 hover:bg-red-500 text-white' 
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                            }`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}