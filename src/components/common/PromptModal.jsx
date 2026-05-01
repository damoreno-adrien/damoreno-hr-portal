/* src/components/common/PromptModal.jsx */
import React, { useState, useEffect } from 'react';

export default function PromptModal({ isOpen, title, message, placeholder = "", defaultValue = "", onConfirm, onCancel, confirmText = "Submit", type = "text" }) {
    const [inputValue, setInputValue] = useState(defaultValue);

    useEffect(() => {
        if (isOpen) setInputValue(defaultValue);
    }, [isOpen, defaultValue]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm border border-gray-700 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-white mb-2 text-center">{title}</h3>
                    <p className="text-gray-300 text-sm mb-4 text-center">{message}</p>
                    
                    <input 
                        type={type}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={placeholder}
                        className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white mb-6 focus:ring-2 focus:ring-indigo-500 outline-none"
                        autoFocus
                    />

                    <div className="flex gap-3">
                        <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg font-semibold text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors">
                            Cancel
                        </button>
                        <button onClick={() => onConfirm(inputValue)} className="flex-1 py-2.5 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors">
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}