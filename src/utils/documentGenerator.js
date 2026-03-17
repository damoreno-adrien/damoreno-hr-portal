import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { formatCustom } from './dateUtils';

// --- Helper: Translate Numbers to Words (Upgraded for Salaries) ---
const translateNumber = (num, lang) => {
    if (num === undefined || num === null || num === '') return lang === 'TH' ? 'ศูนย์' : 'zero';
    const n = parseInt(num, 10);
    if (isNaN(n)) return num;
    if (n === 0) return lang === 'TH' ? 'ศูนย์' : 'zero';

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
    'contract': 'contract_template.docx',
    'salary_increase': 'Addendum_Salary_Increase.docx',
    'promotion': 'Addendum_Promotion_General.docx',
    'uniform': 'Uniform_Deduction_Authorization.docx',
    'resignation': 'Resignation_Letter.docx',
    'warning': 'Warning_Notice.docx',
    'certificate': 'Certificate_Of_Employment.docx',
    'leave': 'Leave_Request.docx'
};

export const generateDocument = async (docType, staffProfile, companyConfig, extraData = {}) => {
    try {
        const fileName = TEMPLATE_FILES[docType];
        if (!fileName) throw new Error("Invalid document type requested.");

        const response = await fetch(`/templates/${fileName}`);
        if (!response.ok) throw new Error(`Could not find the template: ${fileName}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const zip = new PizZip(arrayBuffer);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{{', end: '}}' }
        });

        // Smart Job Selection: Sort history by startDate (newest first)
        const sortedJobs = [...(staffProfile?.jobHistory || [])].sort((a, b) => {
            return new Date(b.startDate) - new Date(a.startDate);
        });
        const currentJob = sortedJobs[0] || {};
        
        // Smart Salary Selection: Look for baseSalary first, then rate, then fallback to 0
        const salaryNum = Number(currentJob.baseSalary || currentJob.rate || 0);
        
        const responsibilities = companyConfig?.roleDescriptions?.[currentJob.position || currentJob.title] || 'ROLE_RESPONSIBILITIES';
        const fullName = staffProfile?.fullName || (staffProfile?.firstName ? `${staffProfile?.firstName} ${staffProfile?.lastName}` : "STAFF_NAME");

        const data = {
            CURRENT_DATE: formatCustom(new Date(), 'dd MMMM yyyy'),
            
            COMPANY_LEGAL_NAME: companyConfig?.companyName || companyConfig?.legalName || "COMPANY_LEGAL_NAME",
            TRADING_NAME: companyConfig?.tradingName || "TRADING_NAME",
            COMPANY_ADDRESS: companyConfig?.companyAddress || companyConfig?.address || "COMPANY_ADDRESS",
            DIRECTORS: companyConfig?.directors || [{ NAME: "DIRECTOR_NAME" }],

            STAFF_NAME: fullName,
            JOB_TITLE: currentJob.position || currentJob.title || "JOB_TITLE",
            DEPARTMENT: currentJob.department || "DEPARTMENT",
            START_DATE: staffProfile?.startDate ? formatCustom(new Date(staffProfile.startDate), 'dd MMMM yyyy') : "START_DATE",
            ORIGINAL_START_DATE: staffProfile?.startDate ? formatCustom(new Date(staffProfile.startDate), 'dd MMMM yyyy') : "ORIGINAL_START_DATE",
            ROLE_RESPONSIBILITIES: responsibilities,
            
            MONTHLY_SALARY: salaryNum.toLocaleString(),
            MONTHLY_SALARY_EN: translateNumber(salaryNum, 'EN'),
            MONTHLY_SALARY_TH: translateNumber(salaryNum, 'TH'),

            ANNUAL_LEAVE_DAYS: companyConfig?.paidAnnualLeaveDays || companyConfig?.annualLeaveDays || "ANNUAL_LEAVE_DAYS",
            ANNUAL_LEAVE_DAYS_EN: translateNumber(companyConfig?.paidAnnualLeaveDays || companyConfig?.annualLeaveDays, 'EN'),
            ANNUAL_LEAVE_DAYS_TH: translateNumber(companyConfig?.paidAnnualLeaveDays || companyConfig?.annualLeaveDays, 'TH'),

            PUBLIC_HOLIDAYS_COUNT: companyConfig?.paidPublicHolidays || companyConfig?.publicHolidays?.length || "PUBLIC_HOLIDAYS_COUNT",
            PUBLIC_HOLIDAYS_COUNT_EN: translateNumber(companyConfig?.paidPublicHolidays || companyConfig?.publicHolidays?.length, 'EN'),
            PUBLIC_HOLIDAYS_COUNT_TH: translateNumber(companyConfig?.paidPublicHolidays || companyConfig?.publicHolidays?.length, 'TH'),

            SICK_LEAVE_DAYS: companyConfig?.paidSickDays || "SICK_LEAVE_DAYS",
            SICK_LEAVE_DAYS_EN: translateNumber(companyConfig?.paidSickDays, 'EN'),
            SICK_LEAVE_DAYS_TH: translateNumber(companyConfig?.paidSickDays, 'TH'),

            PROBATION_MONTHS: companyConfig?.probationMonths || "PROBATION_MONTHS",
            PROBATION_MONTHS_EN: translateNumber(companyConfig?.probationMonths, 'EN'),
            PROBATION_MONTHS_TH: translateNumber(companyConfig?.probationMonths, 'TH'),
            
            STAFF_UNIFORM: companyConfig?.staffUniforms || "STAFF_UNIFORM",
            STAFF_UNIFORM_EN: translateNumber(companyConfig?.staffUniforms, 'EN'),
            STAFF_UNIFORM_TH: translateNumber(companyConfig?.staffUniforms, 'TH'),

            MEAL_DISCOUNT_PERCENT: companyConfig?.mealDiscountPercent || "MEAL_DISCOUNT_PERCENT",
            
            DAILY_ALLOWANCE_THB: companyConfig?.dailyAllowanceTHB || "DAILY_ALLOWANCE_THB",
            DAILY_ALLOWANCE_THB_EN: translateNumber(companyConfig?.dailyAllowanceTHB, 'EN'),
            DAILY_ALLOWANCE_THB_TH: translateNumber(companyConfig?.dailyAllowanceTHB, 'TH'),

            STANDARD_START_TIME_EN: companyConfig?.standardStartTime || "STANDARD_START_TIME_EN",
            STANDARD_START_TIME_TH: companyConfig?.standardStartTime || "STANDARD_START_TIME_TH",

            ...extraData 
        };

        doc.render(data);

        const blob = doc.getZip().generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        
        const cleanName = fullName.replace(/\s+/g, '_');
        const outputFileName = `${docType.toUpperCase()}_${cleanName}.docx`;
        saveAs(blob, outputFileName);
        
        return { success: true };
    } catch (error) {
        console.error(`Error generating ${docType}:`, error);
        if (error.properties && error.properties.errors instanceof Array) {
            const errorMessages = error.properties.errors.map(e => e.properties.explanation || e.message).join("\n");
            console.error("MultiError details:", errorMessages);
            return { success: false, error: "Template Error: Open your browser console to see exactly which tag is broken!" };
        }
        return { success: false, error: error.message };
    }
};