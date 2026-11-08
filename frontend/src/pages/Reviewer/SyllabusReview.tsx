import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Columns, FileSpreadsheet, FileBarChart, X, Clock, ChevronDown, ChevronUp, MessageSquare, Sparkles, Loader2, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { SyllabusStatus, ROLE_LABELS } from '@/types';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DocxClientViewer } from '@/components/DocxViewer/DocxClientViewer';
import { DocxHtmlEditor } from '@/components/DocxEditor/DocxHtmlEditor';
import { OnlyOfficeEditor, OnlyOfficeEditorHandle } from '@/components/DocxViewer/OnlyOfficeEditor';
import { ReviewPanel, FormChecklist } from '@/components/PDFReviewer';
import type { ReviewAction } from '@/components/PDFReviewer';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { VersionLabel } from '@/components/VersionLabel';
import { StatusBadge } from '@/components/StatusBadge';

export default function SyllabusReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, initialized } = useAuth();
  const { syllabi, updateSyllabusStatus, addReviewAction, approveSyllabus, returnSyllabus, getSyllabusById, allSyllabi, markAsOpened } = useData();
  const { toast } = useToast();
  const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:5000';
  const [split, setSplit] = useState(false);
  const [activeForm, setActiveForm] = useState<'form17' | 'form18'>('form17');
  const [activeLeftDocType, setActiveLeftDocType] = useState<'syllabus' | 'form17' | 'form18'>('syllabus');
  const [isGeneratingForm, setIsGeneratingForm] = useState(false);
  const [docModified, setDocModified] = useState(false);
  const [form17Modified, setForm17Modified] = useState(false);
  // One-way latch: once form17 has been edited in this session it stays true,
  // even after the document is saved (onStateChange fires false on save).
  const [form17HasBeenEdited, setForm17HasBeenEdited] = useState(false);
  const [form18HasBeenEdited, setForm18HasBeenEdited] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [signature, setSignature] = useState<any | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [showComparison, setShowComparison] = useState(false);

  const syllabusEditorRef = useRef<OnlyOfficeEditorHandle>(null);
  const form17EditorRef = useRef<OnlyOfficeEditorHandle>(null);
  const form18EditorRef = useRef<OnlyOfficeEditorHandle>(null);

  const [syllabus, setSyllabus] = React.useState<any>(null);
  const [isFetching, setIsFetching] = React.useState(true);

  React.useEffect(() => {
    const fetchSyllabus = async () => {
      if (!id) return;

      // 1. Try filtered list first (global semester)
      let found = syllabi.find(s => s.id === id);

      // 2. Try unfiltered list (all semesters)
      if (!found) {
        found = allSyllabi.find(s => s.id === id);
      }

      // 3. Try API directly
      if (!found) {
        found = await getSyllabusById(id);
      }

      setSyllabus(found);
      setIsFetching(false);

      if (found && user && (!found.openedBy || !found.openedBy.includes(user.id))) {
        markAsOpened(found.id, user.id);
      }
    };

    fetchSyllabus();
  }, [id, syllabi, allSyllabi, getSyllabusById]);

  // 'reviewAs' is passed in navigation state by ReviewSyllabi when clicking Review from a specific tab.
  // It is the authoritative source for which role the faculty user is acting as.
  // Fallback: derive from syllabus data (for direct URL access or other entry points).
  const reviewAs = (location.state as any)?.reviewAs as string | undefined;

  const forwardedByMe = React.useMemo(() => {
    if (!user || !syllabus) return false;
    const currentVersion = syllabus.version || 1;

    // If this user is a collaborator AND the syllabus has already moved to the
    // Senior Faculty stage (under_review_peer), their collaborator-stage forward
    // should NEVER trigger the "already forwarded" banner — it belongs to a past stage.
    const isUserCollaborator =
      Array.isArray(syllabus.collaborators) &&
      syllabus.collaborators.some((c: any) => String(c) === String(user.id));

    if (isUserCollaborator && syllabus.status === 'under_review_peer') {
      return false;
    }

    // Default: check reviewHistory for any forward/approve by this user this version
    return syllabus.reviewHistory?.some((r: any) =>
      r.reviewerId === user.id &&
      (r.action === 'forwarded' || r.action === 'approved') &&
      (r.version ?? 1) === currentVersion
    ) ?? false;
  }, [user, syllabus, reviewAs]);

  const syllabusDocUrl = useMemo(() => syllabus?.fileUrl || '/sample-files/syllabus.docx', [syllabus]);
  const form17Url = useMemo(() => syllabus?.form17Link || null, [syllabus]);
  const form18Url = useMemo(() => syllabus?.form18Link || null, [syllabus]);

  const handleClose = () => {
    const from = (location.state as any)?.from;
    if (from) {
      navigate(from);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/reviewer/syllabi', { replace: true });
    }
  };


  // DataContext maps collaborators as array of string IDs
  const isCollaborator = user?.role === 'faculty' && syllabus &&
    String(syllabus.facultyId) !== String(user?.id) &&
    Array.isArray(syllabus.collaborators) && syllabus.collaborators.some((c: any) => String(c) === String(user?.id));

  // If the current user is a Senior Faculty reviewing someone else's syllabus.
  // Must NOT be a collaborator.
  // DataContext maps assigned_peer_reviewers → assignedPeerReviewers with reviewerId (camelCase)
  const isPeerReviewer = 
    user?.role === 'faculty' && syllabus && String(syllabus.facultyId) !== String(user?.id) &&
    (
      (Array.isArray(syllabus.assignedPeerReviewers) &&
        syllabus.assignedPeerReviewers.some((apr: any) =>
          String(apr.reviewerId) === String(user?.id)
        )
      ) ||
      String(syllabus.claimedBySeniorFacultyId) === String(user?.id)
    );

  // The effective role to use for the ReviewPanel - determines which action buttons appear and the badge label
  // Priority: reviewAs (from nav state) > isPeerReviewer > isCollaborator > user.role
  // - 'faculty_peer_reviewer' → Senior Faculty Reviewer
  // - 'collaborator_reviewer'  → Peer Reviewer (collaborator/co-editor)
  // - user.role ('faculty')    → Lead Faculty (the syllabus owner themselves)
  const effectivePanelRole = (
    reviewAs === 'faculty_peer_reviewer' ? 'faculty_peer_reviewer'
      : reviewAs === 'collaborator_reviewer' ? 'collaborator_reviewer'
        : isPeerReviewer ? 'faculty_peer_reviewer'
          : isCollaborator ? 'collaborator_reviewer'
            : (user?.role ?? 'faculty')
  ) as import('@/types').UserRole;

  const getNextStatus = useCallback((actionType: ReviewAction['type']): SyllabusStatus => {
    if (!user) return 'submitted';
    if (actionType === 'return') return 'returned';
    if (actionType === 'approve') return 'approved';
    // Senior faculty reviewer (either from nav state or data)
    if (effectivePanelRole === 'faculty_peer_reviewer') return 'under_review_dept_head';
    switch (user.role) {
      case 'dept_head': return 'under_review_dean';
      case 'dean': return 'under_review_citl';
      case 'citl': return 'under_review_vpaa';
      case 'vpaa': return 'approved';
      default: return 'submitted';
    }
  }, [user, effectivePanelRole]);

  const handleReviewSubmit = useCallback(async (action: ReviewAction, comment: string) => {
    if (!user || !syllabus) return;
    const from = (location.state as any)?.from;

    // Determine if this user is acting as a senior faculty or collaborator (from nav state or data)
    const actingAsSeniorFaculty = effectivePanelRole === 'faculty_peer_reviewer';
    const actingAsCollaborator = effectivePanelRole === 'collaborator_reviewer';

    if (action.type === 'forward' || action.type === 'approve') {
      // Use 'faculty' role for the peer reviewer or collaborator so approveSyllabus maps it correctly
      const roleToUse = actingAsSeniorFaculty || actingAsCollaborator ? 'faculty' : user.role;

      approveSyllabus(
        syllabus.id,
        roleToUse,
        user.id,
        `${user.firstName} ${user.lastName}`,
        comment
      );

      const isFinalApproval = action.type === 'approve' || user.role === 'vpaa' || actingAsSeniorFaculty || actingAsCollaborator;
      toast({
        title: isFinalApproval ? 'Approved' : 'Forwarded',
        description: isFinalApproval
          ? (actingAsSeniorFaculty || actingAsCollaborator ? 'Syllabus approval recorded.' : 'Syllabus has been fully approved.')
          : 'Review forwarded successfully.'
      });

      // REDIRECT AFTER SUCCESS
      setTimeout(() => {
        if (from) {
          navigate(from);
        } else {
          navigate('/reviewer/syllabi');
        }
      }, 1500);
      return;
    }
    if (action.type === 'return') {
      const roleToUse = actingAsSeniorFaculty || actingAsCollaborator ? 'faculty' : user.role;
      returnSyllabus(
        syllabus.id,
        roleToUse,
        user.id,
        `${user.firstName} ${user.lastName}`,
        comment || 'Returned for revisions'
      );
      toast({ title: 'Returned', description: 'Syllabus returned to faculty.' });
      // REDIRECT AFTER SUCCESS
      setTimeout(() => {
        if (from) {
          navigate(from);
        } else {
          navigate('/reviewer/syllabi');
        }
      }, 1500);
      return;
    }
  }, [syllabus, user, effectivePanelRole, approveSyllabus, returnSyllabus, toast, location.state, navigate]);

  const handleRescan = async () => {
    if (!syllabus?.id) return;
    try {
      const isAbsoluteWindowsPath = /^[A-Za-z]:[/\\]/.test(syllabus.fileUrl) || syllabus.fileUrl?.startsWith('\\\\');
      let fileUrl = syllabus.fileUrl;
      if (isAbsoluteWindowsPath) {
        const filename = fileUrl.replace(/\\/g, '/').split('/').pop() || '';
        fileUrl = `${API_BASE}/uploads/syllabi/${encodeURIComponent(filename)}`;
      } else {
        const apiOrigin = new URL(API_BASE).origin;
        const parsed = new URL(fileUrl.replace('host.docker.internal', new URL(API_BASE).hostname));
        fileUrl = `${apiOrigin}${parsed.pathname}${parsed.search}`;
      }

      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) throw new Error('Could not fetch syllabus file');
      const blob = await fileRes.blob();
      const file = new File([blob], syllabus.fileName || 'syllabus.docx', { type: blob.type });

      const fd = new FormData();
      fd.append('file', file);
      const scanRes = await fetch(`${API_BASE}/ai/scan`, { method: 'POST', body: fd });
      if (!scanRes.ok) throw new Error('AI scan request failed');
      const data = await scanRes.json();
      
      const newAiAnalysis = {
        score: data.result.overallScore ?? 0,
        status: data.result.status ?? 'needs_improvement',
        suggestions: data.result.suggestions || [],
        missingSections: data.result.missingSections || [],
        coAlignment: data.result.coAlignment || [],
        bloomData: data.result.bloomData || [],
        gadData: data.result.gadData || [],
      };
      
      // Update backend via saveAiAnalysis if we have it, or just rely on state if there's a backend endpoint
      // Assuming a simple state update for now in reviewer panel
      setSyllabus((prev: any) => prev ? { ...prev, aiAnalysis: newAiAnalysis } : prev);
      toast({ title: 'AI Re-scan Complete', description: `New score: ${newAiAnalysis.score}% compliance` });
    } catch (err: any) {
      toast({ title: 'Re-scan Failed', description: err.message || 'Unknown error', variant: 'destructive' });
    }
  };

  if (isFetching || !initialized) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        {!initialized ? (
          <p className="text-muted-foreground animate-pulse">Initializing session...</p>
        ) : (
          <p className="text-muted-foreground animate-pulse">Loading syllabus details...</p>
        )}
      </div>
    );
  }

  if (initialized && !user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <h3 className="text-xl font-semibold">Session Expired</h3>
        <p className="text-muted-foreground">Please log in again to continue.</p>
        <Button onClick={() => navigate('/login')}>Login</Button>
      </div>
    );
  }

  if (initialized && user && !syllabus) {
    return (
      <div className="p-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Card className="mt-6 shadow-soft">
          <CardContent className="p-12 text-center">
            <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">Syllabus Not Found</h3>
            <p className="text-muted-foreground">
              The syllabus you're looking for doesn't exist or you don't have permission to review.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleFillForm = async (formType: 'form17' | 'form18', formData: any) => {
    if (!syllabus || !id) return;
    setIsGeneratingForm(true);
    try {
      const res = await fetch(`${API_BASE}/docs/${id}/fill-form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formType, formData }),
      });
      if (!res.ok) {
        let errMsg = 'Failed to generate form document';
        try {
          const err = await res.json();
          errMsg = err.error || errMsg;
        } catch {
          errMsg = `Server error: ${res.status}`;
        }
        throw new Error(errMsg);
      }
      const data = await res.json();
      // Merge the updated fields back into local state
      setSyllabus((prev: any) => ({
        ...prev,
        form17Data: data.form17Data ?? prev.form17Data,
        form18Data: data.form18Data ?? prev.form18Data,
        form17Link: data.form17Link ?? prev.form17Link,
        form18Link: data.form18Link ?? prev.form18Link,
      }));
      // Switch left pane to show the newly generated document
      setActiveLeftDocType(formType);
      setEditorKey(prev => prev + 1);
      // Mark as edited so the senior faculty can submit after generating the form
      if (formType === 'form17') setForm17HasBeenEdited(true);
      if (formType === 'form18') setForm18HasBeenEdited(true);
      toast({ title: 'Form Generated', description: `${formType === 'form17' ? 'Form 17' : 'Form 18'} has been generated and is now displayed on the left.`, variant: 'success' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Generation Failed', description: error.message || 'Could not generate the form document.' });
    } finally {
      setIsGeneratingForm(false);
    }
  };


  function getEditorRef(dt: 'syllabus' | 'form17' | 'form18') {
    if (dt === 'form17') return form17EditorRef;
    if (dt === 'form18') return form18EditorRef;
    return syllabusEditorRef;
  }

  async function handleInsertSignatures(docTypes: ('syllabus' | 'form17' | 'form18')[], sig: { imageData: string }, form18SearchOverride?: string) {
    try {
      toast({
        title: 'Inserting Signatures',
        description: `Please wait while we insert your signature...`,
      });

      if (!sig || !sig.imageData) {
        throw new Error('No signature image data provided.');
      }

      // 1. Save signature to backend to get a URL
      const saveRes = await fetch(`${API_BASE}/signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: sig.imageData }),
      });

      if (!saveRes.ok) throw new Error('Failed to save signature to server');
      const { url: savedUrl } = await saveRes.json();

      let successCount = 0;
      let connectorFailed = false;

      // 2. Process each docType
      for (const docType of docTypes) {
        let searchText = "";
        let align = "center";

        if (user?.role) {
          const role = user.role.toLowerCase();

          if (docType === 'form17') {
            switch (role) {
              case 'dept_head': searchText = "Program Chair/Department Head"; align = "left"; break;
              case 'dean': searchText = "College Dean"; align = "right"; break;
              case 'citl': searchText = "CITL Director"; align = "left"; break;
              case 'vpaa': searchText = "Vice President for Academic Affairs"; align = "right"; break;
              default: searchText = "Program Chair/Department Head"; align = "left"; break;
            }
          }
          else if (docType === 'form18') {
            // If a specific override is provided (e.g. FDIS Chair or CITL Director sub-buttons), use it
            if (form18SearchOverride) {
              searchText = form18SearchOverride;
              align = "center";
            } else {
              switch (role) {
                case 'dept_head': searchText = "Program Coordinator/Department Head"; align = "right"; break;
                case 'citl': searchText = "CITL Director"; align = "center"; break;
                case 'faculty':
                case 'senior_faculty':
                default:
                  searchText = "Lead Faculty/Course Instructor"; align = "right"; break;
              }
            }
          }
          else {
            // Syllabus
            switch (role) {
              case 'dept_head': searchText = "Department Head"; break;
              case 'dean': searchText = "Dean"; break;
              case 'citl': searchText = "CITL Director"; break;
              case 'vpaa': searchText = "VPAA"; break;
              case 'faculty':
              case 'senior_faculty':
              default:
                if (effectivePanelRole === 'collaborator_reviewer') {
                  searchText = "Course Instructor";
                } else {
                  searchText = "Lead Faculty";
                }
                break;
            }
          }
        } else {
          searchText = docType === 'form18' ? "Lead Faculty/Course Instructor" : (docType === 'form17' ? "Program Chair/Department Head" : "Lead Faculty");
        }

        // Try live connector insertion first (no refresh needed)
        const editorRef = getEditorRef(docType);
        const inTable = docType === 'syllabus';
        let liveInserted = false;

        if (editorRef.current) {
          try {
            liveInserted = await editorRef.current.insertSignatureViaConnector(savedUrl, searchText, inTable, align as "left" | "center" | "right");
          } catch {
            liveInserted = false;
          }
        }

        if (liveInserted) {
          successCount++;
        } else {
          // Fallback: use Python backend (will need a refresh)
          connectorFailed = true;
          try {
            const applyRes = await fetch(`${API_BASE}/docs/${id}/apply-signature`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ signatureUrl: savedUrl, searchText, docType, align }),
            });
            if (applyRes.ok) {
              const applyData = await applyRes.json();
              if (applyData.success && applyData.found) successCount++;
            }
          } catch {
            console.warn(`Failed to apply to ${docType}`);
          }
        }
      }

      // If the connector worked, the change is already visible live — no refresh needed!
      // If we had to fall back to the Python backend, we must refresh so the user sees it.
      if (connectorFailed && successCount > 0) {
        setEditorKey(prev => prev + 1);
      }

      if (successCount > 0) {
        toast({
          title: 'Signatures Applied',
          description: `Successfully inserted signature into ${successCount} document(s).`,
          variant: 'success',
        });
      } else {
        toast({
          title: 'Signature Placement Failed',
          description: 'Could not find the target signature spaces in the selected documents.',
          variant: 'destructive',
        });
      }

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Insertion Failed',
        description: error.message || 'An error occurred while inserting the signature.',
      });
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      <div className="flex items-center justify-between p-3 border-b flex-none">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleClose} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="text-sm">
            <div className="font-semibold flex items-center gap-2">
              {syllabus.courseCode} - {syllabus.courseTitle}
              {(syllabus.version ?? 1) > 1 && (
                <Badge className="font-semibold text-[10px] h-4 bg-destructive/90 text-white border-0">
                  ⚠ Returned — v{syllabus.version}
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground">
              {syllabus.facultyName} • {syllabus.department} • Version {syllabus.version ?? 1} •
              Submitted: {format(new Date((() => {
                if (!user) return syllabus.createdAt;
                switch (user.role) {
                  case 'dept_head': return syllabus.forwardedToDeptHeadAt || syllabus.createdAt;
                  case 'dean': return syllabus.forwardedToDeanAt || syllabus.createdAt;
                  case 'citl': return syllabus.forwardedToCITLAt || syllabus.createdAt;
                  case 'vpaa': return syllabus.forwardedToVPAAAt || syllabus.createdAt;
                  default: return syllabus.createdAt;
                }
              })()), 'MMM d, yyyy h:mm a')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="gap-2 h-8"
          >
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            History
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">{syllabus.version ?? 1}</Badge>
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Badge variant={docModified ? 'warning' : 'success'} className="text-xs">
            {docModified ? 'Unsaved changes' : 'Saved'}
          </Badge>
        </div>
      </div>
      {forwardedByMe && (
        <div className="px-3 py-2 border-b text-sm bg-primary/5 text-primary">
          You already forwarded this syllabus.
        </div>
      )}
      {/* Main Content */}
      <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden">
        <div className="flex-1 min-w-0 h-full relative">
          {showComparison ? (
            <div className="w-full h-full flex flex-col bg-muted/50">
              {/* Comparison Header */}
              <div className="flex items-center justify-between px-4 py-2 bg-card border-b shadow-sm z-10">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <GitBranch className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-foreground">Syllabus Comparison</h2>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        Comparing V{syllabus?.version || 1} vs V{Math.max(1, (syllabus?.version || 0) - 1)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-6 px-4 py-1.5 bg-muted/30 rounded-full border text-[11px] font-medium mr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                      <span>Left: Latest Submission</span>
                    </div>
                    <div className="w-px h-3 bg-border" />
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                      <span>Right: Previous Version (Read-Only)</span>
                    </div>
                  </div>

                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setShowComparison(false)}
                    className="gap-2 shadow-md bg-foreground text-background hover:bg-foreground/90"
                  >
                    <X className="h-4 w-4" />
                    Exit Comparison
                  </Button>
                </div>
              </div>

              {/* Comparison Split View */}
              <div className="flex-1 min-h-0">
                <PanelGroup direction="horizontal" className="w-full h-full p-2 gap-2">
                  <Panel defaultSize={50} minSize={30}>
                    <div className="w-full h-full rounded-lg border shadow-sm overflow-hidden bg-white relative">
                      <div className="absolute top-2 left-2 z-10">
                        <Badge variant="outline" className="bg-white/90 backdrop-blur border-blue-200 text-blue-700 shadow-sm">v{syllabus.version ?? 1} — Latest Submission</Badge>
                      </div>
                      <OnlyOfficeEditor
                        ref={syllabusEditorRef}
                        key={`main_${editorKey}`}
                        syllabusId={id || syllabus?.id}
                        mode="edit"
                        className="w-full h-full"
                      />
                    </div>
                  </Panel>

                  <PanelResizeHandle className="w-1.5 flex items-center justify-center group">
                    <div className="w-1 h-8 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
                  </PanelResizeHandle>

                  <Panel defaultSize={50} minSize={30}>
                    <div className="w-full h-full rounded-lg border shadow-sm overflow-hidden bg-white relative">
                      <div className="absolute top-2 left-2 z-10">
                        <Badge variant="outline" className="bg-white/90 backdrop-blur border-amber-200 text-amber-700 shadow-sm">v{Math.max(1, (syllabus.version || 1) - 1)} — With Reviewer Comments (Read-Only)</Badge>
                      </div>
                      <OnlyOfficeEditor
                        key={`compare_${id || syllabus?.id}_${(syllabus?.version || 0) - 1}`}
                        syllabusId={id || syllabus?.id}
                        mode="view"
                        version={(syllabus?.version || 0) - 1}
                        className="w-full h-full"
                      />
                    </div>
                  </Panel>
                </PanelGroup>
              </div>
            </div>
          ) : (
            <PanelGroup direction="horizontal" className="w-full h-full">
              <Panel defaultSize={75} minSize={40}>
                <div className="w-full h-full min-w-0 min-h-0 relative flex flex-col">
                  {/* Document Type Switcher Bar */}
                  <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-card flex-none z-10">
                    <span className="text-xs text-muted-foreground mr-2 font-medium">View:</span>
                    <button
                      onClick={() => setActiveLeftDocType('syllabus')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${activeLeftDocType === 'syllabus'
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent text-muted-foreground'
                        }`}
                    >
                      Syllabus
                    </button>
                    <button
                      onClick={() => { setActiveLeftDocType('form17'); setForm17HasBeenEdited(true); }}
                      disabled={!form17Url}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${activeLeftDocType === 'form17'
                          ? 'bg-blue-600 text-white'
                          : form17Url ? 'hover:bg-accent text-muted-foreground' : 'opacity-40 cursor-not-allowed text-muted-foreground'
                        }`}
                    >
                      Form 17
                    </button>
                    <button
                      onClick={() => setActiveLeftDocType('form18')}
                      disabled={!form18Url}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${activeLeftDocType === 'form18'
                          ? 'bg-green-600 text-white'
                          : form18Url ? 'hover:bg-accent text-muted-foreground' : 'opacity-40 cursor-not-allowed text-muted-foreground'
                        }`}
                    >
                      Form 18
                    </button>
                  </div>
                  {/* Document Viewer */}
                  <div className="flex-1 min-h-0">
                    {activeLeftDocType === 'syllabus' && (
                      <OnlyOfficeEditor
                        ref={syllabusEditorRef}
                        key={`main_${editorKey}`}
                        syllabusId={syllabus.id}
                        mode="edit"
                        className="w-full h-full"
                        onStateChange={setDocModified}
                      />
                    )}
                    {activeLeftDocType === 'form17' && form17Url && (
                      <OnlyOfficeEditor
                        ref={form17EditorRef}
                        key={`form17_view_${editorKey}`}
                        syllabusId={syllabus.id}
                        mode="edit"
                        docType="form17"
                        className="w-full h-full"
                        onStateChange={(mod) => { setDocModified(mod); setForm17Modified(mod); if (mod) setForm17HasBeenEdited(true); }}
                      />
                    )}
                    {activeLeftDocType === 'form18' && form18Url && (
                      <OnlyOfficeEditor
                        ref={form18EditorRef}
                        key={`form18_view_${editorKey}`}
                        syllabusId={syllabus.id}
                        mode="edit"
                        docType="form18"
                        className="w-full h-full"
                        onStateChange={setDocModified}
                      />
                    )}
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/40 transition-colors cursor-col-resize shadow-inner z-10" />

              <Panel defaultSize={25} minSize={20}>
                <div className="h-full border-l p-3 overflow-auto bg-card shadow-inner custom-scrollbar">
                  {!split ? (
                    <ReviewPanel
                      userRole={effectivePanelRole}
                      userId={user.id}
                      userName={`${user.firstName} ${user.lastName}`}
                      signature={signature}
                      onSignatureCreate={setSignature}
                      onSignatureClear={() => setSignature(null)}
                      onSubmit={forwardedByMe ? (() => { }) : handleReviewSubmit}
                      onInsertSignatures={(types, s, searchOverride) => handleInsertSignatures(types, s, searchOverride)}
                      form17Url={form17Url}
                      form17Modified={form17HasBeenEdited}
                      form18Url={form18Url}
                      form18Modified={form18HasBeenEdited}
                      onOpenForm={(form) => {
                        setActiveForm(form);
                        setSplit(true);
                        setShowComparison(false);
                      }}
                      aiAnalysis={syllabus?.aiAnalysis}
                      version={syllabus.version}
                      showComparison={showComparison}
                      onCompare={() => {
                        setShowComparison(!showComparison);
                        if (!showComparison) setShowHistory(false); // Hide history if comparison is active
                      }}
                      onRescan={syllabus?.aiAnalysis ? handleRescan : undefined}
                      assignedPeerReviewers={syllabus.assignedPeerReviewers}
                      isCollaborator={isCollaborator}
                      collaboratorApprovedCount={syllabus.reviewHistory?.filter((r: any) => r.action === 'forwarded' && r.reviewerRole === 'faculty' && syllabus.collaborators?.includes(r.reviewerId) && (r.version ?? 1) === (syllabus.version ?? 1)).length || 0}
                      collaboratorTotalCount={syllabus.collaborators?.length || 1}
                    />
                  ) : (
                    <div className="w-full h-full grid grid-rows-[auto,1fr]">
                      <div className="p-2 border-b flex items-center gap-2 mb-2 sticky top-0 bg-card z-10 justify-between">
                        <div className="flex items-center gap-2">
                          <Columns className="h-4 w-4 text-muted-foreground" />
                          <div className="text-sm font-medium">Supporting Forms</div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => {
                            setSplit(false);
                            setShowComparison(false);
                          }}
                          aria-label="Exit Forms"
                        >
                          <X className="h-4 w-4" />
                          Exit
                        </Button>
                      </div>

                      <div className="min-h-0 overflow-auto">
                        <Tabs value={activeForm} onValueChange={(v) => { setActiveForm(v as 'form17' | 'form18'); }} className="h-full flex flex-col">
                          <TabsList className="w-full h-9 mb-4">
                            <TabsTrigger value="form17" className="flex-1 text-xs gap-1.5"><FileSpreadsheet className="h-3.5 w-3.5" />Form 17</TabsTrigger>
                            <TabsTrigger value="form18" className="flex-1 text-xs gap-1.5"><FileBarChart className="h-3.5 w-3.5" />Form 18</TabsTrigger>
                          </TabsList>
                          <TabsContent value="form17" className="flex-1 min-h-0 p-0 m-0">
                            <FormChecklist
                              formType="form17"
                              syllabus={syllabus}
                              userRole={effectivePanelRole}
                              userName={`${user.firstName} ${user.lastName}`}
                              onGenerate={handleFillForm}
                              isGenerating={isGeneratingForm}
                            />
                          </TabsContent>
                          <TabsContent value="form18" className="flex-1 min-h-0 p-0 m-0">
                            <FormChecklist
                              formType="form18"
                              syllabus={syllabus}
                              userRole={effectivePanelRole}
                              userName={`${user.firstName} ${user.lastName}`}
                              onGenerate={handleFillForm}
                              isGenerating={isGeneratingForm}
                            />
                          </TabsContent>
                        </Tabs>
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
            </PanelGroup>
          )}
        </div>

        {/* Side History Panel */}
        {showHistory && (
          <div className="w-[350px] border-l border-border bg-muted/30 overflow-y-auto p-4 animate-in slide-in-from-right duration-300 shadow-xl z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Version History
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-6">
              {Array.from({ length: syllabus.version ?? 1 }, (_, i) => i + 1).reverse().map((version) => {
                const isCurrentVersion = version === (syllabus.version ?? 1);
                const versionHistory = syllabus.reviewHistory?.filter(r => (r.version ?? 1) === version) || [];

                return (
                  <Card key={version} className={`shadow-sm border-l-4 ${isCurrentVersion ? 'border-l-primary' : 'border-l-muted'}`}>
                    <CardHeader className="p-3 pb-0">
                      <div className="flex items-center justify-between">
                        <Badge variant={isCurrentVersion ? "default" : "secondary"}>
                          Version {version}
                        </Badge>
                        {isCurrentVersion && <Badge variant="outline" className="text-[10px] h-4">Current</Badge>}
                      </div>
                    </CardHeader>
                    <CardContent className="p-3">
                      <div className="relative pl-6 border-l border-border space-y-4">
                        <div className="relative">
                          <div className="absolute -left-[31px] top-1 h-2 w-2 rounded-full bg-primary" />
                          <p className="text-sm font-medium">Submitted</p>
                          <p className="text-xs text-muted-foreground">
                            {version === 1
                              ? format(new Date(syllabus.createdAt), 'MMM d, yyyy h:mm a')
                              : versionHistory.find(r => r.reviewerRole === 'faculty')?.timestamp
                                ? format(new Date(versionHistory.find(r => r.reviewerRole === 'faculty')!.timestamp), 'MMM d, yyyy h:mm a')
                                : 'N/A'
                            }
                          </p>
                        </div>

                        {versionHistory
                          .filter(r => {
                            // Hide the faculty owner's initial submission entry — it's shown as the "Submitted" dot above.
                            // But keep collaborator forwards and senior faculty (peer reviewer) forwards.
                            if (r.reviewerRole !== 'faculty') return true;
                            // For faculty role: show if they are a collaborator or peer reviewer
                            const isCollaborator = Array.isArray(syllabus.collaborators) && syllabus.collaborators.some((c: any) => String(c) === String(r.reviewerId));
                            const isPeerReviewer = Array.isArray(syllabus.assignedPeerReviewers) && syllabus.assignedPeerReviewers.some((apr: any) => String(apr.reviewerId) === String(r.reviewerId));
                            const isSeniorFaculty = String(r.reviewerId) === String(syllabus.claimedBySeniorFacultyId);
                            // Hide the owner's own submission entry (action === 'submitted') — already shown
                            if (r.action === 'submitted') return false;
                            return isCollaborator || isPeerReviewer || isSeniorFaculty;
                          })
                          .map((review, idx) => {
                            // Determine a friendly label for faculty-role reviewers
                            const isCollaborator = review.reviewerRole === 'faculty' && Array.isArray(syllabus.collaborators) && syllabus.collaborators.some((c: any) => String(c) === String(review.reviewerId));
                            const isPeerReviewer = review.reviewerRole === 'faculty' && (
                              (Array.isArray(syllabus.assignedPeerReviewers) && syllabus.assignedPeerReviewers.some((apr: any) => String(apr.reviewerId) === String(review.reviewerId))) ||
                              String(review.reviewerId) === String(syllabus.claimedBySeniorFacultyId)
                            );
                            let roleLabel = ROLE_LABELS[review.reviewerRole] || review.reviewerRole;
                            if (isCollaborator) roleLabel = 'Collaborator';
                            else if (isPeerReviewer) roleLabel = 'Senior Faculty';

                            return (
                              <div key={idx} className="relative">
                                <div className={`absolute -left-[31px] top-1 h-2 w-2 rounded-full ${review.action === 'approved' || review.action === 'forwarded' ? 'bg-success' : 'bg-destructive'
                                  }`} />
                                <p className="text-sm font-medium">
                                  {review.action === 'forwarded' ? 'Forwarded' : review.action.charAt(0).toUpperCase() + review.action.slice(1)} by {roleLabel}
                                  {review.reviewerName && <span className="text-xs font-normal text-muted-foreground ml-1">({review.reviewerName})</span>}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(review.timestamp), 'MMM d, yyyy h:mm a')}
                                </p>
                                {review.comment && (
                                  <p className="text-xs mt-1 p-2 bg-background rounded border text-muted-foreground italic">
                                    "{review.comment}"
                                  </p>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
