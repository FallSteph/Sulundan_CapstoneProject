export interface Semester {
  id: string;
  name: string;
  code: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isCurrent: boolean;
  isArchived?: boolean;
  createdAt: string;
}

export function isSyllabusInSemester(
  s: { semesterId?: string; semester_id?: string; semesterPeriod?: string; semester?: string; academic_year?: string; schoolYear?: string } | null | undefined,
  sem: Semester | null | undefined
): boolean {
  if (!s) return false;
  if (!sem) return true;

  const semId = String(s.semesterId || s.semester_id || '').trim();
  const targetId = String(sem.id || '').trim();
  if (semId && targetId && semId === targetId) return true;

  const targetCode = (sem.code || '').toLowerCase().trim();
  if (targetCode && semId.toLowerCase() === targetCode) return true;

  const period = (s.semesterPeriod || s.semester || '').toLowerCase().trim();
  const semName = (sem.name || '').toLowerCase().trim();

  if (targetCode && period && (period.includes(targetCode) || targetCode.includes(period))) return true;

  if (period && semName) {
    if (period === semName || period.includes(semName) || semName.includes(period)) return true;

    // Check academic years if present in both
    const semYears = semName.match(/\d{4}/g);
    const periodYears = period.match(/\d{4}/g);
    if (semYears && periodYears) {
      const yearMatches = semYears.some(y => periodYears.includes(y));
      if (!yearMatches) return false;
    }

    const is1st = (str: string) => str.includes('1st') || str.includes('first') || str.includes('-1');
    const is2nd = (str: string) => str.includes('2nd') || str.includes('second') || str.includes('-2');
    const isSummer = (str: string) => str.includes('summer') || str.includes('midyear');

    if (is1st(semName) && is1st(period)) return true;
    if (is2nd(semName) && is2nd(period)) return true;
    if (isSummer(semName) && isSummer(period)) return true;
  }

  return false;
}

const getCurrentSchoolYear = () => {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  return `${currentYear}-${nextYear}`;
};

const getDefaultSemesters = (): Semester[] => {
  const sy = getCurrentSchoolYear();
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  return [
    {
      id: '1',
      name: `1st Semester ${sy}`,
      code: `${sy}-1ST`,
      startDate: `${currentYear}-08-15`,
      endDate: `${currentYear}-12-20`,
      isActive: true,
      isCurrent: true,
      createdAt: new Date().toISOString()
    },
    {
      id: '2',
      name: `2nd Semester ${sy}`,
      code: `${sy}-2ND`,
      startDate: `${nextYear}-01-15`,
      endDate: `${nextYear}-05-31`,
      isActive: true,
      isCurrent: false,
      createdAt: new Date().toISOString()
    },
    {
      id: '3',
      name: `Summer ${nextYear}`,
      code: `${nextYear}-SUMMER`,
      startDate: `${nextYear}-06-10`,
      endDate: `${nextYear}-07-31`,
      isActive: true,
      isCurrent: false,
      createdAt: new Date().toISOString()
    }
  ];
};

const STORAGE_KEY = 'syllabus_tracker_semesters';

export const semesterStorage = {
  getSemesters(): Semester[] {
    const defaults = getDefaultSemesters();
    if (typeof window === 'undefined') return defaults;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      this.setSemesters(defaults);
      return defaults;
    } catch (error) {
      console.error('Error loading semesters:', error);
      return defaults;
    }
  },

  setSemesters(semesters: Semester[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(semesters));
    } catch (error) {
      console.error('Error saving semesters:', error);
    }
  },

  addSemester(semester: Omit<Semester, 'id' | 'createdAt'>): Semester {
    const semesters = this.getSemesters();
    const newSemester: Semester = {
      ...semester,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    };
    
    if (newSemester.isCurrent) {
      semesters.forEach(s => s.isCurrent = false);
    }
    
    semesters.push(newSemester);
    this.setSemesters(semesters);
    return newSemester;
  },

  updateSemester(id: string, updates: Partial<Semester>): Semester | null {
    const semesters = this.getSemesters();
    const index = semesters.findIndex(s => s.id === id);
    
    if (index === -1) return null;
    
    if (updates.isCurrent === true) {
      semesters.forEach(s => s.isCurrent = false);
    }
    
    semesters[index] = { ...semesters[index], ...updates };
    this.setSemesters(semesters);
    return semesters[index];
  },

  deleteSemester(id: string): boolean {
    const semesters = this.getSemesters();
    const filtered = semesters.filter(s => s.id !== id);
    
    if (filtered.length === 0) return false;
    
    this.setSemesters(filtered);
    return true;
  },

  getActiveSemesters(): Semester[] {
    const semesters = this.getSemesters();
    return semesters.filter(s => s.isActive);
  },

  getCurrentSemester(): Semester | undefined {
    const semesters = this.getSemesters();
    return semesters.find(s => s.isCurrent && s.isActive);
  },

  resetToDefaults(): void {
    this.setSemesters(getDefaultSemesters());
  }
};
