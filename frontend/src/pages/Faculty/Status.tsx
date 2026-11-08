import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, CheckCircle2, XCircle, MessageSquare, ArrowRight, Download, Loader2, GitBranch, Users, ChevronDown, FileCheck, Search, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Syllabus } from '@/types';
import { VersionLabel } from '@/components/VersionLabel';
import { StatusBadge } from '@/components/StatusBadge';

export default function StatusPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { syllabi, allSyllabi, newVersion } = useData();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'approved';
  
  const setActiveTab = (tab: string) => {
    setSearchParams(prev => {
      prev.set('tab', tab);
      return prev;
    });
  };
  const [revisingIds, setRevisingIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // My own syllabi
  const mySyllabi = syllabi.filter(s => s.facultyId === user?.id);
  const byUpdatedDesc = (a: { updatedAt: string }, b: { updatedAt: string }) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  const isReturnedOrRevised = (s: any) =>
    s.status === 'returned' ||
    (s.status === 'draft' && ((Array.isArray(s.versionHistory) && s.versionHistory.length > 0) || (s.version && s.version > 1)));

  const filterByQuery = (list: Syllabus[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(s =>
      s.courseCode.toLowerCase().includes(q) ||
      s.courseTitle.toLowerCase().includes(q) ||
      (s.facultyName || '').toLowerCase().includes(q) ||
      (s.department || '').toLowerCase().includes(q)
    );
  };

  const approvedSyllabi = useMemo(() => filterByQuery(mySyllabi.filter(s => s.status === 'approved').sort(byUpdatedDesc)), [mySyllabi, searchQuery]);
  const returnedSyllabi = useMemo(() => filterByQuery(mySyllabi.filter(isReturnedOrRevised).sort(byUpdatedDesc)), [mySyllabi, searchQuery]);

  // Collaborating syllabi (not mine, but I'm a collaborator)
  const collaboratingSyllabi = useMemo(() => syllabi.filter(s =>
    s.facultyId !== user?.id &&
    Array.isArray(s.collaborators) &&
    s.collaborators.includes(user?.id ?? '')
  ).sort(byUpdatedDesc), [syllabi, user?.id]);

  const collabApproved = useMemo(() => filterByQuery(collaboratingSyllabi.filter(s => s.status === 'approved')), [collaboratingSyllabi, searchQuery]);
  const collabReturned = useMemo(() => filterByQuery(collaboratingSyllabi.filter(isReturnedOrRevised)), [collaboratingSyllabi, searchQuery]);

  const handleRevise = async (syllabusId: string) => {
    setRevisingIds(prev => [...prev, syllabusId]);
    try {
      const result = await newVersion(syllabusId);
      if (result.success && result.syllabusId) {
        toast({
          title: 'New Version Created',
          description: 'A new editable version has been created. Redirecting to the editor...',
        });
        navigate(`/faculty/forms-editor/${result.syllabusId}`);
      } else {
        toast({
          title: 'Failed',
          description: 'Could not create a new version. Please try again.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setRevisingIds(prev => prev.filter(id => id !== syllabusId));
    }
  };

  const handleDownload = (syllabus: Syllabus, unsigned: boolean = false, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    let API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    if (API_BASE.includes('localhost') && window.location.hostname !== 'localhost') {
      API_BASE = `http://${window.location.hostname}:5000`;
    }

    const token = localStorage.getItem('auth_token');
    const url = `${API_BASE}/syllabi/bulk-download?ids=${syllabus.id}${unsigned ? '&unsigned=true' : ''}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

    const link = document.createElement('a');
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalApproved = approvedSyllabi.length + collabApproved.length;
  const totalReturned = returnedSyllabi.length;

  const ApprovedCard = ({ syllabus, isCollaborating = false }: { syllabus: Syllabus; isCollaborating?: boolean }) => (
    <Card className="shadow-soft border-success/20">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">{syllabus.courseCode} - {syllabus.courseTitle}</h3>
                {isCollaborating && (
                  <Badge variant="secondary" className="text-[10px] h-4">
                    <Users className="h-3 w-3 mr-1" />Collaborator
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {syllabus.department} • {syllabus.semesterPeriod} • Version {syllabus.version ?? 1}
                {isCollaborating && ` • Owner: ${syllabus.facultyName}`}
              </p>
              {(() => {
                const vpaaEntry = [...(syllabus.reviewHistory || [])]
                  .reverse()
                  .find(r => r.reviewerRole === 'vpaa' && (r.action === 'forwarded' || r.action === 'approved'));
                if (!vpaaEntry?.timestamp) return null;
                const d = new Date(vpaaEntry.timestamp);
                return (
                  <p className="text-xs text-success font-medium mt-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 inline-block" />
                    Approved on {d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} at {d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </p>
                );
              })()}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => navigate(`/syllabus/${syllabus.id}`)}>
              View Details
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="success" size="sm" className="w-full sm:w-auto flex items-center justify-center gap-1.5">
                  <span>Download</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-80 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={(e) => handleDownload(syllabus, false, e)}>
                  <FileCheck className="h-4 w-4 mr-2 text-success" />
                  <span>Download with Signatures</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => handleDownload(syllabus, true, e)}>
                  <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>Download w/o Signatures</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const ReturnedCard = ({ syllabus, isCollaborating = false }: { syllabus: Syllabus; isCollaborating?: boolean }) => (
    <Card className="shadow-soft border-destructive/20">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">{syllabus.courseCode} - {syllabus.courseTitle}</h3>
                {isCollaborating && (
                  <Badge variant="secondary" className="text-[10px] h-4">
                    <Users className="h-3 w-3 mr-1" />Collaborator
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {syllabus.semesterPeriod} • Version {syllabus.version ?? 1}
                {isCollaborating && ` • Owner: ${syllabus.facultyName}`}
              </p>
              {(() => {
                const returnedEntry = [...(syllabus.reviewHistory || [])].reverse().find(r => r.action === 'returned');
                if (!returnedEntry?.timestamp) return null;
                const d = new Date(returnedEntry.timestamp);
                return (
                  <p className="text-xs text-destructive font-medium mt-1 flex items-center gap-1">
                    <XCircle className="h-3 w-3 inline-block" />
                    Returned on {d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} at {d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })} by {returnedEntry.reviewerName}
                  </p>
                );
              })()}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/syllabus/${syllabus.id}`)}
              className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive w-full sm:w-auto"
            >
              View Details
            </Button>
            {isCollaborating ? (
              // Collaborators go directly to editor — never call newVersion
              <Button
                size="sm"
                onClick={() => navigate(`/faculty/forms-editor/${syllabus.id}`)}
                className="w-full sm:w-auto"
              >
                Revise Syllabus
              </Button>
            ) : syllabus.status === 'draft' ? (
              // Owner already revised (is now a draft) — go directly to editor
              <Button
                size="sm"
                onClick={() => navigate(`/faculty/forms-editor/${syllabus.id}`)}
                className="w-full sm:w-auto"
              >
                Revise Syllabus
              </Button>
            ) : (
              // Owner starting revision for first time
              <Button
                size="sm"
                onClick={() => handleRevise(syllabus.id)}
                disabled={revisingIds.includes(syllabus.id)}
                className="w-full sm:w-auto"
              >
                {revisingIds.includes(syllabus.id) ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating Version...</>
                ) : (
                  'Revise Syllabus'
                )}
              </Button>
            )}
          </div>
        </div>

        {syllabus.feedback && (
          <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20">
            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Reviewer Feedback</p>
                <p className="text-sm text-muted-foreground">{syllabus.feedback}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Syllabus Status</h1>
        <p className="text-muted-foreground mt-1">View approved and returned syllabi</p>
      </div>

      <Tabs defaultValue="approved" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <TabsList className="grid w-full sm:w-80 grid-cols-2 h-9">
            <TabsTrigger value="approved" className="relative text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-success" />
              Approved
              {totalApproved > 0 && (
                <span className="ml-1.5 bg-success/20 text-success text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                  {totalApproved}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="returned" className="relative text-xs">
              <XCircle className="h-3.5 w-3.5 mr-1.5 text-destructive" />
              Returned
              {totalReturned > 0 && (
                <span className="ml-1.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center shadow-sm">
                  {totalReturned}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Compact Search Bar */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search course (e.g. CS 201, Data Structures)..."
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

        {/* Approved Tab */}
        <TabsContent value="approved" className="space-y-8">
          {/* My Approved */}
          <div className="space-y-4 mt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">My Approved Syllabi</h2>
                <p className="text-sm text-muted-foreground">Syllabi that have completed all reviews</p>
              </div>
            </div>
            {approvedSyllabi.length === 0 ? (
              <Card className="shadow-soft">
                <CardContent className="p-8 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No approved syllabi yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {approvedSyllabi.map(s => <ApprovedCard key={s.id} syllabus={s} />)}
              </div>
            )}
          </div>

          {/* Collaborating Approved */}
          {collabApproved.length > 0 && (
            <div className="space-y-4 border-t pt-6">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-success/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-success" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground">Collaborating — Approved</h2>
                    <Badge variant="secondary" className="text-[11px] font-semibold">{collabApproved.length}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Approved syllabi where you are assigned as collaborator</p>
                </div>
              </div>
              <div className="space-y-4">
                {collabApproved.map(s => <ApprovedCard key={s.id} syllabus={s} isCollaborating />)}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Returned Tab */}
        <TabsContent value="returned" className="space-y-8">
          {/* My Returned */}
          <div className="space-y-4 mt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">My Returned Syllabi</h2>
                <p className="text-sm text-muted-foreground">Syllabi that need updates based on reviewer feedback</p>
              </div>
            </div>
            {returnedSyllabi.length === 0 ? (
              <Card className="shadow-soft">
                <CardContent className="p-8 text-center">
                  <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
                  <p className="text-muted-foreground">No syllabi returned for revision.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {returnedSyllabi.map(s => <ReturnedCard key={s.id} syllabus={s} />)}
              </div>
            )}
          </div>


        </TabsContent>
      </Tabs>
    </div>
  );
}
