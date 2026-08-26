/* src/utils/staffUtils.js */

export const getDisplayName = (staff) => {
    if (!staff) return 'Unknown Staff';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName) return `${staff.firstName} ${staff.lastName || ''}`.trim();
    if (staff.fullName) return staff.fullName;
    return 'Unknown Staff';
};

export const getCurrentJob = (staff) => {
    if (!staff) return {
        position: 'N/A',
        department: 'Unassigned',
        rate: 0,
        payType: 'Salary',
        displayRate: 0
    };
    if (!staff?.jobHistory || staff.jobHistory.length === 0) {
        return { 
            position: staff?.position || 'Staff',
            department: staff?.department || 'Unassigned',
            rate: staff?.baseSalary || 0,
            payType: 'Salary',
            baseSalary: staff?.baseSalary || 0,
            hourlyRate: staff?.hourlyRate || 0,
            standardDayHours: staff?.standardDayHours || 8,
            displayRate: staff?.baseSalary || 0
        };
    }
    
    const latestJob = [...staff.jobHistory].sort((a, b) => {
        const dateA = new Date(b.startDate) || new Date(0);
        const dateB = new Date(a.startDate) || new Date(0);
        return dateA - dateB;
    })[0];

    const payType = latestJob.payType || 'Salary';
    const displayRate = payType === 'Hourly' 
        ? (latestJob.hourlyRate || latestJob.rate || 0)
        : (latestJob.baseSalary || latestJob.rate || 0);

    return {
        ...latestJob,
        position: latestJob.position || 'Staff',
        department: latestJob.department || 'Unassigned',
        payType,
        displayRate,
        baseSalary: latestJob.baseSalary || latestJob.rate || 0,
        hourlyRate: latestJob.hourlyRate || latestJob.rate || 0,
        standardDayHours: latestJob.standardDayHours || 8
    };
};

export const formatRate = (rate, payType) => {
    if (rate === undefined || rate === null) return 'N/A';
    const numValue = Number(rate);
    if (isNaN(numValue)) return 'N/A';
    
    return payType === 'Hourly' 
        ? `฿${numValue.toLocaleString('en-US')}/h`
        : `฿${numValue.toLocaleString('en-US')}/mo`;
};

export const checkIsBirthday = (birthdate) => {
    if (!birthdate) return false;
    const today = new Date();
    const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    let bStr = "";
    if (birthdate.toDate) { 
        const d = birthdate.toDate();
        bStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else { 
        const d = new Date(birthdate);
        bStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return bStr === todayStr;
};

export const parseHireDate = (startDate) => {
    let hireDate = new Date();
    if (!startDate) return hireDate;

    if (startDate.toDate) {
        hireDate = startDate.toDate(); 
    } else if (typeof startDate === 'string') {
        if (startDate.includes('/')) {
            const parts = startDate.split('/');
            if (parts.length === 3) hireDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            else hireDate = new Date(startDate);
        } else {
            hireDate = new Date(startDate);
        }
    }
    hireDate.setHours(0, 0, 0, 0);
    return hireDate;
};
