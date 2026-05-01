/* src/components/common/FeedbackModal.jsx */
import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function FeedbackModal({ isOpen, type, title, message, onClose }) {
    if (!isOpen) return null;
    const isError = type === 'error';
    
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm border border-gray-700 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 text-center">
                    <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isError ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                        {isError ? <AlertCircle className="w-8 h-8" /> : <CheckCircle className="w-8 h-8" />}
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                    <p className="text-gray-300 text-sm mb-6 leading-relaxed">{message}</p>
                    <button onClick={onClose} className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${isError ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'}`}>
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
}