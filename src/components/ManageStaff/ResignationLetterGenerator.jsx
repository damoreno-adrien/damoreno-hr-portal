// src/components/ManageStaff/ResignationLetterGenerator.jsx
import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, Edit3, ArrowRight } from 'lucide-react';
import * as dateUtils from '../../utils/dateUtils';

export default function ResignationLetterGenerator({ staff, isOpen, onClose }) {
    const printRef = useRef();
    const [step, setStep] = useState(1); // Step 1: Edit Data, Step 2: Preview & Print
    
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        phone: '',
        position: '',
        noticeDate: '',
        lastWorkingDay: '',
        language: 'both' // 'both', 'english', 'thai'
    });

    // Initialize data when modal opens
    useEffect(() => {
        if (isOpen && staff) {
            // 1. Extract Name (First + Last, fallback to nickname/displayName)
            const fullName = [staff.firstName, staff.lastName].filter(Boolean).join(' ').trim() 
                || staff.fullName 
                || staff.nickname 
                || 'Employee Name';

            // 2. Extract Position (Digging into jobHistory array)
            let position = '';
            if (staff.jobHistory && staff.jobHistory.length > 0) {
                // Assuming jobHistory is sorted or the first is the current one
                position = staff.jobHistory[0].position || staff.jobHistory[0].department || '';
            }
            if (!position) position = staff.position || staff.department || 'Staff Member';

            // 3. Calculate Default Dates (Last day = 1 month from today)
            const today = new Date();
            const nextMonth = new Date(today);
            nextMonth.setDate(nextMonth.getDate() + 30);

            setFormData({
                name: fullName,
                address: staff.address || '',
                phone: staff.phoneNumber || staff.phone || '',
                position: position,
                noticeDate: dateUtils.formatISODate(today),
                lastWorkingDay: dateUtils.formatISODate(nextMonth),
                language: 'both'
            });
            setStep(1); // Reset to step 1
        }
    }, [isOpen, staff]);

    // Handle smart date changing
    const handleDateChange = (field, value) => {
        const newDate = new Date(value);
        if (isNaN(newDate.getTime())) return; // Invalid date

        if (field === 'lastWorkingDay') {
            const noticeDate = new Date(newDate);
            noticeDate.setDate(noticeDate.getDate() - 30); // <-- Subtract exactly 30 days
            setFormData({ ...formData, lastWorkingDay: value, noticeDate: dateUtils.formatISODate(noticeDate) });
        } else if (field === 'noticeDate') {
            const lastDay = new Date(newDate);
            lastDay.setDate(lastDay.getDate() + 30); // <-- Add exactly 30 days
            setFormData({ ...formData, noticeDate: value, lastWorkingDay: dateUtils.formatISODate(lastDay) });
        }
    };

    const handlePrint = () => {
        const content = printRef.current;
        const originalContents = document.body.innerHTML;
        const originalTitle = document.title; // Save the original website title
        
        // --- 1. Generate the Custom Filename ---
        const d = new Date(formData.noticeDate);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const fileNameDate = `${yyyy}${mm}${dd}`;
        
        // Remove spaces from the name for a clean filename
        const formattedName = formData.name.replace(/\s+/g, ''); 
        
        // Temporarily change the website title to force the PDF filename
        document.title = `ResignationLetter_${formattedName}_${fileNameDate}`;

        // --- 2. Print Execution ---
        document.body.innerHTML = `<div class="clean-print-container">${content.innerHTML}</div>`;
        window.print();
        
        // --- 3. Clean up and Restore ---
        document.title = originalTitle; // Put the title back
        document.body.innerHTML = originalContents;
        window.location.reload(); 
    };

    if (!isOpen || !staff) return null;

    const formattedNoticeDate = formData.noticeDate ? dateUtils.formatDisplayDate(formData.noticeDate) : '[Date]';
    const formattedLastDay = formData.lastWorkingDay ? dateUtils.formatDisplayDate(formData.lastWorkingDay) : '[Date]';

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 font-sans">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl border border-gray-700 flex flex-col max-h-[95vh] overflow-hidden">
                
                {/* --- HEADER --- */}
                <div className="flex justify-between items-center p-5 border-b border-gray-700 bg-gray-900">
                    <h2 className="text-xl font-bold text-white flex items-center">
                        {step === 1 ? 'Step 1: Verify Details' : 'Step 2: Preview & Print Letter'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* --- SCROLLABLE BODY --- */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-900">
                    
                    {step === 1 ? (
                        /* --- STEP 1: EDIT FORM --- */
                        <div className="max-w-2xl mx-auto space-y-6 bg-gray-800 p-6 rounded-xl border border-gray-700">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Full Name</label>
                                    <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white outline-none focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Position</label>
                                    <input type="text" value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})} className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white outline-none focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Phone Number</label>
                                    <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white outline-none focus:border-blue-500" placeholder="e.g. 092-XXX-XXXX" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Language</label>
                                    <select value={formData.language} onChange={e => setFormData({...formData, language: e.target.value})} className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white outline-none focus:border-blue-500">
                                        <option value="both">Bilingual (English + Thai)</option>
                                        <option value="english">English Only</option>
                                        <option value="thai">Thai Only</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Address</label>
                                    <textarea value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} rows="2" className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white outline-none focus:border-blue-500" placeholder="Staff home address..." />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                                <div className="bg-amber-900/20 p-4 rounded-lg border border-amber-800/50">
                                    <label className="block text-sm font-bold text-amber-500 mb-1">Last Working Day</label>
                                    <input type="date" value={formData.lastWorkingDay} onChange={e => handleDateChange('lastWorkingDay', e.target.value)} className="w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-white outline-none focus:border-amber-500" />
                                </div>
                                <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-800/50">
                                    <label className="block text-sm font-bold text-blue-400 mb-1">Notice Date (Signed Date)</label>
                                    <input type="date" value={formData.noticeDate} onChange={e => handleDateChange('noticeDate', e.target.value)} className="w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-white outline-none focus:border-blue-500" />
                                    <p className="text-[10px] text-gray-400 mt-2">* Automatically set to 1 month before last working day.</p>
                                </div>
                            </div>
                        </div>
                    ) : (                        
                        /* --- STEP 2: PRINT PREVIEW --- */
                        <div className="flex flex-col items-center bg-gray-900 pb-8 space-y-8">
                            {/* The printable area wrapper */}
                            <div ref={printRef} className="w-full max-w-[210mm]">
                                
                                {/* --- ENGLISH PAGE --- */}
                                {(formData.language === 'both' || formData.language === 'english') && (
                                    <div className={`virtual-paper bg-white text-black border border-gray-300 mx-auto ${formData.language === 'both' ? 'print-page-break' : ''}`} style={{ width: '210mm', minHeight: '297mm', padding: '25mm 20mm', fontFamily: 'Arial, sans-serif' }}>
                                        <div className="text-center mb-10">
                                            <p className="font-bold text-xl">Resignation letter</p>
                                        </div>
                                        <div className="text-sm mb-8 space-y-1">
                                            <p><span className="font-bold">Full Name:</span> {formData.name}</p>
                                            {formData.address && <p><span className="font-bold">Address:</span> {formData.address}</p>}
                                            {formData.phone && <p><span className="font-bold">Phone:</span> {formData.phone}</p>}
                                        </div>
                                        <p></p>
                                        <div className="text-right text-sm mb-8 space-y-1">
                                            <p className="font-bold text-base">Da Moreno At Town</p>
                                            <p>FRATERNITA CO. LTD,</p>
                                            <p>8 Yaowarad Rd, Tambon Talat Yai, Mueang Phuket District, Phuket 83000</p>
                                        </div>

                                        <div className="text-sm mb-6 font-semibold">
                                            <p>Date: {formattedNoticeDate}</p>
                                        </div>

                                        <div className="text-sm mb-6 font-semibold">
                                            <p>Subject: Resignation - {formData.name}</p>
                                        </div>

                                        <div className="text-sm space-y-4 mb-12 leading-relaxed">
                                            <p>Dear Manager,</p>
                                            <p>
                                                Please accept this letter as formal notification that I am resigning from my position as <strong>{formData.position}</strong> at Da Moreno At Town, effective one month from today. My last day of employment will be <strong>{formattedLastDay}</strong>.
                                            </p>
                                            <p>
                                                I have appreciated the opportunities I have been given during my time at Da Moreno At Town. Thank you for the experience and support I have received.
                                            </p>
                                            <p>
                                                I am committed to ensuring a smooth transition during my departure. Please let me know if there is anything I can do to assist in this process.
                                            </p>
                                            <p className="mt-8 pt-4">Sincerely,</p>
                                            <div className="mt-12 pt-3 border-t border-gray-400 w-48 text-center font-bold">
                                                <p>{formData.name}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* --- THAI PAGE --- */}
                                {(formData.language === 'both' || formData.language === 'thai') && (
                                    <div className="virtual-paper bg-white text-black border border-gray-300 mx-auto mt-8 print-no-margin-top" style={{ width: '210mm', minHeight: '297mm', padding: '25mm 20mm', fontFamily: 'Arial, sans-serif' }}>
                                        <div className="text-center mb-10">
                                            <p className="font-bold text-xl">จดหมายลาออก</p>
                                        </div>
                                        <div className="mb-8 space-y-1">
                                            <p><span className="font-bold">ชื่อ:</span> {formData.name}</p>
                                            {formData.address && <p><span className="font-bold">ที่อยู่:</span> {formData.address}</p>}
                                            {formData.phone && <p><span className="font-bold">เบอร์โทรศัพท์:</span> {formData.phone}</p>}
                                        </div>

                                        <div className="mb-8 space-y-1">
                                            <p className="font-bold text-base">เรียน ผู้จัดการ,</p>
                                            <p>Da Moreno At Town / บริษัท ฟรา เทอ นิ ต้าร์ จำกัด</p>
                                            <p>8 ถนนเยาวราช ตําบลตลาดใหญ อําเภอเมืองภูเก็ต ภูเก็ต 83000</p>
                                        </div>
                                        
                                        <div className="mb-6 font-semibold">
                                            <p>เรื่อง: การลาออก - {formData.name}</p>
                                            <p className="mt-1">วันที่: {formattedNoticeDate}</p>
                                        </div>

                                        <div className="space-y-4 leading-relaxed">
                                            <p>
                                                โปรดพิจารณาจดหมายฉบับนี้เป็นการแจ้งให้ทราบอย่างเป็นทางการว่า ข้าพเจ้ามีความประสงค์ที่จะลาออกจากตำแหน่ง <strong>{formData.position}</strong> ที่ Da Moreno At Town โดยมีผลตั้งแต่วันนี้ไปอีกหนึ่งเดือนข้างหน้า วันสุดท้ายในการทำงานของข้าพเจ้าคือ <strong>{formattedLastDay}</strong>
                                            </p>
                                            <p>
                                                ข้าพเจ้าขอขอบคุณสำหรับโอกาสที่ได้รับในช่วงเวลาที่ข้าพเจ้าได้ทำงานที่ Da Moreno At Town ขอบคุณสำหรับประสบการณ์และการสนับสนุนที่ข้าพเจ้าได้รับ
                                            </p>
                                            <p>
                                                ข้าพเจ้ายินดีที่จะให้ความร่วมมือเพื่อให้การเปลี่ยนแปลงตำแหน่งงานเป็นไปอย่างราบรื่น โปรดแจ้งให้ข้าพเจ้าทราบหากมีสิ่งใดที่ข้าพเจ้าสามารถทำได้เพื่อช่วยในกระบวนการนี้
                                            </p>
                                        </div>
                                        
                                        <p className="mt-8 pt-4">ขอแสดงความนับถือ,</p>
                                        <div className="mt-12 pt-3 border-t border-gray-400 w-48 text-center font-bold">
                                            <p>{formData.name}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* --- FOOTER CONTROLS --- */}
                <div className="p-4 border-t border-gray-700 bg-gray-900 flex justify-between items-center">
                    {step === 2 ? (
                        <button onClick={() => setStep(1)} className="flex items-center text-gray-400 hover:text-white px-4 py-2">
                            <Edit3 className="w-4 h-4 mr-2" /> Edit Details
                        </button>
                    ) : (
                        <div></div>
                    )}

                    {step === 1 ? (
                        <button onClick={() => setStep(2)} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-lg">
                            Preview Letter <ArrowRight className="w-5 h-5" />
                        </button>
                    ) : (
                        <button onClick={handlePrint} className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-8 rounded-lg shadow-lg">
                            <Printer className="w-5 h-5" /> Print / Save as PDF
                        </button>
                    )}
                </div>
            </div>

            {/* Print CSS injected directly to format the virtual A4 pages */}
            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    @page { size: A4 portrait; margin: 0; }
                    body { background: white !important; margin: 0; padding: 0; }
                    
                    body > *:not(.clean-print-container) { display: none !important; }
                    .clean-print-container { width: 100%; display: block; position: static; }
                    
                    .virtual-paper { 
                        box-shadow: none !important; 
                        border: none !important; 
                        width: 210mm !important;
                        height: 297mm !important; /* Force exact A4 height */
                        max-height: 297mm !important;
                        padding: 25mm 20mm !important;
                        margin: 0 !important;
                        color: black !important;
                        background: white !important;
                        page-break-inside: avoid;
                        page-break-after: always;
                        overflow: hidden !important; /* Kills the shadow artifact */
                    }

                    /* Stop the browser from printing a blank 3rd page */
                    .virtual-paper:last-child {
                        page-break-after: auto !important; 
                    }
                    
                    .print-no-margin-top {
                        margin-top: 0 !important;
                    }
                }
            `}} />
        </div>
    );
}