/* src/utils/staffUtils.js */

export const getDisplayName = (staff) => {
    if (!staff) return 'Unknown Staff';
    if (staff.nickname) return staff.nickname;
    if (staff.firstName) return `${staff.firstName} ${staff.lastName || ''}`.trim();
    if (staff.fullName) return staff.fullName;
    return 'Unknown Staff';
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