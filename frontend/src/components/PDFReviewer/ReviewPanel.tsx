import React, { useState, useEffect } from 'react';
import {
  Send,
  ArrowRightCircle,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileSignature,
  MessageSquare,
  FileSpreadsheet,
  FileBarChart,
  ChevronRight,
  Sparkles,
  Table,
  GitBranch,
  ListChecks,
  Loader2,
  Users,
  RefreshCw,
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { SignatureCanvas } from './SignatureCanvas';
import { Signature, REVIEWER_ACTIONS, ReviewAction } from './types';
import { UserRole, ROLE_LABELS } from '@/types';
import { cn } from '@/lib/utils';

interface ReviewPanelProps {
  userRole: UserRole;
  userId: string;
  userName: string;
  signature: Signature | null;
  onSignatureCreate: (signature: Signature) => void;
  onSignatureClear: () => void;
  onSubmit: (action: ReviewAction, comment: string) => void;
  isSubmitting?: boolean;
  className?: string;
  form17Url?: string;
  form17Modified?: boolean;
  form18Url?: string;
  form18Modified?: boolean;
  onOpenForm?: (form: 'form17' | 'form18') => void;
  onInsertSignatures?: (docTypes: ('syllabus' | 'form17' | 'form18')[], signature: Signature, form18SearchOverride?: string) => void;
  aiAnalysis?: any;
  version?: number;
  showComparison?: boolean;
  onCompare?: () => void;
  assignedPeerReviewers?: any[];
  onAddCollaborators?: () => void;
  onSelectSeniorFaculty?: () => void;
  selectedCollaboratorsCount?: number;
  selectedSeniorFacultyCount?: number;
  isCollaborator?: boolean;
  collaboratorApprovedCount?: number;
  collaboratorTotalCount?: number;
  onRescan?: () => Promise<void>;
  onCancelRescan?: () => void;
}

const MAX_COMMENT_LENGTH = 500;
const MIN_RETURN_REASON_LENGTH = 20;

const getBloomLevelColor = (level: string) => {
  switch (level?.toLowerCase()) {
    case 'creating': return 'bg-red-500 text-white border-red-600 hover:bg-red-500';
    case 'evaluating': return 'bg-orange-500 text-white border-orange-600 hover:bg-orange-500';
    case 'analyzing': return 'bg-yellow-400 text-yellow-950 border-yellow-500 hover:bg-yellow-400';
    case 'applying': return 'bg-green-500 text-white border-green-600 hover:bg-green-500';
    case 'understanding': return 'bg-blue-500 text-white border-blue-600 hover:bg-blue-500';
    case 'remembering': return 'bg-purple-500 text-white border-purple-600 hover:bg-purple-500';
    default: return 'bg-muted text-muted-foreground border-border hover:bg-muted';
  }
};

const bloomLevelMap: Record<string, number> = {
  Remembering: 1,
  Understanding: 2,
  Applying: 3,
  Analyzing: 4,
  Evaluating: 5,
  Creating: 6,
  remembering: 1,
  understanding: 2,
  applying: 3,
  analyzing: 4,
  evaluating: 5,
  creating: 6,
};

export function ReviewPanel({
  userRole,
  userId,
  userName,
  signature,
  onSignatureCreate,
  onSignatureClear,
  onSubmit,
  isSubmitting = false,
  className,
  form17Url,
  form17Modified = false,
  form18Url,
  form18Modified = false,
  onOpenForm,
  onInsertSignatures,
  aiAnalysis,
  version = 1,
  showComparison = false,
  onCompare,
  assignedPeerReviewers = [],
  onAddCollaborators,
  onSelectSeniorFaculty,
  selectedCollaboratorsCount = 0,
  selectedSeniorFacultyCount = 0,
  isCollaborator = false,
  collaboratorApprovedCount = 0,
  collaboratorTotalCount = 1,
  onRescan,
  onCancelRescan,
}: ReviewPanelProps) {
  const { toast } = useToast();
  const [isRescanning, setIsRescanning] = useState(false);
  const currentReviewerStatus = assignedPeerReviewers.find(
    apr => apr.reviewerId === userId
  );
  const hasAlreadyActed = !!currentReviewerStatus?.action;
  const totalPeerReviewers = assignedPeerReviewers.length;
  const approvedPeerReviewersCount = assignedPeerReviewers.filter(
    apr => apr.hasForwarded || apr.action === 'forwarded'
  ).length;
  const [comment, setComment] = useState('');
  const [selectedAction, setSelectedAction] = useState<ReviewAction['type'] | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [showForm17Warning, setShowForm17Warning] = useState(false);
  const [showForm18Warning, setShowForm18Warning] = useState(false);

  // 'collaborator_reviewer' role uses the collaborator_reviewer action set;
  // all other roles (faculty, faculty_peer_reviewer, dept_head, etc.) use their own.
  const reviewerActions = REVIEWER_ACTIONS[userRole] ?? REVIEWER_ACTIONS['faculty'];
  const characterCount = comment.length;
  const isOverLimit = characterCount > MAX_COMMENT_LENGTH;
  // Clear validation error when inputs change
  useEffect(() => {
    setValidationError(null);
  }, [comment, signature, selectedAction]);

  const alignmentIssuesCount = React.useMemo(() => {
    if (!aiAnalysis?.coAlignment || aiAnalysis.coAlignment.length === 0) return 0;
    let count = 0;
    if (aiAnalysis.coAlignment.length < 3 || aiAnalysis.coAlignment.length > 5) {
      count++;
    }

    let maxPrevCOLevelNum = 0;
    aiAnalysis.coAlignment.forEach((co: any, i: number) => {
      const coBloom = aiAnalysis.bloomData?.find((b: any) => b.coCode === co.coCode && !b.slo);
      const coLevel = coBloom?.level;

      if (i > 0 && coLevel && bloomLevelMap[coLevel] && maxPrevCOLevelNum > 0) {
        if (bloomLevelMap[coLevel] < maxPrevCOLevelNum) {
          count++;
        }
      }

      if (coLevel && bloomLevelMap[coLevel]) {
        const currentCOLevelNum = bloomLevelMap[coLevel];
        if (currentCOLevelNum > maxPrevCOLevelNum) {
          maxPrevCOLevelNum = currentCOLevelNum;
        }
      }

      if (!co.slos || co.slos.length < 3 || co.slos.length > 5) {
        count++;
      }

      let maxPrevLevelNum = 0;
      if (co.slos) {
        co.slos.forEach((slo: string, si: number) => {
          const sloBloom = aiAnalysis.bloomData?.find((b: any) => b.coCode === co.coCode && b.slo === slo);
          const level = sloBloom ? sloBloom.level : 'Unknown';

          if (coLevel && level !== 'Unknown' && bloomLevelMap[level] > bloomLevelMap[coLevel]) {
            count++;
          }

          if (si > 0 && level !== 'Unknown' && maxPrevLevelNum > 0) {
            if (bloomLevelMap[level] < maxPrevLevelNum) {
              count++;
            }
          }

          if (level !== 'Unknown' && bloomLevelMap[level]) {
            const currentLevelNum = bloomLevelMap[level];
            if (currentLevelNum > maxPrevLevelNum) {
              maxPrevLevelNum = currentLevelNum;
            }
          }
        });
      }
    });

    return count;
  }, [aiAnalysis?.coAlignment, aiAnalysis?.bloomData]);

  // Removed auto-selection logic to ensure users manually select an action before submitting

  const validateSubmission = (): boolean => {
    // Lead faculty (owner) submits immediately — no action selection needed
    const isLeadFaculty = userRole === 'faculty';
    const isCollaboratorRole = userRole === 'collaborator_reviewer';

    if (!isLeadFaculty && !selectedAction) {
      setValidationError('Please select an action');
      return false;
    }

    if (userRole === 'faculty_peer_reviewer' && !form17Modified) {
      setShowForm17Warning(true);
      return false;
    }

    if (selectedAction === 'return' && comment.trim().length < MIN_RETURN_REASON_LENGTH) {
      setValidationError(`Return reason must be at least ${MIN_RETURN_REASON_LENGTH} characters`);
      return false;
    }

    if (isOverLimit) {
      setValidationError(`Comment exceeds maximum length of ${MAX_COMMENT_LENGTH} characters`);
      return false;
    }

    return true;
  };

  const handleSubmit = () => {
    if (!validateSubmission()) return;

    const seniorRoles = ['faculty_peer_reviewer', 'senior_faculty', 'dept_head', 'dean', 'citl'];
    if (seniorRoles.includes(userRole) && !form18Modified) {
      setShowForm18Warning(true);
      return;
    }

    setShowSubmitConfirm(true);
  };

  const handleConfirmSubmit = () => {
    if (confirmText.toLowerCase() !== 'submit syllabus') {
      toast({ title: 'Confirmation failed', description: 'Please type exactly "submit syllabus" to proceed.', variant: 'destructive' });
      return;
    }
    setShowSubmitConfirm(false);
    setConfirmText('');

    // Lead faculty (syllabus owner) — always forwards to senior faculty
    if (userRole === 'faculty') {
      const action: ReviewAction = {
        type: 'forward',
        targetRole: 'faculty_peer_reviewer',
      };
      onSubmit(action, comment);
      return;
    }

    // Collaborator / Peer reviewer — uses selected action with collaborator approval flag
    if (userRole === 'collaborator_reviewer') {
      if (!selectedAction) return;
      const action: ReviewAction = {
        type: selectedAction,
        targetRole: selectedAction === 'forward' ? 'faculty_peer_reviewer' : undefined,
        isCollaboratorApproval: selectedAction === 'forward',
      };
      onSubmit(action, comment);
      return;
    }

    if (!selectedAction) return;

    const action: ReviewAction = {
      type: selectedAction,
      targetRole: selectedAction === 'forward'
        ? reviewerActions?.actions.forward?.targetRole
        : undefined,
    };

    onSubmit(action, comment);
  };

  const handleOpenForm = (formKey: 'form17' | 'form18', url?: string) => {
    if (onOpenForm) {
      onOpenForm(formKey);
      return;
    }
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      toast({ title: 'Not Available', description: `${formKey === 'form17' ? 'Form 17' : 'Form 18'} has not been uploaded yet.`, variant: 'destructive' });
    }
  };

  if (hasAlreadyActed) {
    return (
      <Card className={cn('shadow-soft', className)}>
        <CardHeader>
          <CardTitle className="text-base md:text-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Review Submitted
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {userRole === 'faculty_peer_reviewer' ? (
              currentReviewerStatus?.action === 'returned'
                ? 'You have already returned this syllabus for revisions.'
                : `You have already approved this syllabus (${approvedPeerReviewersCount}/${totalPeerReviewers} collaborators approved).`
            ) : (
              `You have already ${currentReviewerStatus?.action === 'forwarded' ? 'forwarded this syllabus to the Department Head' : 'returned this syllabus for revisions'}`
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentReviewerStatus?.comment && (
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Your Comment:</p>
              <p className="text-sm text-foreground">{currentReviewerStatus.comment}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!reviewerActions) {
    return (
      <Card className={cn('shadow-soft', className)}>
        <CardContent className="p-6 text-center text-muted-foreground">
          No review actions available for your role.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Signature Section */}
      <SignatureCanvas
        userId={userId}
        userName={userName}
        userRole={userRole}
        existingSignature={signature}
        onSignatureCreate={onSignatureCreate}
        onSignatureClear={onSignatureClear}
      />
      {signature && onInsertSignatures && (() => {
        const isSeniorFaculty = (userRole as string) === 'senior_faculty' || (userRole as string) === 'faculty_peer_reviewer';
        const isCollaborator = (userRole as string) === 'collaborator_reviewer';

        // 1. Lead Faculty & others sign Syllabus, Senior Faculty does NOT sign Syllabus
        const canSignSyllabus = !isSeniorFaculty;

        // 2. Senior Faculty, Dept Head, Dean, CITL, VPAA can sign Form 17
        const canSignForm17 = ['dept_head', 'dean', 'citl', 'vpaa', 'senior_faculty', 'faculty_peer_reviewer'].includes(userRole);

        // 3. Lead Faculty, Dept Head, CITL, Senior Faculty can sign Form 18; Peer Reviewer / Collaborator does NOT sign Form 18
        const canSignForm18 = ['faculty', 'dept_head', 'citl', 'senior_faculty', 'faculty_peer_reviewer'].includes(userRole) && !isCollaborator;

        return (
          <div className="space-y-3 pt-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Insert Signature To:</p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                className="w-full justify-start bg-[#1e293b] hover:bg-[#0f172a] text-white px-4 py-2.5 font-semibold"
                onClick={async () => {
                  const docTypes: ('syllabus' | 'form17' | 'form18')[] = [];
                  if (canSignSyllabus) docTypes.push('syllabus');
                  if (form17Url && canSignForm17) docTypes.push('form17');
                  if (form18Url && canSignForm18) docTypes.push('form18');
                  if (docTypes.length > 0) {
                    await onInsertSignatures(docTypes, signature);
                  }
                }}
              >
                <FileSignature className="h-4 w-4 mr-2 shrink-0" />
                <span>Insert to All Files</span>
              </Button>
              <Separator className="my-1" />
              {canSignSyllabus && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start hover:bg-primary/5 hover:text-primary transition-colors px-4 py-2"
                  onClick={() => onInsertSignatures(['syllabus'], signature)}
                >
                  <FileSignature className="h-4 w-4 mr-2 shrink-0" />
                  <span>Syllabus</span>
                </Button>
              )}
              {form17Url && canSignForm17 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start hover:bg-blue-50 hover:text-blue-700 transition-colors px-4 py-2"
                  onClick={() => onInsertSignatures(['form17'], signature)}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2 shrink-0" />
                  <span>Form 17</span>
                </Button>
              )}
              {form18Url && canSignForm18 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start hover:bg-green-50 hover:text-green-700 transition-colors px-4 py-2"
                  onClick={() => onInsertSignatures(['form18'], signature)}
                >
                  <FileBarChart className="h-4 w-4 mr-2 shrink-0" />
                  <span>Form 18</span>
                </Button>
              )}
              {form18Url && userRole === 'citl' && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Form 18 — Sign as:</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start hover:bg-green-50 hover:text-green-700 transition-colors px-4 py-2"
                    onClick={() => onInsertSignatures(['form18'], signature, 'FDIS Chair')}
                  >
                    <FileBarChart className="h-4 w-4 mr-2 shrink-0" />
                    <span>Form 18 — FDIS Chair</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start hover:bg-teal-50 hover:text-teal-700 transition-colors px-4 py-2"
                    onClick={() => onInsertSignatures(['form18'], signature, 'CITL Director')}
                  >
                    <FileBarChart className="h-4 w-4 mr-2 shrink-0" />
                    <span>Form 18 — CITL Director</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Supporting Documents & AI Section */}
      {(form17Url || form18Url || aiAnalysis) && (
        <Card className="shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Supporting Documents & Analysis
            </CardTitle>
            <CardDescription>
              Review additional forms submitted by faculty
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/** local handler to route form open into split view */}
            <div className="hidden" aria-hidden>
              {/* no-op container to keep JSX structure valid */}
            </div>
            {/** handlers */}
            {(() => {
              function openForm(form: 'form17' | 'form18') {
                if (onOpenForm) {
                  onOpenForm(form);
                }
              }
              function onKey(e: React.KeyboardEvent, form: 'form17' | 'form18') {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openForm(form);
                }
              }
              function onClick(e: React.MouseEvent, form: 'form17' | 'form18') {
                e.preventDefault();
                openForm(form);
              }
              return (
                <>
                  {/* Form 17 Card */}
                  <div
                    className="p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-colors hover:bg-accent border-border"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => onKey(e, 'form17')}
                    onClick={(e) => onClick(e, 'form17')}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-blue-100 dark:bg-blue-950/50">
                        <FileSpreadsheet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-slate-900 dark:text-slate-100">Form 17</p>
                        <p className="text-xs text-muted-foreground">
                          {form17Url ? 'Click to edit checklist' : 'Click to fill out checklist'}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Form 18 Card */}
                  <div
                    className="p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-colors hover:bg-accent border-border"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => onKey(e, 'form18')}
                    onClick={(e) => onClick(e, 'form18')}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-green-100 dark:bg-green-950/50">
                        <FileBarChart className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-slate-900 dark:text-slate-100">Form 18</p>
                        <p className="text-xs text-muted-foreground">
                          {form18Url ? 'Click to edit suggestions' : 'Click to fill out suggestions'}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {/* AI Analysis Section internal to Card */}
                  {aiAnalysis && (
                    <div className="mt-4 pt-4 border-t border-border space-y-3">
                      {/* Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-semibold text-sm">
                          <Sparkles className="h-4 w-4 text-primary" />
                          AI Scan Report
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            className={
                              aiAnalysis.score >= 85
                                ? 'bg-green-100 text-green-800'
                                : aiAnalysis.score >= 65
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                            }
                          >
                            {aiAnalysis.score}% Compliance
                          </Badge>
                          {aiAnalysis.status && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {aiAnalysis.status.replace('_', ' ')}
                            </Badge>
                          )}
                          {onRescan && (
                            <div className="flex gap-1.5 items-center">
                              {isRescanning && onCancelRescan && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={onCancelRescan}
                                  className="h-6 px-2 text-[10px] gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                                >
                                  <X className="h-3 w-3" />
                                  Cancel
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[10px] gap-1 text-primary border-primary/40 hover:bg-primary/10 rounded-full"
                                disabled={isRescanning}
                                onClick={async () => {
                                  setIsRescanning(true);
                                  try { await onRescan(); } finally { setIsRescanning(false); }
                                }}
                              >
                                {isRescanning
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <RefreshCw className="h-3 w-3" />}
                                {isRescanning ? 'Scanning...' : 'Re-scan'}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>

                      <Tabs defaultValue="summary" className="w-full">
                        <TabsList className="w-full flex overflow-x-auto justify-start h-9 text-[10px] bg-muted p-1 rounded-md scrollbar-none gap-1">
                          {/* Comments Tab */}
                          <TabsTrigger value="comments" className="text-[10px] px-2 py-1 flex-1 whitespace-nowrap flex items-center justify-center relative gap-1">
                            <MessageSquare className="h-3 w-3 shrink-0" />
                            <span>Comments</span>
                          </TabsTrigger>
                          <TabsTrigger value="summary" className="text-[10px] px-2 py-1 flex-1 whitespace-nowrap flex items-center justify-center relative gap-1">
                            <ListChecks className="h-3 w-3 shrink-0" />
                            <span>Summary</span>
                            {aiAnalysis.missingSections && aiAnalysis.missingSections.length > 0 && (
                              <span className="absolute -top-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold text-white shadow-sm ring-1 ring-background">
                                {aiAnalysis.missingSections.length}
                              </span>
                            )}
                          </TabsTrigger>
                          <TabsTrigger value="suggestions" className="text-[10px] px-2 py-1 flex-1 whitespace-nowrap flex items-center justify-center relative gap-1">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            <span>Issues</span>
                            {aiAnalysis.suggestions && aiAnalysis.suggestions.length > 0 && (
                              <span className="absolute -top-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold text-white shadow-sm ring-1 ring-background">
                                {aiAnalysis.suggestions.length}
                              </span>
                            )}
                          </TabsTrigger>
                          <TabsTrigger value="alignment" className="text-[10px] px-2 py-1 flex-1 whitespace-nowrap flex items-center justify-center relative gap-1">
                            <GitBranch className="h-3 w-3 shrink-0" />
                            <span>Align</span>
                            {alignmentIssuesCount > 0 && (
                              <span className="absolute -top-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold text-white shadow-sm ring-1 ring-background">
                                {alignmentIssuesCount}
                              </span>
                            )}
                          </TabsTrigger>
                          <TabsTrigger value="gad" className="text-[10px] px-2 py-1 flex-1 whitespace-nowrap flex items-center justify-center gap-1"><ListChecks className="h-3 w-3 shrink-0" />GAD</TabsTrigger>
                          <TabsTrigger value="table" className="text-[10px] px-2 py-1 flex-1 whitespace-nowrap flex items-center justify-center gap-1"><Table className="h-3 w-3 shrink-0" />Table</TabsTrigger>
                          <TabsTrigger value="extracted" className="text-[10px] px-2 py-1 flex-1 whitespace-nowrap flex items-center justify-center gap-1"><FileSpreadsheet className="h-3 w-3 shrink-0" />Data</TabsTrigger>
                        </TabsList>

                        {/* SUMMARY TAB */}
                        <TabsContent value="summary" className="mt-2 space-y-2">
                          {/* Missing Sections */}
                          {aiAnalysis.missingSections && aiAnalysis.missingSections.length > 0 ? (
                            <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                              <p className="text-[11px] font-semibold text-red-800 mb-1.5">Missing / Incomplete Sections ({aiAnalysis.missingSections.length})</p>
                              <ul className="space-y-1.5">
                                {aiAnalysis.missingSections.map((s, i) => (
                                  <li key={i} className="text-[11px] text-red-700 flex items-center gap-2">
                                    <Badge className="bg-red-100 text-red-800 text-[9px] h-4 px-1 shrink-0">Required</Badge>
                                    {s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-100 text-green-800 text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              All required sections present.
                            </div>
                          )}
                        </TabsContent>

                        {/* SUGGESTIONS TAB */}
                        <TabsContent value="suggestions" className="mt-2">
                          {aiAnalysis.suggestions && aiAnalysis.suggestions.length > 0 ? (
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 sidebar-scrollbar">
                              {aiAnalysis.suggestions.map((s: any, i: number) => (
                                <div key={i} className="p-2.5 rounded-lg border border-border text-[11px]">
                                  <div className="flex flex-wrap items-start justify-between gap-1.5 mb-1">
                                    <span className="font-semibold">{s.title}</span>
                                    <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground shrink-0">Needs Adjustment</Badge>
                                  </div>
                                  <p className="text-muted-foreground">{s.description}</p>
                                  {s.recommendation && <p className="mt-1 italic text-[10px] opacity-80">→ {s.recommendation}</p>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-100 text-green-800 text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              No improvement suggestions.
                            </div>
                          )}
                        </TabsContent>

                        {/* CO-SLO ALIGNMENT TAB */}
                        <TabsContent value="alignment" className="mt-2">
                          {aiAnalysis.coAlignment && aiAnalysis.coAlignment.length > 0 ? (
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 sidebar-scrollbar">
                              {/* Overall CO Count Validation Warning */}
                              {(aiAnalysis.coAlignment.length < 3 || aiAnalysis.coAlignment.length > 5) && (
                                <div className="flex items-center justify-between p-2 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-[10px]">
                                  <div className="flex items-center gap-1.5">
                                    <AlertCircle className="h-3 w-3 shrink-0" />
                                    <span>
                                      {aiAnalysis.coAlignment.length < 3
                                        ? `Insufficient COs: Found ${aiAnalysis.coAlignment.length} CO(s). Min 3 required.`
                                        : `Too Many COs: Found ${aiAnalysis.coAlignment.length} COs. Max 5 allowed.`
                                      }
                                    </span>
                                  </div>
                                  <Badge className="bg-red-100 text-red-800 text-[9px] h-4 px-1 shrink-0">Required</Badge>
                                </div>
                              )}

                              {(() => {
                                let maxPrevCOLevelNum = 0;
                                let maxPrevCOLevelName = '';

                                return aiAnalysis.coAlignment.map((co: any, i: number) => {
                                  const coBloom = aiAnalysis.bloomData?.find((b: any) => b.coCode === co.coCode && !b.slo);
                                  const coLevel = coBloom?.level;

                                  let breaksCOProgression = false;
                                  let precedingCOLevelName = '';
                                  if (i > 0 && coLevel && bloomLevelMap[coLevel] && maxPrevCOLevelNum > 0) {
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

                                  const isInvalidSloCount = !co.slos || co.slos.length < 3 || co.slos.length > 5;
                                  const hasMissingSLOs = !co.slos || co.slos.length === 0;
                                  const hasMissingCOLevel = !coLevel || coLevel === 'Unknown';
                                  const hasCOIssue = hasMissingSLOs || hasMissingCOLevel || isInvalidSloCount || breaksCOProgression;

                                  let maxPrevLevelNum = 0;
                                  let maxPrevLevelName = '';

                                  return (
                                    <div key={i} className="border rounded-lg overflow-hidden">
                                      {/* CO Header */}
                                      <div className={cn("p-2.5 border-b", hasCOIssue ? "bg-destructive/10" : "bg-muted/30")}>
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex flex-col gap-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <Badge variant="outline" className={cn("font-mono text-[10px] h-4 px-1 justify-center shrink-0", hasCOIssue && "border-destructive/50 text-destructive")}>{co.coCode}</Badge>
                                              {coLevel && coLevel !== 'Unknown' ? (
                                                <Badge className={cn("text-[8px] h-4 px-1 justify-center shrink-0", getBloomLevelColor(coLevel))}>{coLevel}</Badge>
                                              ) : (
                                                <Badge variant="destructive" className="text-[8px] h-4 px-1 justify-center shrink-0">Missing Level</Badge>
                                              )}
                                            </div>
                                            <p className={cn("text-[11px] font-semibold leading-snug", hasCOIssue ? "text-destructive" : "text-foreground")}>
                                              <span className="font-normal">{co.coDescription}</span>
                                            </p>
                                            {isInvalidSloCount && (
                                              <span className="text-[10px] text-destructive font-medium flex items-center gap-1 mt-0.5">
                                                <AlertCircle className="h-2.5 w-2.5 shrink-0" />
                                                {(!co.slos || co.slos.length < 3)
                                                  ? `Requires 3–5 SLOs (found ${co.slos?.length || 0})`
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
                                              <Badge className="bg-red-100 text-red-800 text-[9px] h-4 px-1.5 shrink-0">Required</Badge>
                                            ) : breaksCOProgression ? (
                                              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-[9px] h-4 px-1.5 shrink-0">Adjustment</Badge>
                                            ) : null}
                                          </div>
                                        </div>
                                      </div>

                                      {/* SLOs List */}
                                      {co.slos && co.slos.length > 0 ? (
                                        <ul className="divide-y divide-muted/30">
                                          {co.slos.map((slo: string, si: number) => {
                                            const sloBloom = aiAnalysis.bloomData?.find((b: any) => b.coCode === co.coCode && b.slo === slo);
                                            const level = sloBloom ? sloBloom.level : 'Unknown';

                                            const exceedsLevel = coLevel && level !== 'Unknown' &&
                                              bloomLevelMap[level] > bloomLevelMap[coLevel];

                                            let breaksProgression = false;
                                            let precedingLevelName = '';
                                            if (si > 0 && level !== 'Unknown' && maxPrevLevelNum > 0) {
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

                                            return (
                                              <li key={si} className={cn("text-[10px] p-2", exceedsLevel ? "bg-destructive/10" : breaksProgression ? "bg-yellow-50 dark:bg-yellow-950/30" : "")}>
                                                <div className="flex items-start justify-between gap-2">
                                                  <div className="flex flex-col gap-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      <span className="text-muted-foreground text-center shrink-0 font-mono text-[9px]">SLO {si + 1}</span>
                                                      {level && level !== 'Unknown' && (
                                                        <Badge className={cn("text-[8px] h-4 px-1 justify-center shrink-0", getBloomLevelColor(level))}>{level}</Badge>
                                                      )}
                                                    </div>
                                                    <span className={cn("leading-snug", exceedsLevel ? "text-destructive font-medium" : breaksProgression ? "text-yellow-950 dark:text-yellow-100 font-medium" : "text-muted-foreground")}>{slo}</span>
                                                    {exceedsLevel && (
                                                      <span className="text-[9px] text-destructive flex items-center gap-1 mt-0.5 font-medium">
                                                        <AlertCircle className="h-2 w-2 shrink-0" /> Exceeds CO Bloom's level ({coLevel})
                                                      </span>
                                                    )}
                                                    {breaksProgression && (
                                                      <span className="text-[9px] text-yellow-700 dark:text-yellow-400 flex items-center gap-1 mt-0.5 font-medium">
                                                        <AlertCircle className="h-2 w-2 shrink-0 text-yellow-600 dark:text-yellow-400" /> Lower than preceding SLO Bloom's level ({precedingLevelName})
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="flex items-center gap-1 shrink-0">
                                                    {exceedsLevel ? (
                                                      <Badge className="bg-red-100 text-red-800 border-red-200 text-[9px] h-4 px-1.5">Required</Badge>
                                                    ) : breaksProgression ? (
                                                      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-[9px] h-4 px-1.5">Adjustment</Badge>
                                                    ) : null}
                                                  </div>
                                                </div>
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      ) : (
                                        <div className="p-2 pl-6 flex items-center justify-between"><span className="text-[10px] text-destructive italic font-medium">No SLOs aligned to this CO (Minimum 3 required)</span><Badge className="bg-red-100 text-red-800 text-[9px] h-4 px-1.5 shrink-0">Required</Badge></div>
                                      )}
                                    </div>
                                  );
                                });
                              })()}

                              {aiAnalysis.unalignedSLOs && aiAnalysis.unalignedSLOs.length > 0 && (
                                <div className="border border-destructive/40 rounded-lg p-2.5 mt-2 bg-destructive/5">
                                  <h4 className="text-[11px] font-semibold text-destructive mb-1 flex items-center gap-1.5">
                                    <AlertCircle className="h-3 w-3 shrink-0" />
                                    Unaligned SLOs
                                  </h4>
                                  <div className="space-y-1">
                                    {aiAnalysis.unalignedSLOs.map((slo: string, index: number) => (
                                      <div key={index} className="text-[10px] text-muted-foreground leading-tight">
                                        {slo}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground text-center py-3">No CO-SLO alignment data.</p>
                          )}
                        </TabsContent>

                        {/* GAD ANALYSIS TAB */}
                        <TabsContent value="gad" className="mt-2">
                          {aiAnalysis.gadData && aiAnalysis.coAlignment && aiAnalysis.coAlignment.length > 0 ? (
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 sidebar-scrollbar">
                              {aiAnalysis.coAlignment.map((co: any, i: number) => {
                                const coGad = aiAnalysis.gadData?.find(g => g.coCode === co.coCode && !g.slo);
                                const sloGads = aiAnalysis.gadData?.filter(g => g.coCode === co.coCode && g.slo) || [];

                                return (
                                  <div key={i} className="border rounded-lg overflow-hidden">
                                    <div className="p-2.5 bg-muted/30 border-b">
                                      <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <Badge variant="outline" className="font-mono text-[10px] h-4 px-1 justify-center shrink-0">{co.coCode}</Badge>
                                          {coGad && (
                                            <Badge className={`text-[8px] h-4 px-1 justify-center shrink-0 ${coGad.isGadRelated ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-muted text-muted-foreground border-border'}`}>
                                              {coGad.isGadRelated ? 'GAD Related' : 'Not GAD Related'}
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-[11px] font-semibold text-foreground leading-snug"><span className="font-normal">{co.coDescription}</span></p>
                                        {coGad && coGad.explanation && (
                                          <p className="text-[10px] text-muted-foreground">{coGad.explanation}</p>
                                        )}
                                      </div>
                                    </div>
                                    {co.slos && co.slos.length > 0 ? (
                                      <ul className="divide-y divide-muted/30">
                                        {co.slos.map((slo: string, si: number) => {
                                          const sloGad = sloGads.find(s => s.slo === slo);
                                          return (
                                            <li key={si} className="text-[10px] p-2">
                                              <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="text-muted-foreground text-center mt-0.5 shrink-0">•</span>
                                                  {sloGad && (
                                                    <Badge className={`text-[8px] h-4 px-1 justify-center shrink-0 ${sloGad.isGadRelated ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-muted text-muted-foreground border-border'}`}>
                                                      {sloGad.isGadRelated ? 'GAD Related' : 'Not GAD Related'}
                                                    </Badge>
                                                  )}
                                                </div>
                                                <span className="text-muted-foreground leading-snug">{slo}</span>
                                                {sloGad && sloGad.explanation && (
                                                  <p className="text-[10px] text-muted-foreground pl-4">{sloGad.explanation}</p>
                                                )}
                                              </div>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    ) : (
                                      <div className="p-2 pl-6 placeholder:"><span className="text-[10px] text-muted-foreground italic">No SLOs aligned to this CO</span></div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground text-center py-3">No GAD analysis available.</p>
                          )}
                        </TabsContent>

                        {/* TABLE ANALYSIS TAB */}
                        <TabsContent value="table" className="mt-2">
                          {aiAnalysis.tableAnalysis && (
                            Object.keys(aiAnalysis.tableAnalysis.pre_midterm || {}).length > 0 ||
                            Object.keys(aiAnalysis.tableAnalysis.pre_final || {}).length > 0
                          ) ? (
                            <div className="space-y-2">
                              {(['pre_midterm', 'pre_final'] as const).map(period => {
                                const data = aiAnalysis.tableAnalysis?.[period] || {};
                                const hasWeek = Object.keys(data).some(k => /^week$/i.test(k.trim()));
                                const entries = Object.entries(data).filter(([col, v]) => {
                                  if ((v as number) <= 0) return false;
                                  if (hasWeek && /^week[_\s-]?\d+$/i.test(col.trim())) return false;
                                  return true;
                                });
                                if (entries.length === 0) return null;
                                return (
                                  <div key={period}>
                                    <p className="text-[11px] font-semibold mb-1 capitalize">{period.replace('_', '-')}: Empty Cells</p>
                                    <div className="space-y-1">
                                      {entries.map(([col, count]) => (
                                        <div key={col} className="flex items-center justify-between text-[11px] bg-orange-50 border border-orange-100 rounded px-2 py-1">
                                          <span className="text-orange-800 truncate">{col}</span>
                                          <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 hover:text-orange-700 text-[9px] h-4 shrink-0 border-transparent shadow-none">{Number(count)} empty</Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-100 text-green-800 text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              No empty cells detected in learning table.
                            </div>
                          )}
                        </TabsContent>
                        {/* EXTRACTED DATA TAB */}
                        <TabsContent value="comments" className="mt-2 space-y-2 p-2">
                          {assignedPeerReviewers.filter(apr => ['senior_faculty', 'dept_head', 'dean', 'citl'].includes(apr.role)).map((apr, idx) => (
                            <div key={idx} className="p-2 border rounded bg-muted/20">
                              <div className="font-semibold text-sm mb-1 capitalize">{apr.role.replace('_', ' ')}</div>
                              {apr.comment ? (
                                <p className="text-xs text-foreground">{apr.comment}</p>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">No comment submitted.</p>
                              )}
                            </div>
                          ))}
                        </TabsContent>
                        <TabsContent value="extracted" className="mt-2 text-xs text-muted-foreground p-1 space-y-2 h-[240px] overflow-y-auto sidebar-scrollbar">
                          {aiAnalysis.extractedData ? (
                            <div className="space-y-3">
                              <p className="text-[11px] font-semibold text-foreground mb-1">Extracted Syllabus Information</p>
                              <div className="grid grid-cols-2 gap-2 text-[10px]">
                                {aiAnalysis.extractedData.title && <div><span className="font-medium block">Title:</span>{aiAnalysis.extractedData.title}</div>}
                                {aiAnalysis.extractedData.courseCode && <div><span className="font-medium block">Course Code:</span>{aiAnalysis.extractedData.courseCode}</div>}
                                {aiAnalysis.extractedData.courseTitle && <div><span className="font-medium block">Course Title:</span>{aiAnalysis.extractedData.courseTitle}</div>}
                                {aiAnalysis.extractedData.courseCredit && <div><span className="font-medium block">Course Credit:</span>{aiAnalysis.extractedData.courseCredit}</div>}
                                {aiAnalysis.extractedData.nominalDuration && <div><span className="font-medium block">Nominal Duration:</span>{aiAnalysis.extractedData.nominalDuration}</div>}
                                {aiAnalysis.extractedData.prerequisite && <div><span className="font-medium block">Prerequisite:</span>{aiAnalysis.extractedData.prerequisite}</div>}
                              </div>
                              {aiAnalysis.extractedData.courseDescription && (
                                <div className="text-[10px]"><span className="font-medium block mb-0.5">Description:</span>{aiAnalysis.extractedData.courseDescription}</div>
                              )}
                              {aiAnalysis.extractedData.gradingSystem && (
                                <div className="text-[10px]">
                                  <span className="font-medium block mb-0.5">Grading System:</span>
                                  <ul className="pl-3 list-disc space-y-0.5">
                                    {aiAnalysis.extractedData.gradingSystem.majorOutput && <li>Major Output: {aiAnalysis.extractedData.gradingSystem.majorOutput}</li>}
                                    {aiAnalysis.extractedData.gradingSystem.classStanding && <li>Class Standing: {aiAnalysis.extractedData.gradingSystem.classStanding}</li>}
                                    {aiAnalysis.extractedData.gradingSystem.midTermGrade && <li>Midterm: {aiAnalysis.extractedData.gradingSystem.midTermGrade}</li>}
                                    {aiAnalysis.extractedData.gradingSystem.finalTermGrade && <li>Final Term: {aiAnalysis.extractedData.gradingSystem.finalTermGrade}</li>}
                                    {aiAnalysis.extractedData.gradingSystem.finalGrade && <li>Final Grade: {aiAnalysis.extractedData.gradingSystem.finalGrade}</li>}
                                  </ul>
                                </div>
                              )}
                              {aiAnalysis.extractedData.courseOutcomes?.outcomes?.length > 0 && (
                                <div className="text-[10px]">
                                  <span className="font-medium block mb-0.5">Parsed COs:</span>
                                  <ul className="pl-3 list-decimal space-y-0.5">
                                    {aiAnalysis.extractedData.courseOutcomes.outcomes.map((co: any, i: number) => (
                                      <li key={i}>{co.text}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {aiAnalysis.extractedData.references?.references?.length > 0 && (
                                <div className="text-[10px]">
                                  <span className="font-medium block mb-0.5">References:</span>
                                  <ul className="pl-3 list-disc space-y-0.5">
                                    {aiAnalysis.extractedData.references.references.map((ref: string, i: number) => (
                                      <li key={i}>{ref}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {aiAnalysis.extractedData.policies?.policies && (
                                <div className="text-[10px]">
                                  <span className="font-medium block mb-0.5">Policies:</span>
                                  <p className="whitespace-pre-wrap opacity-90">{aiAnalysis.extractedData.policies.policies}</p>
                                </div>
                              )}
                              {aiAnalysis.extractedData.revisionHistory?.revisionHistory && (
                                <div className="text-[10px]">
                                  <span className="font-medium block mb-0.5">Revision History:</span>
                                  <p className="whitespace-pre-wrap opacity-90">{aiAnalysis.extractedData.revisionHistory.revisionHistory}</p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-[10px]">No extracted data available for this syllabus.</p>
                          )}
                        </TabsContent>
                      </Tabs>
                    </div>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Comparison Button */}
      {version > 1 && onCompare && (
        <Card className="shadow-soft border-dashed border-primary/30 bg-primary/5">
          <CardContent className="p-3 sm:p-4 flex flex-col items-center">
            <Button
              variant={showComparison ? "secondary" : "outline"}
              className={cn(
                "w-full gap-2 transition-all flex items-center justify-center px-3 py-2 sm:px-4 sm:py-2.5 h-auto min-h-[38px] text-xs sm:text-sm whitespace-normal text-center",
                showComparison && "ring-2 ring-primary bg-primary/10 border-primary/50"
              )}
              onClick={onCompare}
            >
              <GitBranch className={cn("h-4 w-4 shrink-0", showComparison ? "text-primary" : "text-muted-foreground")} />
              <span className="leading-snug">{showComparison ? "Viewing Comparison" : "Compare with Recent Version"}</span>
            </Button>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 sm:mt-2 text-center italic leading-tight">
              View your previous version with reviewer comments side-by-side
            </p>
          </CardContent>
        </Card>
      )}

      {/* Comments Section */}
      {userRole !== 'faculty' && (
        <Card className="shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Review Comments
            </CardTitle>
            <CardDescription>
              Add feedback or notes for the faculty
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Enter your comments here... (optional for forward, required for return)"
                className={cn(
                  'min-h-[120px] resize-none',
                  isOverLimit && 'border-destructive focus-visible:ring-destructive'
                )}
              />
              <div className="flex items-center justify-between text-xs">
                <span className={cn(
                  'text-muted-foreground',
                  isOverLimit && 'text-destructive'
                )}>
                  {characterCount} / {MAX_COMMENT_LENGTH} characters
                </span>
                {selectedAction === 'return' && comment.length < MIN_RETURN_REASON_LENGTH && (
                  <span className="text-warning">
                    Min {MIN_RETURN_REASON_LENGTH} chars for return
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons — collaborator/senior-faculty buttons are owner-only (see inside) */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Review Actions</CardTitle>
          <CardDescription>
            Select an action based on your review
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-2">
            {/* For CITL role: Show Return, then Forward */}
            {userRole === 'citl' ? (
              <>
                {/* Return Button - First for CITL */}
                <Button
                  variant="outline"
                  className={cn(
                    'justify-start h-auto py-2.5 px-3 sm:py-3 sm:px-4 transition-all w-full whitespace-normal',
                    selectedAction === 'return'
                      ? 'bg-warning/10 text-warning border-warning/20 ring-2 ring-warning ring-offset-2 shadow-sm'
                      : 'hover:bg-warning/5 hover:text-warning hover:border-warning/30'
                  )}
                  onClick={() => setSelectedAction('return')}
                >
                  <RotateCcw className={cn("h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3 shrink-0", selectedAction === 'return' ? "text-warning" : "text-muted-foreground")} />
                  <div className="text-left flex-1 min-w-0">
                    <p className="font-semibold text-xs sm:text-sm leading-snug">{reviewerActions.actions.return.label}</p>
                    <p className="text-[10px] sm:text-xs opacity-70 leading-normal">
                      Request revisions from the faculty
                    </p>
                  </div>
                </Button>

                {/* Forward Button - Last for CITL */}
                {reviewerActions.actions.forward && (
                  <Button
                    variant="outline"
                    className={cn(
                      'justify-start h-auto py-2.5 px-3 sm:py-3 sm:px-4 transition-all w-full whitespace-normal',
                      selectedAction === 'forward'
                        ? 'bg-blue-50 text-blue-700 border-blue-200 ring-2 ring-blue-500 ring-offset-2 shadow-sm'
                        : 'hover:bg-blue-50/50 hover:text-blue-600 hover:border-blue-200'
                    )}
                    onClick={() => setSelectedAction('forward')}
                  >
                    <ArrowRightCircle className={cn("h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3 shrink-0", selectedAction === 'forward' ? "text-blue-600" : "text-muted-foreground")} />
                    <div className="text-left flex-1 min-w-0">
                      <p className="font-semibold text-xs sm:text-sm leading-snug">{reviewerActions.actions.forward.label}</p>
                      <p className="text-[10px] sm:text-xs opacity-70 leading-normal">
                        Forward to {ROLE_LABELS[reviewerActions.actions.forward.targetRole]}
                      </p>
                    </div>
                  </Button>
                )}
              </>
            ) : (
              /* For other roles: Keep original order (Forward, Approve, Return) */
              <>
                {/* Collaborator Button - only shown for the syllabus owner (lead faculty) */}
                {reviewerActions.actions.collaborator && userRole === 'faculty' && (
                  <Button
                    variant="outline"
                    className={cn(
                      'justify-start h-auto py-2.5 px-3 sm:py-3 sm:px-4 transition-all w-full whitespace-normal hover:bg-blue-50/50 hover:text-blue-600 hover:border-blue-200'
                    )}
                    onClick={() => onAddCollaborators?.()}
                  >
                    <Users className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3 shrink-0 text-muted-foreground" />
                    <div className="text-left flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs sm:text-sm leading-snug">
                          {reviewerActions.actions.collaborator.label}
                        </span>
                        {selectedCollaboratorsCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] h-4 shrink-0 px-1.5 font-medium">
                            {selectedCollaboratorsCount} Selected
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-xs opacity-70 leading-normal mt-0.5">
                        Share this syllabus with co-owners for editing
                      </p>
                    </div>
                  </Button>
                )}

                {/* Forward Button */}
                {reviewerActions.actions.forward && (
                  <Button
                    variant="outline"
                    className={cn(
                      'justify-start h-auto py-2.5 px-3 sm:py-3 sm:px-4 transition-all w-full whitespace-normal',
                      userRole === 'faculty'
                        ? 'hover:bg-blue-50/50 hover:text-blue-600 hover:border-blue-200'
                        : selectedAction === 'forward'
                          ? 'bg-blue-50 text-blue-700 border-blue-200 ring-2 ring-blue-500 ring-offset-2 shadow-sm'
                          : 'hover:bg-blue-50/50 hover:text-blue-600 hover:border-blue-200'
                    )}
                    onClick={() => userRole === 'faculty' ? onSelectSeniorFaculty?.() : setSelectedAction('forward')}
                  >
                    <ArrowRightCircle className={cn("h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3 shrink-0", userRole !== 'faculty' && selectedAction === 'forward' ? "text-blue-600" : "text-muted-foreground")} />
                    <div className="text-left flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs sm:text-sm leading-snug">
                          {userRole === 'collaborator_reviewer'
                            ? `Approved (${collaboratorApprovedCount}/${collaboratorTotalCount})`
                            : reviewerActions.actions.forward.label}
                        </span>
                        {userRole === 'faculty' && selectedSeniorFacultyCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] h-4 shrink-0 px-1.5 font-medium">
                            {selectedSeniorFacultyCount} Selected
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-xs opacity-70 leading-normal mt-0.5">
                        {userRole === 'collaborator_reviewer'
                          ? `Approve this syllabus (${collaboratorApprovedCount} of ${collaboratorTotalCount} approved)`
                          : userRole === 'faculty'
                            ? 'Forward to Senior Faculty Reviewer'
                            : `Forward to ${ROLE_LABELS[reviewerActions.actions.forward.targetRole!]}`}
                      </p>
                    </div>
                  </Button>
                )}

                {/* Approve Button */}
                {reviewerActions.actions.approve && (
                  <Button
                    variant="outline"
                    className={cn(
                      'justify-start h-auto py-2.5 px-3 sm:py-3 sm:px-4 transition-all w-full whitespace-normal',
                      selectedAction === 'approve'
                        ? 'bg-success/10 text-success border-success/20 ring-2 ring-success ring-offset-2 shadow-sm'
                        : 'hover:bg-success/5 hover:text-success hover:border-success/20'
                    )}
                    onClick={() => setSelectedAction('approve')}
                  >
                    <CheckCircle2 className={cn("h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3 shrink-0", selectedAction === 'approve' ? "text-success" : "text-muted-foreground")} />
                    <div className="text-left flex-1 min-w-0">
                      <p className="font-semibold text-xs sm:text-sm leading-snug">{reviewerActions.actions.approve.label}</p>
                      <p className="text-[10px] sm:text-xs opacity-70 leading-normal">
                        Complete the syllabus approval process
                      </p>
                    </div>
                  </Button>
                )}

                {/* Return Button (only if available for this role) */}
                {reviewerActions.actions.return && (
                  <Button
                    variant="outline"
                    className={cn(
                      'justify-start h-auto py-2.5 px-3 sm:py-3 sm:px-4 transition-all w-full whitespace-normal',
                      selectedAction === 'return'
                        ? 'bg-warning/10 text-warning border-warning/20 ring-2 ring-warning ring-offset-2 shadow-sm'
                        : 'hover:bg-warning/5 hover:text-warning hover:border-warning/30'
                    )}
                    onClick={() => setSelectedAction('return')}
                  >
                    <RotateCcw className={cn("h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3 shrink-0", selectedAction === 'return' ? "text-warning" : "text-muted-foreground")} />
                    <div className="text-left flex-1 min-w-0">
                      <p className="font-semibold text-xs sm:text-sm leading-snug">{reviewerActions.actions.return.label}</p>
                      <p className="text-[10px] sm:text-xs opacity-70 leading-normal">
                        Request revisions from the faculty
                      </p>
                    </div>
                  </Button>
                )}
              </>
            )}
          </div>

          <Separator />

          {/* Validation Requirements */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Requirements:</p>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <FileSignature className={cn(
                  'h-4 w-4',
                  signature ? 'text-success' : 'text-muted-foreground'
                )} />
                <span className={signature ? 'text-success' : 'text-muted-foreground'}>
                  Signature (optional)
                </span>
                {signature && <Badge variant="success" className="text-xs">Signed</Badge>}
              </div>
              {selectedAction === 'return' && (
                <div className="flex items-center gap-2">
                  <MessageSquare className={cn(
                    'h-4 w-4',
                    comment.length >= MIN_RETURN_REASON_LENGTH
                      ? 'text-success'
                      : 'text-muted-foreground'
                  )} />
                  <span className={
                    comment.length >= MIN_RETURN_REASON_LENGTH
                      ? 'text-success'
                      : 'text-muted-foreground'
                  }>
                    Return reason (min {MIN_RETURN_REASON_LENGTH} chars)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Validation Error */}
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button
            className={cn(
              "w-full transition-all duration-300 shadow-lg hover:shadow-glow flex items-center justify-center gap-2",
              userRole === 'faculty' || selectedAction ? "gradient-primary hover:opacity-90" : "bg-muted text-muted-foreground"
            )}
            size="lg"
            onClick={handleSubmit}
            disabled={(userRole !== 'faculty' && !selectedAction) || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>{userRole === 'faculty'
                  ? 'Submit'
                  : 'Submit Review'}</span>
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Submit Confirmation Dialog */}
      <AlertDialog open={showSubmitConfirm} onOpenChange={(open) => {
        setShowSubmitConfirm(open);
        if (!open) setConfirmText('');
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Submission</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {userRole === 'faculty' ? 'submit this syllabus to the next reviewer' : 'submit this review'}? This action cannot be undone.
              <br /><br />
              Please type <strong>submit syllabus</strong> below to proceed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="submit syllabus"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmSubmit();
              }}
              disabled={confirmText.toLowerCase() !== 'submit syllabus' || isSubmitting}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Form 17 Not Edited Warning Dialog */}
      <AlertDialog open={showForm17Warning} onOpenChange={setShowForm17Warning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Form 17 Not Edited
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              You still haven't edited <strong>Form 17</strong>. Please edit the form before submitting your review.
              <br /><br />
              Click <strong>Go to Form 17</strong> to open and edit it, or <strong>Dismiss</strong> to go back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowForm17Warning(false)}>
              Dismiss
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowForm17Warning(false);
                if (onOpenForm) onOpenForm('form17');
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Go to Form 17
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Form 18 Not Edited Warning Dialog */}
      <AlertDialog open={showForm18Warning} onOpenChange={setShowForm18Warning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              Leave Form 18 Unedited?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Are you sure you want to leave Form 18 unedited? Make sure you have extracted your comments for Form 18 before proceeding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowForm18Warning(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowForm18Warning(false);
                setShowSubmitConfirm(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
