import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Building,
  Users,
  SortDesc,
  SortAsc,
  Search,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { SyllabusStatus, Syllabus } from '@/types';

export default function ReviewSyllabiPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { syllabi, allSyllabi, getSyllabiForRole } = useData();

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [activeTab, setActiveTab] = useState<'peer' | 'collaborating'>('peer');
  const [searchQuery, setSearchQuery] = useState('');

  const showCollaborating = user?.role === 'faculty';

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

  const pendingSyllabi = useMemo(() => {
    if (!user) return [];
    const raw = getSyllabiForRole(user.id, user.role, user.college, user.department)
      .sort((a, b) => {
        const timeA = new Date(a.updatedAt).getTime();
        const timeB = new Date(b.updatedAt).getTime();
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
    return filterByQuery(raw);
  }, [getSyllabiForRole, user, sortOrder, searchQuery]);

  const collaboratingSyllabi = useMemo(() => {
    if (!user || !showCollaborating) return [];
    const earlyStatuses = ['draft', 'submitted', 'under_review_peer'];
    const raw = syllabi.filter(s => {
      if (s.facultyId === user.id) return false;
      if (!Array.isArray(s.collaborators) || !s.collaborators.includes(user.id)) return false;
      if (!earlyStatuses.includes(s.status)) return false;
      // Exclude if this collaborator has already approved (forwarded) this version
      const currentVersion = s.version || 1;
      const alreadyApproved = s.reviewHistory?.some(r =>
        r.reviewerId === user.id &&
        (r.action === 'forwarded' || r.action === 'approved') &&
        (r.version ?? 1) === currentVersion
      );
      return !alreadyApproved;
    })
    .sort((a, b) => {
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
    return filterByQuery(raw);
  }, [syllabi, user, sortOrder, searchQuery, showCollaborating]);

  const toggleGroup = (groupId: string, open: boolean) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (open) {
        newSet.add(groupId);
      } else {
        newSet.delete(groupId);
      }
      return newSet;
    });
  };

  if (!user) return null;

  const groupSyllabi = () => {
    const targetSyllabi = showCollaborating && activeTab === 'collaborating' ? collaboratingSyllabi : pendingSyllabi;

    if (showCollaborating && activeTab === 'collaborating') {
      return { type: 'none' as const, groups: { All: targetSyllabi } };
    }

    if (user.role === 'dean') {
      const groups: Record<string, Syllabus[]> = {};
      targetSyllabi.forEach((s) => {
        const key = s.department || 'Other';
        groups[key] = groups[key] || [];
        groups[key].push(s);
      });
      return { type: 'department' as const, groups };
    }

    if (user.role === 'citl' || user.role === 'vpaa') {
      const groups: Record<string, Syllabus[]> = {};
      targetSyllabi.forEach((s) => {
        const key = s.college || 'Other';
        groups[key] = groups[key] || [];
        groups[key].push(s);
      });
      return { type: 'college' as const, groups };
    }

    return { type: 'none' as const, groups: { All: targetSyllabi } };
  };

  const groupedSyllabi = groupSyllabi();
  const groupEntries = Object.entries(groupedSyllabi.groups).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const renderSyllabusCard = (syllabus: Syllabus) => {
    // Get the relevant timestamp for display based on role
    let forwardedAt: string | undefined;
    switch (user.role) {
      case 'faculty': forwardedAt = showCollaborating && activeTab === 'collaborating' ? syllabus.updatedAt : syllabus.forwardedToSeniorFacultyAt; break;
      case 'dept_head': forwardedAt = syllabus.forwardedToDeptHeadAt; break;
      case 'dean': forwardedAt = syllabus.forwardedToDeanAt; break;
      case 'citl': forwardedAt = syllabus.forwardedToCITLAt; break;
      case 'vpaa': forwardedAt = syllabus.forwardedToVPAAAt; break;
    }

    return (
      <Card key={syllabus.id} className="shadow-soft mb-3 ml-2">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-warning" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  {syllabus.courseCode} – {syllabus.courseTitle}
                  {syllabus.version > 1 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold bg-yellow-50 text-yellow-600 border border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-900/50 align-middle shrink-0 ml-1.5">
                      v{syllabus.version}
                    </span>
                  )}
                  {(!syllabus.openedBy || !syllabus.openedBy.includes(user.id)) && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 ml-2 align-middle">
                      NEW
                    </span>
                  )}
                </h3>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground mt-0.5">
                  <span>{syllabus.facultyName}</span>
                  <span>•</span>
                  <span>{syllabus.department}</span>
                  {groupedSyllabi.type === 'college' && (
                    <>
                      <span>•</span>
                      <span>{syllabus.college}</span>
                    </>
                  )}
                  <span>•</span>
                  <span title="When it reached your stage">
                    Submitted: {new Date(forwardedAt || syllabus.createdAt).toLocaleDateString()} {new Date(forwardedAt || syllabus.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/syllabus/${syllabus.id}`)}
              >
                View Details
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  navigate(`/reviewer/syllabi/${syllabus.id}/review`, {
                    state: {
                      from: location.pathname,
                      // 'peer' tab = Senior Faculty Reviewer, 'collaborating' tab = Peer Reviewer (collaborator)
                      reviewAs: showCollaborating && activeTab === 'collaborating' 
                        ? 'collaborator_reviewer'
                        : (user.role === 'faculty' ? 'faculty_peer_reviewer' : undefined),
                    },
                  })
                }
              >
                <FileText className="h-4 w-4 mr-1" />
                Review
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderGroupedContent = () => {
    const targetList = showCollaborating && activeTab === 'collaborating' ? collaboratingSyllabi : pendingSyllabi;

    if (targetList.length === 0) {
      return (
        <Card className="shadow-soft">
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="h-16 w-16 text-success mx-auto mb-4" />
            <h3 className="text-xl font-semibold">All caught up!</h3>
            <p className="text-muted-foreground">
              No syllabi pending your review.
            </p>
          </CardContent>
        </Card>
      );
    }

    if (groupedSyllabi.type === 'none') {
      return <div className="space-y-4">{targetList.map(renderSyllabusCard)}</div>;
    }

    return (
      <div className="space-y-4">
        {groupEntries.map(([groupName, syllabiInGroup]) => {
          const groupId = `${groupedSyllabi.type}-${groupName}`;
          const isExpanded = expandedGroups.has(groupId);

          return (
            <Collapsible
              key={groupId}
              open={isExpanded}
              onOpenChange={(open) => toggleGroup(groupId, open)}
              className="border border-border rounded-lg overflow-hidden"
            >
              <CollapsibleTrigger asChild>
                <button className="w-full text-left">
                  <div className="flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        {groupedSyllabi.type === 'college' ? (
                          <Building className="h-5 w-5 text-primary" />
                        ) : (
                          <Users className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold">{groupName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {syllabiInGroup.length} syllabus
                          {syllabiInGroup.length !== 1 ? 'i' : ''} pending review
                        </p>
                      </div>
                    </div>

                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5" />
                    ) : (
                      <ChevronRight className="h-5 w-5" />
                    )}
                  </div>
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="p-4 pt-2 space-y-2">
                  {syllabiInGroup.map(renderSyllabusCard)}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Review Syllabi</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Syllabi awaiting your review
            {groupedSyllabi.type !== 'none' && (
              <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                Grouped by {groupedSyllabi.type}
              </span>
            )}
          </p>
        </div>
      </div>

      {showCollaborating ? (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'peer' | 'collaborating')} className="w-full">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
            <TabsList className="grid w-full lg:w-96 grid-cols-2 h-9">
              <TabsTrigger value="peer" className="relative text-xs">
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                {user.role === 'faculty' ? 'Senior Review' : 'Pending Review'}
                {pendingSyllabi.length > 0 && (
                  <span className="ml-1.5 bg-primary text-white text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                    {pendingSyllabi.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="collaborating" className="relative text-xs">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Collaborating
                {collaboratingSyllabi.length > 0 && (
                  <span className="ml-1.5 bg-primary/80 text-white text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                    {collaboratingSyllabi.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search course or faculty (e.g. IT 101, Dr. Smith)..."
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

              <Select
                value={sortOrder}
                onValueChange={(value) => setSortOrder(value as 'asc' | 'desc')}
              >
                <SelectTrigger className="w-full sm:w-40 h-9 text-xs rounded-lg">
                  <div className="flex items-center gap-1.5 truncate">
                    {sortOrder === 'desc' ? <SortDesc className="h-3.5 w-3.5 text-muted-foreground" /> : <SortAsc className="h-3.5 w-3.5 text-muted-foreground" />}
                    <SelectValue placeholder="Sort Order" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc" className="text-xs">Latest to Oldest</SelectItem>
                  <SelectItem value="asc" className="text-xs">Oldest to Latest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <TabsContent value="peer" className="mt-0">
            {renderGroupedContent()}
          </TabsContent>
          <TabsContent value="collaborating" className="mt-0">
            {renderGroupedContent()}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="w-full space-y-5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="text-sm font-medium text-muted-foreground">
              {pendingSyllabi.length} {pendingSyllabi.length === 1 ? 'syllabus' : 'syllabi'} awaiting review
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search course or faculty (e.g. IT 101, Dr. Smith)..."
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

              <Select
                value={sortOrder}
                onValueChange={(value) => setSortOrder(value as 'asc' | 'desc')}
              >
                <SelectTrigger className="w-full sm:w-40 h-9 text-xs rounded-lg">
                  <div className="flex items-center gap-1.5 truncate">
                    {sortOrder === 'desc' ? <SortDesc className="h-3.5 w-3.5 text-muted-foreground" /> : <SortAsc className="h-3.5 w-3.5 text-muted-foreground" />}
                    <SelectValue placeholder="Sort Order" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc" className="text-xs">Latest to Oldest</SelectItem>
                  <SelectItem value="asc" className="text-xs">Oldest to Latest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {renderGroupedContent()}
        </div>
      )}
    </div>
  );
}
