import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  User,
  Calendar,
  Download,
  Printer,
  FileSpreadsheet,
  FileBarChart,
  Users,
  X,
  Maximize2,
  Minimize2,
  FileType,
  Loader2,
  Eye,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Edit3,
  Upload,
  Hash
} from 'lucide-react';
import { OnlyOfficeEditor } from '@/components/DocxViewer/OnlyOfficeEditor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { VersionLabel } from '@/components/VersionLabel';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useData } from '@/contexts/DataContext';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { ROLE_LABELS } from '@/types';

export default function SyllabusViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { syllabi, refreshSyllabi } = useData();
  const { toast } = useToast();

  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [currentFileUrl, setCurrentFileUrl] = useState('');
  const [currentFileType, setCurrentFileType] = useState<'pdf' | 'docx'>('docx');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentDocumentType, setCurrentDocumentType] = useState<'syllabus' | 'form17' | 'form18'>('syllabus');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // For forcing re-renders
  const [iframeKey, setIframeKey] = useState(0); // For forcing iframe re-render


  // Refresh data when modal closes to ensure we have latest links/versions
  useEffect(() => {
    if (!isFileModalOpen && isEditMode) {
      refreshSyllabi();
    }
  }, [isFileModalOpen, isEditMode]);

  const syllabus = syllabi.find(s => s.id === id);

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

  // Helper to determine file type from filename
  const getFileType = (fileName: string): 'pdf' | 'docx' => {
    if (!fileName) return 'docx'; // Default to docx as requested
    const extension = fileName.split('.').pop()?.toLowerCase();
    return extension === 'pdf' ? 'pdf' : 'docx';
  };

  // Use local sample files from public folder
  const getSampleFileUrl = (fileType: 'pdf' | 'docx'): string => {
    if (fileType === 'docx') {
      return '/sample-files/sample.docx';
    } else {
      return '/sample-files/sample.pdf';
    }
  };

  // Get external link for Form 17 or Form 18
  const getExternalLink = (documentType: 'form17' | 'form18'): string => {
    if (!syllabus) return '';

    let link = '';
    if (documentType === 'form17' && syllabus.form17Link) {
      link = syllabus.form17Link;
    } else if (documentType === 'form18' && syllabus.form18Link) {
      link = syllabus.form18Link;
    }

    if (link && link.includes('host.docker.internal')) {
      return link.replace('host.docker.internal', 'localhost');
    }
    return link;
  };

  const handleViewDocument = async (documentType: 'syllabus' | 'form17' | 'form18', mode: 'view' | 'edit' = 'view') => {
    const documentInfo = {
      syllabus: {
        name: 'Syllabus',
        available: !!syllabus?.fileUrl || !!syllabus?.fileName,
        fileType: syllabus?.fileName ? getFileType(syllabus.fileName) : 'docx' as const
      },
      form17: {
        name: 'Form 17',
        available: !!syllabus?.form17Link,
        fileType: 'docx' as const
      },
      form18: {
        name: 'Form 18',
        available: !!syllabus?.form18Link,
        fileType: 'docx' as const
      }
    };

    const doc = documentInfo[documentType];


    if (!doc.available) {
      toast({ title: 'Not Available', description: `${doc.name} has not been uploaded yet.`, variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setCurrentDocumentType(documentType);
    setIsEditMode(mode === 'edit');

    try {
      let fileUrl = '';
      let fileType: 'pdf' | 'docx' = 'docx';

      if (documentType === 'syllabus') {
        fileUrl = syllabus?.fileUrl || getSampleFileUrl(doc.fileType);
        fileType = doc.fileType;
      } else {
        fileUrl = getExternalLink(documentType as any);
        fileType = 'docx';
        if (fileUrl.toLowerCase().endsWith('.pdf')) {
          fileType = 'pdf';
        }
      }

      if (!fileUrl) {
        toast({ title: 'Link Missing', description: `${doc.name} link is not available.`, variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      if (fileUrl.includes('host.docker.internal')) {
        fileUrl = fileUrl.replace('host.docker.internal', 'localhost');
      }

      setCurrentFileUrl(fileUrl);
      setCurrentFileType(fileType);
      setIsFileModalOpen(true);

      // Force refresh
      setRefreshKey(prev => prev + 1);
      setIframeKey(prev => prev + 1);
    } catch (error) {
      console.error('Error opening document:', error);
      toast({ title: 'Error', description: 'Could not open the document. Please try downloading it instead.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenExternalLink = (documentType: 'form17' | 'form18') => {
    const externalLink = getExternalLink(documentType);
    if (externalLink) {
      window.open(externalLink, '_blank', 'noopener,noreferrer');
    }
  };

  const handleDownload = () => {
    if (!syllabus) return;

    const fileType = getFileType(syllabus.fileName);
    let fileUrl = syllabus.fileUrl || getSampleFileUrl(fileType);
    if (fileUrl.includes('host.docker.internal')) {
      fileUrl = fileUrl.replace('host.docker.internal', 'localhost');
    }

    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = syllabus.fileName || `syllabus_${syllabus.courseCode}.${fileType}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({ title: 'Downloading', description: syllabus.fileName || `syllabus_${syllabus.courseCode}.${fileType}` });
  };

  const handlePrint = () => {
    if (!syllabus) return;

    if (syllabus.status !== 'approved') {
      toast({ title: 'Action Denied', description: 'Only approved syllabi can be printed.', variant: 'destructive' });
      return;
    }

    const fileType = getFileType(syllabus.fileName);

    if (fileType === 'pdf') {
      let fileUrl = syllabus.fileUrl || getSampleFileUrl('pdf');
      if (fileUrl.includes('host.docker.internal')) {
        fileUrl = fileUrl.replace('host.docker.internal', 'localhost');
      }
      const printWindow = window.open(fileUrl, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } else {
      toast({ title: 'Format Not Supported', description: 'DOCX files need to be converted to PDF for printing. Please download first.', variant: 'destructive' });
    }
  };

  const handleOpenInNewTab = () => {
    window.open(currentFileUrl, '_blank', 'noopener,noreferrer');
  };

  // File Viewer Modal Component
  const FileViewerModal = () => {
    if (!syllabus) return null;

    const getDocumentTitle = () => {
      switch (currentDocumentType) {
        case 'syllabus':
          return 'Syllabus';
        case 'form17':
          return 'Form 17';
        case 'form18':
          return 'Form 18';
        default:
          return 'Document';
      }
    };

    const getFileName = () => {
      if (currentDocumentType === 'syllabus') {
        return syllabus.fileName || `syllabus_${syllabus.courseCode}.${currentFileType}`;
      } else {
        return `${currentDocumentType}_${syllabus.courseCode}.pdf`;
      }
    };

    const handleReloadIframe = () => {
      setIframeKey(prev => prev + 1);
      setRefreshKey(prev => prev + 1);
    };

    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center ${isFullscreen ? 'bg-background p-0' : 'bg-black/50 p-4'
        }`}>
        <div className={`relative flex flex-col bg-background shadow-xl ${isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-6xl h-[90vh] rounded-lg'
          }`}>
          {/* Header - Compact */}
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${currentFileType === 'pdf' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                }`}>
                {currentFileType === 'pdf' ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <FileType className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate">
                  {getFileName()}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {syllabus.courseCode} - {getDocumentTitle()} •
                  Submitted: {format(new Date(syllabus.createdAt), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenInNewTab}
                className="h-7 w-7 p-0"
                title="Open in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="h-7 w-7 p-0"
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFileModalOpen(false)}
                className="h-7 w-7 p-0"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* File Viewer */}
          <div className="flex-1 relative">
            {isEditMode || currentFileType === 'docx' ? (
              <div className="w-full h-full bg-muted/10">
                <OnlyOfficeEditor
                  syllabusId={id!}
                  mode={isEditMode ? 'edit' : 'view'}
                  docType={currentDocumentType as 'syllabus' | 'form17' | 'form18'}
                  className="w-full h-full"
                  key={`editor-${refreshKey}`}
                />
              </div>
            ) : (
              <>
                <div className="absolute inset-0">
                  <iframe
                    key={`pdf-iframe-${iframeKey}`}
                    src={`${currentFileUrl}#view=FitH&toolbar=1&navpanes=1&scrollbar=1`}
                    className="w-full h-full border-0"
                    title={`${syllabus.courseCode} ${getDocumentTitle()}`}
                    allow="fullscreen"
                    onLoad={() => setIsLoading(false)}
                    onError={() => {
                      setIsLoading(false);
                      toast({ title: 'Load Failed', description: 'Failed to load PDF. You can try opening the link directly instead.', variant: 'destructive' });
                    }}
                  />
                </div>

                {isLoading && (
                  <div className="absolute inset-0 bg-background/90 flex items-center justify-center">
                    <div className="flex flex-col items-center">
                      <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
                      <p className="text-xs text-muted-foreground">Loading document...</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer - Compact with only reload button */}
          <div className="border-t">
            <div className="p-2 flex items-center justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReloadIframe}
                className="h-7 px-2 text-xs"
              >
                <span className="mr-1">⟳</span>
                Reload
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!syllabus) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => {
          const from = (location.state as any)?.from;
          if (from) {
            navigate(from);
          } else {
            navigate(-1);
          }
        }}>
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

  // Determine actual file type for badges
  const syllabusFileType = getFileType(syllabus.fileName);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Section - Responsive */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 md:gap-4">
          <Button variant="ghost" onClick={() => {
            const from = (location.state as any)?.from;
            if (from) {
              navigate(from);
            } else {
              navigate(-1);
            }
          }} className="h-10">
            <ArrowLeft className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Syllabus Details</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              {syllabus.courseCode} - {syllabus.courseTitle}
            </p>
          </div>
        </div>

        {/* Document Buttons - Separate buttons (not merged) */}
        <div className="flex items-center gap-3">
          {/* Syllabus Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleViewDocument('syllabus')}
            className="gap-2 h-9 px-4"
            disabled={isLoading}
          >
            <FileText className="h-4 w-4" />
            <span className="text-sm">View Syllabus</span>
            {isLoading && currentDocumentType === 'syllabus' && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
          </Button>

          {/* Form 17 Button */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleViewDocument('form17', 'view')}
              className="gap-2 h-9 px-3 rounded-r-none border-r-0"
              disabled={!syllabus.form17Link || isLoading}
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span className="text-sm">Form 17</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleViewDocument('form17', 'edit')}
              className="h-9 px-2 rounded-l-none border-l hover:bg-primary/10 hover:text-primary hover:border-primary/30"
              disabled={!syllabus.form17Link || isLoading}
              title="Edit Form 17"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Form 18 Button */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleViewDocument('form18', 'view')}
              className="gap-2 h-9 px-3 rounded-r-none border-r-0"
              disabled={!syllabus.form18Link || isLoading}
            >
              <FileBarChart className="h-4 w-4" />
              <span className="text-sm">Form 18</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleViewDocument('form18', 'edit')}
              className="h-9 px-2 rounded-l-none border-l hover:bg-primary/10 hover:text-primary hover:border-primary/30"
              disabled={!syllabus.form18Link || isLoading}
              title="Edit Form 18"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
          </div>

        </div>
      </div>

      {/* Main Content Grid - Responsive */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-soft">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center ${syllabusFileType === 'pdf' ? 'bg-red-100' : 'bg-blue-100'
                    }`}>
                    {syllabusFileType === 'pdf' ? (
                      <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-red-600" />
                    ) : (
                      <FileType className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-lg sm:text-xl">{syllabus.courseTitle}</CardTitle>
                    <CardDescription>
                      Course Code: {syllabus.courseCode}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                  <VersionLabel version={syllabus.version} />
                  <StatusBadge status={syllabus.status} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Semester</p>
                  <p className="font-medium text-foreground">{syllabus.semesterPeriod}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Faculty / Lead Instructor</p>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="font-medium text-foreground">{syllabus.facultyName || 'Not specified'}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Program</p>
                  <p className="font-medium text-foreground">{syllabus.department}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">College</p>
                  <p className="font-medium text-foreground">{syllabus.college}</p>
                </div>
              </div>

              {syllabus.feedback && (
                <>
                  <Separator />
                  <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
                    <p className="font-medium text-foreground mb-1">Reviewer Feedback</p>
                    <p className="text-sm text-muted-foreground">{syllabus.feedback}</p>
                  </div>
                </>
              )}

              {/* AI Analysis Result */}
              {syllabus.aiAnalysis && (
                <>
                  <Separator />
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">AI Scanning Result</p>
                      <Badge variant={syllabus.aiAnalysis.score >= 85 ? "outline" : "secondary"} className={syllabus.aiAnalysis.score >= 85 ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}>
                        {syllabus.aiAnalysis.score}% Compliance
                      </Badge>
                    </div>
                    {syllabus.aiAnalysis.suggestions && syllabus.aiAnalysis.suggestions.length > 0 ? (
                      <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                        <p className="text-sm font-medium mb-2 text-blue-900">Suggestions ({syllabus.aiAnalysis.suggestions.length})</p>
                        <ul className="text-sm space-y-2 text-blue-800 list-disc pl-4">
                          {syllabus.aiAnalysis.suggestions.slice(0, 3).map((suggestion, idx) => (
                            <li key={idx}><span className="font-medium capitalize">{suggestion.title}:</span> {suggestion.description}</li>
                          ))}
                          {syllabus.aiAnalysis.suggestions.length > 3 && (
                            <li className="text-muted-foreground list-none mt-2">...and {syllabus.aiAnalysis.suggestions.length - 3} more.</li>
                          )}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No significant issues found during scan.</p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Review History */}
          {syllabus.reviewHistory.length > 0 && (
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle>Review History</CardTitle>
                <CardDescription>{syllabus.reviewHistory.length} review(s)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {syllabus.reviewHistory.map((review, index) => (
                    <div key={index} className="flex items-start gap-4 p-4 rounded-xl bg-muted/30">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${review.action === 'approved' || review.action === 'forwarded'
                        ? 'bg-success/10 text-success'
                        : 'bg-destructive/10 text-destructive'
                        }`}>
                        <User className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground capitalize">{review.action}</p>
                            {review.version && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">v{review.version}</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(review.timestamp), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {review.reviewerName ? `${review.reviewerName} • ` : ''}
                          <span className="text-muted-foreground font-normal capitalize">
                            {getRoleDisplayName(review)}
                          </span>
                        </p>
                        {review.comment && (
                          <p className="text-sm text-muted-foreground mt-2 break-words">{review.comment}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - Timeline & Submission Info */}
        <div className="space-y-6">
          <Card className="shadow-soft">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Submission & Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Hash className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Syllabus ID</p>
                  <p className="font-mono text-sm font-semibold text-foreground">{syllabus.trackingId || syllabus.id}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Uploaded File</p>
                  <p className="text-sm font-medium text-foreground break-all">{syllabus.fileName || `${syllabus.courseCode}_syllabus.docx`}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Submitted</p>
                  <p className="text-sm font-medium text-foreground">
                    {format(new Date(syllabus.createdAt), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Last Updated</p>
                  <p className="text-sm font-medium text-foreground">
                    {format(new Date(syllabus.updatedAt), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* File Viewer Modal */}
      {isFileModalOpen && <FileViewerModal />}
    </div>
  );
}
