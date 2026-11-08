import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Clock, CheckCircle2, XCircle, User, MessageSquare, Eye, FileSpreadsheet, FileBarChart, Sparkles, Loader2, Forward, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/StatusBadge';
import { VersionLabel } from '@/components/VersionLabel';
import { useData } from '@/contexts/DataContext';
import { ROLE_LABELS } from '@/types';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const WORKFLOW_STEPS = [
  { status: 'submitted', label: 'Peer Review', role: 'collaborator_reviewer', stage: 'COLLABORATOR' },
  { status: 'under_review_peer', label: 'Senior Faculty', role: 'faculty_peer_reviewer', stage: 'SENIOR_FACULTY' },
  { status: 'under_review_dept_head', label: 'Dept. Head', role: 'dept_head', stage: 'DEPT_HEAD' },
  { status: 'under_review_dean', label: 'Dean', role: 'dean', stage: 'DEAN' },
  { status: 'under_review_citl', label: 'CITL', role: 'citl', stage: 'CITL' },
  { status: 'under_review_vpaa', label: 'VPAA', role: 'vpaa', stage: 'VPAA' },
  { status: 'approved', label: 'Approved', role: null, stage: 'APPROVED' },
];

export default function TrackingIDPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { syllabi, getSyllabusById, allSyllabi } = useData();
  const { toast } = useToast();
  const [syllabus, setSyllabus] = React.useState<any>(null);
  const [isFetching, setIsFetching] = React.useState(true);

  React.useEffect(() => {
    const fetchSyllabus = async () => {
      if (!id) return;

      // 1. Try filtered list first (global semester)
      let found = syllabi.find(s => s.id === id || s.trackingId === id);

      // 2. Try unfiltered list (all semesters)
      if (!found) {
        found = allSyllabi.find(s => s.id === id || s.trackingId === id);
      }

      // 3. Try API directly
      if (!found) {
        found = await getSyllabusById(id);
      }

      setSyllabus(found);
      setIsFetching(false);
    };

    fetchSyllabus();
  }, [id, syllabi, allSyllabi, getSyllabusById]);

  if (isFetching) {
    return (
      <div className="flex flex-col items-center justify-center p-24 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Loading tracking details...</p>
      </div>
    );
  }

  if (!syllabus) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Card className="shadow-soft">
          <CardContent className="p-12 text-center">
            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">Syllabus Not Found</h3>
            <p className="text-muted-foreground">The syllabus you're looking for doesn't exist.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getCurrentStepIndex = (status: string) => {
    const stage = (syllabus.currentStage || '').toUpperCase();
    if (status === 'approved') return WORKFLOW_STEPS.length - 1;
    if (stage === 'COLLABORATOR' || status === 'submitted') return 0;
    if (stage === 'SENIOR_FACULTY' || status === 'under_review_peer') return 1;
    if (stage === 'DEPT_HEAD' || status === 'under_review_dept_head') return 2;
    if (stage === 'DEAN' || status === 'under_review_dean') return 3;
    if (stage === 'CITL' || status === 'under_review_citl') return 4;
    if (stage === 'VPAA' || status === 'under_review_vpaa') return 5;
    const idx = WORKFLOW_STEPS.findIndex(step => step.status === status);
    return idx >= 0 ? idx : 0;
  };

  const currentStepIndex = getCurrentStepIndex(syllabus.status);

  const handleViewDocument = (documentType: 'syllabus' | 'form17' | 'form18') => {
    const documentInfo = {
      syllabus: {
        url: syllabus.fileName || '#',
        name: 'Syllabus',
        available: !!syllabus.fileName || !!syllabus.fileUrl
      },
      form17: {
        url: syllabus.form17Link || '#',
        name: 'Form 17',
        available: !!syllabus.form17Link
      },
      form18: {
        url: syllabus.form18Link || '#',
        name: 'Form 18',
        available: !!syllabus.form18Link
      }
    };

    const doc = documentInfo[documentType];

    if (!doc.available) {
      toast({ title: 'Not Available', description: `${doc.name} has not been uploaded yet.`, variant: 'destructive' });
      return;
    }

    if (documentType === 'syllabus') {
      navigate(`/syllabus/${syllabus.id}`);
    } else {
      window.open(doc.url, '_blank');
    }
  };

  const getRoleDisplayName = (review: any) => {
    const role = review?.reviewerRole;
    if (!role) return 'Reviewer';

    const isAuthor = review.reviewerId === syllabus?.facultyId;
    const isActualCollaborator = syllabus?.collaborators?.includes(review.reviewerId);
    const isAssignedSenior =
      syllabus?.assignedPeerReviewers?.some((pr: any) => pr.reviewerId === review.reviewerId) ||
      syllabus?.claimedBySeniorFacultyId === review.reviewerId;

    // Dual-role: user is BOTH a collaborator AND the assigned senior faculty.
    // Use chronological order: their FIRST forward = Peer Reviewer (collaborator stage),
    // any SUBSEQUENT forward = Senior Faculty.
    if (isActualCollaborator && isAssignedSenior && !isAuthor && role === 'faculty') {
      const allForwardsByThisUser = (syllabus?.reviewHistory || [])
        .filter((r: any) =>
          r.reviewerId === review.reviewerId &&
          (r.action === 'forwarded' || r.action === 'approved')
        )
        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const myIndex = allForwardsByThisUser.findIndex(
        (r: any) => r.timestamp === review.timestamp
      );
      return myIndex === 0 ? 'Peer Reviewer' : 'Senior Faculty';
    }

    if (role === 'collaborator_reviewer' || (isActualCollaborator && role === 'faculty' && !isAuthor)) {
      return 'Peer Reviewer';
    }

    if (role === 'faculty_peer_reviewer' || role === 'senior_faculty' || (isAssignedSenior && role === 'faculty' && !isAuthor)) {
      return 'Senior Faculty';
    }

    if (ROLE_LABELS[role as keyof typeof ROLE_LABELS]) return ROLE_LABELS[role as keyof typeof ROLE_LABELS];
    const map: Record<string, string> = {
      faculty: 'Faculty',
      dept_head: 'Department Head',
      dean: 'Dean',
      citl: 'CITL',
      vpaa: 'VPAA',
    };
    return map[role.toLowerCase()] || role.replace(/_/g, ' ');
  };

  // Compile all chronological history events
  const historyEvents = [...(syllabus.reviewHistory || [])].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tracking Details</h1>
            <p className="text-muted-foreground text-sm">
              Syllabus ID: <span className="font-mono font-semibold">{syllabus.trackingId || syllabus.id}</span>
            </p>
          </div>
        </div>

        {/* Document View Buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleViewDocument('syllabus')}
            className="gap-2 text-xs"
          >
            <Eye className="h-4 w-4" />
            View Syllabus
          </Button>

          {syllabus.form17Link && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleViewDocument('form17')}
              className="gap-2 text-xs"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Form 17
            </Button>
          )}

          {syllabus.form18Link && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleViewDocument('form18')}
              className="gap-2 text-xs"
            >
              <FileBarChart className="h-4 w-4" />
              Form 18
            </Button>
          )}
        </div>
      </div>

      {/* Syllabus Header Card */}
      <Card className="shadow-soft">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">{syllabus.courseCode} - {syllabus.courseTitle}</CardTitle>
                <CardDescription className="mt-0.5">
                  {syllabus.facultyName ? `Author: ${syllabus.facultyName} • ` : ''}
                  {syllabus.department} • {syllabus.semesterPeriod}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <VersionLabel version={syllabus.version} />
              <StatusBadge status={syllabus.status} />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Workflow Progress Stepper */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Approval Workflow Progress</CardTitle>
          <CardDescription>
            Live approval progress across all stages
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="relative pt-2 pb-2">
            <div className="hidden sm:block absolute top-7 left-8 right-8 h-0.5 bg-border -z-0" />
            <div className="grid grid-cols-2 sm:grid-cols-7 gap-4 relative z-10">
              {WORKFLOW_STEPS.map((step, index) => {
                const isCompleted = index < currentStepIndex || syllabus.status === 'approved';
                const isCurrent = index === currentStepIndex && syllabus.status !== 'approved';

                return (
                  <div key={step.status} className="flex flex-col items-center text-center gap-2">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center transition-all shadow-sm ${
                        isCompleted
                          ? 'bg-success text-white'
                          : isCurrent
                          ? 'bg-warning text-white animate-pulse ring-4 ring-warning/20'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : isCurrent ? (
                        <Clock className="h-5 w-5" />
                      ) : (
                        <User className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <span
                        className={`text-xs font-semibold block ${
                          isCompleted || isCurrent ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {step.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {isCompleted ? 'Completed' : isCurrent ? 'In Progress' : 'Pending'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Complete Approval & History Log */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Approval & Audit History Log</CardTitle>
              <CardDescription>
                Complete sequential history of all submissions, reviews, and approvals
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs">
              {historyEvents.length + 1} Recorded Events
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative pt-2">
            {/* Continuous Vertical Timeline Line */}
            <div className="absolute left-5 top-0 bottom-4 w-0.5 bg-border" />

            <div className="space-y-6">
              {/* Event 1: Initial Submission */}
              <div className="relative flex gap-4 items-start">
                <div className="h-10 w-10 rounded-full bg-primary text-white flex items-center justify-center z-10 shrink-0 shadow-sm">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex-1 bg-muted/30 p-4 rounded-xl border border-border/50">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">Syllabus Created & Submitted</p>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">v1</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(syllabus.createdAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Author: <span className="font-medium text-foreground">{syllabus.facultyName || 'Faculty'}</span>
                  </p>

                  {syllabus.aiAnalysis && (
                    <div className="mt-2.5 p-2 rounded-lg bg-blue-50/80 dark:bg-blue-900/20 text-xs inline-flex items-center gap-1.5 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>AI Compliance Score: <strong>{syllabus.aiAnalysis.score}%</strong></span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sequential Approval & Review Events */}
              {historyEvents.map((review: any, idx: number) => {
                const isApprovedOrForwarded = review.action === 'approved' || review.action === 'forwarded';
                const isReturned = review.action === 'returned';

                return (
                  <div key={review.id || idx} className="relative flex gap-4 items-start">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center z-10 shrink-0 shadow-sm ${
                        isApprovedOrForwarded
                          ? 'bg-success text-white'
                          : isReturned
                          ? 'bg-destructive text-white'
                          : 'bg-primary text-white'
                      }`}
                    >
                      {isApprovedOrForwarded ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : isReturned ? (
                        <XCircle className="h-5 w-5" />
                      ) : (
                        <Forward className="h-5 w-5" />
                      )}
                    </div>

                    <div className="flex-1 bg-muted/30 p-4 rounded-xl border border-border/50">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">
                            {review.action === 'forwarded'
                              ? 'Reviewed & Forwarded'
                              : review.action === 'approved'
                              ? 'Approved'
                              : 'Returned'}
                          </p>
                          <Badge 
                            variant={isApprovedOrForwarded ? "default" : isReturned ? "destructive" : "secondary"}
                            className="text-[10px] h-4 px-1.5 capitalize font-medium"
                          >
                            {review.action}
                          </Badge>
                          {review.version && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">v{review.version}</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(review.timestamp || syllabus.updatedAt || Date.now()), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground mt-1">
                        Role: <span className="font-medium text-foreground">{getRoleDisplayName(review)}</span>
                        {review.reviewerName ? (
                          <> • Reviewer: <span className="font-medium text-foreground">{review.reviewerName}</span></>
                        ) : null}
                      </p>

                      {review.comment && (
                        <div className="mt-2.5 p-3 rounded-lg bg-background/80 border border-border/60 text-xs">
                          <div className="flex items-start gap-2">
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <p className="text-foreground leading-relaxed break-words">{review.comment}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Active Pending Step Indicator */}
              {syllabus.status !== 'approved' && syllabus.status !== 'returned' && (
                <div className="relative flex gap-4 items-start">
                  <div className="h-10 w-10 rounded-full bg-warning text-white flex items-center justify-center z-10 shrink-0 shadow-sm animate-pulse ring-4 ring-warning/20">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div className="flex-1 bg-warning/5 p-4 rounded-xl border border-warning/30">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-foreground">
                        Currently Under Review
                      </p>
                      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px]">
                        Active Stage
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Awaiting review & endorsement by <strong className="text-foreground">{WORKFLOW_STEPS[currentStepIndex]?.label || 'Next Reviewer'}</strong>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

