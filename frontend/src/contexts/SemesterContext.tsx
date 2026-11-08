import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { semesterStorage, type Semester } from '@/utils/semesterStorage';
import { io } from 'socket.io-client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

// ── Helpers to parse combined semester names ─────────────────────────────────
// Semester names follow the pattern: "1st Semester 2024-2025", "Summer 2025", etc.

function parsePeriod(name: string): string {
  // Extract the period portion (everything before the school-year)
  const match = name.match(/^(1st Semester|2nd Semester|Summer)/i);
  return match ? match[1] : name;
}

function parseSchoolYear(name: string): string {
  // Extract the school-year portion (e.g. "2024-2025" or standalone year like "2025")
  const match = name.match(/(\d{4}-\d{4}|\d{4})$/);
  return match ? match[1] : '';
}

interface SemesterContextType {
  /** All semesters from the semester config (sorted most recent first) */
  semesters: Semester[];
  /** The currently selected semester (defaults to the one marked isCurrent) */
  selectedSemester: Semester | null;

  // ── Split state for the two top-bar dropdowns ──────────────────────────
  /** The selected semester period, e.g. "1st Semester" */
  selectedPeriod: string;
  /** The selected school year, e.g. "2024-2025" */
  selectedSchoolYear: string;
  /** All distinct periods available across semesters */
  availablePeriods: string[];
  /** All distinct school years available across semesters */
  availableSchoolYears: string[];
  /** Change the period dropdown — resolves matching semester automatically */
  setSelectedPeriod: (period: string) => void;
  /** Change the school-year dropdown — resolves matching semester automatically */
  setSelectedSchoolYear: (year: string) => void;

  /** Change the selected semester by ID */
  selectSemester: (id: string) => void;
  /** Reset selection back to the current/active semester */
  resetToCurrentSemester: () => void;
  /** Reload semesters from storage (call after admin edits semester config) */
  refreshSemesters: () => Promise<void>;
}

const SemesterContext = createContext<SemesterContextType | undefined>(undefined);

function sortSemestersMostRecentFirst(semesters: Semester[]): Semester[] {
  return [...semesters].sort((a, b) => {
    // Current semester first, then by start date descending
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });
}

export function SemesterProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const loggedInUserRef = useRef<string | null>(null);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<Semester | null>(null);

  // ── Split dropdown state ─────────────────────────────────────────────
  const [selectedPeriod, _setSelectedPeriod] = useState<string>('');
  const [selectedSchoolYear, _setSelectedSchoolYear] = useState<string>('');
  const [tickSemesters, setTickSemesters] = useState(0);

  const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:5000';

  // ── Socket Initialization ───────────────────────────────────────────
  useEffect(() => {
    const socket = io(API_BASE, {
      withCredentials: true,
    });

    socket.on("update_semesters", () => {
      console.log("[Socket] update_semesters received");
      setTickSemesters((t) => t + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, [API_BASE]);

  const loadSemesters = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/semesters`);
      const data = await res.json();
      if (data?.success && Array.isArray(data.semesters)) {
        const mapped = data.semesters.map((s: any) => ({
          id: s._id,
          name: s.name,
          code: s.code,
          startDate: s.startDate,
          endDate: s.endDate,
          isActive: s.isActive,
          isCurrent: s.isCurrent,
          isArchived: s.isArchived || false,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        }));
        const sorted = sortSemestersMostRecentFirst(mapped.filter((s: any) => s.isActive && !s.isArchived));
        setSemesters(sorted);
        return sorted;
      }
    } catch (err) {
      console.error("Failed to fetch semesters:", err);
    }
    return [];
  }, [API_BASE]);

  // ── Automatically select current semester upon user login ────────────
  useEffect(() => {
    if (user?.id) {
      if (loggedInUserRef.current !== user.id) {
        loggedInUserRef.current = user.id;
        loadSemesters().then((sorted) => {
          const current = sorted.find((s) => s.isCurrent && s.isActive) ?? sorted[0] ?? null;
          if (current) {
            setSelectedSemester(current);
            _setSelectedPeriod(parsePeriod(current.name));
            _setSelectedSchoolYear(parseSchoolYear(current.name));
          }
        });
      }
    } else {
      loggedInUserRef.current = null;
    }
  }, [user?.id, loadSemesters]);

  // ── Compute available options from all semesters ─────────────────────
  const availablePeriods = useMemo(() => {
    const periods = semesters.map((s) => parsePeriod(s.name));
    return [...new Set(periods)];
  }, [semesters]);

  const availableSchoolYears = useMemo(() => {
    const years = semesters.map((s) => parseSchoolYear(s.name)).filter(Boolean);
    return [...new Set(years)].sort().reverse();
  }, [semesters]);

  // ── Resolve a matching semester by period + year ─────────────────────
  const resolveAndSelect = useCallback(
    (period: string, year: string) => {
      // Try exact match first
      const match = semesters.find(
        (s) => parsePeriod(s.name) === period && parseSchoolYear(s.name) === year,
      );
      if (match) {
        setSelectedSemester(match);
        return;
      }

      // If no exact match, try to find any semester with the given year
      const yearMatch = semesters.find((s) => parseSchoolYear(s.name) === year);
      if (yearMatch) {
        _setSelectedPeriod(parsePeriod(yearMatch.name));
        setSelectedSemester(yearMatch);
        return;
      }

      // Or any semester with the given period
      const periodMatch = semesters.find((s) => parsePeriod(s.name) === period);
      if (periodMatch) {
        _setSelectedSchoolYear(parseSchoolYear(periodMatch.name));
        setSelectedSemester(periodMatch);
      }
    },
    [semesters],
  );

  // ── Public setters for the two dropdowns ─────────────────────────────
  const setSelectedPeriod = useCallback(
    (period: string) => {
      _setSelectedPeriod(period);
      resolveAndSelect(period, selectedSchoolYear);
    },
    [selectedSchoolYear, resolveAndSelect],
  );

  const setSelectedSchoolYear = useCallback(
    (year: string) => {
      _setSelectedSchoolYear(year);
      resolveAndSelect(selectedPeriod, year);
    },
    [selectedPeriod, resolveAndSelect],
  );

  // Initialize on mount and on socket tick
  useEffect(() => {
    loadSemesters().then(sorted => {
      const current = sorted.find((s) => s.isCurrent && s.isActive) ?? sorted[0] ?? null;

      // If the user was on the "Current" semester, and the "Current" one has changed in config,
      // move them automatically to the new current one so changes apply immediately.
      if (selectedSemester?.isCurrent && current && selectedSemester.id !== current.id) {
        setSelectedSemester(current);
        toast({
          title: "Semester Updated",
          description: `The active semester has been changed to ${current.name}.`,
        });
        return;
      }

      // If we already have a selection, try to keep it (but update the object in case it changed)
      if (selectedSemester) {
        const stillExists = sorted.find(s => s.id === selectedSemester.id);
        if (stillExists) {
          setSelectedSemester(stillExists);
          return;
        }
      }

      // Otherwise (first load or selection disappeared), find the current one
      if (current) {
        setSelectedSemester(current);
        _setSelectedPeriod(parsePeriod(current.name));
        _setSelectedSchoolYear(parseSchoolYear(current.name));
      }
    });
  }, [loadSemesters, tickSemesters]);

  // ── Keep split state in sync when selectedSemester changes directly ──
  useEffect(() => {
    if (selectedSemester) {
      _setSelectedPeriod(parsePeriod(selectedSemester.name));
      _setSelectedSchoolYear(parseSchoolYear(selectedSemester.name));
    }
  }, [selectedSemester]);

  const selectSemester = useCallback(
    (id: string) => {
      const found = semesters.find((s) => s.id === id);
      if (found) setSelectedSemester(found);
    },
    [semesters],
  );

  const resetToCurrentSemester = useCallback(() => {
    const current = semesters.find((s) => s.isCurrent && s.isActive) ?? semesters[0] ?? null;
    setSelectedSemester(current);
  }, [semesters]);

  const refreshSemesters = useCallback(() => {
    return loadSemesters().then((sorted) => {
      const current = sorted.find((s) => s.isCurrent && s.isActive) ?? sorted[0] ?? null;

      // Keep current selection if still exists, but move to new current if it changed
      if (selectedSemester) {
        if (selectedSemester.isCurrent && current && selectedSemester.id !== current.id) {
          setSelectedSemester(current);
          toast({
            title: "Semester Updated",
            description: `The active semester has been changed to ${current.name}.`,
          });
          return;
        }
        
        const stillExists = sorted.find((s) => s.id === selectedSemester.id);
        if (!stillExists) {
          setSelectedSemester(current);
        } else {
          setSelectedSemester(stillExists);
        }
      } else {
        setSelectedSemester(current);
      }
    });
  }, [loadSemesters, selectedSemester]);

  return (
    <SemesterContext.Provider
      value={{
        semesters,
        selectedSemester,
        selectedPeriod,
        selectedSchoolYear,
        availablePeriods,
        availableSchoolYears,
        setSelectedPeriod,
        setSelectedSchoolYear,
        selectSemester,
        resetToCurrentSemester,
        refreshSemesters,
      }}
    >
      {children}
    </SemesterContext.Provider>
  );
}

export function useSemester() {
  const context = useContext(SemesterContext);
  if (context === undefined) {
    throw new Error('useSemester must be used within a SemesterProvider');
  }
  return context;
}
