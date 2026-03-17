import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { formatCustom } from './dateUtils';

// --- Helper: Translate Numbers to Words  ---
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
                str += 'สิบ'; // 10
            } else if (position % 6 === 1 && digit === 2) {
                str += 'ยี่สิบ'; // 20
            } else if (position % 6 === 0 && digit === 1 && i > 0 && numStr[i-1] !== '0') {
                str += 'เอ็ด'; // Ends in 1 (e.g., 11, 21)
            } else {
                str += digits[digit] + positions[position % 6];
            }
            
            // Handle Millions place
            if (position > 0 && position % 6 === 0 && numStr.length > 6) {
                 str += 'ล้าน';
            }
        }
        return str;
    }
    return n.toString();
};

export const generateContract = async (staffProfile, companyConfig) => {
    try {
        // 1. Fetch the template from the public folder
        const response = await fetch('/templates/contract_template.docx');
        if (!response.ok) throw new Error("Could not find the contract template. Make sure it is in public/templates/contract_template.docx");
        
        const arrayBuffer = await response.arrayBuffer();
        
        // 2. Unzip the Word Document
        const zip = new PizZip(arrayBuffer);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{{', end: '}}' }
        });

        // 3. Prepare the Data
        const salaryNum = Number(staffProfile?.jobHistory?.[0]?.baseSalary || 0);

        const data = {
            // Employer Variables
            COMPANY_LEGAL_NAME: companyConfig?.companyName || "COMPANY_LEGAL_NAME",
            TRADING_NAME: companyConfig?.tradingName || "TRADING_NAME",
            COMPANY_ADDRESS: companyConfig?.companyAddress || "COMPANY_ADDRESS",
            
            // Loop for Directors
            DIRECTORS: companyConfig?.directors || [
                { NAME: "DIRECTOR_NAME" },
            ],

            // Staff Variables
            STAFF_NAME: staffProfile?.fullName || staffProfile?.firstName + ' ' + staffProfile?.lastName || "FIRST_NAME LAST_NAME",
            JOB_TITLE: staffProfile?.jobHistory?.[0]?.position || "STAFF_POSITION",
            START_DATE: staffProfile?.startDate ? formatCustom(new Date(staffProfile.startDate), 'dd MMMM yyyy') : "START_DATE",
            
            // Salary Variables (With EN/TH Translations)
            MONTHLY_SALARY: salaryNum.toLocaleString(),
            MONTHLY_SALARY_EN: translateNumber(salaryNum, 'EN'),
            MONTHLY_SALARY_TH: translateNumber(salaryNum, 'TH'),

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