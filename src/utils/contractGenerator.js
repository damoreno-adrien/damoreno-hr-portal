import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { formatCustom } from './dateUtils';

// --- Helper: Translate Numbers to Words (Supports 0-999) ---
const translateNumber = (num, lang) => {
    // 1. Handle completely missing numbers
    if (num === undefined || num === null || num === '') return lang === 'TH' ? 'ศูนย์' : 'zero';

    const n = parseInt(num, 10);
    if (isNaN(n)) return num;

    // 2. NEW: Explicitly handle Zero
    if (n === 0) return lang === 'TH' ? 'ศูนย์' : 'zero';

    if (lang === 'EN') {
        const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + ones[n % 10] : '');
        return n.toString(); // Fallback for huge numbers like salary
    } 
    
    if (lang === 'TH') {
        const onesTh = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
        const tensTh = ['', 'สิบ', 'ยี่สิบ', 'สามสิบ', 'สี่สิบ', 'ห้าสิบ', 'หกสิบ', 'เจ็ดสิบ', 'แปดสิบ', 'เก้าสิบ'];
        if (n === 1) return 'หนึ่ง';
        if (n === 11) return 'สิบเอ็ด';
        if (n < 10) return onesTh[n];
        if (n < 100) return tensTh[Math.floor(n / 10)] + (n % 10 !== 0 ? (n % 10 === 1 ? 'เอ็ด' : onesTh[n % 10]) : '');
        return n.toString(); // Fallback for huge numbers
    }
    return n.toString();
};

export const generateContract = async (staffProfile, companyConfig) => {
    try {
        // 1. Fetch the template from the public folder (Use v2 if you renamed it!)
        const response = await fetch('/templates/contract_template.docx');
        if (!response.ok) throw new Error("Could not find the contract template. Make sure it is in public/templates/contract_template.docx");
        
        const arrayBuffer = await response.arrayBuffer();
        
        // 2. Unzip the Word Document
        const zip = new PizZip(arrayBuffer);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{{', end: '}}' } // Fixes the double-bracket issue
        });

        // 3. Prepare the Data
        const salaryNum = Number(staffProfile?.baseSalary || 0);

        const data = {
            // Employer Variables
            COMPANY_LEGAL_NAME: companyConfig?.legalName || "Fraternita Co. Ltd.",
            TRADING_NAME: companyConfig?.tradingName || "Da Moreno At Town",
            COMPANY_ADDRESS: companyConfig?.address || "8 Yaowarad Rd, Tambon Talat Yai, Mueang Phuket District, Phuket 83000",
            
            // Loop for Directors
            DIRECTORS: companyConfig?.directors || [
                { NAME: "Marco VAIANO" },
                { NAME: "Jeremie Cyrille Alexis PIEYRE" }
            ],

            // Staff Variables
            STAFF_NAME: staffProfile?.fullName || staffProfile?.firstName || "Unknown",
            JOB_TITLE: staffProfile?.jobHistory?.[0]?.title || "Staff",
            START_DATE: staffProfile?.startDate ? formatCustom(new Date(staffProfile.startDate), 'dd MMMM yyyy') : "TBD",
            
            // Salary (Now handles 0 explicitly)
            MONTHLY_SALARY: salaryNum.toLocaleString(),
            MONTHLY_SALARY_EN: salaryNum === 0 ? 'zero' : salaryNum.toLocaleString(),
            MONTHLY_SALARY_TH: salaryNum === 0 ? 'ศูนย์' : salaryNum.toLocaleString(),

            // Config Variables (With EN/TH Translations)
            ANNUAL_LEAVE_DAYS: companyConfig?.paidAnnualLeaveDays || 6,
            ANNUAL_LEAVE_DAYS_EN: translateNumber(companyConfig?.paidAnnualLeaveDays || 6, 'EN'),
            ANNUAL_LEAVE_DAYS_TH: translateNumber(companyConfig?.paidAnnualLeaveDays || 6, 'TH'),

            PUBLIC_HOLIDAYS_COUNT: companyConfig?.paidPublicHolidays || 13,
            PUBLIC_HOLIDAYS_COUNT_EN: translateNumber(companyConfig?.paidPublicHolidays || 13, 'EN'),
            PUBLIC_HOLIDAYS_COUNT_TH: translateNumber(companyConfig?.paidPublicHolidays || 13, 'TH'),

            SICK_LEAVE_DAYS: companyConfig?.paidSickDays || 30,
            SICK_LEAVE_DAYS_EN: translateNumber(companyConfig?.paidSickDays || 30, 'EN'),
            SICK_LEAVE_DAYS_TH: translateNumber(companyConfig?.paidSickDays || 30, 'TH'),

            // Bulletproof fallback for the older Sick Leave tags without "_DAYS"
            SICK_LEAVE: companyConfig?.paidSickDays || 30,
            SICK_LEAVE_EN: translateNumber(companyConfig?.paidSickDays || 30, 'EN'),
            SICK_LEAVE_TH: translateNumber(companyConfig?.paidSickDays || 30, 'TH'),

            // Hardcoded operational variables (until added to Settings)
            PROBATION_MONTHS: 3,
            PROBATION_MONTHS_EN: translateNumber(3, 'EN'),
            PROBATION_MONTHS_TH: translateNumber(3, 'TH'),
            
            STAFF_UNIFORM: 3,
            STAFF_UNIFORM_EN: translateNumber(3, 'EN'),
            STAFF_UNIFORM_TH: translateNumber(3, 'TH'),

            MEAL_DISCOUNT_PERCENT: 50,
            
            DAILY_ALLOWANCE_THB: 50,
            DAILY_ALLOWANCE_THB_EN: translateNumber(50, 'EN'),
            DAILY_ALLOWANCE_THB_TH: translateNumber(50, 'TH'),

            STANDARD_START_TIME_EN: "2:00 PM",
            STANDARD_START_TIME_TH: "14:00 น.",
        };

        // 4. Inject data into template
        doc.render(data);

        // 5. Generate and Download
        const blob = doc.getZip().generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        
        const fileName = `Employment_Contract_${data.STAFF_NAME.replace(/\s+/g, '_')}.docx`;
        saveAs(blob, fileName);
        
        return { success: true };
    } catch (error) {
        console.error("Error generating contract:", error);
        if (error.properties && error.properties.errors instanceof Array) {
            const errorMessages = error.properties.errors.map(function (e) {
                return e.properties.explanation || e.message;
            }).join("\n");
            console.error("MultiError details:", errorMessages);
            return { success: false, error: "Template Error: Open your browser console (F12) to see exactly which tag is broken!" };
        }
        return { success: false, error: error.message };
    }
};