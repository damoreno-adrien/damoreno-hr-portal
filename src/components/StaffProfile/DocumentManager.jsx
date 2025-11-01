import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';

export const DocumentManager = ({ documents = [], onUploadFile, onDeleteFile }) => {
    const [fileToUpload, setFileToUpload] = useState(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileChange = (e) => {
        setFileToUpload(e.target.files[0] || null);
    };

    const handleUploadClick = async () => {
        if (!fileToUpload) return;
        setIsUploading(true);
        try {
            await onUploadFile(fileToUpload);
            setFileToUpload(null); // Clear selection on success
            if (document.getElementById('file-upload-input')) {
                 document.getElementById('file-upload-input').value = ''; // Reset file input visually
            }
        } catch (error) {
            // Error handling might be done in the parent, but logging here is good too
            console.error("Upload failed in component:", error);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div>
            <h3 className="text-lg font-semibold text-white mb-4">Document Management</h3>
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
                    <input 
                        type="file" 
                        id="file-upload-input" 
                        onChange={handleFileChange} 
                        className="flex-grow block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                    />
                    <button 
                        onClick={handleUploadClick} 
                        disabled={!fileToUpload || isUploading} 
                        className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:bg-gray-500 flex-shrink-0 transition-colors"
                    >
                        {isUploading ? 'Uploading...' : 'Upload'}
                    </button>
                </div>
            </div>
            <div className="mt-6 space-y-3 max-h-80 overflow-y-auto">
                <h4 className="text-md font-semibold text-gray-300">Uploaded Files</h4>
                {(documents.length > 0) ? (
                    documents
                        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)) // Sort by upload date, newest first
                        .map((doc, index) => (
                            <div key={index} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg group">
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-white hover:text-amber-400 truncate pr-4 flex-grow min-w-0" title={doc.name}>
                                    {doc.name}
                                </a>
                                <button 
                                    onClick={() => onDeleteFile(doc)} 
                                    className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-4 flex-shrink-0"
                                    title="Delete this file"
                                >
                                    <Trash2 className="h-5 w-5"/>
                                </button>
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500 text-sm mt-4 text-center">No documents have been uploaded for this staff member.</p>
                    )
                }
            </div>
        </div>
    );
};