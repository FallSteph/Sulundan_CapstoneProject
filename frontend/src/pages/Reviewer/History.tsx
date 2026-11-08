import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, CheckCircle2, XCircle, Forward, Calendar, Eye, Search, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SortDesc, SortAsc } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/StatusBadge';
import { VersionLabel } from '@/components/VersionLabel';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { Syllabus } from '@/types';

export default function ReviewerHistoryPage() {
  const navigate = useNavigate();
  const { syllabi } = useData();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const reviewedSyllabi = useMemo(() => {
    if (!user) return [];
    
    let list: Syllabus[] = [];
    if (user.role === 'faculty') {
      // Faculty (peer reviewer) sees syllabi touched by anyone in the peer reviewer role in their department
      // Exclude those still in the under_review_peer stage and their own uploads
      list = (syllabi || []).filter(s => 
        s.status !== 'under_review_peer' &&
        s.facultyId !== user.id &&
        s.department === user.department &&
        (s.reviewHistory || []).some(r => r.reviewerRole === 'faculty' && r.reviewerId !== s.facultyId)
      );
    } else if (user.role === 'dept_head') {
      list = (syllabi || []).filter(s => 
        (s.department === user.department || (s.reviewHistory || []).some(r => r.reviewerId === user.id)) &&
        (s.reviewHistory || []).some(r => 
          ['dept_head', 'dean', 'citl', 'vpaa'].includes(r.reviewerRole) ||
          (r.reviewerRole === 'faculty' && r.reviewerId !== s.facultyId)
        )
      );
    } else if (user.role === 'dean') {
      list = (syllabi || []).filter(s => 
        (s.college === user.college || (s.reviewHistory || []).some(r => r.reviewerId === user.id)) &&
        (s.reviewHistory || []).some(r => 
          ['dean', 'citl', 'vpaa'].includes(r.reviewerRole) ||
          (s.reviewHistory || []).length > 0
        )
      );
    } else {
      // Reviewers (CITL / VPAA / Admin) see syllabi that entered the review cycle
      const reviewerRoles = ['dept_head', 'dean', 'citl', 'vpaa'];
      list = (syllabi || []).filter(s => 
        (s.reviewHistory || []).some(r => 
          reviewerRoles.includes(r.reviewerRole) ||
          (r.reviewerRole === 'faculty' && r.reviewerId !== s.facultyId)
        )
      );
    }

    return list.filter(s => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = (s.courseCode || '').toLowerCase().includes(q) || 
                           (s.courseTitle || '').toLowerCase().includes(q) ||
                           (s.facultyName || '').toLowerCase().includes(q) ||
                           (s.department || '').toLowerCase().includes(q);
      const matchesStatus = selectedStatus === 'all' || s.status === selectedStatus;
      
      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || Date.now()).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || Date.now()).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [syllabi, user, searchQuery, selectedStatus, sortOrder]);

  if (!user) return null;

  const totalPages = Math.ceil(reviewedSyllabi.length / itemsPerPage);
  const currentItems = reviewedSyllabi.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedStatus('all');
    setSortOrder('desc');
    setCurrentPage(1);
  };

  const hasActiveFilters = searchQuery !== '' || selectedStatus !== 'all' || sortOrder !== 'desc';

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'approved':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'returned':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'forwarded':
        return <Forward className="h-4 w-4 text-warning" />;
      default:
        return null;
    }
  };

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case 'approved':
        return 'default';
      case 'returned':
        return 'destructive';
      case 'forwarded':
        return 'warning';
      default:
        return 'outline';
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Review History</h1>
          <p className="text-muted-foreground mt-1">Track and review syllabus review records and audit history</p>
        </div>
        <Badge variant="secondary" className="w-fit text-xs px-3 py-1 font-medium">
          <FileText className="h-3.5 w-3.5 mr-1 text-primary" />
          {reviewedSyllabi.length} Reviewed Submissions
        </Badge>
      </div>

      {/* Compact Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search course or instructor (e.g. CS 101, Dr. Jane)..."
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

          {/* Status - Hidden for Peer Reviewer */}
          {user.role !== 'faculty' && (
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="h-9 w-full sm:w-44 text-xs rounded-lg">
                <div className="flex items-center gap-1.5 truncate">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="All Statuses" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                <SelectItem value="submitted" className="text-xs">Peer Review</SelectItem>
                <SelectItem value="under_review_peer" className="text-xs">Senior Faculty</SelectItem>
                <SelectItem value="under_review_dept_head" className="text-xs">Dept. Head</SelectItem>
                <SelectItem value="under_review_dean" className="text-xs">Dean</SelectItem>
                <SelectItem value="under_review_citl" className="text-xs">CITL</SelectItem>
                <SelectItem value="under_review_vpaa" className="text-xs">VPAA</SelectItem>
                <SelectItem value="approved" className="text-xs">Approved</SelectItem>
                <SelectItem value="returned" className="text-xs">Returned</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Sort dropdown */}
          <Select
            value={sortOrder}
            onValueChange={(value) => setSortOrder(value as 'asc' | 'desc')}
          >
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

      {reviewedSyllabi.length === 0 ? (
        <Card className="shadow-soft border-dashed border-2">
          <CardContent className="p-12 text-center">
            <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No Records Found</h3>
            <p className="text-muted-foreground">Try adjusting your filters or search query.</p>
            {hasActiveFilters && (
              <Button variant="link" onClick={clearFilters} className="mt-2 text-primary">
                Clear all filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {currentItems.map((syllabus) => {
              const myReviews = (syllabus.reviewHistory || []).filter(r => r.reviewerId === user.id);
              const myReview = myReviews[myReviews.length - 1]; // Get latest action by this user
              
              const relevantReview = [...(syllabus.reviewHistory || [])].reverse().find(r => 
                user.role === 'faculty' 
                  ? r.reviewerRole === 'faculty' && r.reviewerId !== syllabus.facultyId
                  : r.reviewerRole === user.role
              );
              const displayTimestamp = relevantReview?.timestamp || syllabus.updatedAt || syllabus.createdAt || new Date().toISOString();

              return (
                <Card 
                  key={syllabus.id} 
                  className="shadow-soft hover:shadow-md transition-all duration-200 cursor-pointer group border-border/50"
                  onClick={() => navigate(`/syllabus/${syllabus.id}`)}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {syllabus.courseCode} - {syllabus.courseTitle}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">{syllabus.facultyName} • {syllabus.department} • {syllabus.semesterPeriod}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {myReview ? (
                          <Badge variant={getActionBadgeVariant(myReview.action)} className="capitalize px-2.5 py-0.5 rounded-full text-xs">
                            {getActionIcon(myReview.action)}
                            <span className="ml-1.5">{myReview.action}</span>
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="capitalize px-2.5 py-0.5 rounded-full text-xs">
                            <Forward className="h-3.5 w-3.5 mr-1.5" />
                            Forwarded
                          </Badge>
                        )}
                        <VersionLabel version={syllabus.version} size="sm" />
                        <StatusBadge status={syllabus.status} size="sm" />
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Reviewed on {format(new Date(displayTimestamp), 'MMM d, yyyy h:mm a')}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-xs px-2 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="border-t border-border/60 pt-4 mt-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-muted-foreground text-center sm:text-left">
                  Showing <span className="font-semibold text-foreground">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, reviewedSyllabi.length)}</span> of{' '}
                  <span className="font-semibold text-foreground">{reviewedSyllabi.length}</span> reviews
                </div>
                
                <div className="flex items-center space-x-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="h-8 w-8 p-0"
                    title="First Page"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="h-8 w-8 p-0"
                    title="Previous Page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <Button
                      key={p}
                      variant={currentPage === p ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(p)}
                      className="h-8 w-8 p-0 text-xs font-medium"
                    >
                      {p}
                    </Button>
                  ))}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8 p-0"
                    title="Next Page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8 p-0"
                    title="Last Page"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
