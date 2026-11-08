import React, { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  UserCheck,
  UserX,
  FileUp,
  Clock,
  CheckCircle2,
  Download,
  Search,
  ShieldCheck,
  FileSpreadsheet,
  Building2,
  FileText,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from 'lucide-react';
import {
  REPORT_STATUS_LABELS,
  REPORT_STATUS_COLORS,
  type FacultyReportRow,
  type ReportApprovalStatus,
} from '@/mock/reportsData';
import { useSemester } from '@/contexts/SemesterContext';
import { isSyllabusInSemester } from '@/utils/semesterStorage';
import { useData } from '@/contexts/DataContext';
import { SyllabusStatus } from '@/types';
import { VersionLabel } from '@/components/VersionLabel';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/hooks/use-toast';

// --- Helpers ---------------------------------------------------------------

function getUniqueDepartments(rows: FacultyReportRow[]): string[] {
  return [...new Set(rows.map((r) => r.department))].sort();
}

function groupByFaculty(rows: FacultyReportRow[]): FacultyReportRow[][] {
  const map = new Map<string, FacultyReportRow[]>();
  for (const row of rows) {
    if (!map.has(row.facultyId)) map.set(row.facultyId, []);
    map.get(row.facultyId)!.push(row);
  }
  return [...map.values()];
}

// --- Status Mapping ----------------------------------------------------------

function mapSyllabusStatusToReportStatus(status: SyllabusStatus): ReportApprovalStatus {
  switch (status) {
    case 'draft': return 'not_yet_submitted';
    case 'submitted':
    case 'under_review_peer':
    case 'under_review_dept_head':
      return 'submitted_pending_dept';
    case 'under_review_dean': return 'approved_dept_head';
    case 'under_review_citl': return 'approved_citl';
    case 'under_review_vpaa': return 'forwarded_vpaa';
    case 'approved': return 'approved_vpaa';
    case 'returned': return 'returned_for_revision';
    default: return 'not_yet_submitted';
  }
}

// Approval status rank: higher = more advanced (newest activity first)
const APPROVAL_STATUS_RANK: Record<ReportApprovalStatus, number> = {
  approved_vpaa: 7,
  forwarded_vpaa: 6,
  approved_citl: 5,
  forwarded_citl: 4,
  approved_dept_head: 3,
  submitted_pending_dept: 2,
  returned_for_revision: 1,
  not_yet_submitted: 0,
};

// --- Component ---------------------------------------------------------------

export default function ReportsPage() {
  const { user } = useAuth();
  const { selectedSemester } = useSemester();
  const { allSyllabi, allUsers } = useData();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const hasActiveFilters = searchQuery || selectedDepartment !== 'all' || selectedStatus !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedDepartment('all');
    setSelectedStatus('all');
  };

  const scopedData = useMemo(() => {
    if (!user) return [];
    
    // Process live data (from database/DataContext)
    const liveData: FacultyReportRow[] = allSyllabi.map(s => {
      const faculty = allUsers.find(u => String(u.id) === String(s.facultyId));
      return {
        id: s.id,
        trackingId: s.trackingId || '',
        facultyId: s.facultyId,
        facultyName: s.facultyName || (faculty ? `${faculty.firstName} ${faculty.lastName}` : 'Unknown Faculty'),
        employmentStatus: (faculty?.isActive === false) ? 'Inactive' : 'Active',
        semesterId: s.semesterId || '1',
        semesterPeriod: s.semesterPeriod || '1st Semester 2024-2025',
        college: s.college || faculty?.college || 'Unknown College',
        department: s.department || faculty?.department || 'Unknown Department',
        subjectCode: s.courseCode,
        subjectName: s.courseTitle,
        version: s.version ?? 1,
        section: (s as any).section || 'N/A', // Try to get section if it exists
        syllabusSubmitted: s.status !== 'draft',
        approvalStatus: mapSyllabusStatusToReportStatus(s.status),
        rawStatus: s.status,
        remarks: s.feedback || '',
      };
    });

    const base = (() => {
      if (user.role === 'dept_head') {
        const userDept = (user.department || '').toLowerCase().trim();
        return liveData.filter((r) => (r.department || '').toLowerCase().trim() === userDept);
      }
      if (user.role === 'dean') {
        const userCollege = (user.college || '').toLowerCase().trim();
        return liveData.filter((r) => (r.college || '').toLowerCase().trim() === userCollege);
      }
      return [];
    })();

    if (!selectedSemester) return base;
    
    return base.filter((r) => isSyllabusInSemester(r, selectedSemester));
  }, [user, selectedSemester, allSyllabi, allUsers]);

  const availableDepartments = useMemo(
    () => getUniqueDepartments(scopedData),
    [scopedData],
  );

  const filteredData = useMemo(() => {
    let data = scopedData;
    if (selectedDepartment && selectedDepartment !== 'all') {
      data = data.filter((r) => r.department === selectedDepartment);
    }
    if (selectedStatus && selectedStatus !== 'all') {
      data = data.filter((r) => r.rawStatus === selectedStatus);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter((r) =>
        r.facultyName.toLowerCase().includes(q) ||
        r.subjectCode.toLowerCase().includes(q) ||
        r.subjectName.toLowerCase().includes(q)
      );
    }
    // Sort by most advanced approval status first (most recently active)
    return [...data].sort(
      (a, b) => APPROVAL_STATUS_RANK[b.approvalStatus] - APPROVAL_STATUS_RANK[a.approvalStatus],
    );
  }, [scopedData, selectedDepartment, selectedStatus, searchQuery]);

  // --- Pagination ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedDepartment, selectedStatus]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  const stats = useMemo(() => {
    const uniqueFaculty = new Set(filteredData.map((r) => r.facultyId));
    const activeFaculty = new Set(
      filteredData.filter((r) => r.employmentStatus === 'Active').map((r) => r.facultyId),
    );
    const inactiveFaculty = new Set(
      filteredData.filter((r) => r.employmentStatus === 'Inactive').map((r) => r.facultyId),
    );
    return {
      totalFaculty: uniqueFaculty.size,
      activeFaculty: activeFaculty.size,
      inactiveFaculty: inactiveFaculty.size,
      syllabiSubmitted: filteredData.filter((r) => r.syllabusSubmitted).length,
      syllabiPending: filteredData.filter((r) => !r.syllabusSubmitted).length,
      fullyApproved: filteredData.filter((r) => r.approvalStatus === 'approved_vpaa').length,
    };
  }, [filteredData]);

  const grouped = useMemo(() => {
    const byFaculty = groupByFaculty(filteredData);
    return byFaculty.sort(
      (ga, gb) =>
        APPROVAL_STATUS_RANK[gb[0].approvalStatus] - APPROVAL_STATUS_RANK[ga[0].approvalStatus],
    );
  }, [filteredData]);

  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    try {
      const params = new URLSearchParams();
      if (user?.college) params.append('college', user.college);
      if (selectedDepartment !== 'all') {
        params.append('department', selectedDepartment);
      } else if (user?.role === 'dept_head' && user.department) {
        params.append('department', user.department);
      }
      if (selectedStatus !== 'all') {
        params.append('status', selectedStatus);
      }
      
      if (selectedSemester) params.append('semesterId', selectedSemester.id);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('format', format);
      
      const token = localStorage.getItem('auth_token');
      if (token) params.append('token', token);

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

  if (!user || (user.role !== 'dept_head' && user.role !== 'dean')) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
        <ShieldCheck className="h-16 w-16 text-muted-foreground/40" />
        <h2 className="text-2xl font-semibold text-foreground">Access Restricted</h2>
        <p className="text-muted-foreground max-w-md">
          This page is available only for Department Heads and Deans.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            Faculty Syllabus Reports
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            {selectedSemester ? `${selectedSemester.name} (${selectedSemester.code})` : 'All Semesters'}
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search input */}
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search faculty name, course code, or title (e.g. IT 101)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </div>

            {/* Department */}
            <div className="relative">
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="h-10 w-full min-w-0">
                  <div className="flex items-center w-full overflow-hidden">
                    <Building2 className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">
                      <SelectValue placeholder="Department" />
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-[300px] min-w-[var(--radix-select-trigger-width)]">
                  <SelectItem value="all" className="text-sm truncate">All Departments</SelectItem>
                  {availableDepartments.map((d) => (
                    <SelectItem key={d} value={d} className="text-sm truncate">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
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
                  <SelectItem value="approved" className="text-sm truncate">Approved</SelectItem>
                  <SelectItem value="submitted" className="text-sm truncate">Peer Review</SelectItem>
                  <SelectItem value="under_review_peer" className="text-sm truncate">Senior Faculty Review</SelectItem>
                  <SelectItem value="under_review_dept_head" className="text-sm truncate">Dept. Head Review</SelectItem>
                  <SelectItem value="under_review_dean" className="text-sm truncate">Dean Review</SelectItem>
                  <SelectItem value="under_review_citl" className="text-sm truncate">CITL Review</SelectItem>
                  <SelectItem value="under_review_vpaa" className="text-sm truncate">VPAA Review</SelectItem>
                  <SelectItem value="returned" className="text-sm truncate">Returned</SelectItem>
                  <SelectItem value="draft" className="text-sm truncate">Draft / Not Submitted</SelectItem>
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
          { title: 'Total Syllabi', value: filteredData.length, icon: FileText, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[120px]">Employment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[160px]">Department</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[110px]">Course Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[200px]">Course Title</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider min-w-[100px]">Submitted</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[210px]">Approval Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[150px]">Remarks</th>
              </tr>
            </thead>

            <tbody>
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-muted-foreground">
                    <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm font-medium">No syllabus records found.</p>
                    <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters or search query.</p>
                  </td>
                </tr>
              )}

              {paginatedData.map((row, index) => {
                const rowNumber = (currentPage - 1) * itemsPerPage + index + 1;
                const stripeBg = index % 2 === 0 ? '' : 'bg-muted/20';

                return (
                  <tr
                    key={row.id}
                    className={`
                      border-b border-border/50 transition-colors hover:bg-muted/40
                      ${stripeBg}
                    `}
                  >
                    <td className="px-4 py-3.5 text-muted-foreground text-xs">{rowNumber}</td>

                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                        {row.trackingId || '—'}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0 border border-primary/20">
                          {(row.facultyName?.[0] || 'F').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{row.facultyName}</p>
                          <p className="text-xs text-muted-foreground truncate">{row.college}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`
                          inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium
                          ${
                            row.employmentStatus === 'Active'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          }
                        `}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            row.employmentStatus === 'Active' ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        {row.employmentStatus}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-muted-foreground text-xs font-medium">
                      {row.department}
                    </td>

                    <td className="px-4 py-3.5 font-mono font-medium text-foreground text-xs">
                      {row.subjectCode}
                    </td>

                    <td className="px-4 py-3.5 text-foreground max-w-[200px] truncate text-sm" title={row.subjectName}>
                      {row.subjectName}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={`
                          inline-flex px-2 py-0.5 rounded-md text-xs font-medium
                          ${
                            row.syllabusSubmitted
                              ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20'
                              : 'bg-muted text-muted-foreground border border-border'
                          }
                        `}
                      >
                        {row.syllabusSubmitted ? 'Yes' : 'No'}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <VersionLabel version={row.version} size="sm" />
                        <StatusBadge status={(row.rawStatus || 'draft') as SyllabusStatus} size="sm" />
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-muted-foreground text-xs italic">
                      {row.remarks || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredData.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-border/70 bg-card">
            <div className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
              <span className="font-semibold text-foreground">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> of{' '}
              <span className="font-semibold text-foreground">{filteredData.length}</span> records
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
        Showing {filteredData.length} record{filteredData.length !== 1 ? 's' : ''} across{' '}
        {stats.totalFaculty} faculty member{stats.totalFaculty !== 1 ? 's' : ''}.
        {' '}View and export only — no edit access on this page.
      </p>
    </div>
  );
}
