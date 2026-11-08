import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, FileText, Check, Loader2, MessagesSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FormChecklistProps {
  formType: 'form17' | 'form18';
  syllabus: any;
  userRole: string;
  userName: string;
  onGenerate: (formType: 'form17' | 'form18', formData: any) => Promise<void>;
  isGenerating?: boolean;
}

const FORM17_SECTIONS = [
  {
    title: "Preliminaries",
    criteria: [
      "1. The course code, course title, credit units, and time duration are indicated.",
      "2. The prerequisite(s) is/are specified.",
      "3. The course description is clearly stated."
    ]
  },
  {
    title: "Vision, Mission, Goals, Objectives, and Outcomes",
    criteria: [
      "1. The vision, mission, quality policy, institutional outcomes, and core values of the university are accurately stated.",
      "2. The course and specific outcomes describe competencies that are measurable as indicated by specific and active verbs.",
      "3. The outcomes address the most essential learning competencies.",
      "4. The learning outcomes are student-centered.",
      "5. The learning outcomes are attainable and realistic in a remote learning set-up.",
      "6. The learning outcomes are arranged logically: Complexity (lowest to the highest level of learning taxonomy) Domain (knowledge, skills, values)",
      "7. The learning outcomes are constructively aligned with the vision, mission, quality policy, institutional outcomes, and core values."
    ]
  },
  {
    title: "Course Content",
    criteria: [
      "1. The Learning Plan specifies the following: Schedule Course Outcomes Specific Learning Outcomes Performance Assessment Outputs Innovative Approaches and Strategies ICT Tools/Resources Required Readings Teacher’s Notes",
      "2. The course outcomes are constructively aligned with the specific learning outcomes.",
      "3. The course content mainstreams innovative and ethical leadership, cultural and natural heritage, gender and development, DRRM and climate change, futures thinking and foresight, entrepreneurial and green mindset, or other sustainable development goals in the curriculum.",
      "4. The course outcomes are constructively aligned with the performance assessment tasks/activities."
    ]
  },
  {
    title: "Assessment",
    criteria: [
      "1. Assessment tools and tasks are performance-based.",
      "2. Assessment tasks are aligned with the course and specific learning outcomes.",
      "3. Assessment tasks are varied to accommodate learners’ needs.",
      "4. Evaluation/Grading System is clearly stated."
    ]
  },
  {
    title: "Learning Modality and Methods",
    criteria: [
      "1. Hybrid flexible teaching and learning modalities are used.",
      "2. Teaching and learning modalities foster inclusivity and equitability.",
      "3. Teaching and learning methods/strategies are relevant to hybrid flexible learning.",
      "4. Teaching and learning methods/strategies are innovative.",
      "5. Teaching and learning methods/strategies emphasize 21st century competencies."
    ]
  },
  {
    title: "Resources, Required Readings, and References",
    criteria: [
      "1. Hybrid flexible learning materials are incorporated including classroom-based, offline-online, wired-non-wired, synchronous-asynchronous responsive to the learners.",
      "2. Required readings and references are relevant.",
      "3. References are accessible to the students.",
      "4. References and other resources are of recent edition.",
      "5. The reference list follows the latest edition of the APA.",
      "6. There are five references and 10 e-books/ online resources listed."
    ]
  },
  {
    title: "Policies",
    criteria: [
      "1. Policies are responsive to the flexible learning system.",
      "2. Policy on academic integrity, including AI use, is stipulated.",
      "3. Policy identifies the learning management system, communication, and collaborating tools to be used.",
      "4. Policies specify the etiquette in using technology tools and platforms."
    ]
  },
  {
    title: "Other Required Information",
    criteria: [
      "1. Revision history is indicated.",
      "2. Instructor’s name is indicated.",
      "3. The names of the recommending approval are indicated: Program Chair/Department Head Dean CITL Director VPAA",
      "4. The syllabus adheres to the University Document Control standards."
    ]
  },
  {
    title: "House Style",
    criteria: [
      "1. Paper size (A4)",
      "2. Paper Orientation (landscape)",
      "3. Line Spacing (single)",
      "4. Margin (1 inch - right, left, top, bottom)",
      "5. Font (Book Antiqua)",
      "6. Headings (12 pt) Text (11 pt) (Except for Page 1 with 9 pt font size)"
    ]
  }
];

export function FormChecklist({ formType, syllabus, userRole, userName, onGenerate, isGenerating = false }: FormChecklistProps) {
  const { toast } = useToast();
  const isReadOnly = userRole === 'vpaa';
  const [isExtracting, setIsExtracting] = useState(false);
  
  // ----------------------------------------------------
  // Form 17 States
  // ----------------------------------------------------
  const [f17Header, setF17Header] = useState({
    reviewerName: '',
    dateOfReview: '',
    courseCode: '',
    courseTitle: '',
    instructorName: ''
  });

  const [f17Checklist, setF17Checklist] = useState<Record<string, { status: 'Yes' | 'No' | '', remarks: string }>>({});
  const [f17Suggestions, setF17Suggestions] = useState('');

  // ----------------------------------------------------
  // Form 18 States
  // ----------------------------------------------------
  const [f18Header, setF18Header] = useState({
    courseCode: '',
    courseTitle: ''
  });

  const [f18Suggestions, setF18Suggestions] = useState<Array<{ reviewPoint: string; actionTaken: string; pageNumber: string; remarks: string }>>([
    { reviewPoint: '', actionTaken: '', pageNumber: '', remarks: '' }
  ]);

  // Load initial data
  useEffect(() => {
    if (!syllabus) return;

    if (formType === 'form17') {
      const saved = syllabus.form17Data || {};
      setF17Header({
        reviewerName: saved.reviewerName || userName || '',
        dateOfReview: saved.dateOfReview || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        courseCode: saved.courseCode || syllabus.courseCode || '',
        courseTitle: saved.courseTitle || syllabus.courseTitle || '',
        instructorName: saved.instructorName || syllabus.facultyName || ''
      });
      setF17Suggestions(saved.suggestions || '');

      // Build checklist mapping
      const initialChecklist: Record<string, { status: 'Yes' | 'No' | '', remarks: string }> = {};
      FORM17_SECTIONS.forEach(sec => {
        sec.criteria.forEach(crit => {
          const savedItem = saved.checklist?.[crit] || {};
          initialChecklist[crit] = {
            status: savedItem.status || '',
            remarks: savedItem.remarks || ''
          };
        });
      });
      setF17Checklist(initialChecklist);
    } else {
      const saved = syllabus.form18Data || {};
      setF18Header({
        courseCode: saved.courseCode || syllabus.courseCode || '',
        courseTitle: saved.courseTitle || syllabus.courseTitle || ''
      });

      const isCitl = userRole === 'citl';
      let savedSugs = isCitl ? saved.citlSuggestions : saved.programSuggestions;
      
      // Fallback for legacy data without separate arrays
      if (!savedSugs) {
         if (saved.reviewType === (isCitl ? 'citl' : 'program')) {
             savedSugs = saved.suggestions;
         } else {
             savedSugs = []; // New blank array for this role
         }
      }

      setF18Suggestions(savedSugs && savedSugs.length > 0 ? savedSugs : [{ reviewPoint: '', actionTaken: '', pageNumber: '', remarks: '' }]);
    }
  }, [formType, syllabus, userName, userRole]);

  // ----------------------------------------------------
  // Form 17 Actions
  // ----------------------------------------------------
  const handleBulkF17Check = (criteriaList: string[], status: 'Yes' | 'No') => {
    setF17Checklist(prev => {
      const next = { ...prev };
      criteriaList.forEach(crit => {
        const current = next[crit] || { status: '', remarks: '' };
        next[crit] = { ...current, status };
      });
      return next;
    });
  };

  const handleF17CheckChange = (crit: string, status: 'Yes' | 'No') => {
    setF17Checklist(prev => {
      const current = prev[crit] || { status: '', remarks: '' };
      const nextStatus = current.status === status ? '' : status; // toggle off if clicked again
      return {
        ...prev,
        [crit]: {
          ...current,
          status: nextStatus
        }
      };
    });
  };

  const handleF17RemarksChange = (crit: string, remarks: string) => {
    setF17Checklist(prev => ({
      ...prev,
      [crit]: {
        ...(prev[crit] || { status: '', remarks: '' }),
        remarks
      }
    }));
  };

  // ----------------------------------------------------
  // Form 18 Actions
  // ----------------------------------------------------
  const handleF18SugChange = (index: number, field: string, val: string) => {
    setF18Suggestions(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: val
      };
      return next;
    });
  };

  const handleAddF18Row = () => {
    setF18Suggestions(prev => [...prev, { reviewPoint: '', actionTaken: '', pageNumber: '', remarks: '' }]);
  };

  const handleRemoveF18Row = (index: number) => {
    if (f18Suggestions.length === 1) return;
    setF18Suggestions(prev => prev.filter((_, i) => i !== index));
  };

  const handleExtractComments = async () => {
    if (!syllabus?.id && !syllabus?._id) return;
    setIsExtracting(true);
    try {
      const syllabusId = syllabus.id || syllabus._id;
      const rawApi = (import.meta.env as any).VITE_API_BASE_URL as string | undefined;
      let apiBase = (rawApi ? rawApi.trim() : '') || 'http://localhost:5000';
      if (apiBase.includes('localhost') && !window.location.hostname.includes('localhost')) {
        apiBase = apiBase.replace('localhost', window.location.hostname);
      }
      const token = (() => { try { return localStorage.getItem('auth_token') || ''; } catch { return ''; } })();
      const res = await fetch(
        `${apiBase}/docs/${encodeURIComponent(syllabusId)}/extract-comments?docType=syllabus`,
        { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: 'application/json' } }
      );
      if (!res.ok) throw new Error('Failed to extract comments');
      const data = await res.json();
      const comments: { author: string; comment: string; reviewCode: string; pageNumber?: string }[] = data.comments || [];

      // Dictionary for Program Review (Left Column)
      const programGuide: Record<string, string> = {
        'A.1.': 'A.1. Format: Use template prescribed by the university.',
        'A.2.': 'A.2. Structure: Present content logical sections.',
        'A.3.': 'A.3. Font Style: Use Book Antiqua.',
        'A.4.': 'A.4. Font Size:',
        'A.4.1.': 'A.4.1. Headings: 12 pt.',
        'A.4.2.': 'A.4.2. Main text (page 1): 9 pt.',
        'A.4.3.': 'A.4.3. Main text (succeeding pages): 11 pt.',
        'A.5.': 'A.5. Line Spacing: Apply single space throughout the document.',
        'B.1.': 'B.1. coherence and logical connection between CO and SLO',
        'B.2.': 'B.2. coherence and logical connection between CO and PAO',
        'B.3.': 'B.3. coherence and logical connection between CO and IAS',
        'B.4.': 'B.4. coherence and logical connection between CO and ICT',
        'B.5.': 'B.5. coherence and logical connection between SLO and IAS',
        'B.6.': 'B.6. coherence and logical connection between SLO and ICT',
        'C.1.': 'C.1. All Course Outcomes (COs) must begin with behavioral verbs (e.g. demonstrate, analyze, evaluate, formulate)',
        'C.2.': 'C.2. Specific Learning Outcomes (SLOs) should be precise, observable',
        'D.1.': 'D.1. Hierarchical COs arranged in increasing level of complexity',
        'D.2.': 'D.2. Overarching COs that encapsulate the SLOs',
        'D.3.': 'D.3. Foundational SLOs in increasing complexity',
        'D.4.': 'D.4. Mediating SLOs in increasing complexity',
        'D.5.': 'D.5. Terminal/Ultimate SLOs in increasing complexity',
        'E.1.': 'E.1. Revision history: Indicating the month and year of the previous revision(s) and the complete date of the present revision.',
        'E.2.': 'E.2. Proper signatories (lead faculty, department head, dean, CITL director, and VPAA)',
        'E.3.': 'E.3. Name(s) and signature(s) of syllabus author(s) responsible for present Revision',
        'E.4.': 'E.4. Complete and consistent reference list using APA 7th edition guidelines.',
        'F.1.': 'F.1. Form 17 - Syllabus Review Checklist',
        'F.2.': 'F.2. Form 18-1 - Syllabus Suggestion and Action Taken Form',
        'F.3.': 'F.3. Justification Form – no affixed signature for lead faculty'
      };

      // Dictionary for CITL Review (Right Column)
      const citlGuide: Record<string, string> = {
        'A.1.': 'A.1. format',
        'A.2.': 'A.2. structure',
        'A.3.': 'A.3. font style use',
        'A.4.': 'A.4. font size use',
        'A.4.1.': 'A.4.1. headings - 12 pt.',
        'A.4.2.': 'A.4.2. main text (page 1) - 9 pt.',
        'A.4.3.': 'A.4.3. main text (succeeding pages) 11 pt.',
        'A.5.': 'A.5. line spacing (single)',
        'B.1.': 'B.1. coherence and logical connection between CO and SLO',
        'B.2.': 'B.2. coherence and logical connection between CO and PAO',
        'B.3.': 'B.3. coherence and logical connection between CO and IAS',
        'B.4.': 'B.4. coherence and logical connection between CO and ICT',
        'B.5.': 'B.5. coherence and logical connection between SLO and IAS',
        'B.6.': 'B.6. coherence and logical connection between SLO and ICT',
        'C.1.': 'C.1. use of action/behavioral verb/s in course outcome/s',
        'C.2.': 'C.2. use of action/behavioral verb/in specific learning outcome/s',
        'D.1.': 'D.1. hierarchical COs',
        'D.2.': 'D.2. overarching COs',
        'D.3.': 'D.3. foundational SLO',
        'D.4.': 'D.4. mediating SLO',
        'D.5.': 'D.5. terminal/ultimate SLO',
        'E.1.': 'E.1. Revision History',
        'E.2.': 'E.2. Signatories',
        'E.3.': 'E.3. Name/s of Syllabus Author(s)',
        'E.4.': 'E.4. Reference List',
        'F.1.': 'F.1. Form 17 (Review Checklist)',
        'F.2.': 'F.2. Form 18-1 (Syllabus Review Suggestion and Action Taken)',
        'F.3.': 'F.3. Justification Form'
      };

      // Use ALL comments — OnlyOffice may store author names differently than our system
      // (e.g. "juan" vs "Juan Dela Cruz"), so filtering by name causes missed extractions.
      const allComments = comments;

      if (allComments.length === 0) {
        toast({ title: 'No comments found', description: 'No comments were found in this document. Make sure reviewers have added comments in OnlyOffice.', variant: 'default' });
        return;
      }

      const isCitl = userRole === 'citl';
      const guideMap = isCitl ? citlGuide : programGuide;

      // Include all comments that have a matched review code
      const matchedRows = allComments
        .filter(c => c.reviewCode)
        .map(c => {
          const codePrefix = c.reviewCode.split(' ')[0]; // e.g. "B.1.", "A.2."
          
          return {
            reviewPoint: codePrefix,
            actionTaken: '',
            pageNumber: '',
            remarks: ''
          };
        });

      // Also collect unmatched comments so reviewer can still see them
      const unmatchedCount = allComments.filter(c => !c.reviewCode).length;

      // Filter out rows that are already present in f18Suggestions (matched by reviewPoint)
      const uniqueNewRows = matchedRows.filter(newRow => 
        !f18Suggestions.some(existingRow => existingRow.reviewPoint === newRow.reviewPoint)
      );

      if (uniqueNewRows.length === 0 && matchedRows.length > 0) {
        toast({ title: 'No new comments to extract', description: 'All comments matching review codes have already been added to the suggestions.', variant: 'default' });
        return;
      }

      if (uniqueNewRows.length === 0) {
        toast({ title: 'No tagged comments found', description: `Found ${allComments.length} comment(s) but none had review codes (e.g. "A.1.", "B.2."). Make sure comments start with a review code.`, variant: 'default' });
        return;
      }
      
      setF18Suggestions(prev => {
        // If the current list only has one completely empty row, replace it. Otherwise append.
        const isEmptyDefault = prev.length === 1 && !prev[0].reviewPoint && !prev[0].actionTaken && !prev[0].pageNumber && !prev[0].remarks;
        return isEmptyDefault ? uniqueNewRows : [...prev, ...uniqueNewRows];
      });
      toast({ title: `${uniqueNewRows.length} new comment(s) extracted!`, description: `Review Points have been added.${unmatchedCount > 0 ? ` (${unmatchedCount} untagged comment(s) skipped)` : ''} Please review and edit before saving.`, variant: 'default' });
    } catch (e: any) {
      toast({ title: 'Extraction failed', description: e?.message || 'Could not extract comments.', variant: 'destructive' });
    } finally {
      setIsExtracting(false);
    }
  };

  // ----------------------------------------------------
  // Generate Action
  // ----------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formType === 'form17') {
      const payload = {
        ...f17Header,
        checklist: f17Checklist,
        suggestions: f17Suggestions
      };
      await onGenerate('form17', payload);
    } else {
      const isCitl = userRole === 'citl';
      const saved = syllabus.form18Data || {};
      
      const payload = {
        ...f18Header,
        reviewType: isCitl ? 'citl' : 'program',
        suggestions: f18Suggestions,
        // Preserve both arrays in the database
        citlSuggestions: isCitl ? f18Suggestions : (saved.citlSuggestions || []),
        programSuggestions: !isCitl ? f18Suggestions : (saved.programSuggestions || [])
      };
      await onGenerate('form18', payload);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-sm">
      {isReadOnly && (
        <div className="bg-blue-50/50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs p-3 rounded-lg flex items-center justify-center gap-2">
          <span className="font-medium">Viewing in Read-Only Mode</span>
        </div>
      )}
      <fieldset disabled={isReadOnly} className="space-y-6 min-w-0">
        {formType === 'form17' ? (
          // ====================================================
          // FORM 17 RENDER
          // ====================================================
          <div className="space-y-6">
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border space-y-4">
            <h3 className="font-semibold text-slate-950 dark:text-slate-50 text-base">Checklist Header Info</h3>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label htmlFor="reviewerName" className="text-xs font-semibold">Reviewer's Name</Label>
                <Input 
                  id="reviewerName"
                  value={f17Header.reviewerName}
                  onChange={(e) => setF17Header(prev => ({ ...prev, reviewerName: e.target.value }))}
                  placeholder="Stephanie Joy E. Faller"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="dateOfReview" className="text-xs font-semibold">Date of Review</Label>
                <Input 
                  id="dateOfReview"
                  value={f17Header.dateOfReview}
                  onChange={(e) => setF17Header(prev => ({ ...prev, dateOfReview: e.target.value }))}
                  placeholder="May 8, 2025"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="courseCode" className="text-xs font-semibold">Course Code</Label>
                <Input 
                  id="courseCode"
                  value={f17Header.courseCode}
                  onChange={(e) => setF17Header(prev => ({ ...prev, courseCode: e.target.value }))}
                  placeholder="IT1311"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="courseTitle" className="text-xs font-semibold">Course Title</Label>
                <Input 
                  id="courseTitle"
                  value={f17Header.courseTitle}
                  onChange={(e) => setF17Header(prev => ({ ...prev, courseTitle: e.target.value }))}
                  placeholder="Multimedia Systems"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="instructorName" className="text-xs font-semibold">Name(s) of Course Instructor/s</Label>
                <Input 
                  id="instructorName"
                  value={f17Header.instructorName}
                  onChange={(e) => setF17Header(prev => ({ ...prev, instructorName: e.target.value }))}
                  placeholder="Juan Dela Cruz"
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-slate-950 dark:text-slate-50 text-base">Checklist Criteria</h3>
            {FORM17_SECTIONS.map((sec, secIdx) => (
              <div key={secIdx} className="space-y-2 border rounded-lg overflow-hidden bg-white dark:bg-card">
                <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 flex items-center justify-between border-b">
                  <span className="font-semibold text-xs">{sec.title}</span>
                  {!isReadOnly && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => handleBulkF17Check(sec.criteria, 'Yes')}
                      >
                        Yes to All
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => handleBulkF17Check(sec.criteria, 'No')}
                      >
                        No to All
                      </Button>
                    </div>
                  )}
                </div>
                <div className="divide-y">
                  {sec.criteria.map((crit, critIdx) => {
                    const item = f17Checklist[crit] || { status: '', remarks: '' };
                    return (
                      <div key={critIdx} className="p-3 space-y-2">
                        <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">{crit}</p>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                            <Checkbox 
                              checked={item.status === 'Yes'}
                              onCheckedChange={() => handleF17CheckChange(crit, 'Yes')}
                            />
                            <span>Yes (Meets standard)</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                            <Checkbox 
                              checked={item.status === 'No'}
                              onCheckedChange={() => handleF17CheckChange(crit, 'No')}
                            />
                            <span>No (Does NOT meet)</span>
                          </label>
                        </div>
                        <Input 
                          placeholder="Remarks..."
                          value={item.remarks}
                          onChange={(e) => handleF17RemarksChange(crit, e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="f17Suggestions" className="font-semibold text-xs">Suggestions for Improvement</Label>
            <Textarea 
              id="f17Suggestions"
              value={f17Suggestions}
              onChange={(e) => setF17Suggestions(e.target.value)}
              placeholder="Provide comments and suggestions..."
              rows={4}
              className="text-xs"
            />
          </div>
        </div>
      ) : (
        // ====================================================
        // FORM 18 RENDER
        // ====================================================
        <div className="space-y-6">
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border space-y-4">
            <h3 className="font-semibold text-slate-950 dark:text-slate-50 text-base">Suggestions Form Header</h3>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label htmlFor="f18courseCode" className="text-xs font-semibold">Course Code</Label>
                <Input 
                  id="f18courseCode"
                  value={f18Header.courseCode}
                  onChange={(e) => setF18Header(prev => ({ ...prev, courseCode: e.target.value }))}
                  placeholder="IT1311"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="f18courseTitle" className="text-xs font-semibold">Course Title</Label>
                <Input 
                  id="f18courseTitle"
                  value={f18Header.courseTitle}
                  onChange={(e) => setF18Header(prev => ({ ...prev, courseTitle: e.target.value }))}
                  placeholder="Multimedia Systems"
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-slate-950 dark:text-slate-50 text-base">
                {userRole === 'citl' ? 'CITL Review Suggestions (Part B)' : 'Program Review Suggestions (Part A)'}
              </h3>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExtractComments}
                  disabled={isExtracting || isReadOnly}
                  className="h-8 gap-1 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300"
                >
                  {isExtracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessagesSquare className="h-3.5 w-3.5" />}
                  {isExtracting ? 'Extracting...' : 'Extract from Comments'}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={handleAddF18Row}
                  className="h-8 gap-1 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Row
                </Button>
              </div>
            </div>
            
            <div className="space-y-4">
              {f18Suggestions.map((sug, idx) => (
                <div key={idx} className="p-4 border rounded-lg bg-white dark:bg-card space-y-3 relative">
                  <div className="absolute top-2 right-2">
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleRemoveF18Row(idx)}
                      disabled={f18Suggestions.length === 1}
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-xs font-bold text-slate-500">Suggestion #{idx + 1}</div>
                  
                  <div>
                    <Label className="text-xs font-semibold">Review Point (Suggestion)</Label>
                    <Input 
                      value={sug.reviewPoint}
                      onChange={(e) => handleF18SugChange(idx, 'reviewPoint', e.target.value)}
                      placeholder="e.g. A.1., A.2."
                      className="mt-1 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Action Taken</Label>
                    <Textarea 
                      value={sug.actionTaken}
                      onChange={(e) => handleF18SugChange(idx, 'actionTaken', e.target.value)}
                      placeholder="e.g. Revised course description on page 2."
                      rows={2}
                      className="mt-1 text-xs"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Page Number</Label>
                      <Input 
                        value={sug.pageNumber}
                        onChange={(e) => handleF18SugChange(idx, 'pageNumber', e.target.value)}
                        placeholder="e.g. 2"
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Remarks</Label>
                      <Input 
                        value={sug.remarks}
                        onChange={(e) => handleF18SugChange(idx, 'remarks', e.target.value)}
                        placeholder="e.g. Required"
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </fieldset>

      {!isReadOnly && (
        <div className="pt-4 border-t sticky bottom-0 bg-card p-2 z-10 flex gap-2">
        <Button 
          type="submit" 
          disabled={isGenerating} 
          className="flex-1 gap-2 shadow-soft bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating Document...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Save Document
            </>
          )}
        </Button>
      </div>
      )}
    </form>
  );
}
