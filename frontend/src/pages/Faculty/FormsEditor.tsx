import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Columns, FileSpreadsheet, FileBarChart, X, Loader2, BadgeCheck, GitBranch, Check, Search, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ROLE_LABELS } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OnlyOfficeEditor, OnlyOfficeEditorHandle } from '@/components/DocxViewer/OnlyOfficeEditor';
import { ReviewPanel } from '@/components/PDFReviewer';
import type { ReviewAction } from '@/components/PDFReviewer';
import { useToast } from '@/hooks/use-toast';
import { VersionLabel } from '@/components/VersionLabel';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function FormsEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { syllabi, submitSyllabus, getSyllabusById, allSyllabi, allUsers, updateCollaborators, saveAiAnalysis } = useData();
  const { toast } = useToast();
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
  // Custom alert state
  const [showAlert, setShowAlert] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertDesc, setAlertDesc] = useState('');
  const [showConfirmRescan, setShowConfirmRescan] = useState(false);
  const [showConfirmLeaveForm18, setShowConfirmLeaveForm18] = useState(false);

  const [syllabus, setSyllabus] = useState<any>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [split, setSplit] = useState(false);
  const [activeForm, setActiveForm] = useState<'form17' | 'form18'>('form17');
  const [docModified, setDocModified] = useState(false);
  const [signature, setSignature] = useState<any | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [showComparison, setShowComparison] = useState(searchParams.get('compare') === '1');
  const [showHistory, setShowHistory] = useState(false);

  const syllabusEditorRef = useRef<OnlyOfficeEditorHandle>(null);
  const form17EditorRef = useRef<OnlyOfficeEditorHandle>(null);
  const form18EditorRef = useRef<OnlyOfficeEditorHandle>(null);
  const rescanPromiseRef = useRef<{ resolve: () => void, reject: () => void } | null>(null);
  const isStartingScanRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const confirmRescan = () => {
    isStartingScanRef.current = false;
    return new Promise<void>((resolve, reject) => {
      rescanPromiseRef.current = { resolve, reject };
      setShowConfirmRescan(true);
    });
  };

  /** Re‑run AI scan on the syllabus file and save updated results */
  const handleRescan = useCallback(async () => {
    isStartingScanRef.current = true;
    setShowConfirmRescan(false);
    if (!syllabus?.id) {
      setAlertTitle('Re‑scan failed');
      setAlertDesc('Syllabus not loaded.');
      setShowAlert(true);
      isStartingScanRef.current = false;
      rescanPromiseRef.current?.resolve();
      rescanPromiseRef.current = null;
      return;
    }
    // Resolve the syllabus file URL (may be relative or have wrong host)
    let fileUrl = syllabus.fileUrl || syllabus.file_url;
    if (!fileUrl) {
      setAlertTitle('Re‑scan failed');
      setAlertDesc('No syllabus file URL found.');
      setShowAlert(true);
      isStartingScanRef.current = false;
      rescanPromiseRef.current?.resolve();
      rescanPromiseRef.current = null;
      return;
    }

    // Normalize the URL: the backend may return localhost or host.docker.internal
    // but the frontend may be connecting via a LAN IP. Rebuild using API_BASE's origin.
    try {
      const isAbsoluteWindowsPath = /^[A-Za-z]:[/\\]/.test(fileUrl) || fileUrl.startsWith('\\\\');
      if (isAbsoluteWindowsPath) {
        // It's a raw Windows file path — extract just the filename and build the URL
        const filename = fileUrl.replace(/\\/g, '/').split('/').pop() || '';
        fileUrl = `${API_BASE}/uploads/syllabi/${encodeURIComponent(filename)}`;
      } else {
        // Replace docker/localhost host with actual API_BASE host
        const apiOrigin = new URL(API_BASE).origin;
        const parsed = new URL(fileUrl.replace('host.docker.internal', new URL(API_BASE).hostname));
        // Force the origin to match API_BASE (handles localhost vs LAN IP mismatch)
        fileUrl = `${apiOrigin}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      // If URL parsing fails, try prepending API_BASE if it starts with /
      if (fileUrl.startsWith('/')) {
        fileUrl = `${API_BASE}${fileUrl}`;
      }
    }

    try {
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) throw new Error(`Could not fetch syllabus file (${fileRes.status})`);
      const blob = await fileRes.blob();
      const fileName = syllabus.fileName || syllabus.file_name || 'syllabus.docx';
      const file = new File([blob], fileName, { type: blob.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

      // Run AI scan (non‑streaming)
      abortControllerRef.current = new AbortController();
      const fd = new FormData();
      fd.append('file', file);
      const scanRes = await fetch(`${API_BASE}/ai/scan`, { 
        method: 'POST', 
        body: fd,
        signal: abortControllerRef.current.signal 
      });
      if (!scanRes.ok) {
        let errorMsg = `AI scan request failed (${scanRes.status})`;
        try {
          const errData = await scanRes.json();
          if (errData && errData.error) {
            errorMsg = errData.error;
          }
        } catch (e) {}
        throw new Error(errorMsg);
      }
      const data = await scanRes.json();
      const result = data.result || {};

      const newAiAnalysis = {
        score: result.overallScore ?? 0,
        status: result.status ?? 'needs_improvement',
        suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
        missingSections: Array.isArray(result.missingSections) ? result.missingSections : [],
        coAlignment: Array.isArray(result.coAlignment) ? result.coAlignment : [],
        bloomData: Array.isArray(result.bloomData) ? result.bloomData : [],
        gadData: Array.isArray(result.gadData) ? result.gadData : [],
      };

      await saveAiAnalysis(syllabus.id, newAiAnalysis);
      setSyllabus((prev: any) => prev ? { ...prev, aiAnalysis: newAiAnalysis } : prev);
      setAlertTitle('AI Re‑scan Complete');
      setAlertDesc(`New score: ${newAiAnalysis.score}% compliance`);
      setShowAlert(true);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setAlertTitle('Re‑scan Cancelled');
        setAlertDesc('The re-scan process was cancelled by the user.');
        setShowAlert(true);
      } else {
        console.error('[handleRescan]', err);
        setAlertTitle('Re‑scan Failed');
        setAlertDesc(err?.message || 'Unknown error');
        setShowAlert(true);
      }
    } finally {
      isStartingScanRef.current = false;
      rescanPromiseRef.current?.resolve();
      rescanPromiseRef.current = null;
      abortControllerRef.current = null;
    }
  }, [syllabus, API_BASE, saveAiAnalysis]);

  const cancelRescan = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  function getEditorRef(dt: 'syllabus' | 'form17' | 'form18') {
    if (dt === 'form17') return form17EditorRef;
    if (dt === 'form18') return form18EditorRef;
    return syllabusEditorRef;
  }

  // States for Senior Faculty and Collaborators
  const [isSeniorFacultyOpen, setIsSeniorFacultyOpen] = useState(false);
  const [selectedSeniorFacultyIds, setSelectedSeniorFacultyIds] = useState<string[]>([]);
  
  const [isCollaboratorOpen, setIsCollaboratorOpen] = useState(false);
  const [selectedCollaboratorIds, setSelectedCollaboratorIds] = useState<string[]>([]);

  const departmentFaculty = useMemo(() => {
    if (!user) return [];
    return allUsers.filter(u => 
      u.role === 'faculty' && 
      u.department === user.department && 
      u.id !== user.id
    );
  }, [allUsers, user]);

  const [reviewerSearch, setReviewerSearch] = useState('');

  React.useEffect(() => {
    if (!isSeniorFacultyOpen && !isCollaboratorOpen) {
      setReviewerSearch('');
    }
  }, [isSeniorFacultyOpen, isCollaboratorOpen]);

  const filteredFaculty = useMemo(() => {
    const query = reviewerSearch.trim().toLowerCase();
    if (!query) return departmentFaculty;
    return departmentFaculty.filter(f => 
      `${f.firstName} ${f.lastName}`.toLowerCase().includes(query) ||
      (f.email && f.email.toLowerCase().includes(query))
    );
  }, [departmentFaculty, reviewerSearch]);

  React.useEffect(() => {
    const fetchSyllabus = async () => {
      if (!id) return;
      let found = syllabi.find(s => s.id === id) || allSyllabi.find(s => s.id === id);
      if (!found) found = await getSyllabusById(id);
      setSyllabus(found);
      if (found && found.collaborators) {
        setSelectedCollaboratorIds(found.collaborators);
      }
      setIsFetching(false);
    };
    fetchSyllabus();
  }, [id, syllabi, allSyllabi, getSyllabusById]);

  const handleSaveCollaborators = async () => {
    if (!id) return;
    try {
      const success = await updateCollaborators(id, selectedCollaboratorIds);
      if (success) {
        setAlertTitle('Collaborators Updated');
        setAlertDesc('Co‑owners have been saved.');
        setShowAlert(true);
        setIsCollaboratorOpen(false);
      } else {
        setAlertTitle('Error');
        setAlertDesc('Failed to update collaborators');
        setShowAlert(true);
      }
    } catch (err) {
      setAlertTitle('Error');
      setAlertDesc('Failed to update collaborators');
      setShowAlert(true);
    }
  };

  const handleClose = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/faculty/track', { replace: true });
    }
  };

  // New handler to confirm leaving Form 18 unedited
  const handleLeave = () => {
    if (activeForm === 'form18' && !docModified) {
      setShowConfirmLeaveForm18(true);
    } else {
      handleClose();
    }
  };

  const handleSubmitBundle = useCallback(async (assignedReviewers?: { reviewerId: string; reviewerName: string }[]) => {
    if (!id) return;
    setIsSubmitting(true);
    try {
      // 1. Ensure bundle IDs are set (proactive sync)
      await fetch(`${API_BASE}/syllabi/${encodeURIComponent(id)}/bundle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // 2. Submit for review
      await submitSyllabus(id, assignedReviewers);
      
      setAlertTitle('Syllabus Submitted');
      setAlertDesc(assignedReviewers && assignedReviewers.length > 0
        ? `Your syllabus has been submitted and assigned to ${assignedReviewers.length} peer reviewer(s).`
        : 'Your syllabus has been forwarded for peer review.');
      setShowAlert(true);
      navigate('/faculty/track');
    } catch (err) {
      console.error("Submission error:", err);
      setAlertTitle('Submit failed');
      setAlertDesc('There was an error submitting your syllabus. Please try again.');
      setShowAlert(true);
    } finally {
      setIsSubmitting(false);
    }
  }, [id, API_BASE, submitSyllabus, navigate]);

  const handleReviewSubmit = useCallback(async (action: ReviewAction) => {
    // For FormsEditor, the user is always the lead faculty submitting their syllabus.
    if (action.type === 'forward') {
      if (selectedSeniorFacultyIds.length === 0) {
        setAlertTitle('Missing Reviewer');
        setAlertDesc('You must select at least one senior faculty to review this syllabus before submitting.');
        setShowAlert(true);
        setIsSeniorFacultyOpen(true);
        return;
      }
      const assignedReviewers = departmentFaculty
        .filter(f => selectedSeniorFacultyIds.includes(f.id))
        .map(f => ({ reviewerId: f.id, reviewerName: `${f.firstName} ${f.lastName}` }));
      
      await handleSubmitBundle(assignedReviewers);
      return;
    }

    if (action.type === 'return') {
      await handleSubmitBundle();
      return;
    }
  }, [
    selectedSeniorFacultyIds,
    departmentFaculty,
    handleSubmitBundle,
    setAlertTitle,
    setAlertDesc,
    setShowAlert,
    setIsSeniorFacultyOpen
  ]);

  const handleInsertSignatures = async (docTypes: ('syllabus' | 'form17' | 'form18')[], sig: { imageData: string }) => {
    try {
      toast({
        title: 'Inserting Signatures',
        description: 'Please wait while we insert your signature...'
      });

      if (!sig || !sig.imageData) throw new Error('No signature image data.');

      const saveRes = await fetch(`${API_BASE}/signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: sig.imageData }),
      });
      if (!saveRes.ok) throw new Error('Failed to save signature');
      const { url: savedUrl } = await saveRes.json();
      
      let successCount = 0;
      let connectorFailed = false;

      for (const docType of docTypes) {
        let searchText = "";
        let align = "left";

        if (docType === 'form18') {
          searchText = "Lead Faculty/Course Instructor";
        } else {
          searchText = "Lead Faculty";
        }

        const editorRef = getEditorRef(docType);
        const inTable = docType === 'syllabus';
        let liveInserted = false;

        if (editorRef.current) {
          try {
            liveInserted = await editorRef.current.insertSignatureViaConnector(savedUrl, searchText, inTable);
          } catch {
            liveInserted = false;
          }
        }

        if (liveInserted) {
          successCount++;
        } else {
          connectorFailed = true;
          try {
            const applyRes = await fetch(`${API_BASE}/docs/${id}/apply-signature`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                signatureUrl: savedUrl, 
                searchText,
                docType: docType,
                align: align
              }),
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

      if (connectorFailed && successCount > 0) {
        setEditorKey(prev => prev + 1);
      }

      if (successCount > 0) {
        toast({
          title: 'Signatures Applied',
          description: `Successfully inserted signature into ${successCount} document(s).`
        });
      } else {
        toast({
          title: 'Signature Placement Failed',
          description: 'Could not find the target signature spaces in the selected documents.',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      toast({
        title: 'Insertion Failed',
        description: error.message || 'There was an error inserting your signature.',
        variant: 'destructive'
      });
    }
  };

  if (isFetching || !id) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Loading forms editor...</p>
      </div>
    );
  }

  if (!syllabus) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={handleClose} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="mt-12 text-center">
          <h3 className="text-xl font-semibold">Syllabus Not Found</h3>
          <p className="text-muted-foreground mt-2">Could not retrieve the syllabus details.</p>
        </div>
      </div>
    );
  }

  const isOwner = syllabus.facultyId === user?.id;
  const isCollaborator = Array.isArray(syllabus.collaborators) && syllabus.collaborators.includes(user?.id ?? '');
  const canEdit = isOwner || (isCollaborator && syllabus.status === 'draft');

  if (!canEdit) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={handleClose} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="mt-12 text-center">
          <h3 className="text-xl font-semibold">Access Restricted</h3>
          <p className="text-muted-foreground mt-2">
            Collaborators can only edit a syllabus once it has been returned and a new version is created by the owner.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b flex-none">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="text-sm">
            <div className="font-semibold flex items-center gap-2 flex-wrap">
              <span>{syllabus.courseCode} - {syllabus.courseTitle}</span>
              <Badge variant="secondary" className="font-normal text-[10px] h-4">
                {isOwner ? 'Lead Faculty Editor' : 'Collaborator Editor'}
              </Badge>
              <VersionLabel version={syllabus.version} size="sm" />
              {syllabus.status === 'RETURNED' && (
                <Badge className="font-semibold text-[10px] h-4 bg-destructive/90 text-white border-0">
                  ⚠ Returned for Revision
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground text-[11px] mt-0.5">
              {syllabus.facultyName} • Program: {syllabus.department}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(syllabus.version ?? 1) > 1 && (
            <Button 
              variant={showComparison ? "secondary" : "outline"} 
              size="sm" 
              onClick={() => setShowComparison(!showComparison)}
              className={`gap-2 h-8 ${showComparison ? "bg-primary/10 text-primary border-primary/50" : ""}`}
            >
              <GitBranch className="h-4 w-4" />
              {showComparison ? "Exit Comparison" : "Compare Versions"}
            </Button>
          )}
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
          <Badge variant={docModified ? 'warning' : 'success'} className="text-[10px] h-5 ml-2">
            {docModified ? 'Unsaved changes' : 'Saved'}
          </Badge>
        </div>
      </div>

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
                        Comparing Version {syllabus?.version || 1} vs Version {Math.max(1, (syllabus?.version || 0) - 1)}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-6 px-4 py-1.5 bg-muted/30 rounded-full border text-[11px] font-medium mr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                      <span>Left: Current Draft (Editable)</span>
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
                        <Badge variant="outline" className="bg-white/90 backdrop-blur border-blue-200 text-blue-700 shadow-sm">Current Version — Version {syllabus.version ?? 1} (Editable)</Badge>
                      </div>
                      <OnlyOfficeEditor 
                        key={`main_${editorKey}`}
                        ref={syllabusEditorRef}
                        syllabusId={id} 
                        mode="edit" 
                        className="w-full h-full" 
                        onStateChange={setDocModified}
                      />
                    </div>
                  </Panel>
                  
                  <PanelResizeHandle className="w-1.5 flex items-center justify-center group">
                    <div className="w-1 h-8 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
                  </PanelResizeHandle>
                  
                  <Panel defaultSize={50} minSize={30}>
                    <div className="w-full h-full rounded-lg border shadow-sm overflow-hidden bg-white relative">
                      <div className="absolute top-2 left-2 z-10">
                        <Badge variant="outline" className="bg-white/90 backdrop-blur border-amber-200 text-amber-700 shadow-sm">Version {Math.max(1, (syllabus.version || 1) - 1)} — With Reviewer Comments (Read-Only)</Badge>
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
                <div className="w-full h-full min-w-0 min-h-0 relative">
                  <OnlyOfficeEditor 
                    key={`main_${editorKey}`}
                    ref={syllabusEditorRef}
                    syllabusId={id} 
                    mode="edit" 
                    className="w-full h-full" 
                    onStateChange={setDocModified}
                  />
                </div>
              </Panel>
              
              <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/40 transition-colors cursor-col-resize" />
              
              <Panel defaultSize={25} minSize={20}>
                <div className="h-full border-l p-3 overflow-auto bg-card">
                  {!split ? (
                    <ReviewPanel
                      userRole="faculty"
                      userId={user?.id || ''}
                      userName={`${user?.firstName} ${user?.lastName}`}
                      signature={signature}
                      onSignatureCreate={setSignature}
                      onSignatureClear={() => setSignature(null)}
                      onSubmit={handleReviewSubmit}
                      isSubmitting={isSubmitting}
                      onInsertSignatures={handleInsertSignatures}
                      form17Url={syllabus.form17Link}
                      form18Url={syllabus.form18Link}
                      onOpenForm={(form) => {
                        setActiveForm(form);
                        setSplit(true);
                        setShowComparison(false); // Can't compare and see forms simultaneously in the sidebar
                      }}
                      aiAnalysis={syllabus?.aiAnalysis}
                      version={syllabus.version}
                      showComparison={showComparison}
                      onCompare={() => setShowComparison(!showComparison)}
                      onAddCollaborators={() => setIsCollaboratorOpen(true)}
                      onSelectSeniorFaculty={() => setIsSeniorFacultyOpen(true)}
                      selectedCollaboratorsCount={selectedCollaboratorIds.length}
                      selectedSeniorFacultyCount={selectedSeniorFacultyIds.length}
                      onRescan={syllabus?.aiAnalysis ? confirmRescan : undefined}
                    />
                  ) : (
                    <div className="w-full h-full grid grid-rows-[auto,1fr]">
                      <div className="p-2 border-b flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Columns className="h-4 w-4 text-muted-foreground" />
                          <div className="text-sm font-medium">Supporting Forms</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => {
                            setSplit(false);
                            setShowComparison(false);
                          }}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Exit
                        </Button>
                      </div>
                      <div className="min-h-0 overflow-hidden mt-2">
                        <Tabs value={activeForm} onValueChange={(v) => setActiveForm(v as 'form17' | 'form18')} className="h-full flex flex-col">
                          <TabsList className="w-full h-8 mb-2">
                            <TabsTrigger value="form17" className="flex-1 text-xs gap-1"><FileSpreadsheet className="h-3 w-3" />Form 17</TabsTrigger>
                            <TabsTrigger value="form18" className="flex-1 text-xs gap-1"><FileBarChart className="h-3 w-3" />Form 18</TabsTrigger>
                          </TabsList>
                          <TabsContent value="form17" className="flex-1 min-h-0 p-0 m-0">
                            <OnlyOfficeEditor 
                              key={`form17_${editorKey}`}
                              ref={form17EditorRef}
                              syllabusId={id} 
                              mode="edit" 
                              docType="form17" 
                              className="w-full h-full border rounded-md"
                            />
                          </TabsContent>
                          <TabsContent value="form18" className="flex-1 min-h-0 p-0 m-0">
                            <OnlyOfficeEditor 
                              key={`form18_${editorKey}`}
                              ref={form18EditorRef}
                              syllabusId={id} 
                              mode="edit" 
                              docType="form18" 
                              className="w-full h-full border rounded-md"
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
          <div className="w-[320px] border-l border-border bg-muted/30 overflow-y-auto p-4 animate-in slide-in-from-right duration-300 shadow-xl z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Version History
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-6">
              {Array.from({ length: syllabus.version ?? 1 }, (_, i) => i + 1).reverse().map((version) => {
                const isCurrentVersion = version === (syllabus.version ?? 1);
                const versionHistory = (syllabus.reviewHistory || []).filter((r: any) => (r.version ?? 1) === version);

                const getRoleLabel = (review: any) => {
                  const isCollaborator = Array.isArray(syllabus.collaborators) && syllabus.collaborators.some((c: any) => String(c) === String(review.reviewerId));
                  const isPeerReviewer = Array.isArray(syllabus.assignedPeerReviewers) && syllabus.assignedPeerReviewers.some((apr: any) => String(apr.reviewerId) === String(review.reviewerId));
                  const isSeniorFac = String(review.reviewerId) === String(syllabus.claimedBySeniorFacultyId);
                  if (isCollaborator) return 'Collaborator';
                  if (isPeerReviewer || isSeniorFac) return 'Senior Faculty';
                  return ROLE_LABELS[review.reviewerRole as keyof typeof ROLE_LABELS] || review.reviewerRole;
                };

                return (
                  <Card key={version} className={`shadow-sm border-l-4 ${isCurrentVersion ? 'border-l-primary' : 'border-l-muted'}`}>
                    <CardHeader className="p-3 pb-0">
                      <div className="flex items-center justify-between">
                        <Badge variant={isCurrentVersion ? 'default' : 'secondary'}>Version {version}</Badge>
                        {isCurrentVersion && <Badge variant="outline" className="text-[10px] h-4">Current</Badge>}
                      </div>
                    </CardHeader>
                    <CardContent className="p-3">
                      <div className="relative pl-6 border-l border-border space-y-4">
                        {/* Submitted */}
                        <div className="relative">
                          <div className="absolute -left-[31px] top-1 h-2 w-2 rounded-full bg-primary" />
                          <p className="text-sm font-medium">Submitted</p>
                          <p className="text-xs text-muted-foreground">
                            {version === 1
                              ? format(new Date(syllabus.createdAt), 'MMM d, yyyy h:mm a')
                              : (() => {
                                  const firstEntry = versionHistory.find((r: any) => r.reviewerRole === 'faculty' && r.reviewerId === syllabus.facultyId);
                                  return firstEntry?.timestamp ? format(new Date(firstEntry.timestamp), 'MMM d, yyyy h:mm a') : 'N/A';
                                })()
                            }
                          </p>
                        </div>

                        {/* Review events */}
                        {versionHistory
                          .filter((r: any) => {
                            if (r.action === 'submitted') return false;
                            if (r.reviewerRole !== 'faculty') return true;
                            const isCollaborator = Array.isArray(syllabus.collaborators) && syllabus.collaborators.some((c: any) => String(c) === String(r.reviewerId));
                            const isPeerReviewer = Array.isArray(syllabus.assignedPeerReviewers) && syllabus.assignedPeerReviewers.some((apr: any) => String(apr.reviewerId) === String(r.reviewerId));
                            const isSeniorFac = String(r.reviewerId) === String(syllabus.claimedBySeniorFacultyId);
                            if (r.reviewerId === syllabus.facultyId && r.action !== 'forwarded' && r.action !== 'returned') return false;
                            return isCollaborator || isPeerReviewer || isSeniorFac || r.reviewerId !== syllabus.facultyId;
                          })
                          .map((review: any, idx: number) => (
                            <div key={idx} className="relative">
                              <div className={`absolute -left-[31px] top-1 h-2 w-2 rounded-full ${review.action === 'approved' || review.action === 'forwarded' ? 'bg-success' : 'bg-destructive'}`} />
                              <p className="text-sm font-medium">
                                {review.action === 'forwarded' ? 'Forwarded' : review.action.charAt(0).toUpperCase() + review.action.slice(1)} by {getRoleLabel(review)}
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
                          ))
                        }
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Select Senior Faculty Dialog */}
      <Dialog open={isSeniorFacultyOpen} onOpenChange={setIsSeniorFacultyOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Select Senior Faculty</DialogTitle>
            <DialogDescription>
              Select one senior faculty member to review this syllabus.
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
                    const isSelected = selectedSeniorFacultyIds.includes(f.id);
                    return (
                      <div 
                        key={f.id}
                        onClick={() => {
                          setSelectedSeniorFacultyIds(prev => 
                            prev.includes(f.id) ? [] : [f.id]
                          );
                        }}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                          isSelected 
                            ? 'border-primary bg-primary/5 text-foreground font-medium' 
                            : 'border-border bg-card hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex flex-col text-left">
                          <span className="text-sm text-foreground font-semibold">{f.firstName} {f.lastName}</span>
                          <span className="text-xs text-muted-foreground">{f.email}</span>
                        </div>
                        <div className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all ${
                          isSelected ? 'bg-primary border-primary text-white' : 'border-muted-foreground/30 bg-transparent'
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
          <DialogFooter className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setIsSeniorFacultyOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setIsSeniorFacultyOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Leave Form 18 Dialog */}
      <Dialog open={showConfirmLeaveForm18} onOpenChange={setShowConfirmLeaveForm18}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Leave Form 18 Unedited?</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave Form 18 unedited?
              Make sure you have extracted your comment for Form 18 before proceeding.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setShowConfirmLeaveForm18(false)}>
              Cancel
            </Button>
            <Button onClick={() => { setShowConfirmLeaveForm18(false); handleClose(); }}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Collaborators Dialog */}
      <Dialog open={isCollaboratorOpen} onOpenChange={setIsCollaboratorOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Add Collaborators</DialogTitle>
            <DialogDescription>
              Select faculty members from your department to collaborate and edit this syllabus.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2.5">
              <Label className="text-sm font-semibold text-foreground">Available Faculty</Label>
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
                    const isSelected = selectedCollaboratorIds.includes(f.id);
                    return (
                      <div 
                        key={f.id}
                        onClick={() => {
                          setSelectedCollaboratorIds(prev =>
                            prev.includes(f.id)
                              ? prev.filter(id => id !== f.id)
                              : [...prev, f.id]
                          );
                        }}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                          isSelected 
                            ? 'border-primary bg-primary/5 text-foreground font-medium' 
                            : 'border-border bg-card hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex flex-col text-left">
                          <span className="text-sm text-foreground font-semibold">{f.firstName} {f.lastName}</span>
                          <span className="text-xs text-muted-foreground">{f.email}</span>
                        </div>
                        <div className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all ${
                          isSelected ? 'bg-primary border-primary text-white' : 'border-muted-foreground/30 bg-transparent'
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
          <DialogFooter className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setIsCollaboratorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCollaborators}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={showAlert} onOpenChange={setShowAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{alertTitle}</AlertDialogTitle>
            <AlertDialogDescription>{alertDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Rescan Dialog */}
      <AlertDialog 
        open={showConfirmRescan} 
        onOpenChange={(open) => {
          if (!open && !isStartingScanRef.current) {
            rescanPromiseRef.current?.resolve();
            rescanPromiseRef.current = null;
          }
          setShowConfirmRescan(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-scan the syllabus?</AlertDialogTitle>
            <AlertDialogDescription>
              This will run the AI analysis again and may update the compliance score.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRescan}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
