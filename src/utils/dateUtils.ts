export const DAYS_OF_WEEK = [
  { id: 1, name: 'Pazartesi', shortName: 'Pzt' },
  { id: 2, name: 'Salı', shortName: 'Sal' },
  { id: 3, name: 'Çarşamba', shortName: 'Çar' },
  { id: 4, name: 'Perşembe', shortName: 'Per' },
  { id: 5, name: 'Cuma', shortName: 'Cum' },
  { id: 6, name: 'Cumartesi', shortName: 'Cmt' },
  { id: 7, name: 'Pazar', shortName: 'Paz' },
];

export const getDayOfWeekIndex = (date: Date = new Date()): number => {
  // JavaScript getDay() returns 0 for Sunday, 1 for Monday... 6 for Saturday
  const day = date.getDay();
  return day === 0 ? 7 : day;
};

export const formatDateToTR = (dateString?: string): string => {
  if (!dateString) return '-';
  try {
    const clean = dateString.trim().replace('T', ' ');
    const parts = clean.split(' ');
    const datePart = parts[0];
    const timePart = parts[1];

    const dParts = datePart.split('-');
    if (dParts.length === 3) {
      const formattedDate = `${dParts[2].padStart(2, '0')}.${dParts[1].padStart(2, '0')}.${dParts[0]}`;
      if (timePart) {
        const tParts = timePart.split(':');
        if (tParts.length >= 2) {
          return `${formattedDate} ${tParts[0].padStart(2, '0')}:${tParts[1].padStart(2, '0')}`;
        }
      }
      return formattedDate;
    }

    // Fallback
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    }

    return dateString;
  } catch {
    return dateString;
  }
};

export const getTodayDateString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getCurrentDateTimeString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

export const getCurrentTimeString = (): string => {
  const d = new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const isTimeBetween = (current: string, start: string, end: string): boolean => {
  try {
    const [cHour, cMin] = current.split(':').map(Number);
    const [sHour, sMin] = start.split(':').map(Number);
    const [eHour, eMin] = end.split(':').map(Number);

    const cVal = cHour * 60 + cMin;
    const sVal = sHour * 60 + sMin;
    const eVal = eHour * 60 + eMin;

    return cVal >= sVal && cVal <= eVal;
  } catch {
    return false;
  }
};
