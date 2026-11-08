import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, Calendar, Download, Eye, Search, X, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, 
  Users, Edit3, SortDesc, SortAsc 
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { STATUS_LABELS, Syllabus } from '@/types';
import { VersionLabel } from '@/components/VersionLabel';
import { StatusBadge } from '@/components/StatusBadge';

// Helper function to shorten status text
const shortenStatus = (status: string): string => {
  return STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status;
};

export default function FacultyHistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { syllabi } = useData();

  // State for filters and pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [collabPage, setCollabPage] = useState(1);
  const itemsPerPage = 10;

  // Get faculty's own syllabi
  const facultySyllabi = useMemo(() => {
    return syllabi.filter(s => s.facultyId === user?.id);
  }, [syllabi, user]);

  // Syllabi where I am a collaborator
  const collaboratingSyllabi = useMemo(() => {
    return syllabi.filter(s =>
      s.facultyId !== user?.id &&
      Array.isArray(s.collaborators) &&
      s.collaborators.includes(user?.id ?? '')
    );
  }, [syllabi, user]);

  // Filter and sort faculty's own syllabi
  const sortedSyllabi = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return (facultySyllabi || [])
      .filter(syllabus => {
        const matchesSearch = 
          !query ||
          (syllabus.courseCode || '').toLowerCase().includes(query) ||
          (syllabus.courseTitle || '').toLowerCase().includes(query) ||
          (syllabus.department || '').toLowerCase().includes(query) ||
          (syllabus.fileName || '').toLowerCase().includes(query);
        
        const matchesStatus = selectedStatus === 'all' || syllabus.status === selectedStatus;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || a.updatedAt || Date.now()).getTime();
        const dateB = new Date(b.createdAt || b.updatedAt || Date.now()).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      });
  }, [facultySyllabi, searchQuery, selectedStatus, sortOrder]);

  // Filter and sort collaborating syllabi
  const sortedCollabSyllabi = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return (collaboratingSyllabi || [])
      .filter(syllabus => {
        const matchesSearch = 
          !query ||
          (syllabus.courseCode || '').toLowerCase().includes(query) ||
          (syllabus.courseTitle || '').toLowerCase().includes(query) ||
          ((syllabus.facultyName || '').toLowerCase().includes(query)) ||
          (syllabus.department || '').toLowerCase().includes(query) ||
          (syllabus.fileName || '').toLowerCase().includes(query);
        
        const matchesStatus = selectedStatus === 'all' || syllabus.status === selectedStatus;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || a.updatedAt || Date.now()).getTime();
        const dateB = new Date(b.createdAt || b.updatedAt || Date.now()).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      });
  }, [collaboratingSyllabi, searchQuery, selectedStatus, sortOrder]);

  // Pagination for My History
  const totalPages = Math.ceil(sortedSyllabi.length / itemsPerPage);
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedSyllabi.slice(start, start + itemsPerPage);
  }, [sortedSyllabi, currentPage]);

  // Pagination for Collaborating
  const collabTotalPages = Math.ceil(sortedCollabSyllabi.length / itemsPerPage);
  const currentCollabItems = useMemo(() => {
    const start = (collabPage - 1) * itemsPerPage;
    return sortedCollabSyllabi.slice(start, start + itemsPerPage);
  }, [sortedCollabSyllabi, collabPage]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedStatus('all');
    setSortOrder('desc');
    setCurrentPage(1);
    setCollabPage(1);
  };

  const hasActiveFilters = searchQuery !== '' || selectedStatus !== 'all' || sortOrder !== 'desc';

  const handleDownload = (syllabus: Syllabus, e: React.MouseEvent) => {
    e.stopPropagation();
    let API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    if (API_BASE.includes('localhost') && window.location.hostname !== 'localhost') {
      API_BASE = `http://${window.location.hostname}:5000`;
    }
    const token = localStorage.getItem('auth_token');
    const url = `${API_BASE}/syllabi/bulk-download?ids=${syllabus.id}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    const link = document.createElement('a');
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!user) return null;

  // Render a Single Syllabus Card
  const renderCard = (syllabus: Syllabus, isCollab = false) => (
    <Card 
      key={syllabus.id} 
      className="shadow-soft hover:shadow-md transition-all duration-200 cursor-pointer group border-border/50"
      onClick={() => navigate(`/syllabus/${syllabus.id}`)}
    >
      <CardContent className="p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              {isCollab ? <Users className="h-5 w-5 text-primary" /> : <FileText className="h-5 w-5 text-primary" />}
            </div>
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {syllabus.courseCode} - {syllabus.courseTitle}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isCollab && <span className="font-medium text-foreground/80">Owner: {syllabus.facultyName || 'Unknown'} • </span>}
                {syllabus.department} • {syllabus.semesterPeriod}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <VersionLabel version={syllabus.version} size="sm" />
            <StatusBadge status={syllabus.status} size="sm" />
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>Submitted on {format(new Date(syllabus.createdAt || syllabus.updatedAt || Date.now()), 'MMM d, yyyy h:mm a')}</span>
          </div>
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {syllabus.status === 'returned' && isCollab && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/faculty/forms-editor/${syllabus.id}`)}
                className="h-7 text-xs px-2.5 text-primary border-primary/30 hover:bg-primary/10"
              >
                <Edit3 className="h-3.5 w-3.5 mr-1" />
                Revise
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/syllabus/${syllabus.id}`)}
              className="h-7 text-xs px-2 group-hover:bg-primary/10 group-hover:text-primary transition-colors"
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              View Details
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => handleDownload(syllabus, e)}
              className="h-7 text-xs px-2 group-hover:bg-primary/10 group-hover:text-primary transition-colors"
              title="Download"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Download
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Render Pagination
  const renderPagination = (page: number, total: number, count: number, onPageChange: (p: number) => void) => {
    if (total <= 1) return null;
    return (
      <div className="border-t border-border/60 pt-4 mt-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground text-center sm:text-left">
            Showing <span className="font-semibold text-foreground">{(page - 1) * itemsPerPage + 1}-{Math.min(page * itemsPerPage, count)}</span> of{' '}
            <span className="font-semibold text-foreground">{count}</span> submissions
          </div>
          
          <div className="flex items-center space-x-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(1)}
              disabled={page === 1}
              className="h-8 w-8 p-0"
              title="First Page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className="h-8 w-8 p-0"
              title="Previous Page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            {Array.from({ length: total }, (_, i) => i + 1).map((p) => (
              <Button
                key={p}
                variant={page === p ? "default" : "outline"}
                size="sm"
                onClick={() => onPageChange(p)}
                className="h-8 w-8 p-0 text-xs font-medium"
              >
                {p}
              </Button>
            ))}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === total}
              className="h-8 w-8 p-0"
              title="Next Page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(total)}
              disabled={page === total}
              className="h-8 w-8 p-0"
              title="Last Page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Submission History</h1>
          <p className="text-muted-foreground mt-1">Track and review syllabus submissions and collaborative workflows</p>
        </div>
        <Badge variant="secondary" className="w-fit text-xs px-3 py-1 font-medium">
          <FileText className="h-3.5 w-3.5 mr-1 text-primary" />
          {facultySyllabi.length} Total Submissions
        </Badge>
      </div>

      {/* Tabs and Compact Filter Toolbar */}
      <Tabs defaultValue="my-history" className="w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
          <TabsList className="grid w-full lg:w-80 grid-cols-2 h-9">
            <TabsTrigger value="my-history" className="relative text-xs">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              My History
              {facultySyllabi.length > 0 && (
                <span className="ml-1.5 bg-primary text-white text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                  {facultySyllabi.length}
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

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search course (e.g. IT 101, Algorithms)..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); setCollabPage(1); }}
                className="pl-8 pr-7 h-9 text-xs rounded-lg"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setCurrentPage(1); setCollabPage(1); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setCurrentPage(1); setCollabPage(1); }}>
              <SelectTrigger className="h-9 w-full sm:w-40 text-xs rounded-lg">
                <div className="flex items-center gap-1.5 truncate">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="All Statuses" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                {['draft', 'submitted', 'under_review_peer', 'under_review_dept_head', 'under_review_dean', 'under_review_citl', 'under_review_vpaa', 'approved', 'returned'].map(status => (
                  <SelectItem key={status} value={status} className="text-xs">
                    {shortenStatus(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortOrder} onValueChange={(v) => { setSortOrder(v as 'asc' | 'desc'); setCurrentPage(1); setCollabPage(1); }}>
              <SelectTrigger className="w-full sm:w-40 h-9 text-xs rounded-lg">
                <div className="flex items-center gap-1.5 truncate">
                  {sortOrder === 'desc' ? <SortDesc className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <SortAsc className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <SelectValue placeholder="Sort Order" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc" className="text-xs">Latest to Oldest</SelectItem>
                <SelectItem value="asc" className="text-xs">Oldest to Latest</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* TAB 1: MY HISTORY */}
        <TabsContent value="my-history" className="mt-0">
          {sortedSyllabi.length === 0 ? (
            <Card className="shadow-soft border-dashed border-2">
              <CardContent className="p-12 text-center">
                <div className="h-14 w-14 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-7 w-7 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">No Submissions Found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {hasActiveFilters ? "No submissions match your active filters." : "You haven't submitted any syllabus yet."}
                </p>
                {hasActiveFilters ? (
                  <Button variant="link" onClick={clearFilters} className="text-primary">
                    Clear all filters
                  </Button>
                ) : (
                  <Button variant="default" size="sm" onClick={() => navigate('/faculty/upload')}>
                    Upload Your First Syllabus
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {currentItems.map((syllabus) => renderCard(syllabus, false))}
              </div>

              {renderPagination(currentPage, totalPages, sortedSyllabi.length, setCurrentPage)}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: COLLABORATING */}
        <TabsContent value="collaborating" className="mt-0">
          {sortedCollabSyllabi.length === 0 ? (
            <Card className="shadow-soft border-dashed border-2">
              <CardContent className="p-12 text-center">
                <div className="h-14 w-14 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="h-7 w-7 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">No Collaborating Syllabi</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {hasActiveFilters ? "No collaborating syllabi match your active filters." : "You are not listed as a collaborator on any syllabus."}
                </p>
                {hasActiveFilters && (
                  <Button variant="link" onClick={clearFilters} className="text-primary">
                    Clear all filters
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {currentCollabItems.map((syllabus) => renderCard(syllabus, true))}
              </div>

              {renderPagination(collabPage, collabTotalPages, sortedCollabSyllabi.length, setCollabPage)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
