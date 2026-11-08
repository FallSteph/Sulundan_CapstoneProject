import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  pdfUrl: string;
  currentPage: number;
  zoom: number;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onTotalPagesChange: (total: number) => void;
  onPageDimensionsChange?: (width: number, height: number) => void;
  children?: React.ReactNode;
  className?: string;
}

export function PDFViewer({
  pdfUrl,
  currentPage,
  zoom,
  onPageChange,
  onZoomChange,
  onTotalPagesChange,
  onPageDimensionsChange,
  children,
  className,
}: PDFViewerProps) {
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setTotalPages(numPages);
    onTotalPagesChange(numPages);
    setIsLoading(false);
    setError(null);
  }, [onTotalPagesChange]);

  const handleDocumentLoadError = useCallback((err: Error) => {
    console.error('PDF load error:', err);
    setError('Failed to load PDF document');
    setIsLoading(false);
  }, []);

  const handlePageLoadSuccess = useCallback((page: { width: number; height: number }) => {
    if (onPageDimensionsChange) {
      onPageDimensionsChange(page.width * zoom, page.height * zoom);
    }
  }, [onPageDimensionsChange, zoom]);

  const goToPreviousPage = useCallback(() => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  }, [currentPage, onPageChange]);

  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  }, [currentPage, totalPages, onPageChange]);

  const zoomIn = useCallback(() => {
    if (zoom < 3) {
      onZoomChange(Math.min(zoom + 0.25, 3));
    }
  }, [zoom, onZoomChange]);

  const zoomOut = useCallback(() => {
    if (zoom > 0.5) {
      onZoomChange(Math.max(zoom - 0.25, 0.5));
    }
  }, [zoom, onZoomChange]);

  const rotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          goToPreviousPage();
          break;
        case 'ArrowRight':
          goToNextPage();
          break;
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomIn();
          }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomOut();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPreviousPage, goToNextPage, zoomIn, zoomOut]);

  return (
    <div className={cn('flex flex-col h-full bg-muted/30 rounded-xl overflow-hidden', className)}>
      {/* Controls */}
      <div className="flex items-center justify-between p-3 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPreviousPage}
            disabled={currentPage <= 1 || isLoading}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[100px] text-center">
            Page {currentPage} of {totalPages || '...'}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextPage}
            disabled={currentPage >= totalPages || isLoading}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={zoomOut}
            disabled={zoom <= 0.5 || isLoading}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[60px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={zoomIn}
            disabled={zoom >= 3 || isLoading}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={rotate}
            disabled={isLoading}
            aria-label="Rotate"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Display */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto flex items-start justify-center p-4"
      >
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-destructive">
            <p className="text-lg font-medium">{error}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Please check the PDF URL and try again.
            </p>
          </div>
        ) : (
          <div className="relative">
            <Document
              file={pdfUrl}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={handleDocumentLoadError}
              loading={
                <div className="flex flex-col items-center justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                  <p className="text-sm text-muted-foreground">Loading PDF...</p>
                </div>
              }
            >
              {isLoading ? (
                <Skeleton className="w-[600px] h-[800px]" />
              ) : (
                <Page
                  pageNumber={currentPage}
                  scale={zoom}
                  rotate={rotation}
                  onLoadSuccess={handlePageLoadSuccess}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  loading={
                    <div className="flex items-center justify-center p-12">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  }
                />
              )}
            </Document>
            
            {/* Annotation overlay */}
            {children && (
              <div className="absolute inset-0 pointer-events-auto">
                {children}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
