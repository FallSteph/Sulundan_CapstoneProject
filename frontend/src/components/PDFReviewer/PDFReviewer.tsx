import React, { useState, useCallback } from 'react';
import { PDFViewer } from './PDFViewer';
import { AnnotationCanvas } from './AnnotationCanvas';
import { AnnotationToolbar } from './AnnotationToolbar';
import { ReviewPanel } from './ReviewPanel';
import { useAnnotations } from './hooks/useAnnotations';
import { 
  Annotation, 
  AnnotationTool, 
  Signature,
  ReviewAction,
  CommentAnnotation,
} from './types';
import { UserRole } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface PDFReviewerProps {
  pdfUrl: string;
  syllabusId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  initialAnnotations?: Annotation[];
  onReviewSubmit: (data: {
    action: ReviewAction;
    comment: string;
    annotations: Annotation[];
    signature: Signature | null;
  }) => Promise<void>;
  className?: string;
  // Add Form 17/18 URLs
  form17Url?: string;
  form18Url?: string;
}

export function PDFReviewer({
  pdfUrl,
  syllabusId,
  userId,
  userName,
  userRole,
  initialAnnotations = [],
  onReviewSubmit,
  className,
  // Add Form 17/18 URLs
  form17Url,
  form18Url,
}: PDFReviewerProps) {
  const { toast } = useToast();
  
  // PDF state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pageDimensions, setPageDimensions] = useState({ width: 600, height: 800 });
  
  // Annotation state
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select');
  const {
    annotations,
    activeStyle,
    addAnnotation,
    removeAnnotation,
    setActiveStyle,
    undo,
    redo,
    canUndo,
    canRedo,
    clearAnnotations,
    getAnnotationsForPage,
  } = useAnnotations(initialAnnotations);
  
  // Signature state
  const [signature, setSignature] = useState<Signature | null>(null);
  
  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePageDimensionsChange = useCallback((width: number, height: number) => {
    setPageDimensions({ width, height });
  }, []);

  const handleCommentClick = useCallback((comment: CommentAnnotation) => {
    // Could open a modal or sidebar for editing comment content
    toast({
      title: 'Comment Selected',
      description: 'Click on the comment marker to edit or delete.',
    });
  }, [toast]);

  const handleSignatureCreate = useCallback((sig: Signature) => {
    setSignature(sig);
    toast({
      title: 'Signature Saved',
      description: 'Your digital signature has been saved.',
    });
  }, [toast]);

  const handleSignatureClear = useCallback(() => {
    setSignature(null);
  }, []);

  const handleReviewSubmit = useCallback(async (action: ReviewAction, comment: string) => {
    setIsSubmitting(true);
    
    try {
      await onReviewSubmit({
        action,
        comment,
        annotations,
        signature,
      });
      
      toast({
        title: 'Review Submitted',
        description: action.type === 'approve' 
          ? 'The syllabus has been approved.' 
          : action.type === 'forward'
          ? 'The syllabus has been forwarded to the next reviewer.'
          : 'The syllabus has been returned to the faculty.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: 'There was an error submitting your review. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [onReviewSubmit, annotations, signature, toast]);

  // Auto-save annotations
  React.useEffect(() => {
    const saveAnnotations = () => {
      // In production, save to backend
      localStorage.setItem(`annotations-${syllabusId}`, JSON.stringify(annotations));
    };
    
    const debounceTimer = setTimeout(saveAnnotations, 1000);
    return () => clearTimeout(debounceTimer);
  }, [annotations, syllabusId]);

  return (
    <div className={cn('flex flex-col lg:flex-row gap-4 h-full', className)}>
      {/* Left: PDF Viewer with Annotations */}
      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {/* Annotation Toolbar */}
        <AnnotationToolbar
          activeTool={activeTool}
          activeStyle={activeStyle}
          onToolChange={setActiveTool}
          onStyleChange={setActiveStyle}
          onUndo={undo}
          onRedo={redo}
          onClear={clearAnnotations}
          canUndo={canUndo}
          canRedo={canRedo}
        />

        {/* PDF Viewer */}
        <div className="flex-1 min-h-0">
          <PDFViewer
            pdfUrl={pdfUrl}
            currentPage={currentPage}
            zoom={zoom}
            onPageChange={setCurrentPage}
            onZoomChange={setZoom}
            onTotalPagesChange={setTotalPages}
            onPageDimensionsChange={handlePageDimensionsChange}
            className="h-full"
          >
            <AnnotationCanvas
              width={pageDimensions.width}
              height={pageDimensions.height}
              activeTool={activeTool}
              activeStyle={activeStyle}
              annotations={getAnnotationsForPage(currentPage)}
              pageNumber={currentPage}
              userId={userId}
              userName={userName}
              userRole={userRole}
              onAddAnnotation={addAnnotation}
              onRemoveAnnotation={removeAnnotation}
              onCommentClick={handleCommentClick}
            />
          </PDFViewer>
        </div>
      </div>

      {/* Right: Review Panel */}
      <div className="w-full lg:w-96 lg:overflow-auto">
        <ReviewPanel
          userRole={userRole}
          userId={userId}
          userName={userName}
          signature={signature}
          onSignatureCreate={handleSignatureCreate}
          onSignatureClear={handleSignatureClear}
          onSubmit={handleReviewSubmit}
          isSubmitting={isSubmitting}
          // Pass Form 17/18 URLs
          form17Url={form17Url}
          form18Url={form18Url}
        />
      </div>
    </div>
  );
}
