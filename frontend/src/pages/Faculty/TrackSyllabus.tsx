import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, CheckCircle2, ArrowRight, User, XCircle, Users, Search, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Syllabus } from '@/types';
import { VersionLabel } from '@/components/VersionLabel';
import { StatusBadge } from '@/components/StatusBadge';


const WORKFLOW_STEPS = [
  { status: 'submitted', label: 'Peer Review', role: 'collaborator_reviewer', stage: 'COLLABORATOR' },
  { status: 'under_review_peer', label: 'Senior Faculty', role: 'faculty_peer_reviewer', stage: 'SENIOR_FACULTY' },
  { status: 'under_review_dept_head', label: 'Dept. Head', role: 'dept_head', stage: 'DEPT_HEAD' },
  { status: 'under_review_dean', label: 'Dean', role: 'dean', stage: 'DEAN' },
  { status: 'under_review_citl', label: 'CITL', role: 'citl', stage: 'CITL' },
  { status: 'under_review_vpaa', label: 'VPAA', role: 'vpaa', stage: 'VPAA' },
  { status: 'approved', label: 'Approved', role: null, stage: 'APPROVED' },
];

function getStepIndex(syllabus: Syllabus): number {
  const stage = (syllabus.currentStage || '').toUpperCase();
  if (syllabus.status === 'approved') return WORKFLOW_STEPS.length - 1;
  
  if (stage === 'COLLABORATOR' || syllabus.status === 'submitted') return 0;
  if (stage === 'SENIOR_FACULTY' || syllabus.status === 'under_review_peer') return 1;
  if (stage === 'DEPT_HEAD' || syllabus.status === 'under_review_dept_head') return 2;
  if (stage === 'DEAN' || syllabus.status === 'under_review_dean') return 3;
  if (stage === 'CITL' || syllabus.status === 'under_review_citl') return 4;
  if (stage === 'VPAA' || syllabus.status === 'under_review_vpaa') return 5;
  const idx = WORKFLOW_STEPS.findIndex(s => s.status === syllabus.status);
  return idx >= 0 ? idx : 0;
}

function SyllabusTrackCard({ syllabus, isCollaborating = false, allUsers = [] }: { syllabus: Syllabus; isCollaborating?: boolean; allUsers?: any[] }) {
  const navigate = useNavigate();
  const currentStepIndex = getStepIndex(syllabus);

  // Resolve collaborator names from IDs
  const collaboratorNames = Array.isArray(syllabus.collaborators) && syllabus.collaborators.length > 0
    ? syllabus.collaborators.map(id => {
        const u = allUsers.find((user: any) => user.id === id);
        return u ? `${u.firstName} ${u.lastName}` : null;
      }).filter(Boolean)
    : [];

  return (
    <Card className={`shadow-soft ${isCollaborating ? 'border-primary/30' : ''}`}>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${isCollaborating ? 'bg-primary/10' : 'bg-primary/10'}`}>
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                <span>{syllabus.courseCode} - {syllabus.courseTitle}</span>
                {isCollaborating && (
                  <Badge variant="secondary" className="text-[10px] h-4 font-normal ml-1">
                    <Users className="h-3 w-3 mr-1" />
                    Collaborating
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {syllabus.semesterPeriod} • Version {syllabus.version ?? 1}
                {isCollaborating && ` • Owner: ${syllabus.facultyName}`}
                {' • '}Submitted: {new Date(syllabus.createdAt).toLocaleDateString()} {new Date(syllabus.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </CardDescription>
              {/* Show collaborators */}
              {!isCollaborating && collaboratorNames.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-xs text-muted-foreground">Collaborators:</span>
                  {collaboratorNames.map((name, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] h-4 px-1.5 font-normal">
                      <Users className="h-2.5 w-2.5 mr-1" />
                      {name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate(`/faculty/tracking/${syllabus.id}`)}>
              View Details
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Workflow Steps Header */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">
            Approval Workflow Progress
          </div>
          <Badge variant="secondary" className="text-[10px] h-4">
            {syllabus.status === 'approved' ? 'Approved (Completed)' : `Stage ${currentStepIndex + 1} of ${WORKFLOW_STEPS.length}`}
          </Badge>
        </div>

        {/* Workflow Steps */}
        <div className="relative pt-2 pb-2">
          <div className="hidden sm:block absolute top-7 left-8 right-8 h-0.5 bg-border -z-0" />
          <div className="grid grid-cols-2 sm:grid-cols-7 gap-3 relative z-10">
            {WORKFLOW_STEPS.map((step, index) => {
              const isCompleted = index < currentStepIndex || syllabus.status === 'approved';
              const isCurrent = index === currentStepIndex && syllabus.status !== 'approved';

              return (
                <div key={`${step.status}-${step.label}`} className="flex flex-col items-center text-center gap-2">
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

        {/* Senior Faculty Status */}
        {syllabus.assignedPeerReviewers && syllabus.assignedPeerReviewers.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              Senior Faculty Reviewers
            </div>
            <div className="space-y-2">
              {syllabus.assignedPeerReviewers.map((reviewer) => (
                <div
                  key={reviewer.reviewerId}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">{reviewer.reviewerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {reviewer.hasForwarded
                          ? 'Approved'
                          : reviewer.action === 'returned'
                            ? 'Returned'
                            : 'Waiting for review'}
                      </p>
                    </div>
                  </div>
                  {reviewer.hasForwarded ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : reviewer.action === 'returned' ? (
                    <XCircle className="h-5 w-5 text-destructive" />
                  ) : (
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TrackSyllabusPage() {
  const navigate = useNavigate();
  const { syllabi, allSyllabi, allUsers } = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');

  // My own syllabi in progress (not approved, returned, or draft)
  const mySyllabi = useMemo(() => {
    const raw = syllabi
      .filter(s =>
        s.facultyId === user?.id &&
        s.status !== 'approved' &&
        s.status !== 'returned' &&
        s.status !== 'draft'
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    if (!searchQuery.trim()) return raw;
    const q = searchQuery.toLowerCase().trim();
    return raw.filter(s =>
      s.courseCode.toLowerCase().includes(q) ||
      s.courseTitle.toLowerCase().includes(q) ||
      (s.department || '').toLowerCase().includes(q)
    );
  }, [syllabi, user?.id, searchQuery]);

  // Syllabi where I am a collaborator - in progress (not approved, returned, or draft)
  const collaboratingSyllabi = useMemo(() => {
    const raw = syllabi
      .filter(s =>
        s.facultyId !== user?.id &&
        Array.isArray(s.collaborators) &&
        s.collaborators.includes(user?.id ?? '') &&
        s.status !== 'approved' &&
        s.status !== 'returned' &&
        s.status !== 'draft'
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    if (!searchQuery.trim()) return raw;
    const q = searchQuery.toLowerCase().trim();
    return raw.filter(s =>
      s.courseCode.toLowerCase().includes(q) ||
      s.courseTitle.toLowerCase().includes(q) ||
      (s.facultyName || '').toLowerCase().includes(q) ||
      (s.department || '').toLowerCase().includes(q)
    );
  }, [syllabi, user?.id, searchQuery]);

  const hasAnything = mySyllabi.length > 0 || collaboratingSyllabi.length > 0 || searchQuery.trim().length > 0;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Track Syllabus</h1>
          <p className="text-muted-foreground mt-1">Monitor syllabi through the approval workflow</p>
        </div>
      </div>

      {!hasAnything ? (
        <Card className="shadow-soft">
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="h-16 w-16 text-success mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No syllabi in progress</h3>
            <p className="text-muted-foreground mb-4">All syllabi have been processed.</p>
            <Button onClick={() => navigate('/faculty/upload')}>Upload New Syllabus</Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="my-syllabi" className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <TabsList className="grid w-full sm:w-80 grid-cols-2 h-9">
              <TabsTrigger value="my-syllabi" className="relative text-xs">
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                My Syllabi
                {mySyllabi.length > 0 && (
                  <span className="ml-1.5 bg-primary text-white text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                    {mySyllabi.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="collaborating" className="relative text-xs">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Collaborating
                {collaboratingSyllabi.length > 0 && (
                  <span className="ml-1.5 bg-primary text-white text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                    {collaboratingSyllabi.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Compact Search Bar */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search course (e.g. IT 101, Web Dev)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-7 h-9 text-xs rounded-lg"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <TabsContent value="my-syllabi" className="space-y-6 mt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">My Syllabi — Under Review</h2>
                <p className="text-sm text-muted-foreground">Monitor progress through peer and administrative reviews</p>
              </div>
            </div>
            {mySyllabi.length === 0 ? (
              <Card className="shadow-soft">
                <CardContent className="p-8 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    {searchQuery ? "No matching syllabi found for your search." : "You have no syllabi currently under review."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {mySyllabi.map(syllabus => (
                  <SyllabusTrackCard key={syllabus.id} syllabus={syllabus} allUsers={allUsers} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="collaborating" className="space-y-6 mt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Collaborating — Under Review</h2>
                <p className="text-sm text-muted-foreground">Syllabi you are collaborating on currently under review</p>
              </div>
            </div>
            {collaboratingSyllabi.length === 0 ? (
              <Card className="shadow-soft">
                <CardContent className="p-8 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    {searchQuery ? "No matching collaborating syllabi found for your search." : "You are not collaborating on any syllabi currently under review."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {collaboratingSyllabi.map(syllabus => (
                  <SyllabusTrackCard key={syllabus.id} syllabus={syllabus} isCollaborating allUsers={allUsers} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
