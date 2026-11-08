import React, { useMemo, useState } from 'react';
import { Archive, Download, Eye, FileDown, PackageOpen, Loader2, ChevronDown, ChevronUp, Search, X, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useSemester } from '@/contexts/SemesterContext';
import { useToast } from '@/hooks/use-toast';
import { Syllabus, SyllabusStatus } from '@/types';
import { VersionLabel } from '@/components/VersionLabel';
import { StatusBadge } from '@/components/StatusBadge';
import { format } from 'date-fns';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFileType(fileName: string): string {
  if (!fileName) return 'FILE';
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'docx') return 'DOCX';
  if (ext === 'doc') return 'DOC';
  return ext.toUpperCase() || 'FILE';
}

function isDocFile(fileName: string): boolean {
  if (!fileName) return false;
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'doc' || ext === 'docx';
}

// ── Page Component ────────────────────────────────────────────────────────────

export default function ArchivePage() {
  const { user } = useAuth();
  const { syllabi } = useData();
  const { selectedSemester, selectedPeriod, selectedSchoolYear } = useSemester();
  const { toast } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [collapsedColleges, setCollapsedColleges] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // ── Role-based filtering ─────────────────────────────────────────────────
  const scopedSyllabi = useMemo(() => {
    if (!user) return [];

    // 'syllabi' is already filtered by the globally selected semester from DataContext
    let data = syllabi.filter((s) => s.status !== 'draft');

    // Role scoping
    switch (user.role) {
      case 'admin':
        break;
      case 'dean':
        data = data.filter((s) => s.college === user.college);
        break;
      case 'dept_head':
        data = data.filter((s) => s.department === user.department);
        break;
      default:
        return [];
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      data = data.filter((s) =>
        s.courseCode.toLowerCase().includes(q) ||
        s.courseTitle.toLowerCase().includes(q) ||
        (s.facultyName || '').toLowerCase().includes(q) ||
        (s.department || '').toLowerCase().includes(q) ||
        (s.college || '').toLowerCase().includes(q) ||
        (s.fileName || '').toLowerCase().includes(q)
      );
    }

    return data;
  }, [syllabi, selectedSemester, user, searchQuery]);

  // ── Group by College ─────────────────────────────────────────────────────
  const groupedByCollege = useMemo(() => {
    const map = new Map<string, { college: string; syllabi: Syllabus[] }>();
    for (const s of scopedSyllabi) {
      const college = s.college || 'Unassigned College';
      if (!map.has(college)) {
        map.set(college, { college, syllabi: [] });
      }
      map.get(college)!.syllabi.push(s);
    }
    // Sort each group newest first
    for (const group of map.values()) {
      group.syllabi.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }
    return [...map.values()].sort((a, b) => a.college.localeCompare(b.college));
  }, [scopedSyllabi]);

  // ── Bulk DOCX/DOC files only ─────────────────────────────────────────────
  const docFiles = useMemo(
    () => scopedSyllabi.filter((s) => isDocFile(s.fileName || '')),
    [scopedSyllabi],
  );
  const selectedDocFiles = useMemo(
    () => docFiles.filter((s) => selectedIds.has(s.id)),
    [docFiles, selectedIds],
  );

  // ── Toggle helpers ────────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectCollege(collegeSyllabi: Syllabus[]) {
    const collegeDocIds = collegeSyllabi.filter((s) => isDocFile(s.fileName || '')).map((s) => s.id);
    if (collegeDocIds.length === 0) return;

    const allSelected = collegeDocIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        collegeDocIds.forEach((id) => next.delete(id));
      } else {
        collegeDocIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function isCollegeAllSelected(collegeSyllabi: Syllabus[]) {
    const collegeDocIds = collegeSyllabi.filter((s) => isDocFile(s.fileName || '')).map((s) => s.id);
    return collegeDocIds.length > 0 && collegeDocIds.every((id) => selectedIds.has(id));
  }

  function toggleCollegeCollapse(college: string) {
    setCollapsedColleges((prev) => {
      const next = new Set(prev);
      next.has(college) ? next.delete(college) : next.add(college);
      return next;
    });
  }

  // ── Download actions ──────────────────────────────────────────────────────
  function handleBulkDownloadSelected() {
    if (selectedDocFiles.length === 0) {
      toast({
        title: 'Nothing to download',
        description: 'No syllabus files selected. Check the boxes next to files you want.',
        variant: 'destructive',
      });
      return;
    }

    const ids = selectedDocFiles.map(s => s.id).join(',');
    console.log(`[Archive] Downloading ${selectedDocFiles.length} selected files. IDs:`, ids);
    
    let API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    if (API_BASE.includes('localhost') && window.location.hostname !== 'localhost') {
      API_BASE = `http://${window.location.hostname}:5000`;
    }
    const token = localStorage.getItem('auth_token');
    const url = `${API_BASE}/syllabi/bulk-download?ids=${encodeURIComponent(ids)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    
    toast({
      title: "Download started",
      description: `Preparing ${selectedDocFiles.length} files...`,
    });

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `syllabi-bulk-${Date.now()}.zip`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleBulkDownloadAll() {
    if (docFiles.length === 0) {
      toast({
        title: 'No syllabus files',
        description: 'There are no syllabus files in the current view.',
        variant: 'destructive',
      });
      return;
    }

    const ids = docFiles.map(s => s.id).join(',');
    console.log(`[Archive] Downloading ALL ${docFiles.length} files. IDs:`, ids);

    let API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    if (API_BASE.includes('localhost') && window.location.hostname !== 'localhost') {
      API_BASE = `http://${window.location.hostname}:5000`;
    }
    const token = localStorage.getItem('auth_token');
    const url = `${API_BASE}/syllabi/bulk-download?ids=${encodeURIComponent(ids)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    
    toast({
      title: "Download started",
      description: `Preparing all ${docFiles.length} files...`,
    });

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `syllabi-bulk-all-${Date.now()}.zip`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleDownloadSingle(s: Syllabus) {
    if (!s.fileUrl) {
      toast({ title: 'No file available', variant: 'destructive' });
      return;
    }
    
    toast({ title: 'Downloading', description: s.fileName || 'document' });
    
    try {
      const response = await fetch(s.fileUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = downloadUrl;
      link.setAttribute('download', s.fileName || 'syllabus.docx');
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        window.URL.revokeObjectURL(downloadUrl);
      }, 500);
    } catch (err) {
      console.error("[Archive] Single download error:", err);
      window.open(s.fileUrl, '_blank');
    }
  }

  function handleViewFile(s: Syllabus) {
    const fileUrl = s.fileUrl || s.form17Link || s.form18Link;
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    } else {
      toast({ title: 'No preview available', description: s.fileName || 'document' });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Syllabus Archive
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {selectedSemester
              ? (selectedSchoolYear ? `${selectedPeriod || selectedSemester.name} · ${selectedSchoolYear}` : `${selectedPeriod || selectedSemester.name}`)
              : 'All semesters'}
            {' '}·{' '}{scopedSyllabi.length} file{scopedSyllabi.length !== 1 ? 's' : ''} across{' '}
            {groupedByCollege.length} college{groupedByCollege.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Bulk download buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start">
          <Button
            variant="outline"
            className="gap-2 border-primary/30 hover:bg-primary/5 h-9 text-xs"
            onClick={handleBulkDownloadSelected}
            disabled={isDownloading || selectedDocFiles.length === 0}
          >
            {isDownloading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            Download Selected ({selectedDocFiles.length})
          </Button>
          <Button
            variant="default"
            className="gap-2 h-9 text-xs"
            onClick={handleBulkDownloadAll}
            disabled={isDownloading || docFiles.length === 0}
          >
            {isDownloading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <PackageOpen className="h-4 w-4" />}
            Download All (.zip) ({docFiles.length})
          </Button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search course, instructor, or file..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-8 h-9 text-xs rounded-lg"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {groupedByCollege.length === 0 && (
        <Card className="p-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <Archive className="h-14 w-14 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground">No syllabus files found</p>
            <p className="text-sm text-muted-foreground/70">
              {selectedSemester
                ? `No submitted syllabi found for ${selectedPeriod || selectedSemester.name}${selectedSchoolYear ? ` ${selectedSchoolYear}` : ''}.`
                : 'Select a semester from the top bar to view archived files.'}
            </p>
          </div>
        </Card>
      )}

      {/* ── Grouped by College ──────────────────────────────────────────── */}
      <div className="space-y-4">
        {groupedByCollege.map(({ college, syllabi }) => {
          const isCollapsed = collapsedColleges.has(college);
          const collegeDocCount = syllabi.filter((s) => isDocFile(s.fileName || '')).length;
          const allSelected = isCollegeAllSelected(syllabi);

          return (
            <Card key={college} className="overflow-hidden shadow-soft border-border/70">
              {/* College Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 bg-muted/40 border-b border-border/50 gap-2">
                <button
                  type="button"
                  onClick={() => toggleCollegeCollapse(college)}
                  className="flex items-center gap-3 min-w-0 text-left hover:opacity-80 transition-opacity flex-1"
                >
                  <Building2 className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{college}</p>
                    <p className="text-xs text-muted-foreground">
                      {syllabi.length} syllabus file{syllabi.length !== 1 ? 's' : ''}
                      {collegeDocCount > 0 && ` · ${collegeDocCount} .docx available`}
                    </p>
                  </div>
                </button>

                {/* Per-College Controls */}
                <div className="flex items-center gap-3 flex-shrink-0 self-end sm:self-center">
                  {collegeDocCount > 0 && (
                    <div
                      className="flex items-center gap-2 bg-background/90 px-2.5 py-1 rounded-md border border-border/70 hover:bg-background transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectCollege(syllabi);
                      }}
                    >
                      <Checkbox
                        id={`select-college-${college}`}
                        checked={allSelected}
                        onCheckedChange={() => toggleSelectCollege(syllabi)}
                        aria-label={`Select all syllabi in ${college}`}
                      />
                      <label
                        htmlFor={`select-college-${college}`}
                        className="text-xs font-medium text-foreground cursor-pointer select-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Select all ({collegeDocCount})
                      </label>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => toggleCollegeCollapse(college)}
                    className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                  >
                    {isCollapsed ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Syllabus rows */}
              {!isCollapsed && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/30 text-muted-foreground">
                        <th className="px-3 py-2.5 w-10 text-center">
                          {collegeDocCount > 0 && (
                            <Checkbox
                              checked={allSelected}
                              onCheckedChange={() => toggleSelectCollege(syllabi)}
                              aria-label="Select all in this college"
                            />
                          )}
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[85px]">ID</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[100px]">Code</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[200px]">Subject Name</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[150px]">Program</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[150px]">Instructor</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[80px]">Type</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[120px]">Status</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[100px]">Updated</th>
                        <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider min-w-[90px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syllabi.map((s, idx) => {
                        const fileType = getFileType(s.fileName || '');
                        const isDoc = isDocFile(s.fileName || '');
                        const isChecked = selectedIds.has(s.id);
                        const stripeBg = idx % 2 === 0 ? '' : 'bg-muted/20';

                        return (
                          <tr
                            key={s.id}
                            className={`border-b border-border/40 transition-colors hover:bg-muted/30 ${stripeBg} ${
                              isChecked ? 'bg-primary/5' : ''
                            }`}
                          >
                            {/* Checkbox — only for .doc/.docx */}
                            <td className="px-3 py-2.5 text-center">
                              {isDoc ? (
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() => toggleSelect(s.id)}
                                  aria-label={`Select ${s.courseCode}`}
                                />
                              ) : (
                                <span className="block h-4 w-4 mx-auto" />
                              )}
                            </td>

                            {/* Tracking ID */}
                            <td className="px-4 py-2.5">
                              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                                {s.trackingId || '—'}
                              </span>
                            </td>

                            {/* Course Code */}
                            <td className="px-4 py-2.5 font-mono font-medium text-foreground text-xs">
                              {s.courseCode}
                            </td>

                            {/* Course Title */}
                            <td
                              className="px-4 py-2.5 text-foreground max-w-[200px] truncate text-sm"
                              title={s.courseTitle}
                            >
                              {s.courseTitle}
                            </td>

                            {/* Program / Department */}
                            <td className="px-4 py-2.5 text-muted-foreground text-xs">
                              {s.department || '—'}
                            </td>

                            {/* Instructor */}
                            <td className="px-4 py-2.5 text-foreground text-xs font-medium">
                              {s.facultyName}
                            </td>

                            {/* File Type */}
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                  fileType === 'PDF'
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                }`}
                              >
                                {fileType}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <VersionLabel version={s.version} size="sm" />
                                <StatusBadge status={s.status as SyllabusStatus} size="sm" />
                              </div>
                            </td>

                            {/* Updated */}
                            <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                              {format(new Date(s.updatedAt), 'MMM d, yyyy')}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewFile(s)}
                                  className="h-7 w-7 p-0 hover:bg-primary/10 hover:text-primary rounded-lg transition-colors"
                                  title="View file"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownloadSingle(s)}
                                  className="h-7 w-7 p-0 hover:bg-primary/10 hover:text-primary rounded-lg transition-colors"
                                  title="Download file"
                                >
                                  <FileDown className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Footer */}
      {scopedSyllabi.length > 0 && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          Read-only archive — view and download only. Bulk download (.zip) includes Syllabus (.docx), Form 17, and Form 18.
        </p>
      )}
    </div>
  );
}
