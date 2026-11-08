import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Upload, Loader2, CheckCircle, X, Copy, Sparkles, Eye, ArrowRight, Zap, RefreshCw, AlertCircle, FileText, FileSpreadsheet, XCircle, Send, Search, Check, GitBranch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useSemester } from '@/contexts/SemesterContext';
import { useToast } from '@/hooks/use-toast';
import { semesterStorage } from '@/utils/semesterStorage';
import { SyllabusStatus } from '@/types';

// Define types
interface COAlignmentItem {
  coCode: string;
  coDescription: string;
  slos: string[];
}

interface BloomItem {
  coCode: string;
  slo: string;
  level: string;
}

interface GadItem {
  coCode: string;
  slo?: string;
  isGadRelated: boolean;
  explanation: string;
}

interface AIAnalysisResult {
  id: string;
  fileName: string;
  timestamp: string;
  overallScore: number;
  status: 'excellent' | 'good' | 'needs_improvement';
  suggestions: Array<{
    id: number;
    category: string;
    severity: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    recommendation: string;
  }>;
  missingSections: string[];
  coAlignment: COAlignmentItem[];
  unalignedSLOs: string[];
  bloomData: BloomItem[];
  gadData?: GadItem[];
}

// NEW: Table analysis result type
interface TableAnalysisResult {
  pre_midterm: Record<string, number>;
  pre_final: Record<string, number>;
}

function sanitizeTableAnalysis(data: TableAnalysisResult | null): TableAnalysisResult | null {
  if (!data) return null;
  const sanitizeSection = (sec: Record<string, number> = {}) => {
    const cleanSec: Record<string, number> = {};
    const keys = Object.keys(sec);
    const hasWeek = keys.some(k => /^week$/i.test(k.trim()));
    for (const [k, v] of Object.entries(sec)) {
      if (hasWeek && /^week[_\s-]?\d+$/i.test(k.trim())) {
        continue;
      }
      cleanSec[k] = v;
    }
    return cleanSec;
  };
  return {
    pre_midterm: sanitizeSection(data.pre_midterm),
    pre_final: sanitizeSection(data.pre_final),
  };
}

interface ExtractedCourseOutcomes {
  outcomes: { number: number; text: string }[];
  missing: number[];
  maxExceeded: boolean;
  isValid: boolean;
}

interface ExtractedReferences {
  references: string[];
  count: number;
  missing: boolean;
}

interface ExtractedGradingSystem {
  majorOutput: string | null;
  classStanding: string | null;
  midTermGrade: string | null;
  finalTermGrade: string | null;
  finalGrade: string | null;
  missing: boolean;
}

interface ExtractedPolicies {
  policies: string | null;
  missing: boolean;
}

interface ExtractedRevisionHistory {
  revisionHistory: string | null;
  missing: boolean;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/* =========================================================
   SCAN RESULT CACHE  (localStorage, SHA-256 fingerprint)
   TTL: 24 h | Max entries: 10 (LRU eviction)
========================================================= */
const CACHE_KEY = 'syllabusCache';
const CACHE_TTL = 1 * 60 * 60 * 1000; // 1 hour in ms
const CACHE_MAX = 10;

async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function readCache(hash: string): any | null {
  try {
    const store = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const entry = store[hash];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      // stale — remove lazily
      delete store[hash];
      localStorage.setItem(CACHE_KEY, JSON.stringify(store));
      return null;
    }
    return entry.data;
  } catch { return null; }
}

function writeCache(hash: string, data: any) {
  try {
    const store: Record<string, any> = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    // LRU eviction: drop oldest if over limit
    const keys = Object.keys(store);
    if (keys.length >= CACHE_MAX) {
      const oldest = keys.sort((a, b) => (store[a].timestamp ?? 0) - (store[b].timestamp ?? 0))[0];
      delete store[oldest];
    }
    store[hash] = { timestamp: Date.now(), data };
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch { /* storage full – silently ignore */ }
}

function clearCacheEntry(hash: string) {
  try {
    const store = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    delete store[hash];
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch { }
}

const bloomLevelMap: Record<string, number> = {
  Remembering: 1,
  Understanding: 2,
  Applying: 3,
  Analyzing: 4,
  Evaluating: 5,
  Creating: 6,
};

// Helper to determine Bloom's Taxonomy level from the first verb
const getBloomLevelFromFirstVerb = (sentence: string): string => {
  if (!sentence) return "Unknown";

  // Extract the first word (primary verb), handling bullets and leading spaces
  const cleanedSentence = sentence.trim().replace(/^[•\-\d\.]+\s*/, "");
  const firstWord = cleanedSentence.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");

  const mapping: Record<string, string> = {
    // Remembering
    define: "Remembering", list: "Remembering", identify: "Remembering", recall: "Remembering",
    recognize: "Remembering", state: "Remembering", name: "Remembering", label: "Remembering",
    match: "Remembering", repeat: "Remembering", reproduce: "Remembering", select: "Remembering",
    memorize: "Remembering", enumerate: "Remembering", describe: "Remembering", outline: "Remembering",

    // Understanding
    explain: "Understanding", summarize: "Understanding", interpret: "Understanding",
    classify: "Understanding", discuss: "Understanding", illustrate: "Understanding",
    paraphrase: "Understanding", infer: "Understanding", predict: "Understanding",
    associate: "Understanding", estimate: "Understanding", clarify: "Understanding",
    translate: "Understanding", exemplify: "Understanding",

    // Applying
    apply: "Applying", use: "Applying", demonstrate: "Applying", implement: "Applying",
    execute: "Applying", solve: "Applying", perform: "Applying", manipulate: "Applying",
    measure: "Applying", relate: "Applying", show: "Applying", prepare: "Applying",
    compute: "Applying", operate: "Applying", practice: "Applying", carry: "Applying",

    // Analyzing
    analyze: "Analyzing", differentiate: "Analyzing", organize: "Analyzing",
    examine: "Analyzing", investigate: "Analyzing", categorize: "Analyzing",
    distinguish: "Analyzing", compare: "Analyzing", contrast: "Analyzing",
    deconstruct: "Analyzing", structure: "Analyzing",
    dissect: "Analyzing", break: "Analyzing",

    // Evaluating
    evaluate: "Evaluating", assess: "Evaluating", justify: "Evaluating",
    critique: "Evaluating", defend: "Evaluating", argue: "Evaluating",
    validate: "Evaluating", recommend: "Evaluating", support: "Evaluating",
    appraise: "Evaluating", criticize: "Evaluating", judge: "Evaluating",
    prioritize: "Evaluating", rate: "Evaluating", verify: "Evaluating",

    // Creating
    create: "Creating", design: "Creating", develop: "Creating", construct: "Creating",
    formulate: "Creating", build: "Creating", compose: "Creating", produce: "Creating",
    assemble: "Creating", devise: "Creating", generate: "Creating", plan: "Creating",
    propose: "Creating", rearrange: "Creating", invent: "Creating", synthesize: "Creating",
    integrate: "Creating"
  };

  return mapping[firstWord] || "Unknown";
};

export default function UploadSyllabusPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { addSyllabus, addSyllabusWithId, syllabi, reuploadSyllabus, uploadSyllabus, saveAiAnalysis, submitBatchSyllabi, allUsers, deleteSyllabus } = useData();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<string[]>([]);
  const [reviewerSearch, setReviewerSearch] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const departmentFaculty = useMemo(() => {
    if (!user) return [];
    return allUsers.filter(u =>
      u.role === 'faculty' &&
      u.department === user.department &&
      u.id !== user.id
    );
  }, [allUsers, user]);

  React.useEffect(() => {
    if (!isAssignOpen) {
      setReviewerSearch('');
      setSelectedReviewerIds([]);
    }
  }, [isAssignOpen]);

  const filteredFaculty = useMemo(() => {
    const query = reviewerSearch.trim().toLowerCase();
    if (!query) return departmentFaculty;
    return departmentFaculty.filter(f =>
      `${f.firstName} ${f.lastName}`.toLowerCase().includes(query) ||
      (f.email && f.email.toLowerCase().includes(query))
    );
  }, [departmentFaculty, reviewerSearch]);

  const isReturnedOrRevised = (s: any) =>
    s.status === 'returned' ||
    (s.status === 'draft' && ((Array.isArray(s.versionHistory) && s.versionHistory.length > 0) || (s.version && s.version > 1)));

  const mySyllabi = syllabi
    .filter(s => s.facultyId === user?.id && s.status !== 'approved' && !isReturnedOrRevised(s))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // Exclude COLLABORATOR-stage syllabi & returned/revised syllabi from drafts.
  // Returned/revised syllabi belong strictly in the Status page under Returned tab.
  const drafts = mySyllabi.filter(s =>
    s.status === 'draft' &&
    s.currentStage !== 'COLLABORATOR' &&
    s.currentStage !== 'collaborator' &&
    s.currentStage !== 'SENIOR_FACULTY' &&
    !isReturnedOrRevised(s)
  );

  const handleSubmitBundle = async (assignedReviewers?: { reviewerId: string; reviewerName: string }[]) => {
    if (drafts.length === 0) return;

    // If assignedReviewers wasn't passed directly (e.g., from the main Submit button),
    // grab them from the selectedReviewerIds state
    const finalReviewers = assignedReviewers || (
      selectedReviewerIds.length > 0
        ? departmentFaculty
          .filter(f => selectedReviewerIds.includes(f.id))
          .map(f => ({ reviewerId: f.id, reviewerName: `${f.firstName} ${f.lastName}` }))
        : undefined
    );

    setIsSubmitting(true);
    try {
      await submitBatchSyllabi(drafts.map(d => d.id), finalReviewers);
      toast({
        title: "Bundle Submitted",
        description: assignedReviewers && assignedReviewers.length > 0
          ? `Successfully submitted and assigned ${drafts.length} syllabi to ${assignedReviewers.length} peer reviewer(s).`
          : `Successfully submitted ${drafts.length} syllabi.`,
      });
      // Navigate to Track Syllabus so the user can see their submitted syllabi
      navigate('/faculty/track');
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: "There was an error submitting your syllabi bundle.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const { selectedSemester, semesters: dbSemesters } = useSemester();
  const { toast } = useToast();

  const revisionOfId = searchParams.get('revisionOf');
  const isRevision = !!revisionOfId;
  const originalSyllabus = useMemo(() =>
    revisionOfId ? syllabi.find(s => s.id === revisionOfId) : null
    , [revisionOfId, syllabi]);

  const [isLoading, setIsLoading] = useState(false);
  const [activeAnalysisCalls, setActiveAnalysisCalls] = useState(0);
  const isAnalyzing = activeAnalysisCalls > 0;
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiResults, setAiResults] = useState<AIAnalysisResult | null>(null);
  // NEW: state for table analysis
  const [tableAnalysis, setTableAnalysis] = useState<TableAnalysisResult | null>(null);
  const [isTableAnalyzing, setIsTableAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [extractedTitle, setExtractedTitle] = useState<any>(null);
  const [extractedCourseCode, setExtractedCourseCode] = useState<string | null>(null);
  const [extractedCourseCredit, setExtractedCourseCredit] = useState<string | null>(null);
  const [extractedCourseTitle, setExtractedCourseTitle] = useState<string | null>(null);
  const [extractedNominalDuration, setExtractedNominalDuration] = useState<string | null>(null);
  const [extractedPrerequisite, setExtractedPrerequisite] = useState<string | null>(null);
  const [extractedCourseDescription, setExtractedCourseDescription] = useState<string | null>(null);
  const [extractedCourseOutcomes, setExtractedCourseOutcomes] = useState<ExtractedCourseOutcomes | null>(null);
  const [extractedReferences, setExtractedReferences] = useState<ExtractedReferences | null>(null);
  const [extractedGradingSystem, setExtractedGradingSystem] = useState<ExtractedGradingSystem | null>(null);
  const [extractedPolicies, setExtractedPolicies] = useState<ExtractedPolicies | null>(null);
  const [extractedRevisionHistory, setExtractedRevisionHistory] = useState<ExtractedRevisionHistory | null>(null);

  // Cache state
  const [currentFileHash, setCurrentFileHash] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  // Track whether all extraction calls finished so we can write cache once
  const cacheWrittenRef = useRef(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelAIScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      toast({
        title: "Scan Cancelled",
        description: "The AI analysis has been stopped.",
      });
    }
  };

  const resetAnalysisState = () => {
    setAiResults(null);
    setTableAnalysis(null);
    setExtractedTitle(null);
    setExtractedCourseCode(null);
    setExtractedCourseCredit(null);
    setExtractedCourseTitle(null);
    setExtractedNominalDuration(null);
    setExtractedPrerequisite(null);
    setExtractedCourseDescription(null);
    setExtractedCourseOutcomes(null);
    setExtractedReferences(null);
    setExtractedGradingSystem(null);
    setExtractedPolicies(null);
    setExtractedRevisionHistory(null);
    cacheWrittenRef.current = false;
  };

  const loadingSemesters = dbSemesters.length === 0;

  const [formData, setFormData] = useState({
    courseCode: '',
    courseTitle: '',
    semesterPeriod: '',
    college: user?.college || '',
    department: user?.department || '',
    syllabusFile: null as File | null,
  });

  // Load semesters and set default from SemesterContext
  useEffect(() => {
    if (selectedSemester && !formData.semesterPeriod) {
      setFormData(prev => ({
        ...prev,
        semesterPeriod: selectedSemester.id
      }));
    }
  }, [selectedSemester, formData.semesterPeriod]);

  // Update form data when originalSyllabus is loaded
  useEffect(() => {
    if (originalSyllabus) {
      // Find the semester ID that matches the name/period from DB semesters
      const match = dbSemesters.find(s =>
        s.name === originalSyllabus.semesterPeriod ||
        s.code === originalSyllabus.semesterPeriod ||
        formatSemesterName(s) === originalSyllabus.semesterPeriod
      );

      setFormData(prev => ({
        ...prev,
        courseCode: originalSyllabus.courseCode,
        courseTitle: originalSyllabus.courseTitle,
        semesterPeriod: match ? match.id : originalSyllabus.semesterPeriod,
        college: originalSyllabus.college || user?.college || '',
        department: originalSyllabus.department || user?.department || '',
      }));
    }
  }, [originalSyllabus, user, dbSemesters]);

  useEffect(() => {
    if (extractedCourseCode) {
      setFormData(prev => ({ ...prev, courseCode: extractedCourseCode }));
    }
  }, [extractedCourseCode]);

  useEffect(() => {
    if (extractedCourseTitle) {
      setFormData(prev => ({ ...prev, courseTitle: extractedCourseTitle }));
    }
  }, [extractedCourseTitle]);

  // Group bloomData by CO code for display
  const bloomsByCo = useMemo(() => {
    const map = new Map<string, { coLevel?: string, slos: BloomItem[] }>();
    aiResults?.bloomData.forEach(item => {
      if (!map.has(item.coCode)) map.set(item.coCode, { slos: [] });
      const entry = map.get(item.coCode)!;
      if (item.slo) {
        entry.slos.push(item);
      } else {
        entry.coLevel = item.level;
      }
    });
    return map;
  }, [aiResults?.bloomData]);

  // List of GAD-related keywords
  const gadKeywords = [
    'gender', 'equality', 'equity', 'women', 'woman', 'empowerment', 'inclusive',
    'inclusion', 'discrimination', 'sexism', 'mainstreaming', 'sensitivity',
    'equal opportunity', 'equal opportunities', 'gender-based', 'gender gap',
    'gender role', 'gender roles'
  ];

  // Check if text contains any GAD keywords
  const hasGadKeywords = (text: string): boolean => {
    const lowerText = text.toLowerCase();
    return gadKeywords.some(keyword => lowerText.includes(keyword));
  };

  // Ensure every CO and SLO has GAD data
  const ensureCompleteGadData = (coAlignment: COAlignmentItem[], gadData: GadItem[]): GadItem[] => {
    const gadMap = new Map<string, GadItem>();
    gadData.forEach(g => {
      const key = g.slo ? `${g.coCode}||${g.slo}` : `${g.coCode}||CO_LEVEL`;
      if (!gadMap.has(key)) gadMap.set(key, g);
    });
    coAlignment.forEach(co => {
      const coKey = `${co.coCode}||CO_LEVEL`;
      let coGad = gadMap.get(coKey);

      // Check for GAD keywords in CO description
      if (!coGad) {
        coGad = {
          coCode: co.coCode,
          isGadRelated: hasGadKeywords(co.coDescription),
          explanation: hasGadKeywords(co.coDescription) ? "Contains GAD-related keywords" : ""
        };
        gadMap.set(coKey, coGad);
      } else if (!coGad.isGadRelated && hasGadKeywords(co.coDescription)) {
        coGad.isGadRelated = true;
        coGad.explanation = "Contains GAD-related keywords";
      }

      // Check for GAD keywords in each SLO
      co.slos.forEach(slo => {
        const sloKey = `${co.coCode}||${slo}`;
        let sloGad = gadMap.get(sloKey);

        if (!sloGad) {
          sloGad = {
            coCode: co.coCode,
            slo,
            isGadRelated: hasGadKeywords(slo),
            explanation: hasGadKeywords(slo) ? "Contains GAD-related keywords" : ""
          };
          gadMap.set(sloKey, sloGad);
        } else if (!sloGad.isGadRelated && hasGadKeywords(slo)) {
          sloGad.isGadRelated = true;
          sloGad.explanation = "Contains GAD-related keywords";
        }
      });
    });
    return Array.from(gadMap.values());
  };

  // Group gadData by CO code for display
  const gadByCo = useMemo(() => {
    const map = new Map<string, { co?: GadItem, slos: GadItem[] }>();
    aiResults?.gadData?.forEach(item => {
      if (!map.has(item.coCode)) map.set(item.coCode, { slos: [] });
      const entry = map.get(item.coCode)!;
      if (item.slo) {
        entry.slos.push(item);
      } else {
        entry.co = item;
      }
    });
    return map;
  }, [aiResults?.gadData]);

  // NEW: Memoized Bloom level mismatch and progression suggestions
  const bloomValidationSuggestions = useMemo(() => {
    if (!aiResults) return [];

    const suggestions: { id?: string; title: string; description: string; severity: 'low' | 'medium' | 'high'; category: string; recommendation?: string }[] = [];

    // 1. Minimum COs Check
    if (aiResults.coAlignment.length < 3) {
      suggestions.push({
        id: `min-cos`,
        title: 'Insufficient Course Outcomes',
        description: `Only ${aiResults.coAlignment.length} Course Outcome(s) detected. Minimum recommended is 3.`,
        severity: 'high',
        category: 'Course Outcomes',
        recommendation: 'Add additional Course Outcomes to fully cover the course learning objectives.'
      });
    }

    aiResults.coAlignment.forEach(co => {
      const entry = bloomsByCo.get(co.coCode);
      const coLevel = entry?.coLevel;
      const slos = entry?.slos || [];

      // 0. Missing SLOs Check
      if (slos.length === 0) {
        suggestions.push({
          id: `missing-slos-${co.coCode}`,
          title: `Missing SLOs (${co.coCode})`,
          description: `No specific learning outcomes (SLOs) were detected for ${co.coCode}. Each Course Outcome should have at least 3 aligned SLOs.`,
          severity: 'high',
          category: 'Course Outcomes',
          recommendation: `Add 3-5 specific, measurable learning outcomes that support the achievement of ${co.coCode}.`
        });
      }

      // 0.0 Minimum SLOs Check
      if (slos.length > 0 && slos.length < 3) {
        suggestions.push({
          id: `min-slos-${co.coCode}`,
          title: `Insufficient SLOs (${co.coCode})`,
          description: `This CO has only ${slos.length} SLO(s). Minimum recommended is 3.`,
          severity: 'medium',
          category: 'Alignment',
          recommendation: 'Add more Specific Learning Outcomes to fully cover the Course Outcome.'
        });
      }

      // 0.0 Maximum SLOs Check
      if (slos.length > 5) {
        suggestions.push({
          id: `max-slos-${co.coCode}`,
          title: `Too Many SLOs (${co.coCode})`,
          description: `This CO has ${slos.length} SLOs. Maximum recommended is 5.`,
          severity: 'medium',
          category: 'Alignment',
          recommendation: 'Review SLOs for redundancy and group similar ones.'
        });
      }

      // 0.1 Missing CO Level Check
      if (!coLevel) {
        suggestions.push({
          id: `missing-co-level-${co.coCode}`,
          title: `Missing Bloom Level (${co.coCode})`,
          description: `${co.coCode} is missing a detectable Bloom's Taxonomy level. Please ensure the description starts with a measurable action verb.`,
          severity: 'medium',
          category: 'Bloom\'s Taxonomy',
          recommendation: `Start the description of ${co.coCode} with a strong action verb (e.g., "Analyze", "Evaluate", "Design").`
        });
      }

      // 1. SLO level <= CO level check
      if (coLevel && bloomLevelMap[coLevel]) {
        const coLevelNum = bloomLevelMap[coLevel];
        const invalidSLOs: { slo: string; level: string }[] = [];

        slos.forEach((sloBloom) => {
          if (sloBloom.level && bloomLevelMap[sloBloom.level]) {
            const sloLevelNum = bloomLevelMap[sloBloom.level];
            if (sloLevelNum > coLevelNum) {
              invalidSLOs.push({ slo: sloBloom.slo!, level: sloBloom.level });
            }
          }
        });

        if (invalidSLOs.length > 0) {
          const validLevels = Object.keys(bloomLevelMap)
            .filter(level => bloomLevelMap[level] <= coLevelNum)
            .sort((a, b) => bloomLevelMap[a] - bloomLevelMap[b])
            .join(", ");

          const listText = invalidSLOs.length === 1
            ? `The SLO "${invalidSLOs[0].slo.length > 60 ? invalidSLOs[0].slo.substring(0, 60) + '...' : invalidSLOs[0].slo}"`
            : `${invalidSLOs.length} SLOs (including "${invalidSLOs[0].slo.substring(0, 30)}...")`;

          suggestions.push({
            id: `bloom-level-${co.coCode}`,
            title: `SLO Bloom Level Issue (${co.coCode})`,
            description: `${listText} exceed the cognitive level of ${co.coCode} (${coLevel}). SLOs should not be at a higher cognitive level than their parent CO.`,
            severity: 'high',
            category: 'Bloom\'s Taxonomy',
            recommendation: `Rephrase the affected SLOs using verbs from lower cognitive levels such as ${validLevels.split(',').slice(0, 2).join(', ')} to align with the CO level.`
          });
        }
      }

      // 2. SLO Taxonomy Progression Check (within CO) - Grouped to avoid spam
      const progressionIssues: { curr: string; prev: string; currLevel: string; prevLevel: string }[] = [];
      let maxPrevLevelNum = 0;
      let maxPrevLevelName = '';
      for (let i = 0; i < slos.length; i++) {
        const currSLO = slos[i];

        if (currSLO.level && bloomLevelMap[currSLO.level]) {
          const currLevelNum = bloomLevelMap[currSLO.level];

          if (i > 0 && maxPrevLevelNum > 0 && currLevelNum < maxPrevLevelNum) {
            progressionIssues.push({
              curr: currSLO.slo!,
              prev: maxPrevLevelName,
              currLevel: currSLO.level,
              prevLevel: maxPrevLevelName
            });
          }

          if (currLevelNum > maxPrevLevelNum) {
            maxPrevLevelNum = currLevelNum;
            maxPrevLevelName = currSLO.level;
          }
        }
      }

      if (progressionIssues.length > 0) {
        const listText = progressionIssues.length === 1
          ? `The SLO "${progressionIssues[0].curr.substring(0, 30)}..." (${progressionIssues[0].currLevel}) is at a lower level than preceding SLO (${progressionIssues[0].prevLevel})`
          : `${progressionIssues.length} SLOs follow a regressive Bloom sequence`;

        suggestions.push({
          id: `bloom-progression-${co.coCode}`,
          title: `SLO Progression Issue (${co.coCode})`,
          description: `${listText} within ${co.coCode}. SLOs should ideally progress from lower to higher cognitive levels or stay at the same level.`,
          severity: 'medium',
          category: 'Bloom\'s Taxonomy',
          recommendation: `Rephrase the affected SLOs to higher cognitive levels or reorder them to maintain logical progression from lower to higher Bloom levels.`
        });
      }
    });

    return suggestions;
  }, [aiResults?.coAlignment, aiResults?.bloomData, bloomsByCo]);



  const isTitlePassing = useMemo(() => {
    if (!extractedTitle) return false;
    if (typeof extractedTitle === 'string') return extractedTitle.trim().length > 0;
    return !!(extractedTitle as any).isValid && !!(extractedTitle as any).title;
  }, [extractedTitle]);

  const derivedMissing = useMemo(() => {
    const missing: string[] = [];
    if (!isTitlePassing) {
      if (typeof extractedTitle === 'object' && (extractedTitle as any)?.missingPages && (extractedTitle as any).missingPages.length > 0) {
        missing.push(`Title (Missing on Page ${(extractedTitle as any).missingPages.join(', ')})`);
      } else {
        missing.push('Title');
      }
    }
    if (!extractedCourseCode) missing.push('Course Code');
    if (!extractedCourseTitle) missing.push('Course Title');
    if (!extractedNominalDuration) missing.push('Nominal Duration');
    if (!extractedPrerequisite) missing.push('Prerequisite');
    if (!extractedCourseDescription) missing.push('Course Description');
    if (!extractedCourseCredit) missing.push('Course Credit');
    if (!extractedCourseOutcomes || extractedCourseOutcomes.outcomes.length === 0) missing.push('Course Outcomes');
    if (extractedCourseOutcomes && Array.isArray(extractedCourseOutcomes.missing) && extractedCourseOutcomes.missing.length > 0) {
      missing.push(`Missing COs: ${extractedCourseOutcomes.missing.map(n => `CO${n}`).join(', ')}`);
    }
    const hasGrading = extractedGradingSystem && (
      (extractedGradingSystem.majorOutput && extractedGradingSystem.majorOutput.trim()) ||
      (extractedGradingSystem.classStanding && extractedGradingSystem.classStanding.trim()) ||
      (extractedGradingSystem.midTermGrade && extractedGradingSystem.midTermGrade.trim()) ||
      (extractedGradingSystem.finalTermGrade && extractedGradingSystem.finalTermGrade.trim()) ||
      (extractedGradingSystem.finalGrade && extractedGradingSystem.finalGrade.trim())
    );
    if (!hasGrading) missing.push('Grading System');
    if (!(extractedPolicies && extractedPolicies.policies && extractedPolicies.policies.trim().length > 0)) missing.push('Policies');
    if (!(extractedRevisionHistory && extractedRevisionHistory.revisionHistory && extractedRevisionHistory.revisionHistory.trim().length > 0)) missing.push('Revision History');
    return missing;
  }, [
    isTitlePassing,
    extractedTitle,
    extractedCourseCode,
    extractedCourseTitle,
    extractedNominalDuration,
    extractedPrerequisite,
    extractedCourseDescription,
    extractedCourseCredit,
    extractedCourseOutcomes,
    extractedGradingSystem,
    extractedPolicies,
    extractedRevisionHistory
  ]);

  const generalSuggestions = useMemo(() => {
    const base = (aiResults?.suggestions || []).map(s => ({
      id: s.id?.toString() || Math.random().toString(),
      title: s.title,
      description: s.description,
      severity: s.severity,
      category: s.category,
      recommendation: s.recommendation
    }));
    const derived: { id?: string; title: string; description: string; severity: 'low' | 'medium' | 'high'; category: string; recommendation?: string; sloContext?: any }[] = [];
    if (!isTitlePassing) {
      const missingPageText = typeof extractedTitle === 'object' && (extractedTitle as any)?.missingPages && (extractedTitle as any).missingPages.length > 0
        ? ` on Page ${(extractedTitle as any).missingPages.join(', ')}`
        : '';
      derived.push({
        id: 'missing-title',
        title: 'Add Title',
        description: `Provide a clear syllabus header title${missingPageText}.`,
        severity: 'high',
        category: 'Structure',
        recommendation: 'Include a header like "SYLLABUS" or the course name on every page.'
      });
    }
    if (!extractedCourseCode) derived.push({ id: 'missing-code', title: 'Add Course Code', description: 'Include Course Code label and value.', severity: 'high', category: 'Structure', recommendation: 'Specify the code (e.g., CS 101).' });
    if (!extractedCourseTitle) derived.push({ id: 'missing-course-title', title: 'Add Course Title', description: 'Include Course Title label and value.', severity: 'high', category: 'Structure', recommendation: 'Specify the full course title.' });
    if (!extractedNominalDuration) derived.push({ id: 'missing-duration', title: 'Add Nominal Duration', description: 'Specify the nominal duration.', severity: 'medium', category: 'Structure', recommendation: 'Include duration like "54 Hours" or "18 Weeks".' });
    if (!extractedPrerequisite) derived.push({ id: 'missing-prereq', title: 'Add Prerequisite', description: 'Specify prerequisite if applicable or indicate none.', severity: 'medium', category: 'Structure', recommendation: 'State "None" if there are no prerequisites.' });
    if (!extractedCourseDescription) derived.push({ id: 'missing-desc', title: 'Add Course Description', description: 'Provide a concise course description.', severity: 'high', category: 'Structure', recommendation: 'Write a brief overview of the course goals.' });
    if (!extractedCourseCredit) derived.push({ id: 'missing-credit', title: 'Add Course Credit', description: 'Specify course credit units.', severity: 'medium', category: 'Structure', recommendation: 'Include units (e.g., "3 Units").' });
    if (!extractedCourseOutcomes || extractedCourseOutcomes.outcomes.length === 0) {
      derived.push({ id: 'missing-cos', title: 'Add Course Outcomes', description: 'Include CO1–CO5 with measurable verbs.', severity: 'high', category: 'Course Outcomes', recommendation: 'Define 3-5 clear outcomes starting with action verbs.' });
    } else if (extractedCourseOutcomes.missing && extractedCourseOutcomes.missing.length > 0) {
      derived.push({
        id: 'incomplete-cos',
        title: 'Complete Missing COs',
        description: `Provide ${extractedCourseOutcomes.missing.map(n => `CO${n}`).join(', ')}.`,
        severity: 'high',
        category: 'Course Outcomes',
        recommendation: 'Ensure each CO is clearly numbered and described.'
      });
    }
    const hasGrading = extractedGradingSystem && (
      (extractedGradingSystem.majorOutput && extractedGradingSystem.majorOutput.trim()) ||
      (extractedGradingSystem.classStanding && extractedGradingSystem.classStanding.trim()) ||
      (extractedGradingSystem.midTermGrade && extractedGradingSystem.midTermGrade.trim()) ||
      (extractedGradingSystem.finalTermGrade && extractedGradingSystem.finalTermGrade.trim()) ||
      (extractedGradingSystem.finalGrade && extractedGradingSystem.finalGrade.trim())
    );
    if (!hasGrading) derived.push({ id: 'missing-grading', title: 'Add Grading System', description: 'Provide grading distribution and grade computation.', severity: 'high', category: 'Assessment', recommendation: 'Include a table or list showing percentage weights.' });
    if (!(extractedPolicies && extractedPolicies.policies && extractedPolicies.policies.trim().length > 0)) {
      derived.push({ id: 'missing-policies', title: 'Add Policies', description: 'Include institutional and course policies as bullet points.', severity: 'medium', category: 'Structure', recommendation: 'List rules for attendance, academic honesty, etc.' });
    }
    if (!(extractedRevisionHistory && extractedRevisionHistory.revisionHistory && extractedRevisionHistory.revisionHistory.trim().length > 0)) {
      derived.push({ id: 'missing-revision', title: 'Add Revision History', description: 'Provide latest revision date and record.', severity: 'low', category: 'Structure', recommendation: 'Include a version number or last updated date.' });
    }
    return [...base, ...derived, ...bloomValidationSuggestions];
  }, [
    aiResults?.suggestions,
    extractedTitle,
    extractedCourseCode,
    extractedCourseTitle,
    extractedNominalDuration,
    extractedPrerequisite,
    extractedCourseDescription,
    extractedCourseCredit,
    extractedCourseOutcomes,
    extractedGradingSystem,
    extractedPolicies,
    extractedRevisionHistory,
    bloomValidationSuggestions
  ]);

  const mergedMissing = useMemo(() => {
    const set = new Set<string>(aiResults?.missingSections || []);
    derivedMissing.forEach(m => set.add(m));
    return Array.from(set);
  }, [aiResults?.missingSections, derivedMissing]);

  const suggestionsCount = useMemo(() => generalSuggestions.length, [generalSuggestions.length]);

  const computedScore = useMemo(() => {
    let score = 0;
    if (isTitlePassing) score += 8;
    if (extractedCourseCode) score += 8;
    if (extractedCourseTitle) score += 8;
    if (extractedNominalDuration) score += 6;
    if (extractedPrerequisite) score += 6;
    if (extractedCourseDescription) score += 10;
    if (extractedCourseCredit) score += 6;
    const hasCOs = extractedCourseOutcomes && extractedCourseOutcomes.outcomes.length > 0;
    const validCOs = hasCOs && extractedCourseOutcomes.isValid;
    if (validCOs) score += 10;
    const hasReferences = extractedReferences && extractedReferences.count > 0 && !extractedReferences.missing;
    if (hasReferences) score += 6;
    const hasGrading = extractedGradingSystem && (
      (extractedGradingSystem.majorOutput && extractedGradingSystem.majorOutput.trim()) ||
      (extractedGradingSystem.classStanding && extractedGradingSystem.classStanding.trim()) ||
      (extractedGradingSystem.midTermGrade && extractedGradingSystem.midTermGrade.trim()) ||
      (extractedGradingSystem.finalTermGrade && extractedGradingSystem.finalTermGrade.trim()) ||
      (extractedGradingSystem.finalGrade && extractedGradingSystem.finalGrade.trim())
    );
    if (hasGrading) score += 8;
    const hasPolicies = extractedPolicies && extractedPolicies.policies && extractedPolicies.policies.trim().length > 0;
    if (hasPolicies) score += 6;
    const hasRevision = extractedRevisionHistory && extractedRevisionHistory.revisionHistory && extractedRevisionHistory.revisionHistory.trim().length > 0;
    if (hasRevision) score += 4;
    if (aiResults && aiResults.coAlignment.length > 0) {
      const coCount = aiResults.coAlignment.length;
      let goodCos = 0;
      aiResults.coAlignment.forEach(co => {
        // Only count SLOs for the "3 SLOs per CO" rule
        const slos = (aiResults.bloomData || []).filter(b => b.coCode === co.coCode && b.slo);
        if (slos.length >= 3) goodCos++;
      });
      const quality = coCount > 0 ? (goodCos / coCount) : 0;
      score += Math.round(14 * quality);
    }

    // Deduct score based on suggestions
    const highSeverityCount = generalSuggestions.filter(s => s.severity === 'high').length;
    const mediumSeverityCount = generalSuggestions.filter(s => s.severity === 'medium').length;
    const lowSeverityCount = generalSuggestions.filter(s => s.severity === 'low').length;

    let deduction = highSeverityCount * 5 + mediumSeverityCount * 2 + lowSeverityCount * 1;
    deduction = Math.min(deduction, 40); // Cap deduction

    score = Math.max(0, score - deduction);

    if (score > 100) score = 100;
    return score;
  }, [
    extractedTitle,
    extractedCourseCode,
    extractedCourseTitle,
    extractedNominalDuration,
    extractedPrerequisite,
    extractedCourseDescription,
    extractedCourseCredit,
    extractedCourseOutcomes,
    extractedReferences,
    extractedGradingSystem,
    extractedPolicies,
    extractedRevisionHistory,
    aiResults?.coAlignment,
    aiResults?.bloomData,
    generalSuggestions.length
  ]);

  useEffect(() => {
    setAiResults(prev => {
      if (!prev) return prev;

      // Base status from score
      let status: 'excellent' | 'good' | 'needs_improvement' =
        computedScore >= 80 ? 'excellent' : computedScore >= 60 ? 'good' : 'needs_improvement';

      // If there are ANY Alignment suggestions, cap at 'good'
      const alignmentSuggestions = generalSuggestions.filter(
        s => s.category === 'Alignment' || s.category === "Bloom's Taxonomy"
      );
      if (alignmentSuggestions.length > 0 && status === 'excellent') {
        status = 'good';
      }
      // If there are HIGH severity alignment/bloom issues, cap at 'needs_improvement'
      const highAlignmentIssues = alignmentSuggestions.filter(s => s.severity === 'high');
      if (highAlignmentIssues.length > 0 && status !== 'needs_improvement') {
        status = 'needs_improvement';
      }

      if (prev.overallScore === computedScore && prev.status === status) return prev;
      return { ...prev, overallScore: computedScore, status };
    });
  }, [computedScore, generalSuggestions]);

  // Write to cache when all analysis calls finish (and result not already from cache)
  useEffect(() => {
    if (
      activeAnalysisCalls === 0 &&
      currentFileHash &&
      !isFromCache &&
      !cacheWrittenRef.current &&
      aiResults !== null
    ) {
      cacheWrittenRef.current = true;
      writeCache(currentFileHash, {
        aiResults,
        tableAnalysis,
        extractedTitle,
        extractedCourseCode,
        extractedCourseCredit,
        extractedCourseTitle,
        extractedNominalDuration,
        extractedPrerequisite,
        extractedCourseDescription,
        extractedCourseOutcomes,
        extractedReferences,
        extractedGradingSystem,
        extractedPolicies,
        extractedRevisionHistory,
      });
      console.log('[SyllabusCache] Results cached for hash:', currentFileHash.slice(0, 8) + '...');
    }
  }, [
    activeAnalysisCalls, currentFileHash, isFromCache, aiResults,
    tableAnalysis, extractedTitle, extractedCourseCode, extractedCourseCredit,
    extractedCourseTitle, extractedNominalDuration, extractedPrerequisite,
    extractedCourseDescription, extractedCourseOutcomes, extractedReferences,
    extractedGradingSystem, extractedPolicies, extractedRevisionHistory,
  ]);

  // Helper to format semester display name (same as TopBar)
  const formatSemesterName = (sem: any) => {
    if (!sem) return '';
    const name = sem.name || '';
    const code = sem.code || '';
    const yearMatch = code.match(/\d{4}-\d{4}|\d{4}/);
    const yearPart = yearMatch ? yearMatch[0] : '';
    if (yearPart && !name.includes(yearPart)) {
      return `${name} ${yearPart}`;
    }
    return name;
  };

  // NEW: Call Python service for table analysis
  const analyzeTable = async (file: File) => {
    setIsTableAnalyzing(true);
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/analyze-table?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store"
      });
      if (!response.ok) throw new Error("Table analysis failed");
      const data = await response.json();
      setTableAnalysis(sanitizeTableAnalysis(data));
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error("Table analysis error:", error);
      toast({
        title: "Table Analysis Failed",
        description: "Could not analyze table structure.",
        variant: "destructive"
      });
      // Set fallback empty data so tab still shows something
      setTableAnalysis({
        pre_midterm: {},
        pre_final: {}
      });
    } finally {
      setIsTableAnalyzing(false);
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const analyzeAllFields = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/extract-all-fields?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) return;
      const data = await response.json();
      console.log("[analyzeAllFields] Response:", data);

      if (data.courseCode) {
        console.log("[analyzeAllFields] Setting courseCode:", data.courseCode);
        setFormData(prev => ({ ...prev, courseCode: data.courseCode }));
      }
      if (data.courseTitle) {
        console.log("[analyzeAllFields] Setting courseTitle:", data.courseTitle);
        setFormData(prev => ({ ...prev, courseTitle: data.courseTitle }));
      }
      if (data.semester) {
        const matched = dbSemesters.find(s =>
          s.name.toLowerCase().includes(data.semester.toLowerCase()) ||
          data.semester.toLowerCase().includes(s.name.toLowerCase())
        );
        if (matched) {
          setFormData(prev => ({ ...prev, semesterPeriod: matched.id }));
        }
      }
    } catch (err) {
      console.error("All fields extraction error:", err);
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const analyzeTitle = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/extract-title?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) {
        setExtractedTitle(null);
        return;
      }
      const data = await response.json();
      setExtractedTitle(typeof data?.title === "string" && data.title.trim() ? data.title.trim() : null);
    } catch {
      setExtractedTitle(null);
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const analyzeCourseCode = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/extract-course-code?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) {
        setExtractedCourseCode(null);
        return;
      }
      const data = await response.json();
      console.log("[analyzeCourseCode] Response:", data);
      const code = typeof data?.courseCode === "string" ? data.courseCode.trim() : "";
      setExtractedCourseCode(code || null);
      if (code && code !== "N/A") {
        console.log("[analyzeCourseCode] Setting courseCode:", code);
        setFormData(prev => ({ ...prev, courseCode: code }));
      }
    } catch (error) {
      console.error("[analyzeCourseCode] Error:", error);
      setExtractedCourseCode(null);
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const analyzeCourseCredit = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/extract-course-credit?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) {
        setExtractedCourseCredit(null);
        return;
      }
      const data = await response.json();
      const credit = typeof data?.courseCredit === "string" ? data.courseCredit.trim() : "";
      setExtractedCourseCredit(credit || null);
    } catch {
      setExtractedCourseCredit(null);
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const analyzeCourseTitle = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/extract-course-title?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) {
        setExtractedCourseTitle(null);
        return;
      }
      const data = await response.json();
      console.log("[analyzeCourseTitle] Response:", data);
      const title = typeof data?.courseTitle === "string" ? data.courseTitle.trim() : "";
      setExtractedCourseTitle(title || null);
      if (title && title !== "N/A") {
        console.log("[analyzeCourseTitle] Setting courseTitle:", title);
        setFormData(prev => ({ ...prev, courseTitle: title }));
      }
    } catch (error) {
      console.error("[analyzeCourseTitle] Error:", error);
      setExtractedCourseTitle(null);
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const analyzeNominalDuration = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/extract-nominal-duration?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) {
        setExtractedNominalDuration(null);
        return;
      }
      const data = await response.json();
      const duration = typeof data?.nominalDuration === "string" ? data.nominalDuration.trim() : "";
      setExtractedNominalDuration(duration || null);
    } catch {
      setExtractedNominalDuration(null);
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const analyzePrerequisite = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/extract-prerequisite?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) {
        setExtractedPrerequisite(null);
        return;
      }
      const data = await response.json();
      const prereq = typeof data?.prerequisite === "string" ? data.prerequisite.trim() : "";
      setExtractedPrerequisite(prereq || null);
    } catch {
      setExtractedPrerequisite(null);
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const analyzeCourseDescription = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/extract-course-description?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) {
        setExtractedCourseDescription(null);
        return;
      }
      const data = await response.json();
      const desc = typeof data?.courseDescription === "string" ? data.courseDescription.trim() : "";
      setExtractedCourseDescription(desc || null);
    } catch {
      setExtractedCourseDescription(null);
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const analyzeCourseOutcomes = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/extract-course-outcomes?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) {
        setExtractedCourseOutcomes(null);
        return;
      }
      const data = await response.json();
      const valid = data && Array.isArray(data.outcomes);
      setExtractedCourseOutcomes(valid ? {
        outcomes: Array.isArray(data.outcomes) ? data.outcomes : [],
        missing: Array.isArray(data.missing) ? data.missing : [],
        maxExceeded: !!data.maxExceeded,
        isValid: !!data.isValid
      } : null);
    } catch {
      setExtractedCourseOutcomes(null);
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const analyzeReferences = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/extract-references?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) {
        setExtractedReferences(null);
        return;
      }
      const data = await response.json();
      const valid = data && Array.isArray(data.references);
      setExtractedReferences(valid ? {
        references: data.references,
        count: typeof data.count === "number" ? data.count : data.references.length,
        missing: !!data.missing
      } : null);
    } catch {
      setExtractedReferences(null);
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const analyzeGradingSystem = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/extract-grading-system?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) {
        setExtractedGradingSystem(null);
        return;
      }
      const data = await response.json();
      const result: ExtractedGradingSystem = {
        majorOutput: typeof data?.majorOutput === "string" ? data.majorOutput : null,
        classStanding: typeof data?.classStanding === "string" ? data.classStanding : null,
        midTermGrade: typeof data?.midTermGrade === "string" ? data.midTermGrade : null,
        finalTermGrade: typeof data?.finalTermGrade === "string" ? data.finalTermGrade : null,
        finalGrade: typeof data?.finalGrade === "string" ? data.finalGrade : null,
        missing: !!data?.missing
      };
      setExtractedGradingSystem(result);
    } catch {
      setExtractedGradingSystem(null);
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const analyzePolicies = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/extract-policies?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) {
        setExtractedPolicies(null);
        return;
      }
      const data = await response.json();
      const result: ExtractedPolicies = {
        policies: typeof data?.policies === "string" ? data.policies : null,
        missing: !!data?.missing
      };
      setExtractedPolicies(result);
    } catch {
      setExtractedPolicies(null);
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const analyzeRevisionHistory = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/extract-revision-history?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });
      if (!response.ok) {
        setExtractedRevisionHistory(null);
        return;
      }
      const data = await response.json();
      const result: ExtractedRevisionHistory = {
        revisionHistory: typeof data?.revisionHistory === "string" ? data.revisionHistory : null,
        missing: !!data?.missing
      };
      setExtractedRevisionHistory(result);
    } catch {
      setExtractedRevisionHistory(null);
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };



  // Fallback to non‑streaming endpoint
  const fallbackToNonStreaming = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/ai/scan`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
      });
      const data = await response.json();
      const result = data.result || {};

      const coAlign = Array.isArray(result.coAlignment) ? result.coAlignment : [];
      const gad = Array.isArray(result.gadData) ? result.gadData : [];
      const completeGadData = ensureCompleteGadData(coAlign, gad);

      const fullResult: AIAnalysisResult = {
        id: Date.now().toString(),
        fileName: file.name,
        timestamp: new Date().toISOString(),
        overallScore: result.overallScore ?? 0,
        status: result.status ?? 'needs_improvement',
        suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
        missingSections: Array.isArray(result.missingSections) ? result.missingSections : [],
        coAlignment: coAlign,
        unalignedSLOs: Array.isArray(result.unalignedSLOs) ? result.unalignedSLOs : [],
        bloomData: Array.isArray(result.bloomData) ? result.bloomData : [],
        gadData: completeGadData
      };
      setAiResults(fullResult);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error("Fallback error:", error);
      const fallback = createFallbackAIAnalysis(file.name);
      setAiResults(fallback);
      toast({
        title: "AI Analysis Failed",
        description: "Using fallback AI data",
        variant: "destructive"
      });
    } finally {
      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    }
  };

  const createFallbackAIAnalysis = (fileName: string): AIAnalysisResult => ({
    id: Date.now().toString(),
    fileName,
    timestamp: new Date().toISOString(),
    overallScore: 78,
    status: 'needs_improvement',
    suggestions: [
      {
        id: 1,
        category: 'Structure',
        severity: 'medium',
        title: 'Missing Learning Outcomes',
        description: 'No clearly defined Course Learning Outcomes section.',
        recommendation: 'Add CLOs with measurable verbs.'
      },
      {
        id: 2,
        category: 'Assessment',
        severity: 'high',
        title: 'Grading Scheme Issue',
        description: 'Grading percentages sum to 95%, not 100%.',
        recommendation: 'Adjust distribution to total 100%.'
      },
    ],
    missingSections: ['Academic Integrity Policy', 'Disability Accommodation'],
    coAlignment: [
      {
        coCode: 'CO1',
        coDescription: 'Demonstrate understanding of fundamental principles...',
        slos: [
          'Identify project elements and stakeholder involvement',
          'Explain project phases and animation pipelines',
          'Integrate project management phases and workflows'
        ]
      },
      {
        coCode: 'CO2',
        coDescription: 'Differentiate project constraints...',
        slos: [
          'Classify project constraints and challenges'
        ]
      },
    ],
    unalignedSLOs: ['Apply ethical reasoning to case studies', 'Communicate effectively in teams'],
    bloomData: [],
    gadData: []
  });

  // Streaming analysis – live updates
  const analyzeSyllabusStream = async (file: File) => {
    setActiveAnalysisCalls(prev => prev + 1);
    setShowAIModal(true);
    let receivedData = false;

    setAiResults({
      id: Date.now().toString(),
      fileName: file.name,
      timestamp: new Date().toISOString(),
      overallScore: 0,
      status: 'needs_improvement',
      suggestions: [],
      missingSections: [],
      coAlignment: [],
      unalignedSLOs: [],
      bloomData: [],
      gadData: []
    });

    const formData = new FormData();
    formData.append("file", file);

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    const streamTimeout = setTimeout(() => {
      console.log("Stream connection timed out");
      if (reader) reader.cancel();
    }, 15000); // 15 seconds connection timeout for the stream start

    let rawBuffer = "";

    const extractJSONObjects = (raw: string) => {
      let startIdx = 0;
      let braceCount = 0;
      let inJson = false;
      let i = 0;
      while (i < raw.length) {
        const ch = raw[i];
        if (!inJson && ch === '{') {
          inJson = true;
          braceCount = 1;
          startIdx = i;
        } else if (inJson) {
          if (ch === '{') braceCount++;
          else if (ch === '}') braceCount--;

          if (braceCount === 0) {
            const jsonStr = raw.substring(startIdx, i + 1);
            try {
              const obj = JSON.parse(jsonStr);
              handleStreamData(obj);
              rawBuffer = raw.slice(i + 1);
              extractJSONObjects(rawBuffer);
              return;
            } catch (e) {
              console.error("Failed to parse JSON object:", e);
            }
          }
        }
        i++;
      }
    };

    try {
      const response = await fetch(`${API_BASE}/ai/scan-stream?t=${Date.now()}`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-store"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI scan-stream failed (${response.status}): ${errorText}`);
      }

      if (!response.body) throw new Error("No response body");

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (!receivedData) {
          receivedData = true;
          clearTimeout(streamTimeout);
        }
        const chunkStr = decoder.decode(value, { stream: true });
        buffer += chunkStr;

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            try {
              const event = JSON.parse(jsonStr);
              if (event.type === 'token') {
                rawBuffer += event.token;
                extractJSONObjects(rawBuffer);
              } else if (event.type === 'done') {
                // Stream finished – add warnings based on SLO counts (using bloomData) and ensure GAD data is complete
                setAiResults(prev => {
                  if (!prev) return prev;

                  // Ensure we have complete GAD data
                  const completeGadData = ensureCompleteGadData(prev.coAlignment, prev.gadData || []);

                  const bloomsByCo = new Map<string, BloomItem[]>();
                  prev.bloomData.forEach(b => {
                    if (!bloomsByCo.has(b.coCode)) bloomsByCo.set(b.coCode, []);
                    bloomsByCo.get(b.coCode)!.push(b);
                  });

                  const warnings: any[] = [];
                  // Minimum COs Check
                  if (prev.coAlignment.length < 3) {
                    warnings.push({
                      id: Date.now() + Math.random(),
                      category: 'Course Outcomes',
                      severity: 'high',
                      title: 'Insufficient Course Outcomes',
                      description: `Only ${prev.coAlignment.length} Course Outcome(s) detected. Minimum recommended is 3.`,
                      recommendation: 'Add additional Course Outcomes to fully cover the course learning objectives.'
                    });
                  }
                  Array.from(bloomsByCo.entries()).forEach(([coCode, blooms]) => {
                    // Filter to only count actual SLO entries, ignoring the empty CO-level bloom entry
                    const sloCount = blooms.filter(b => b.slo && b.slo.trim().length > 0).length;

                    if (sloCount < 3) {
                      warnings.push({
                        id: Date.now() + Math.random(),
                        category: 'Alignment',
                        severity: 'medium',
                        title: `CO ${coCode} has fewer than 3 SLOs`,
                        description: `This CO has only ${sloCount} SLO(s). Minimum recommended is 3.`,
                        recommendation: 'Add more Specific Learning Outcomes to fully cover the Course Outcome.'
                      });
                    } else if (sloCount > 5) {
                      warnings.push({
                        id: Date.now() + Math.random(),
                        category: 'Alignment',
                        severity: 'medium',
                        title: `CO ${coCode} has more than 5 SLOs`,
                        description: `This CO has ${sloCount} SLOs. Maximum recommended is 5.`,
                        recommendation: 'Review SLOs for redundancy and group similar ones.'
                      });
                    }
                  });

                  // Bloom's Taxonomy Progression Check
                  const coLevels: { coCode: string; level: number }[] = [];
                  prev.coAlignment.forEach(co => {
                    const entry = Array.from(bloomsByCo.get(co.coCode) || []);
                    // For progression, we look at the CO level if available, otherwise SLO levels
                    const bloomObj = prev.bloomData.find(b => b.coCode === co.coCode && !b.slo);
                    if (bloomObj && bloomObj.level && bloomLevelMap[bloomObj.level]) {
                      coLevels.push({
                        coCode: co.coCode,
                        level: bloomLevelMap[bloomObj.level]
                      });
                    }
                  });

                  // Ensure COs are sorted numerically (CO1, CO2, etc.) to validate progression correctly
                  coLevels.sort((a, b) => {
                    const numA = parseInt(a.coCode.replace(/\D/g, '')) || 0;
                    const numB = parseInt(b.coCode.replace(/\D/g, '')) || 0;
                    return numA - numB;
                  });

                  let maxPrevCOLevel = 0;
                  let maxPrevCOLevelName = '';
                  for (let i = 0; i < coLevels.length; i++) {
                    const currCO = coLevels[i];
                    if (i > 0 && maxPrevCOLevel > 0 && currCO.level < maxPrevCOLevel) {
                      warnings.push({
                        id: `progression-${currCO.coCode}-${Date.now()}`,
                        category: 'Bloom\'s Taxonomy',
                        severity: 'high',
                        title: 'Taxonomy Progression Issue',
                        description: `${currCO.coCode} is not aligned. It should be ${maxPrevCOLevelName} (Level ${maxPrevCOLevel}) or higher.`,
                        recommendation: 'Revise the Course Outcome action verbs to ensure a logical progression from lower-order to higher-order thinking skills.'
                      });
                    }
                    if (currCO.level > maxPrevCOLevel) {
                      maxPrevCOLevel = currCO.level;
                      maxPrevCOLevelName = Object.keys(bloomLevelMap).find(key => bloomLevelMap[key] === currCO.level) || '';
                    }
                  }

                  // Duplicate Bloom's Level Check
                  const levelCounts = new Map<number, number>();
                  coLevels.forEach(co => {
                    levelCounts.set(co.level, (levelCounts.get(co.level) || 0) + 1);
                  });

                  levelCounts.forEach((count, level) => {
                    if (count >= 3) {
                      const levelName = Object.keys(bloomLevelMap).find(key => bloomLevelMap[key] === level);
                      warnings.push({
                        id: Date.now() + Math.random(),
                        category: 'Bloom\'s Taxonomy',
                        severity: 'medium',
                        title: 'Overused Bloom\'s Taxonomy Level',
                        description: `Bloom level ${level} (${levelName}) is used in ${count} Course Outcomes. Only up to 2 are recommended. Consider revising to improve progression.`,
                        recommendation: 'Revise the COs to ensure better progression and distribution.'
                      });
                    }
                  });

                  return {
                    ...prev,
                    suggestions: [...prev.suggestions, ...warnings],
                    gadData: completeGadData
                  };
                });
                setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
                return;
              } else if (event.type === 'error') {
                // If we received no actual AI tokens yet, fall back to the non-streaming endpoint
                if (!receivedData) {
                  clearTimeout(streamTimeout);
                  // Decrement OUR counter first — fallbackToNonStreaming manages its own counter
                  setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
                  await fallbackToNonStreaming(file);
                  return;
                } else {
                  // Partial data was received; show a warning toast but keep what we have
                  toast({
                    title: "Stream Interrupted",
                    description: event.message || "Analysis may be incomplete, but partial results are shown.",
                    variant: "destructive"
                  });
                }
              }
            } catch (e) {
              console.error("Error parsing SSE event:", e);
            }
          }
        }
      }

      setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
    } catch (error: any) {
      console.error("Stream error:", error);
      clearTimeout(streamTimeout);
      if (error.name === 'AbortError') {
        setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
        return;
      }
      if (!receivedData) {
        setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
        await fallbackToNonStreaming(file);
      } else {
        setActiveAnalysisCalls(prev => Math.max(0, prev - 1));
        toast({
          title: "Stream Interrupted",
          description: "Analysis may be incomplete, but partial results are shown.",
          variant: "destructive"
        });
      }
    }
  };

  // Update aiResults incrementally as stream events arrive
  const handleStreamData = (data: any) => {
    setAiResults(prev => {
      if (!prev) return prev;

      try {
        switch (data.type) {
          case 'score':
            return {
              ...prev,
              overallScore: typeof data.overallScore === 'number' ? data.overallScore : 0,
              status: ['excellent', 'good', 'needs_improvement'].includes(data.status) ? data.status : 'needs_improvement'
            };
          case 'missing':
            return {
              ...prev,
              missingSections: typeof data.section === 'string'
                ? [...prev.missingSections, data.section]
                : prev.missingSections
            };
          case 'suggestion':
            if (data && typeof data === 'object' && 'id' in data) {
              return {
                ...prev,
                suggestions: [...prev.suggestions, data]
              };
            }
            return prev;
          case 'co': {
            // CO object – may contain nested bloom objects in its slos array
            const coCode = data.coCode || '';
            const coDesc = data.coDescription || '';
            const rawSlos = Array.isArray(data.slos) ? data.slos : [];

            // Separate simple strings from nested bloom objects
            const sloStrings: string[] = [];
            const newBlooms: BloomItem[] = [];
            const newGads: GadItem[] = [];

            // Programmatically determine CO level from first verb
            const detectedCoLevel = getBloomLevelFromFirstVerb(coDesc);
            if (detectedCoLevel !== "Unknown") {
              newBlooms.push({
                coCode,
                slo: '',
                level: detectedCoLevel
              });
            }

            rawSlos.forEach((item: any) => {
              if (typeof item === 'string') {
                sloStrings.push(item);
                const detectedSloLevel = getBloomLevelFromFirstVerb(item);
                if (detectedSloLevel !== "Unknown") {
                  newBlooms.push({
                    coCode,
                    slo: item,
                    level: detectedSloLevel
                  });
                }
              } else if (item && typeof item === 'object') {
                // If it's a nested bloom object (with type, slo, level)
                if (item.type === 'bloom') {
                  const sloText = item.slo || '';
                  sloStrings.push(sloText);

                  // Programmatically determine SLO level from first verb (override AI if match found)
                  const detectedSloLevel = getBloomLevelFromFirstVerb(sloText);
                  newBlooms.push({
                    coCode: item.coCode || coCode,
                    slo: sloText,
                    level: (detectedSloLevel !== "Unknown") ? detectedSloLevel : (item.level || 'Unknown')
                  });
                } else if (item.type === 'gad') {
                  const sloText = item.slo || '';
                  if (sloText) sloStrings.push(sloText);
                  newGads.push({
                    coCode: item.coCode || coCode,
                    slo: item.slo,
                    isGadRelated: item.isGadRelated || false,
                    explanation: item.explanation || ''
                  });
                } else {
                  // Fallback: if it's some other object, try to extract a string representation
                  const sloText = item.slo || JSON.stringify(item);
                  sloStrings.push(sloText);
                  const detectedSloLevel = getBloomLevelFromFirstVerb(sloText);
                  if (detectedSloLevel !== "Unknown") {
                    newBlooms.push({
                      coCode,
                      slo: sloText,
                      level: detectedSloLevel
                    });
                  }
                }
              }
            });

            const existingCoIdx = prev.coAlignment.findIndex(co => co.coCode === coCode);
            let updatedAlignment = [...prev.coAlignment];

            if (existingCoIdx !== -1) {
              // Merge SLOs into existing CO
              const existingCo = updatedAlignment[existingCoIdx];
              updatedAlignment[existingCoIdx] = {
                ...existingCo,
                slos: Array.from(new Set([...existingCo.slos, ...sloStrings]))
              };
            } else {
              // Add new CO
              updatedAlignment.push({
                coCode,
                coDescription: coDesc,
                slos: sloStrings
              });
            }

            // Merge new blooms into existing bloomData, deduplicating by coCode and slo
            const updatedBloomData = [...prev.bloomData];
            newBlooms.forEach(nb => {
              const exists = updatedBloomData.some(b => b.coCode === nb.coCode && b.slo === nb.slo);
              if (!exists) {
                updatedBloomData.push(nb);
              }
            });

            // Merge new gads into existing gadData, deduplicating by coCode and slo
            const updatedGadData = [...(prev.gadData || [])];
            newGads.forEach(ng => {
              const exists = updatedGadData.some(g => g.coCode === ng.coCode && g.slo === ng.slo);
              if (!exists) {
                updatedGadData.push(ng);
              }
            });

            return {
              ...prev,
              coAlignment: updatedAlignment,
              bloomData: updatedBloomData,
              gadData: updatedGadData
            };
          }
          case 'bloom': {
            // Standalone bloom object (if AI ever outputs them separately)
            const coCode = data.coCode || '';
            const slo = data.slo || '';

            // Determine text to check for first verb
            let text = slo;
            if (!text) {
              const co = prev.coAlignment.find(c => c.coCode === coCode);
              if (co) text = co.coDescription;
            }

            const detectedLevel = getBloomLevelFromFirstVerb(text);
            const level = (detectedLevel !== "Unknown") ? detectedLevel : (data.level || 'Unknown');

            const exists = prev.bloomData.some(b => b.coCode === coCode && b.slo === slo);
            if (exists) return prev;

            // Ensure SLO is added to coAlignment if it's a bloom object for an SLO
            let updatedAlignment = [...prev.coAlignment];
            if (slo) {
              const existingCoIdx = updatedAlignment.findIndex(co => co.coCode === coCode);
              if (existingCoIdx !== -1) {
                const existingCo = updatedAlignment[existingCoIdx];
                if (!existingCo.slos.includes(slo)) {
                  updatedAlignment[existingCoIdx] = {
                    ...existingCo,
                    slos: [...existingCo.slos, slo]
                  };
                }
              }
            }

            return {
              ...prev,
              coAlignment: updatedAlignment,
              bloomData: [
                ...prev.bloomData,
                {
                  coCode,
                  slo,
                  level
                }
              ]
            };
          }
          case 'gad': {
            const coCode = data.coCode || '';
            const slo = data.slo;

            // Check if already exists
            const exists = (prev.gadData || []).some(g => g.coCode === coCode && g.slo === slo);
            if (exists) return prev;

            // Ensure SLO is in coAlignment
            let updatedAlignment = [...prev.coAlignment];
            if (slo) {
              const existingCoIdx = updatedAlignment.findIndex(co => co.coCode === coCode);
              if (existingCoIdx !== -1) {
                const existingCo = updatedAlignment[existingCoIdx];
                if (!existingCo.slos.includes(slo)) {
                  updatedAlignment[existingCoIdx] = {
                    ...existingCo,
                    slos: [...existingCo.slos, slo]
                  };
                }
              }
            }

            return {
              ...prev,
              coAlignment: updatedAlignment,
              gadData: [
                ...(prev.gadData || []),
                {
                  coCode,
                  slo,
                  isGadRelated: data.isGadRelated || false,
                  explanation: data.explanation || ''
                }
              ]
            };
          }
          case 'unaligned':
            return {
              ...prev,
              unalignedSLOs: Array.isArray(data.slos) ? data.slos : []
            };
          case 'error':
            toast({
              title: "Analysis Error",
              description: data.message || "Unknown error",
              variant: "destructive"
            });
            return prev;
          default:
            return prev;
        }
      } catch (err) {
        console.error("Error processing stream data:", err);
        return prev;
      }
    });
  };

  const processSelectedFile = async (file: File) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.docx')) {
      toast({
        title: "Invalid file format",
        description: "Please upload a Microsoft Word document (.docx).",
        variant: "destructive"
      });
      return;
    }

    // Abort any in-flight scan
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Clear file input so the same file can be re-selected after a Re-scan
    if (fileInputRef.current) {
      setTimeout(() => { if (fileInputRef.current) fileInputRef.current.value = ""; }, 0);
    }

    resetAnalysisState();
    setFormData(prev => ({ ...prev, syllabusFile: file }));

    // --- Cache check ---
    const hash = await hashFile(file);
    setCurrentFileHash(hash);

    const cached = readCache(hash);
    if (cached) {
      console.log('[SyllabusCache] Cache HIT for', file.name);
      setIsFromCache(true);
      // Restore all state from cache instantly
      if (cached.aiResults) setAiResults(cached.aiResults);
      if (cached.tableAnalysis) setTableAnalysis(sanitizeTableAnalysis(cached.tableAnalysis));
      if (cached.extractedTitle) setExtractedTitle(cached.extractedTitle);
      if (cached.extractedCourseCode) setExtractedCourseCode(cached.extractedCourseCode);
      if (cached.extractedCourseCredit) setExtractedCourseCredit(cached.extractedCourseCredit);
      if (cached.extractedCourseTitle) setExtractedCourseTitle(cached.extractedCourseTitle);
      if (cached.extractedNominalDuration) setExtractedNominalDuration(cached.extractedNominalDuration);
      if (cached.extractedPrerequisite) setExtractedPrerequisite(cached.extractedPrerequisite);
      if (cached.extractedCourseDescription) setExtractedCourseDescription(cached.extractedCourseDescription);
      if (cached.extractedCourseOutcomes) setExtractedCourseOutcomes(cached.extractedCourseOutcomes);
      if (cached.extractedReferences) setExtractedReferences(cached.extractedReferences);
      if (cached.extractedGradingSystem) setExtractedGradingSystem(cached.extractedGradingSystem);
      if (cached.extractedPolicies) setExtractedPolicies(cached.extractedPolicies);
      if (cached.extractedRevisionHistory) setExtractedRevisionHistory(cached.extractedRevisionHistory);
      setShowAIModal(true);
      toast({ title: 'Loaded from cache', description: 'Previous scan results restored instantly.' });
      return; // Skip all API calls
    }

    // --- Cache MISS: run full analysis ---
    console.log('[SyllabusCache] Cache MISS for', file.name, '– starting full scan');
    setIsFromCache(false);

    analyzeSyllabusStream(file);
    analyzeTable(file);
    analyzeAllFields(file);
    analyzeTitle(file);
    analyzeCourseCode(file);
    analyzeCourseCredit(file);
    analyzeCourseTitle(file);
    analyzeNominalDuration(file);
    analyzePrerequisite(file);
    analyzeCourseDescription(file);
    analyzeCourseOutcomes(file);
    analyzeReferences(file);
    analyzeGradingSystem(file);
    analyzePolicies(file);
    analyzeRevisionHistory(file);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      await processSelectedFile(file);
    }
  };

  // Re-scan: clear cache entry and re-trigger full analysis for the current file
  const handleRescan = async () => {
    const file = formData.syllabusFile;
    if (!file) return;
    if (currentFileHash) clearCacheEntry(currentFileHash);
    setIsFromCache(false);
    cacheWrittenRef.current = false;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    resetAnalysisState();
    setCurrentFileHash(currentFileHash); // keep same hash, cache entry was cleared

    analyzeSyllabusStream(file);
    analyzeTable(file);
    analyzeAllFields(file);
    analyzeTitle(file);
    analyzeCourseCode(file);
    analyzeCourseCredit(file);
    analyzeCourseTitle(file);
    analyzeNominalDuration(file);
    analyzePrerequisite(file);
    analyzeCourseDescription(file);
    analyzeCourseOutcomes(file);
    analyzeReferences(file);
    analyzeGradingSystem(file);
    analyzePolicies(file);
    analyzeRevisionHistory(file);
  };

  const handleSubmit = async (e: React.FormEvent, isAnyway = false, forceStatus?: SyllabusStatus) => {
    e.preventDefault();

    if (!isAnyway && (!formData.courseCode || !formData.courseTitle || !formData.semesterPeriod || !formData.syllabusFile)) {
      toast({
        title: "Missing required fields",
        description: "Please fill in all required fields and upload a syllabus file.",
        variant: "destructive",
      });
      return;
    }

    if (isAnyway && !formData.syllabusFile) {
      toast({
        title: "File required",
        description: "Please select a syllabus file first.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1500));

    const selectedSemData = dbSemesters.find(s => s.id === formData.semesterPeriod);
    const semesterName = selectedSemData ? formatSemesterName(selectedSemData) : formData.semesterPeriod;

    const syllabusData = {
      courseCode: formData.courseCode || "N/A",
      courseTitle: formData.courseTitle || "N/A",
      semesterPeriod: semesterName || "N/A",
      semesterId: formData.semesterPeriod || "1",
      college: formData.college || user?.college || "N/A",
      department: formData.department || user?.department || "N/A",
      facultyId: user!.id,
      facultyName: `${user!.firstName} ${user!.lastName}`,
      fileName: formData.syllabusFile!.name,

      status: forceStatus || ('draft' as const),
      aiAnalysis: aiResults ? {
        score: aiResults.overallScore,
        status: aiResults.status,
        suggestions: generalSuggestions,
        missingSections: mergedMissing,
        coAlignment: aiResults.coAlignment || [],
        bloomData: aiResults.bloomData || [],
        gadData: aiResults.gadData || [],
        tableAnalysis: tableAnalysis || null,
        appliedSuggestions: false,
        extractedData: {
          title: extractedTitle,
          courseCode: extractedCourseCode,
          courseTitle: extractedCourseTitle,
          courseCredit: extractedCourseCredit,
          nominalDuration: extractedNominalDuration,
          prerequisite: extractedPrerequisite,
          courseDescription: extractedCourseDescription,
          courseOutcomes: extractedCourseOutcomes,
          references: extractedReferences,
          gradingSystem: extractedGradingSystem,
          policies: extractedPolicies,
          revisionHistory: extractedRevisionHistory
        }
      } : undefined,
      coSloAlignment: aiResults?.coAlignment.map(co => ({
        code: co.coCode,
        description: co.coDescription,
        slos: co.slos
      })) || [],
    };

    if (isRevision && originalSyllabus) {
      const success = await reuploadSyllabus(originalSyllabus.id, formData.syllabusFile!, syllabusData.aiAnalysis);
      if (success) {
        // Also persist AI analysis separately (guarantees it's saved even if reupload omits it)
        if (syllabusData.aiAnalysis) {
          await saveAiAnalysis(originalSyllabus.id, syllabusData.aiAnalysis);
        }
        toast({
          title: 'Syllabus Updated',
          description: 'Your revision has been uploaded and reset for review.',
        });
        navigate(`/faculty/forms-editor/${originalSyllabus.id}`);
      } else {
        toast({
          title: 'Update Failed',
          description: 'Could not re-upload syllabus.',
          variant: 'destructive',
        });
      }
    } else {
      const newId = await uploadSyllabus(syllabusData, formData.syllabusFile!);
      if (newId) {
        // Also persist AI analysis separately (guarantees it's saved)
        if (syllabusData.aiAnalysis) {
          await saveAiAnalysis(newId, syllabusData.aiAnalysis);
        }
        toast({
          title: 'Syllabus Uploaded',
          description: 'Proceeding to forms and signing...',
        });
        navigate(`/faculty/forms-editor/${newId}`);
      } else {
        toast({
          title: 'Upload Failed',
          description: 'Could not save syllabus to the database.',
          variant: 'destructive',
        });
      }
    }
    setIsLoading(false);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
      case 'medium': return 'bg-warning/20 text-warning';
      case 'low': return 'bg-success/20 text-success';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
      case 'high':
      case 'required':
        return {
          label: 'Required',
          className: 'bg-red-100 text-red-800 border-red-200'
        };
      case 'medium':
      case 'warning':
        return {
          label: 'Needs Adjustment',
          className: 'bg-yellow-100 text-yellow-800 border-yellow-200'
        };
      case 'low':
      case 'info':
      case 'suggestion':
      default:
        return {
          label: 'Suggestion',
          className: 'bg-blue-100 text-blue-800 border-blue-200'
        };
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getBloomLevelColor = (level: string) => {
    switch (level) {
      case 'Remembering': return 'bg-purple-500 text-white border-purple-600 hover:bg-purple-500 hover:text-white';
      case 'Understanding': return 'bg-blue-500 text-white border-blue-600 hover:bg-blue-500 hover:text-white';
      case 'Applying': return 'bg-green-500 text-white border-green-600 hover:bg-green-500 hover:text-white';
      case 'Analyzing': return 'bg-yellow-400 text-yellow-950 border-yellow-500 hover:bg-yellow-400 hover:text-yellow-950';
      case 'Evaluating': return 'bg-orange-500 text-white border-orange-600 hover:bg-orange-500 hover:text-white';
      case 'Creating': return 'bg-red-500 text-white border-red-600 hover:bg-red-500 hover:text-white';
      default: return 'bg-muted text-muted-foreground border-border hover:bg-muted hover:text-muted-foreground';
    }
  };

  const submitForReview = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setShowAIModal(false);
    // Saving as 'draft' initially so it goes to forms-editor
    handleSubmit(new Event('submit') as unknown as React.FormEvent<HTMLFormElement>, true, 'draft');
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          {isRevision ? 'Revise Syllabus' : 'Upload Syllabus'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isRevision
            ? `Updating revision for ${originalSyllabus?.courseCode} - ${originalSyllabus?.courseTitle}`
            : 'Submit a new syllabus with AI-powered quality analysis'}
        </p>
      </div>

      {isAnalyzing && !showAIModal && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setShowAIModal(true)} className="gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Show AI Analysis
          </Button>
        </div>
      )}

      {/* AI Analysis Modal */}
      <Dialog open={showAIModal} onOpenChange={setShowAIModal}>
        <DialogContent className="!max-w-[1200px] max-w-5xl max-h-[88vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-5 py-3.5 border-b shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <DialogTitle className="flex items-center gap-2 text-base font-semibold flex-wrap">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>AI Analysis {isAnalyzing ? '(Analyzing...)' : 'Report'}</span>
                  {isFromCache && !isAnalyzing && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-500/30">
                      <Zap className="h-3 w-3" />
                      Cached
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">
                  {isAnalyzing ? 'Results appear as they are generated.' : 'Review suggestions and extracted syllabus fields before submitting.'}
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAIModal(false)}
                className="h-8 w-8 p-0 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 ml-2"
                title="Close"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </DialogHeader>

          {aiResults && (
            <div className="flex-1 overflow-y-auto px-5 py-3 sidebar-scrollbar">
              {/* Compact Score Banner */}
              <div className="flex items-center justify-between gap-4 p-2 px-3 bg-muted/40 rounded-lg border mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs text-muted-foreground">Overall Score:</span>
                    <span className={`text-lg font-bold ${getScoreColor(aiResults.overallScore)}`}>
                      {aiResults.overallScore}%
                    </span>
                  </div>
                  <div className="h-3.5 w-px bg-border" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Status:</span>
                    <Badge variant="outline" className={`
                      ${aiResults.status === 'excellent' ? 'bg-success/20 text-success border-success/30' :
                        aiResults.status === 'good' ? 'bg-warning/20 text-warning border-warning/30' :
                          'bg-destructive/20 text-destructive border-destructive/30'}
                      text-[11px] px-2 py-0.5 capitalize
                    `}>
                      {aiResults.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
                {formData.syllabusFile?.name && (
                  <div className="text-xs text-muted-foreground truncate max-w-xs hidden sm:block">
                    File: <span className="font-medium text-foreground">{formData.syllabusFile.name}</span>
                  </div>
                )}
              </div>

              {/* Tabs - now with 6 tabs */}
              <Tabs defaultValue="suggestions" className="w-full">
                <TabsList className="grid grid-cols-6 mb-2.5 h-8">
                  <TabsTrigger value="summary" className="text-xs py-1">
                    Summary
                  </TabsTrigger>
                  <TabsTrigger value="suggestions" className="text-xs py-1">
                    Suggestions ({suggestionsCount})
                  </TabsTrigger>
                  <TabsTrigger value="missing" className="text-xs py-1">
                    Missing ({mergedMissing.length})
                  </TabsTrigger>
                  <TabsTrigger value="alignment" className="text-xs py-1">
                    Alignment{' '}
                    {isAnalyzing && (!aiResults?.coAlignment || aiResults.coAlignment.length === 0) ? (
                      <Loader2 className="ml-1 h-3 w-3 animate-spin inline" />
                    ) : (
                      `(${aiResults?.coAlignment.length ?? 0})`
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="gad" className="text-xs py-1">
                    GAD Results
                  </TabsTrigger>
                  <TabsTrigger value="table" className="text-xs py-1">
                    Table Analysis {isTableAnalyzing && <Loader2 className="ml-1 h-3 w-3 animate-spin inline" />}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="mt-0">
                  <div className="border rounded-lg divide-y bg-card text-xs">
                    {/* Title */}
                    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 p-2.5 hover:bg-muted/20">
                      <div className="font-medium text-foreground">Title</div>
                      <div className="text-muted-foreground break-words">
                        {typeof extractedTitle === 'object' && extractedTitle !== null ? (
                          (extractedTitle as any).pages && (extractedTitle as any).pages.length > 0 ? (
                            <div className="space-y-1">
                              {(extractedTitle as any).pages.map((p: any) => (
                                <div key={p.page} className="flex items-center gap-2">
                                  <span className="font-medium text-foreground">Page {p.page}:</span>
                                  {p.status === 'passes' && p.title ? (
                                    <span className="text-muted-foreground">{p.title}</span>
                                  ) : (
                                    <span className="text-destructive font-medium">Missing</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span>{(extractedTitle as any).title || "-"}</span>
                          )
                        ) : (
                          <span>{extractedTitle || "-"}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {(typeof extractedTitle === 'object' && extractedTitle !== null ? (extractedTitle as any).isValid : !!extractedTitle) ? (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-success/20 text-success border-success/30"
                          >
                            Passes
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-red-100 text-red-800 border-red-200 shrink-0"
                          >
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Course Code */}
                    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 p-2.5 hover:bg-muted/20">
                      <div className="font-medium text-foreground">Course Code</div>
                      <div className="text-muted-foreground break-words">{extractedCourseCode || "-"}</div>
                      <div className="flex items-center gap-1">
                        {extractedCourseCode ? (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-success/20 text-success border-success/30"
                          >
                            Passes
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-red-100 text-red-800 border-red-200 shrink-0"
                          >
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Course Title */}
                    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 p-2.5 hover:bg-muted/20">
                      <div className="font-medium text-foreground">Course Title</div>
                      <div className="text-muted-foreground break-words">{extractedCourseTitle || "-"}</div>
                      <div className="flex items-center gap-1">
                        {extractedCourseTitle ? (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-success/20 text-success border-success/30"
                          >
                            Passes
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-red-100 text-red-800 border-red-200 shrink-0"
                          >
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Nominal Duration */}
                    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 p-2.5 hover:bg-muted/20">
                      <div className="font-medium text-foreground">Nominal Duration</div>
                      <div className="text-muted-foreground break-words">{extractedNominalDuration || "-"}</div>
                      <div className="flex items-center gap-1">
                        {extractedNominalDuration ? (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-success/20 text-success border-success/30"
                          >
                            Passes
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-red-100 text-red-800 border-red-200 shrink-0"
                          >
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Prerequisite */}
                    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 p-2.5 hover:bg-muted/20">
                      <div className="font-medium text-foreground">Prerequisite</div>
                      <div className="text-muted-foreground break-words">{extractedPrerequisite || "N/A"}</div>
                      <div className="flex items-center gap-1">
                        <Badge
                          variant="outline"
                          className="w-28 justify-center text-[10px] px-2 py-0.5 bg-success/20 text-success border-success/30"
                        >
                          Passes
                        </Badge>
                      </div>
                    </div>

                    {/* Course Description */}
                    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 p-2.5 hover:bg-muted/20">
                      <div className="font-medium text-foreground">Course Description</div>
                      <div className="text-muted-foreground whitespace-pre-wrap break-words line-clamp-3">{extractedCourseDescription || "-"}</div>
                      <div className="flex items-center gap-1">
                        {extractedCourseDescription ? (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-success/20 text-success border-success/30"
                          >
                            Passes
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-red-100 text-red-800 border-red-200 shrink-0"
                          >
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Course Outcomes */}
                    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 p-2.5 hover:bg-muted/20">
                      <div className="font-medium text-foreground">Course Outcomes</div>
                      <div className="text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto">
                        {extractedCourseOutcomes && extractedCourseOutcomes.outcomes.length > 0
                          ? extractedCourseOutcomes.outcomes
                            .slice()
                            .sort((a, b) => a.number - b.number)
                            .map((o, idx) => (
                              <div key={idx}>CO{o.number}: {o.text}</div>
                            ))
                          : <span>-</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {extractedCourseOutcomes && extractedCourseOutcomes.isValid && extractedCourseOutcomes.outcomes.length > 0 ? (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-success/20 text-success border-success/30"
                          >
                            Passes
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-red-100 text-red-800 border-red-200 shrink-0"
                          >
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* References */}
                    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 p-2.5 hover:bg-muted/20">
                      <div className="font-medium text-foreground">References</div>
                      <div className="text-muted-foreground break-words">{extractedReferences ? `${extractedReferences.count} detected` : "-"}</div>
                      <div className="flex items-center gap-1">
                        {extractedReferences && !extractedReferences.missing && extractedReferences.count > 0 ? (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-success/20 text-success border-success/30"
                          >
                            Passes
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-red-100 text-red-800 border-red-200 shrink-0"
                          >
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Course Credit */}
                    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 p-2.5 hover:bg-muted/20">
                      <div className="font-medium text-foreground">Course Credit</div>
                      <div className="text-muted-foreground break-words">{extractedCourseCredit || "-"}</div>
                      <div className="flex items-center gap-1">
                        {extractedCourseCredit ? (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-success/20 text-success border-success/30"
                          >
                            Passes
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-red-100 text-red-800 border-red-200 shrink-0"
                          >
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Grading System */}
                    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 p-2.5 hover:bg-muted/20">
                      <div className="font-medium text-foreground">Grading System</div>
                      <div className="text-muted-foreground space-y-0.5">
                        {extractedGradingSystem ? (
                          <>
                            <div>Major Output: {extractedGradingSystem.majorOutput || "-"} | Class Standing: {extractedGradingSystem.classStanding || "-"}</div>
                            <div>MidTerm Grade: {extractedGradingSystem.midTermGrade || "-"} | Final Grade: {extractedGradingSystem.finalGrade || "-"}</div>
                          </>
                        ) : (
                          <span>-</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {extractedGradingSystem && (
                          (extractedGradingSystem.majorOutput && extractedGradingSystem.majorOutput.trim()) ||
                          (extractedGradingSystem.classStanding && extractedGradingSystem.classStanding.trim()) ||
                          (extractedGradingSystem.midTermGrade && extractedGradingSystem.midTermGrade.trim()) ||
                          (extractedGradingSystem.finalTermGrade && extractedGradingSystem.finalTermGrade.trim()) ||
                          (extractedGradingSystem.finalGrade && extractedGradingSystem.finalGrade.trim())
                        ) ? (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-success/20 text-success border-success/30"
                          >
                            Passes
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-red-100 text-red-800 border-red-200 shrink-0"
                          >
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Policies */}
                    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 p-2.5 hover:bg-muted/20">
                      <div className="font-medium text-foreground">Policies</div>
                      <div className="text-muted-foreground line-clamp-2">
                        {extractedPolicies?.policies ? extractedPolicies.policies : "-"}
                      </div>
                      <div className="flex items-center gap-1">
                        {extractedPolicies && extractedPolicies.policies && extractedPolicies.policies.trim().length > 0 ? (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-success/20 text-success border-success/30"
                          >
                            Passes
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-red-100 text-red-800 border-red-200 shrink-0"
                          >
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Revision History */}
                    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 p-2.5 hover:bg-muted/20">
                      <div className="font-medium text-foreground">Revision History</div>
                      <div className="text-muted-foreground whitespace-pre-wrap break-words line-clamp-2">{extractedRevisionHistory?.revisionHistory || "-"}</div>
                      <div className="flex items-center gap-1">
                        {extractedRevisionHistory && extractedRevisionHistory.revisionHistory && extractedRevisionHistory.revisionHistory.trim().length > 0 ? (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-success/20 text-success border-success/30"
                          >
                            Passes
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="w-28 justify-center text-[10px] px-2 py-0.5 bg-red-100 text-red-800 border-red-200 shrink-0"
                          >
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="suggestions" className="space-y-2 mt-0">
                  {generalSuggestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No suggestions.</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-xs mb-2">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Review suggestions before submitting.
                      </div>
                      {generalSuggestions.map((s, idx) => {
                        const badge = getSeverityBadge(s.severity);
                        return (
                          <div key={`gen-${idx}`} className="border rounded-lg p-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm">{s.title}</span>
                              <Badge className={`text-xs ${badge.className}`}>
                                {badge.label}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">{s.description}</div>
                            {s.recommendation && (
                              <div className="mt-2 p-2 bg-primary/5 rounded border border-primary/10">
                                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-primary mb-1">
                                  <Sparkles className="h-3 w-3" />
                                  AI RECOMMENDATION
                                </div>
                                <p className="text-xs text-foreground italic">"{s.recommendation}"</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="missing" className="space-y-2 mt-0">
                  {mergedMissing.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No missing sections.</p>
                  ) : (
                    mergedMissing.map((section, index) => {
                      const normalize = (text: string) => text.toLowerCase().replace(/’/g, "'");
                      const isOptionalSection = [
                        "ICT Tools/Resources Lec",
                        "ICT Tools/Resources Lab",
                        "Required Readings",
                        "Assessment",
                        "Teacher's Notes"
                      ].some(optional => normalize(section).includes(normalize(optional)));
                      return (
                        <div key={index} className="flex items-center justify-between gap-2 text-sm p-2 border rounded-lg">
                          <span>{section}</span>
                          {!isOptionalSection && (
                            <Badge className="bg-red-100 text-red-800 text-xs shrink-0">Required</Badge>
                          )}
                        </div>
                      );
                    })
                  )}
                </TabsContent>

                {/* Alignment Tab – using bloomData as source of SLOs */}
                <TabsContent value="alignment" className="space-y-3 mt-0">
                  {isAnalyzing ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                      <p className="font-medium">Scanning Syllabus</p>
                      <p className="text-sm text-muted-foreground">AI is checking for Course Outcomes and SLOs…</p>
                    </div>
                  ) : !aiResults?.coAlignment || aiResults.coAlignment.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No Course Outcomes detected.
                    </p>
                  ) : (
                    <>
                      {/* Overall CO Count Validation Warning */}
                      {(aiResults.coAlignment.length < 3 || aiResults.coAlignment.length > 5) && (
                        <div className="flex items-center justify-between p-2.5 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-xs">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>
                              {aiResults.coAlignment.length < 3
                                ? `Insufficient Course Outcomes: Found ${aiResults.coAlignment.length} CO(s). A minimum of 3 COs is required (3–5 recommended).`
                                : `Too Many Course Outcomes: Found ${aiResults.coAlignment.length} COs. A maximum of 5 COs is allowed (3–5 recommended).`
                              }
                            </span>
                          </div>
                          <Badge className="bg-red-100 text-red-800 text-xs shrink-0">Required</Badge>
                        </div>
                      )}

                      {(() => {
                        let maxPrevCOLevelNum = 0;
                        let maxPrevCOLevelName = '';

                        return aiResults.coAlignment.map((co, index) => {
                          const entry = bloomsByCo.get(co.coCode);
                          const blooms = entry?.slos || [];
                          const coLevel = entry?.coLevel;

                          let breaksCOProgression = false;
                          let precedingCOLevelName = '';
                          if (index > 0 && coLevel && bloomLevelMap[coLevel] && maxPrevCOLevelNum > 0) {
                            if (bloomLevelMap[coLevel] < maxPrevCOLevelNum) {
                              breaksCOProgression = true;
                              precedingCOLevelName = maxPrevCOLevelName;
                            }
                          }

                          if (coLevel && bloomLevelMap[coLevel]) {
                            const currentCOLevelNum = bloomLevelMap[coLevel];
                            if (currentCOLevelNum > maxPrevCOLevelNum) {
                              maxPrevCOLevelNum = currentCOLevelNum;
                              maxPrevCOLevelName = coLevel;
                            }
                          }

                          // Pre-calculate if any SLO in this CO has an issue
                          let maxPrevLevelNum = 0;
                          let maxPrevLevelName = '';

                          const sloIssues = co.slos.map((sloText, idx) => {
                            const bloom = blooms.find(s => s.slo === sloText);
                            const level = bloom ? bloom.level : 'Unknown';

                            const exceedsLevel = coLevel && level !== 'Unknown' &&
                              bloomLevelMap[level] > bloomLevelMap[coLevel];

                            let breaksProgression = false;
                            let precedingLevelName = '';
                            if (idx > 0 && level !== 'Unknown' && maxPrevLevelNum > 0) {
                              if (bloomLevelMap[level] < maxPrevLevelNum) {
                                breaksProgression = true;
                                precedingLevelName = maxPrevLevelName;
                              }
                            }

                            if (level !== 'Unknown' && bloomLevelMap[level]) {
                              const currentLevelNum = bloomLevelMap[level];
                              if (currentLevelNum > maxPrevLevelNum) {
                                maxPrevLevelNum = currentLevelNum;
                                maxPrevLevelName = level;
                              }
                            }

                            return {
                              sloText,
                              level,
                              exceedsLevel,
                              breaksProgression,
                              precedingLevelName,
                              hasIssue: exceedsLevel || breaksProgression
                            };
                          });

                          const isInvalidSloCount = co.slos.length < 3 || co.slos.length > 5;
                          const isInvalidCOCount = aiResults.coAlignment.length < 3 || aiResults.coAlignment.length > 5;
                          const hasMissingSLOs = co.slos.length === 0;
                          const hasMissingCOLevel = !coLevel;
                          const hasCOIssue = hasMissingSLOs || hasMissingCOLevel || isInvalidSloCount || breaksCOProgression;

                          return (
                            <div key={index} className="border rounded-lg overflow-hidden">
                              {/* CO Header */}
                              <div className={`${hasCOIssue ? 'bg-destructive/10' : 'bg-muted/30'} p-2.5 px-3 border-b`}>
                                <div className="grid grid-cols-[56px_110px_1fr_auto] items-center gap-3">
                                  <Badge variant="outline" className={`font-mono text-xs h-6 w-[56px] justify-center px-0 shrink-0 ${hasCOIssue ? 'border-destructive/50 text-destructive' : ''}`}>
                                    {co.coCode}
                                  </Badge>
                                  {coLevel ? (
                                    <Badge className={`${getBloomLevelColor(coLevel)} text-[10px] w-[110px] flex justify-center h-6 shrink-0`}>
                                      {coLevel}
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-[10px] w-[110px] flex justify-center h-6 shrink-0">
                                      Missing Level
                                    </Badge>
                                  )}
                                  <div className="flex flex-col min-w-0">
                                    <span className={`text-xs font-semibold leading-snug ${hasCOIssue ? 'text-destructive' : 'text-foreground'}`}>
                                      {co.coDescription}
                                    </span>
                                    {isInvalidSloCount && (
                                      <span className="text-[11px] text-destructive font-medium flex items-center gap-1 mt-0.5">
                                        <AlertCircle className="h-3 w-3 shrink-0" />
                                        {co.slos.length < 3
                                          ? `Requires 3–5 SLOs (found ${co.slos.length})`
                                          : `Exceeds 5 SLOs (found ${co.slos.length})`
                                        }
                                      </span>
                                    )}
                                    {breaksCOProgression && (
                                      <span className="text-[10px] text-destructive font-medium flex items-center gap-1 mt-0.5">
                                        <AlertCircle className="h-2.5 w-2.5 shrink-0" /> Lower than preceding CO Bloom's level ({precedingCOLevelName})
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isInvalidSloCount ? (
                                      <Badge className="bg-red-100 text-red-800 text-[10px] px-1.5 py-0.5 shrink-0">Required</Badge>
                                    ) : breaksCOProgression ? (
                                      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-[10px] px-1.5 py-0.5 shrink-0">Adjustment</Badge>
                                    ) : null}
                                  </div>
                                </div>
                              </div>

                              {/* SLOs List */}
                              <div className="divide-y divide-muted/30">
                                {co.slos.length === 0 ? (
                                  <div className="p-2.5 px-3 pl-16 flex items-center justify-between">
                                    <span className="text-xs text-destructive italic font-medium">
                                      No SLOs aligned to this CO (Minimum 3 required)
                                    </span>
                                    <Badge className="bg-red-100 text-red-800 text-[10px] px-1.5 py-0.5 shrink-0">Required</Badge>
                                  </div>
                                ) : (
                                  sloIssues.map((issue, idx) => {
                                    const { sloText, level, exceedsLevel, breaksProgression, precedingLevelName } = issue;

                                    const rowBg = exceedsLevel
                                      ? 'bg-destructive/10'
                                      : breaksProgression
                                        ? 'bg-yellow-50 dark:bg-yellow-950/30'
                                        : 'hover:bg-muted/10';

                                    return (
                                      <div key={idx} className={`p-2 px-3 ${rowBg}`}>
                                        <div className="grid grid-cols-[56px_110px_1fr_auto] items-center gap-3">
                                          <span className="text-[11px] text-muted-foreground text-center font-mono font-medium shrink-0">
                                            SLO {idx + 1}
                                          </span>
                                          <Badge className={`${getBloomLevelColor(level)} text-[10px] w-[110px] flex justify-center h-5 shrink-0`}>
                                            {level}
                                          </Badge>
                                          <div className="flex flex-col min-w-0">
                                            <span className={`text-xs leading-relaxed ${exceedsLevel ? 'text-destructive font-medium' : breaksProgression ? 'text-yellow-950 dark:text-yellow-100 font-medium' : 'text-foreground'}`}>
                                              {sloText}
                                            </span>
                                            {exceedsLevel && (
                                              <span className="text-[10px] text-destructive flex items-center gap-1 mt-0.5">
                                                <AlertCircle className="h-2.5 w-2.5 shrink-0" /> Exceeds CO Bloom's level ({coLevel})
                                              </span>
                                            )}
                                            {breaksProgression && (
                                              <span className="text-[10px] text-yellow-700 dark:text-yellow-400 flex items-center gap-1 mt-0.5 font-medium">
                                                <AlertCircle className="h-2.5 w-2.5 shrink-0 text-yellow-600 dark:text-yellow-400" /> Lower than preceding SLO Bloom's level ({precedingLevelName})
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            {exceedsLevel ? (
                                              <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px] px-1.5 py-0.5">
                                                Required
                                              </Badge>
                                            ) : breaksProgression ? (
                                              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-[10px] px-1.5 py-0.5">
                                                Adjustment
                                              </Badge>
                                            ) : null}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </>
                  )}

                  {aiResults.unalignedSLOs.length > 0 && (
                    <div className="border border-destructive/40 rounded-lg p-3 mt-3 bg-destructive/5">
                      <h4 className="text-xs font-semibold text-destructive mb-1.5 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Unaligned SLOs
                      </h4>
                      <div className="space-y-1">
                        {aiResults.unalignedSLOs.map((slo, index) => (
                          <div key={index} className="text-xs text-muted-foreground">
                            • {slo}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* GAD Results Tab */}
                <TabsContent value="gad" className="space-y-3 mt-0">
                  {isAnalyzing ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                      <p className="font-medium">Scanning Syllabus</p>
                      <p className="text-sm text-muted-foreground">AI is checking for GAD relevance…</p>
                    </div>
                  ) : !aiResults?.gadData || aiResults.gadData.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No GAD analysis available.
                    </p>
                  ) : (
                    aiResults.coAlignment.map((co, index) => {
                      const entry = gadByCo.get(co.coCode);
                      const coGad = entry?.co;
                      const sloGads = entry?.slos || [];

                      return (
                        <div key={index} className="border rounded-lg overflow-hidden">
                          {/* CO Header */}
                          <div className="bg-muted/30 p-2.5 px-3 border-b">
                            <div className="grid grid-cols-[56px_1fr_130px] items-center gap-3">
                              <Badge variant="outline" className="font-mono text-xs h-6 w-[56px] justify-center px-0 shrink-0">
                                {co.coCode}
                              </Badge>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-semibold leading-snug">
                                  {co.coDescription}
                                </span>
                              </div>
                              {coGad && (
                                <Badge
                                  className={`${coGad.isGadRelated ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'} text-[10px] w-[130px] justify-center shrink-0`}
                                >
                                  {coGad.isGadRelated ? 'GAD Related' : 'Not GAD Related'}
                                </Badge>
                              )}
                            </div>
                            {coGad && coGad.explanation && (
                              <p className="text-xs text-muted-foreground mt-1.5 pl-[68px]">
                                {coGad.explanation}
                              </p>
                            )}
                          </div>

                          {/* SLOs List */}
                          <div className="divide-y divide-muted/30">
                            {co.slos.length === 0 ? (
                              <div className="p-2.5 px-3 pl-16">
                                <span className="text-xs text-muted-foreground italic">
                                  No SLOs aligned to this CO
                                </span>
                              </div>
                            ) : (
                              co.slos.map((sloText, idx) => {
                                const sloGad = sloGads.find(s => s.slo === sloText);

                                return (
                                  <div key={idx} className="p-2 px-3 hover:bg-muted/10">
                                    <div className="grid grid-cols-[56px_1fr_130px] items-center gap-3">
                                      <span className="text-[11px] text-muted-foreground text-center font-mono font-medium shrink-0">
                                        SLO {idx + 1}
                                      </span>
                                      <div className="flex flex-col min-w-0">
                                        <span className="text-xs leading-relaxed text-foreground">
                                          {sloText}
                                        </span>
                                      </div>
                                      {sloGad && (
                                        <Badge
                                          className={`${sloGad.isGadRelated ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'} text-[10px] w-[130px] justify-center shrink-0`}
                                        >
                                          {sloGad.isGadRelated ? 'GAD Related' : 'Not GAD Related'}
                                        </Badge>
                                      )}
                                    </div>
                                    {sloGad && sloGad.explanation && (
                                      <p className="text-xs text-muted-foreground mt-1 pl-[68px]">
                                        {sloGad.explanation}
                                      </p>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </TabsContent>

                {/* NEW: Table Analysis Tab Content */}
                <TabsContent value="table" className="mt-0 space-y-6">
                  {isTableAnalyzing ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                      <p className="text-sm text-muted-foreground">Analyzing table structure...</p>
                    </div>
                  ) : tableAnalysis ? (
                    <>
                      {/* Pre‑Midterm Table */}
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Pre‑Midterm</h3>
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="px-3 py-2 text-left">Column</th>
                                <th className="px-3 py-2 text-right">Empty Cells</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(tableAnalysis.pre_midterm).map(([col, count]) => (
                                <tr key={col} className="border-t">
                                  <td className="px-3 py-2">{col}</td>
                                  <td className="px-3 py-2 text-right font-mono">{count}</td>
                                </tr>
                              ))}
                              {Object.keys(tableAnalysis.pre_midterm).length === 0 && (
                                <tr>
                                  <td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">
                                    No data available
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Pre‑Final Table */}
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Pre‑Final</h3>
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="px-3 py-2 text-left">Column</th>
                                <th className="px-3 py-2 text-right">Empty Cells</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(tableAnalysis.pre_final).map(([col, count]) => (
                                <tr key={col} className="border-t">
                                  <td className="px-3 py-2">{col}</td>
                                  <td className="px-3 py-2 text-right font-mono">{count}</td>
                                </tr>
                              ))}
                              {Object.keys(tableAnalysis.pre_final).length === 0 && (
                                <tr>
                                  <td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">
                                    No data available
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No table analysis available.
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between gap-2 p-3 px-5 border-t bg-muted/20">
            <div className="flex-1"></div>
            <div className="flex items-center gap-2">
              {!isAnalyzing && aiResults && (
                <Button variant="outline" size="sm" onClick={handleRescan} className="gap-1.5 text-muted-foreground hover:text-foreground h-8 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Re-scan
                </Button>
              )}
              {isAnalyzing && (
                <Button variant="outline" size="sm" onClick={cancelAIScan} className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/50 h-8 text-xs">
                  Cancel Scan
                </Button>
              )}
              <Button onClick={submitForReview} className="bg-primary hover:bg-primary/90 h-8 text-xs gap-1.5" size="sm" disabled={isAnalyzing}>
                <span>Proceed to Forms</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tabs for Upload and Drafts */}
      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="mb-6 grid w-[420px] grid-cols-2">
          <TabsTrigger value="upload" className="flex items-center justify-center gap-2">
            <Upload className="h-4 w-4" />
            <span>Upload Syllabus</span>
          </TabsTrigger>
          <TabsTrigger value="drafts" className="flex items-center justify-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Drafts</span>
            {drafts.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                {drafts.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="mt-0">
          <Card className="shadow-soft">
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Course Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="courseCode">Course Code *</Label>
                    <Input id="courseCode" placeholder="CS101" value={formData.courseCode} onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="courseTitle">Course Title *</Label>
                    <Input id="courseTitle" placeholder="Introduction to Computer Science" value={formData.courseTitle} onChange={(e) => setFormData({ ...formData, courseTitle: e.target.value })} required />
                  </div>
                </div>

                {/* Semester Period */}
                <div className="space-y-2">
                  <Label htmlFor="semester">Semester & School Year *</Label>
                  <Select value={formData.semesterPeriod} onValueChange={(v) => setFormData({ ...formData, semesterPeriod: v })} required disabled={loadingSemesters}>
                    <SelectTrigger id="semester" className="h-10">
                      <SelectValue placeholder="Select semester" />
                    </SelectTrigger>
                    <SelectContent>
                      {dbSemesters.map(semester => (
                        <SelectItem key={semester.id} value={semester.id}>
                          {formatSemesterName(semester)} {semester.isCurrent && " - Current"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground italic">
                    Auto-selected based on the current active semester. You can change it if needed.
                  </p>
                </div>

                {/* College and Department */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="college">College</Label>
                    <Input id="college" value={formData.college} readOnly className="bg-muted cursor-not-allowed" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input id="department" value={formData.department} readOnly className="bg-muted cursor-not-allowed" />
                  </div>
                </div>

                {/* Syllabus Upload */}
                <div className="space-y-2">
                  <Label htmlFor="syllabusFile">Upload Syllabus (Word/DOCX) *</Label>
                  <div
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer relative ${isDragging
                      ? 'border-primary bg-primary/5 scale-[1.01] shadow-md ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/50 hover:bg-muted/30'
                      }`}
                  >
                    {isAnalyzing && (
                      <div
                        className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-xl z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="text-center">
                          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
                          <p className="font-medium">Analyzing Syllabus</p>
                          <p className="text-sm text-muted-foreground">AI is checking for improvements...</p>
                          {!showAIModal && (
                            <div className="mt-3">
                              <Button type="button" variant="secondary" size="sm" onClick={() => setShowAIModal(true)} className="gap-2">
                                <Eye className="h-3.5 w-3.5" />
                                Show AI Analysis
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <input
                      id="syllabusFile"
                      ref={fileInputRef}
                      type="file"
                      accept=".docx"
                      className="hidden"
                      onChange={handleFileChange}
                    />

                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className={`h-12 w-12 rounded-xl flex items-center justify-center transition-colors ${isDragging ? 'bg-primary/20 text-primary' : 'bg-primary/10 text-primary'
                        }`}>
                        <Upload className="h-6 w-6" />
                      </div>

                      <div>
                        <p className="font-medium text-foreground">
                          {isDragging ? 'Drop your Word document here' : 'Drag & drop your Word file here, or click to browse'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Supported format: Microsoft Word (.docx)
                        </p>
                      </div>

                      {formData.syllabusFile && !isAnalyzing && (
                        <div
                          className="mt-2 p-3 bg-success/10 border border-success/20 rounded-lg inline-flex items-center gap-2 max-w-full"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FileText className="h-4 w-4 text-success flex-shrink-0" />
                          <span className="text-sm text-success font-medium truncate max-w-xs">{formData.syllabusFile.name}</span>
                          {aiResults && <Badge variant="outline" className="ml-2 text-xs border-success/30 text-success">AI Analyzed</Badge>}
                        </div>
                      )}
                    </div>

                    {/* Persistent buttons – appear after analysis finishes */}
                    {(!isAnalyzing && aiResults) && (
                      <div className="mt-4 flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowAIModal(true)} className="gap-2">
                          <Eye className="h-3.5 w-3.5" />
                          Show Analysis
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={handleRescan} className="gap-2 text-muted-foreground hover:text-foreground">
                          <RefreshCw className="h-3.5 w-3.5" />
                          Re-scan
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>AI will analyze your syllabus for improvements</span>
                  </div>
                </div>

                {/* Submit Button */}
                <Button type="submit" className="w-full" size="lg" disabled={isLoading || isAnalyzing}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving & Proceeding...
                    </>
                  ) : (
                    <>
                      <span>Proceed to Forms Editor</span>
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drafts" className="mt-0">
          <div className="space-y-6">
            <div className="flex items-center gap-2.5">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Drafts (Pending Submission)</h2>
            </div>

            {drafts.length === 0 ? (
              <Card className="shadow-soft">
                <CardContent className="p-12 text-center">
                  <FileText className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">No drafts found</h3>
                  <p className="text-muted-foreground mb-4">You have no syllabi waiting for submission.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {drafts.map((syllabus) => (
                  <Card key={syllabus.id} className={`shadow-soft transition-all ${(syllabus.version ?? 1) > 1
                    ? 'border-destructive/40 bg-destructive/5'
                    : 'border-muted'
                    }`}>
                    {/* Returned for Revision Banner */}
                    {(syllabus.version ?? 1) > 1 && (
                      <div className="flex items-center gap-2 px-4 pt-3 pb-0">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-destructive">
                          <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                          Returned for Revision
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground font-medium">v{syllabus.version}</span>
                      </div>
                    )}
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${(syllabus.version ?? 1) > 1 ? 'bg-destructive/10' : 'bg-muted/20'
                          }`}>
                          <FileText className={`h-5 w-5 ${(syllabus.version ?? 1) > 1 ? 'text-destructive' : 'text-muted-foreground'
                            }`} />
                        </div>
                        <div>
                          <CardTitle className="text-base truncate max-w-[150px]">
                            {syllabus.courseCode}
                            {(syllabus.version ?? 1) > 1 && (
                              <span className="ml-1.5 text-[10px] font-bold text-destructive bg-destructive/10 rounded px-1 py-0.5">v{syllabus.version}</span>
                            )}
                          </CardTitle>
                          <CardDescription className="text-xs">{syllabus.semesterPeriod}</CardDescription>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the draft syllabus for {syllabus.courseCode}. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const result = await deleteSyllabus(syllabus.id);
                                  if (result.success) {
                                    toast({ title: "Draft deleted", description: "The syllabus draft has been successfully deleted." });
                                  } else {
                                    toast({ title: "Deletion Failed", description: `There was an error deleting the draft: ${result.error}`, variant: "destructive" });
                                  }
                                }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-1 mb-4">{syllabus.courseTitle}</p>
                      <div className="flex flex-col gap-2">
                        <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`/faculty/forms-editor/${syllabus.id}`)}>
                          {(syllabus.version ?? 1) > 1 ? 'Edit Revised Syllabus' : 'Edit & Sign'}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                        {(syllabus.version ?? 1) > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-muted-foreground hover:text-foreground text-xs"
                            onClick={() => navigate(`/faculty/forms-editor/${syllabus.id}?compare=1`)}
                          >
                            <GitBranch className="mr-1.5 h-3.5 w-3.5" />
                            Compare with Previous Version
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Assign Peer Reviewer Dialog */}
      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Assign Peer Reviewers</DialogTitle>
            <DialogDescription>
              Select one or more faculty members from your department to peer-review this bundle.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2.5">
              <Label className="text-sm font-semibold text-foreground">Department Reviewers</Label>
              {departmentFaculty.length > 0 && (
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={reviewerSearch}
                    onChange={(e) => setReviewerSearch(e.target.value)}
                    className="pl-9 h-9 rounded-xl text-sm"
                  />
                </div>
              )}
              <div className="max-h-[220px] overflow-y-auto border border-border rounded-xl p-2.5 space-y-1.5 sidebar-scrollbar bg-muted/20">
                {departmentFaculty.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No other department faculty found.</p>
                ) : filteredFaculty.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No matching faculty found.</p>
                ) : (
                  filteredFaculty.map((f) => {
                    const isSelected = selectedReviewerIds.includes(f.id);
                    return (
                      <div
                        key={f.id}
                        onClick={() => {
                          setSelectedReviewerIds(prev =>
                            prev.includes(f.id)
                              ? prev.filter(id => id !== f.id)
                              : [...prev, f.id]
                          );
                        }}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all duration-200 ${isSelected
                          ? 'border-primary bg-primary/5 text-foreground font-medium'
                          : 'border-border bg-card hover:bg-muted/40'
                          }`}
                      >
                        <div className="flex flex-col text-left">
                          <span className="text-sm text-foreground font-semibold">{f.firstName} {f.lastName}</span>
                          <span className="text-xs text-muted-foreground">{f.email}</span>
                        </div>
                        <div className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all ${isSelected ? 'bg-primary border-primary text-white' : 'border-muted-foreground/30 bg-transparent'
                          }`}>
                          {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAssignOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setIsAssignOpen(false);
                const assignedReviewers = departmentFaculty
                  .filter(f => selectedReviewerIds.includes(f.id))
                  .map(f => ({ reviewerId: f.id, reviewerName: `${f.firstName} ${f.lastName}` }));
                await handleSubmitBundle(assignedReviewers);
              }}
              disabled={selectedReviewerIds.length === 0 || isSubmitting}
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm Assignment ({selectedReviewerIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
