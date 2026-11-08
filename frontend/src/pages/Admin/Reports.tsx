import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  FileUp,
  Clock,
  CheckCircle2,
  Download,
  Search,
  FileSpreadsheet,
  Eye,
  FileText,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { useSemester } from '@/contexts/SemesterContext';
import { STATUS_LABELS, SyllabusStatus, COLLEGES, DEPARTMENTS } from '@/types';
import { VersionLabel } from '@/components/VersionLabel';
import { StatusBadge } from '@/components/StatusBadge';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

// --- Types -------------------------------------------------------------------

type ApprovalStatus =
  | 'draft'
  | 'submitted'
  | 'under_review_peer'
  | 'under_review_dept_head'
  | 'under_review_dean'
  | 'under_review_citl'
  | 'under_review_vpaa'
  | 'approved'
  | 'returned';

// --- Constants ---------------------------------------------------------------

const APPROVAL_STATUS_RANK: Record<ApprovalStatus, number> = {
  approved: 8,
  under_review_vpaa: 7,
  under_review_citl: 6,
  under_review_dean: 5,
  under_review_dept_head: 4,
  under_review_peer: 3,
  submitted: 2,
  returned: 1,
  draft: 0,
};

const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  draft: 'Not Submitted',
  submitted: 'Submitted',
  under_review_peer: 'Senior Faculty Review',
  under_review_dept_head: 'Department Head Review',
  under_review_dean: 'Dean Review',
  under_review_citl: 'CITL Review',
  under_review_vpaa: 'VPAA Review',
  approved: 'Approved (Final)',
  returned: 'Returned',
};

const APPROVAL_STATUS_COLORS: Record<ApprovalStatus, { bg: string; text: string; dot: string }> = {
  draft: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-400' },
  submitted: { bg: 'bg-sky-100 dark:bg-sky-900/40', text: 'text-sky-700 dark:text-sky-400', dot: 'bg-sky-500' },
  under_review_peer: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  under_review_dept_head: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  under_review_dean: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  under_review_citl: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  under_review_vpaa: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  approved: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' },
  returned: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
};

const ALL_STATUSES = Object.keys(APPROVAL_STATUS_LABELS) as ApprovalStatus[];

// --- Component ---------------------------------------------------------------

export default function AdminReportsPage() {
  const navigate = useNavigate();
  const { syllabi, refreshSyllabi } = useData();
  const { selectedSemester } = useSemester();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCollege, setSelectedCollege] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Refresh data on mount
  React.useEffect(() => {
    refreshSyllabi();
  }, []);

  const hasActiveFilters = searchQuery || selectedCollege !== 'all' || selectedDepartment !== 'all' || selectedStatus !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCollege('all');
    setSelectedDepartment('all');
    setSelectedStatus('all');
  };

  // --- Filter by semester from context ---
  const semesterData = useMemo(() => {
    if (!selectedSemester) return syllabi;
    // DataContext already filters 'syllabi' by selectedSemester.
    // We just return it here to keep the rest of the logic unchanged.
    return syllabi;
  }, [syllabi, selectedSemester]);

  const availableColleges = useMemo(() => {
    // Return all possible colleges instead of just what's in the data
    return [...COLLEGES];
  }, []);

  const availableDepartments = useMemo(() => {
    if (selectedCollege === 'all') return [];
    return DEPARTMENTS[selectedCollege] || [];
  }, [selectedCollege]);

  // --- Apply filters ---
  const filteredSyllabi = useMemo(() => {
    if (!Array.isArray(semesterData)) return [];
    let data = semesterData;
    if (selectedCollege !== 'all') data = data.filter((s) => s.college === selectedCollege);
    if (selectedDepartment !== 'all') data = data.filter((s) => s.department === selectedDepartment);
    if (selectedStatus !== 'all') data = data.filter((s) => s.status === selectedStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (s) =>
          s.facultyName.toLowerCase().includes(q) ||
          s.courseCode.toLowerCase().includes(q) ||
          s.courseTitle.toLowerCase().includes(q),
      );
    }
    return [...data].sort(
      (a, b) =>
        (APPROVAL_STATUS_RANK[b.status as ApprovalStatus] ?? 0) -
        (APPROVAL_STATUS_RANK[a.status as ApprovalStatus] ?? 0),
    );
  }, [semesterData, selectedCollege, selectedDepartment, selectedStatus, searchQuery]);

  // --- Pagination ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredSyllabi.length / itemsPerPage) || 1;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCollege, selectedDepartment, selectedStatus]);

  const paginatedSyllabi = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredSyllabi.slice(start, start + itemsPerPage);
  }, [filteredSyllabi, currentPage, itemsPerPage]);

  // --- Group by faculty name ---
  const grouped = useMemo(() => {
    const safeSyllabi = filteredSyllabi || [];
    const map = new Map<string, typeof safeSyllabi>();
    for (const s of safeSyllabi) {
      if (!map.has(s.facultyName)) map.set(s.facultyName, []);
      map.get(s.facultyName)!.push(s);
    }
    // Sort groups so highest-ranked status group comes first
    return [...map.values()].sort(
      (ga, gb) =>
        (APPROVAL_STATUS_RANK[gb[0]?.status as ApprovalStatus] ?? 0) -
        (APPROVAL_STATUS_RANK[ga[0]?.status as ApprovalStatus] ?? 0),
    );
  }, [filteredSyllabi]);

  // --- Stats ---
  const stats = useMemo(() => {
    const safeSyllabi = filteredSyllabi || [];
    const uniqueFaculty = new Set(safeSyllabi.map((s) => s.facultyName));
    const inReviewStatuses: SyllabusStatus[] = [
      'submitted',
      'under_review_peer',
      'under_review_dept_head',
      'under_review_dean',
      'under_review_citl',
      'under_review_vpaa'
    ];

    return {
      totalFaculty: uniqueFaculty.size,
      totalSyllabi: safeSyllabi.length,
      syllabiSubmitted: safeSyllabi.filter((s) => s.status === 'approved' || inReviewStatuses.includes(s.status)).length,
      syllabiPending: safeSyllabi.filter((s) => inReviewStatuses.includes(s.status)).length,
      fullyApproved: safeSyllabi.filter((s) => s.status === 'approved').length,
    };
  }, [filteredSyllabi]);

  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    try {
      const params = new URLSearchParams();
      if (selectedCollege !== 'all') params.append('college', selectedCollege);
      if (selectedDepartment !== 'all') params.append('department', selectedDepartment);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      if (selectedSemester) params.append('semesterId', selectedSemester.id);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('format', format);
      
      const token = localStorage.getItem('auth_token');
      if (token) params.append('token', token);

      // Robustly determine API BASE - use hostname but fixed port 5000
      let API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
      if (API_BASE.includes('localhost') && window.location.hostname !== 'localhost') {
        API_BASE = `http://${window.location.hostname}:5000`;
      }
      
      const url = `${API_BASE}/syllabi/export-reports?${params.toString()}`;
      console.log("[Export] Triggering download via window.open:", url);
      
      toast({
        title: "Export started",
        description: `Generating your ${format.toUpperCase()} report...`,
      });

      // Use window.open for downloads - it's often more reliable 
      // when the server sends Content-Disposition: attachment.
      window.open(url, '_blank');

    } catch (err) {
      console.error("[Export Error]", err);
      toast({
        title: "Export failed",
        description: "An error occurred while starting the export.",
        variant: "destructive"
      });
    }
  };

  const handleTestExport = () => {
    let API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    if (API_BASE.includes('localhost') && window.location.hostname !== 'localhost') {
      API_BASE = `http://${window.location.hostname}:5000`;
    }
    const url = `${API_BASE}/syllabi/test-export`;
    console.log("[Test Export] URL:", url);
    window.open(url, '_blank');
  };

  if (!selectedSemester) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center">
          <Calendar className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">No Semester Selected</h2>
          <p className="text-muted-foreground">Please select a semester from the top bar to view reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            Reports
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            {selectedSemester
              ? `${selectedSemester.name} (${selectedSemester.code})`
              : 'All Semesters'}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Button
            variant="outline"
            className="gap-2 border-primary/30 hover:bg-primary/5 h-9 text-xs"
            onClick={() => handleExport('csv')}
          >
            <Download className="h-4 w-4" />
            Export to CSV
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-primary/30 hover:bg-primary/5 h-9 text-xs"
            onClick={() => handleExport('excel')}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export to Excel
          </Button>
        </div>
      </div>

      {/* Filters Card */}
      <Card className="shadow-soft">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between min-h-9">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Filters</CardTitle>
            </div>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <X className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            ) : (
              <div className="h-9"></div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {/* Search input */}
            <div className="relative sm:col-span-2 lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search faculty, course code, or title (e.g. IT 101, Algorithms)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </div>

            {/* College filter */}
            <div className="relative">
              <Select
                value={selectedCollege}
                onValueChange={(v) => { setSelectedCollege(v); setSelectedDepartment('all'); }}
              >
                <SelectTrigger className="h-10 w-full min-w-0">
                  <div className="flex items-center w-full overflow-hidden">
                    <Building2 className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">
                      <SelectValue placeholder="College" />
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-[300px] min-w-[var(--radix-select-trigger-width)]">
                  <SelectItem value="all" className="text-sm truncate">All Colleges</SelectItem>
                  {availableColleges.map((c) => (
                    <SelectItem key={c} value={c} className="text-sm truncate">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Program filter */}
            <div className="relative">
              <Select
                value={selectedDepartment}
                onValueChange={setSelectedDepartment}
                disabled={selectedCollege === 'all'}
              >
                <SelectTrigger className="h-10 w-full min-w-0">
                  <div className="flex items-center w-full overflow-hidden">
                    <Users className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">
                      <SelectValue placeholder={selectedCollege === 'all' ? 'Select college first' : 'Program'} />
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-[300px] min-w-[var(--radix-select-trigger-width)]">
                  <SelectItem value="all" className="text-sm truncate">All Programs</SelectItem>
                  {availableDepartments.map((d) => (
                    <SelectItem key={d} value={d} className="text-sm truncate">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status filter */}
            <div className="relative">
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-10 w-full min-w-0">
                  <div className="flex items-center w-full overflow-hidden">
                    <FileText className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">
                      <SelectValue placeholder="Status" />
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-[300px] min-w-[var(--radix-select-trigger-width)]">
                  <SelectItem value="all" className="text-sm truncate">All Statuses</SelectItem>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-sm truncate">{APPROVAL_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Total Faculty', value: stats.totalFaculty, icon: Users, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
          { title: 'Total Syllabi', value: stats.totalSyllabi, icon: FileText, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
          { title: 'Under Review', value: stats.syllabiPending, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
          { title: 'Approved', value: stats.fullyApproved, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
        ].map((card) => (
          <Card key={card.title} className="p-4 border border-border/70 shadow-soft hover:shadow-md transition-all">
            <div className="flex items-center gap-3.5">
              <div className={`h-11 w-11 rounded-xl ${card.bg} ${card.color} flex items-center justify-center shrink-0 border ${card.border}`}>
                <card.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-foreground leading-none">{card.value}</p>
                <p className="text-xs font-medium text-muted-foreground mt-1.5 truncate">{card.title}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Faculty Reports Table ────────────────────────────────────────── */}
      <div className="border border-border/70 rounded-xl overflow-hidden shadow-xs bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/70 text-muted-foreground border-b border-border/80">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider w-10">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[90px]">Syllabus ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[180px]">Faculty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[160px]">Program</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[110px]">Course Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[200px]">Course Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[120px]">Semester</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[110px]">Updated</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[210px]">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider min-w-[80px]">Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredSyllabi.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-muted-foreground">
                    <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm font-medium">No syllabus records found.</p>
                    <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters or search query.</p>
                  </td>
                </tr>
              )}

              {paginatedSyllabi.map((syllabus, index) => {
                const rowNumber = (currentPage - 1) * itemsPerPage + index + 1;
                const stripeBg = index % 2 === 0 ? '' : 'bg-muted/20';

                return (
                  <tr
                    key={syllabus.id}
                    className={`
                      border-b border-border/50 transition-colors hover:bg-muted/40
                      ${stripeBg}
                    `}
                  >
                    {/* Row number */}
                    <td className="px-4 py-3.5 text-muted-foreground text-xs">{rowNumber}</td>

                    {/* Syllabus Tracking ID */}
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                        {syllabus.trackingId || '—'}
                      </span>
                    </td>

                    {/* Faculty Name */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0 border border-primary/20">
                          {(syllabus.facultyName?.[0] || 'F').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{syllabus.facultyName}</p>
                          <p className="text-xs text-muted-foreground truncate">{syllabus.college}</p>
                        </div>
                      </div>
                    </td>

                    {/* Program */}
                    <td className="px-4 py-3.5 text-muted-foreground text-xs font-medium">
                      {syllabus.department || '—'}
                    </td>

                    {/* Course Code */}
                    <td className="px-4 py-3.5 font-mono font-medium text-foreground text-xs">
                      {syllabus.courseCode}
                    </td>

                    {/* Course Title */}
                    <td
                      className="px-4 py-3.5 text-foreground max-w-[200px] truncate text-sm"
                      title={syllabus.courseTitle}
                    >
                      {syllabus.courseTitle}
                    </td>

                    {/* Semester */}
                    <td className="px-4 py-3.5 text-muted-foreground text-xs whitespace-nowrap">
                      {syllabus.semesterPeriod}
                    </td>

                    {/* Updated */}
                    <td className="px-4 py-3.5 text-muted-foreground text-xs whitespace-nowrap">
                      {(() => {
                        try {
                          return syllabus.updatedAt ? format(new Date(syllabus.updatedAt), 'MMM d, yyyy') : 'N/A';
                        } catch (e) {
                          return 'Invalid Date';
                        }
                      })()}
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <VersionLabel version={syllabus.version} size="sm" />
                        <StatusBadge status={syllabus.status as SyllabusStatus} size="sm" />
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3.5 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/syllabus/${syllabus.id}`)}
                        className="h-8 w-8 p-0 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
                        title="View syllabus details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredSyllabi.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-border/70 bg-card">
            <div className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
              <span className="font-semibold text-foreground">{Math.min(currentPage * itemsPerPage, filteredSyllabi.length)}</span> of{' '}
              <span className="font-semibold text-foreground">{filteredSyllabi.length}</span> records
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="h-8 w-8 p-0"
                  title="First page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 w-8 p-0"
                  title="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {(() => {
                  const pages = [];
                  if (totalPages <= 5) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                  } else {
                    if (currentPage <= 3) {
                      pages.push(1, 2, 3, 4, '...', totalPages);
                    } else if (currentPage >= totalPages - 2) {
                      pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
                    } else {
                      pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
                    }
                  }
                  return pages.map((page, idx) =>
                    page === '...' ? (
                      <span key={`dots-${idx}`} className="px-2 text-xs text-muted-foreground">...</span>
                    ) : (
                      <Button
                        type="button"
                        key={page}
                        variant={currentPage === page ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(page as number)}
                        className="h-8 w-8 p-0 text-xs"
                      >
                        {page}
                      </Button>
                    ),
                  );
                })()}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 p-0"
                  title="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 p-0"
                  title="Last page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer note ──────────────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground text-center pt-2">
        Showing {filteredSyllabi.length} syllab{filteredSyllabi.length !== 1 ? 'i' : 'us'} across{' '}
        {stats.totalFaculty} faculty member{stats.totalFaculty !== 1 ? 's' : ''}.{' '}
        View and export only — no edit access on this page.
      </p>
    </div>
  );
}
