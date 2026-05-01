/* src/utils/documentGenerator.js */

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { formatCustom } from './dateUtils';

// --- Helper: Translate Numbers to Words (Upgraded for Salaries) ---
export const translateNumber = (num, lang) => {
    // FIX: Empêche "undefined" de casser la traduction
    if (num === undefined || num === null || num === '' || String(num).toLowerCase() === 'undefined') {
        return lang === 'TH' ? 'ศูนย์' : 'zero';
    }
    
    const n = parseInt(num, 10);
    // FIX: Si c'est du texte ou NaN, on renvoie zéro au lieu de planter
    if (isNaN(n)) return lang === 'TH' ? 'ศูนย์' : 'zero'; 

    if (lang === 'EN') {
        const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        const scales = ['', 'thousand', 'million'];

        const convertLessThanOneThousand = (num) => {
            let currentStr = '';
            if (num % 100 < 20) {
                currentStr = ones[num % 100];
                num = Math.floor(num / 100);
            } else {
                currentStr = ones[num % 10];
                num = Math.floor(num / 10);
                currentStr = tens[num % 10] + (currentStr ? '-' + currentStr : '');
                num = Math.floor(num / 10);
            }
            if (num === 0) return currentStr;
            return ones[num] + ' hundred' + (currentStr ? ' and ' + currentStr : '');
        };

        let str = '';
        let scaleIdx = 0;
        let tempN = n;
        while (tempN > 0) {
            const chunk = tempN % 1000;
            if (chunk > 0) {
                const chunkStr = convertLessThanOneThousand(chunk);
                str = chunkStr + (scales[scaleIdx] ? ' ' + scales[scaleIdx] : '') + (str ? ' ' + str : '');
            }
            tempN = Math.floor(tempN / 1000);
            scaleIdx++;
        }
        return str.trim();
    } 
    
    if (lang === 'TH') {
        const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
        const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
        let str = '';
        const numStr = n.toString();
        for (let i = 0; i < numStr.length; i++) {
            const digit = parseInt(numStr[i]);
            const position = numStr.length - 1 - i;
            if (digit === 0) continue;
            if (position % 6 === 1 && digit === 1) {
                str += 'สิบ'; 
            } else if (position % 6 === 1 && digit === 2) {
                str += 'ยี่สิบ'; 
            } else if (position % 6 === 0 && digit === 1 && i > 0 && numStr[i-1] !== '0') {
                str += 'เอ็ด'; 
            } else {
                str += digits[digit] + positions[position % 6];
            }
            if (position > 0 && position % 6 === 0 && numStr.length > 6) {
                 str += 'ล้าน';
            }
        }
        return str;
    }
    return n.toString();
};

const TEMPLATE_FILES = {
    'contract': 'General_Contract.docx',
    'salary_increase': 'Addendum_Salary_Increase.docx',
    'promotion': 'Addendum_Promotion_General.docx',
    'uniform': 'Uniform_Deduction_Authorization.docx',
    'resignation': 'Resignation_Letter.docx',
    'warning': 'Warning_Notice.docx',
    'certificate': 'Certificate_Of_Employment.docx',
    'leave': 'Leave_Request.docx',
    'receipt': 'Payment_receipt.docx'
};

export const generateDocument = async (docType, staffProfile, companyConfig, extraData = {}) => {
    try {
        const fileName = TEMPLATE_FILES[docType];
        if (!fileName) throw new Error("Invalid document type requested.");

        // Fusion de la configuration de branche (au cas où tu l'aurais oublié)
        const staffBranchId = extraData.BRANCH_NAME || staffProfile?.branchId;
        const branchOverrides = companyConfig?.branchSettings?.[staffBranchId] || {};
        const effectiveConfig = { ...companyConfig, ...branchOverrides };

        const response = await fetch(`/templates/${fileName}`);
        if (!response.ok) throw new Error(`Could not find the template: ${fileName}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const zip = new PizZip(arrayBuffer);
        
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{{', end: '}}' },
            // FIX ULTIME : Remplace "undefined" par un espace vide si le tag Word est inconnu
            nullGetter: function() {
                return "";
            }
        });

        const sortedJobs = [...(staffProfile?.jobHistory || [])].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
        const currentJob = sortedJobs[0] || {};
        
        const salaryNum = Number(currentJob.baseSalary || currentJob.rate || 0);
        const netPayRaw = Number(extraData.NET_PAY_RAW) || 0;
        
        const templateName = currentJob.roleTemplate || currentJob.position || currentJob.title;
        const responsibilities = effectiveConfig?.roleDescriptions?.[templateName] || '[ ROLE_RESPONSIBILITIES_MISSING ]';
        
        const fullName = staffProfile?.fullName || (staffProfile?.firstName ? `${staffProfile?.firstName} ${staffProfile?.lastName}` : (staffProfile?.name || "STAFF_NAME"));
        const branchName = effectiveConfig?.branches?.find(b => b.id === staffBranchId)?.name || staffBranchId || "Unassigned";

        const data = {
            CURRENT_DATE: formatCustom(new Date(), 'dd MMMM yyyy'),
            
            COMPANY_LEGAL_NAME: effectiveConfig?.companyName || effectiveConfig?.legalName || "COMPANY_LEGAL_NAME",
            TRADING_NAME: effectiveConfig?.tradingName || "TRADING_NAME",
            COMPANY_ADDRESS: effectiveConfig?.companyAddress || effectiveConfig?.address || "COMPANY_ADDRESS",
            DIRECTORS: effectiveConfig?.directors || [{ NAME: "DIRECTOR_NAME" }],

            BRANCH_NAME: branchName,
            PAYMENT_METHOD_DISPLAY: staffProfile?.paymentMethod === 'cash' ? 'Cash / เงินสด' : 'Bank Transfer / โอนผ่านธนาคาร',
            IS_BANK: staffProfile?.paymentMethod !== 'cash',
            BANK_ACCOUNT: staffProfile?.bankAccount || "-",
            HOLIDAY_POLICY: staffProfile?.holidayPolicy === 'paid' ? 'Paid / จ่ายเป็นเงิน' : 'In Lieu / ชดเชยวันหยุด',
            
            STAFF_NAME: fullName,
            JOB_TITLE: currentJob.position || currentJob.title || "JOB_TITLE",
            DEPARTMENT: currentJob.department || "DEPARTMENT",
            START_DATE: staffProfile?.startDate ? formatCustom(new Date(staffProfile.startDate), 'dd MMMM yyyy') : "START_DATE",
            ORIGINAL_START_DATE: staffProfile?.startDate ? formatCustom(new Date(staffProfile.startDate), 'dd MMMM yyyy') : "ORIGINAL_START_DATE",
            
            // On fournit les variables et des alias courants pour s'adapter à tes documents Word
            ROLE_RESPONSIBILITIES: responsibilities,
            RESPONSIBILITIES: responsibilities, // Alias
            
            ID_TYPE: staffProfile?.idType || "ID_TYPE",
            ID_NUMBER: staffProfile?.idNumber || "-",            
            
            MONTHLY_SALARY: salaryNum.toLocaleString(),
            MONTHLY_SALARY_EN: translateNumber(salaryNum, 'EN'),
            MONTHLY_SALARY_TH: translateNumber(salaryNum, 'TH'),

            NET_PAY_WORDS_TH: translateNumber(netPayRaw, 'TH') + (netPayRaw > 0 ? ' ถ้วน' : ''),
            NET_PAY_WORDS_EN: translateNumber(netPayRaw, 'EN') + ' Baht',

            ANNUAL_LEAVE_DAYS: effectiveConfig?.paidAnnualLeaveDays || effectiveConfig?.annualLeaveDays || "0",
            ANNUAL_LEAVE_DAYS_EN: translateNumber(effectiveConfig?.paidAnnualLeaveDays || effectiveConfig?.annualLeaveDays, 'EN'),
            ANNUAL_LEAVE_DAYS_TH: translateNumber(effectiveConfig?.paidAnnualLeaveDays || effectiveConfig?.annualLeaveDays, 'TH'),

            PUBLIC_HOLIDAYS_COUNT: effectiveConfig?.paidPublicHolidays || effectiveConfig?.publicHolidays?.length || "0",
            PUBLIC_HOLIDAYS: effectiveConfig?.paidPublicHolidays || effectiveConfig?.publicHolidays?.length || "0", // Alias
            PUBLIC_HOLIDAYS_COUNT_EN: translateNumber(effectiveConfig?.paidPublicHolidays || effectiveConfig?.publicHolidays?.length, 'EN'),
            PUBLIC_HOLIDAYS_COUNT_TH: translateNumber(effectiveConfig?.paidPublicHolidays || effectiveConfig?.publicHolidays?.length, 'TH'),

            SICK_LEAVE_DAYS: effectiveConfig?.paidSickDays || "0",
            SICK_LEAVE_DAYS_EN: translateNumber(effectiveConfig?.paidSickDays, 'EN'),
            SICK_LEAVE_DAYS_TH: translateNumber(effectiveConfig?.paidSickDays, 'TH'),

            PROBATION_MONTHS: effectiveConfig?.probationMonths || "0",
            PROBATION_MONTHS_EN: translateNumber(effectiveConfig?.probationMonths, 'EN'),
            PROBATION_MONTHS_TH: translateNumber(effectiveConfig?.probationMonths, 'TH'),
            
            STAFF_UNIFORM: effectiveConfig?.staffUniforms || "0",
            UNIFORMS: effectiveConfig?.staffUniforms || "0", // Alias
            STAFF_UNIFORM_EN: translateNumber(effectiveConfig?.staffUniforms, 'EN'),
            STAFF_UNIFORM_TH: translateNumber(effectiveConfig?.staffUniforms, 'TH'),

            MEAL_DISCOUNT_PERCENT: effectiveConfig?.mealDiscountPercent || "0",
            MEAL_DISCOUNT: effectiveConfig?.mealDiscountPercent || "0", // Alias
            
            DAILY_ALLOWANCE_THB: effectiveConfig?.dailyAllowanceTHB || "0",
            DAILY_ALLOWANCE: effectiveConfig?.dailyAllowanceTHB || "0", // Alias
            DAILY_ALLOWANCE_THB_EN: translateNumber(effectiveConfig?.dailyAllowanceTHB, 'EN'),
            DAILY_ALLOWANCE_THB_TH: translateNumber(effectiveConfig?.dailyAllowanceTHB, 'TH'),

            STANDARD_START_TIME_EN: effectiveConfig?.standardStartTime || "00:00",
            STANDARD_START_TIME_TH: effectiveConfig?.standardStartTime || "00:00",

            ...extraData 
        };

        doc.render(data);

        const blob = doc.getZip().generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        
        const cleanName = fullName.replace(/\s+/g, '_');
        let outputFileName = `${docType.toUpperCase()}_${cleanName}.docx`;
        
        if (docType === 'receipt') {
            const periodSlug = extraData.PAY_PERIOD ? extraData.PAY_PERIOD.replace(/\s+/g, '_') : '';
            outputFileName = `Payment_Receipt_${cleanName}_${periodSlug}.docx`;
        }
        
        saveAs(blob, outputFileName);
        return { success: true };
    } catch (error) {
        console.error(`Error generating ${docType}:`, error);
        return { success: false, error: error.message };
    }
};