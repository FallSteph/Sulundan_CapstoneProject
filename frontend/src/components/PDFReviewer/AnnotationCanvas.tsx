import React, { useRef, useEffect, useCallback, useState } from 'react';
import { 
  Annotation, 
  AnnotationTool, 
  AnnotationStyle, 
  Point,
  CommentAnnotation,
  HighlightAnnotation,
  DrawingAnnotation,
  RectangleAnnotation,
  ArrowAnnotation,
} from './types';
import { UserRole } from '@/types';
import { cn } from '@/lib/utils';

interface AnnotationCanvasProps {
  width: number;
  height: number;
  activeTool: AnnotationTool;
  activeStyle: AnnotationStyle;
  annotations: Annotation[];
  pageNumber: number;
  userId: string;
  userName: string;
  userRole: UserRole;
  onAddAnnotation: (annotation: Annotation) => void;
  onRemoveAnnotation: (id: string) => void;
  onCommentClick?: (annotation: CommentAnnotation) => void;
  className?: string;
}

export function AnnotationCanvas({
  width,
  height,
  activeTool,
  activeStyle,
  annotations,
  pageNumber,
  userId,
  userName,
  userRole,
  onAddAnnotation,
  onRemoveAnnotation,
  onCommentClick,
  className,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [activeComment, setActiveComment] = useState<CommentAnnotation | null>(null);

  const getPoint = useCallback((e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    return {
      x: (clientX - rect.left) / (rect.width / width),
      y: (clientY - rect.top) / (rect.height / height),
    };
  }, [width, height]);

  const createBaseAnnotation = useCallback(() => ({
    id: crypto.randomUUID(),
    pageNumber,
    createdAt: new Date().toISOString(),
    authorId: userId,
    authorName: userName,
    authorRole: userRole,
  }), [pageNumber, userId, userName, userRole]);

  // Draw all annotations on canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    annotations
      .filter(a => a.pageNumber === pageNumber)
      .forEach(annotation => {
        ctx.save();
        
        switch (annotation.type) {
          case 'highlight':
            ctx.fillStyle = annotation.style.color;
            ctx.globalAlpha = annotation.style.opacity * 0.3;
            const hWidth = Math.abs(annotation.endPoint.x - annotation.startPoint.x);
            const hHeight = Math.abs(annotation.endPoint.y - annotation.startPoint.y);
            ctx.fillRect(
              Math.min(annotation.startPoint.x, annotation.endPoint.x),
              Math.min(annotation.startPoint.y, annotation.endPoint.y),
              hWidth,
              hHeight
            );
            break;

          case 'drawing':
            if (annotation.points.length > 1) {
              ctx.strokeStyle = annotation.style.color;
              ctx.lineWidth = annotation.style.thickness;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.globalAlpha = annotation.style.opacity;
              
              ctx.beginPath();
              ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
              annotation.points.forEach((point, i) => {
                if (i > 0) ctx.lineTo(point.x, point.y);
              });
              ctx.stroke();
            }
            break;

          case 'rectangle':
            ctx.strokeStyle = annotation.style.color;
            ctx.lineWidth = annotation.style.thickness;
            ctx.globalAlpha = annotation.style.opacity;
            const rWidth = annotation.endPoint.x - annotation.startPoint.x;
            const rHeight = annotation.endPoint.y - annotation.startPoint.y;
            ctx.strokeRect(annotation.startPoint.x, annotation.startPoint.y, rWidth, rHeight);
            break;

          case 'arrow':
            ctx.strokeStyle = annotation.style.color;
            ctx.fillStyle = annotation.style.color;
            ctx.lineWidth = annotation.style.thickness;
            ctx.globalAlpha = annotation.style.opacity;
            
            const { startPoint: aStart, endPoint: aEnd } = annotation;
            const angle = Math.atan2(aEnd.y - aStart.y, aEnd.x - aStart.x);
            const headLength = 15;
            
            ctx.beginPath();
            ctx.moveTo(aStart.x, aStart.y);
            ctx.lineTo(aEnd.x, aEnd.y);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(aEnd.x, aEnd.y);
            ctx.lineTo(
              aEnd.x - headLength * Math.cos(angle - Math.PI / 6),
              aEnd.y - headLength * Math.sin(angle - Math.PI / 6)
            );
            ctx.lineTo(
              aEnd.x - headLength * Math.cos(angle + Math.PI / 6),
              aEnd.y - headLength * Math.sin(angle + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fill();
            break;

          case 'comment':
            // Draw comment marker
            ctx.fillStyle = '#fbbf24';
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.arc(annotation.position.x, annotation.position.y, 12, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#000';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💬', annotation.position.x, annotation.position.y);
            break;
        }
        
        ctx.restore();
      });

    // Draw current drawing in progress
    if (isDrawing && currentPoints.length > 1 && activeTool === 'draw') {
      ctx.save();
      ctx.strokeStyle = activeStyle.color;
      ctx.lineWidth = activeStyle.thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = activeStyle.opacity;
      
      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      currentPoints.forEach((point, i) => {
        if (i > 0) ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.restore();
    }

    // Draw current shape preview
    if (isDrawing && startPoint && (activeTool === 'rectangle' || activeTool === 'arrow' || activeTool === 'highlight')) {
      const lastPoint = currentPoints[currentPoints.length - 1] || startPoint;
      ctx.save();
      ctx.strokeStyle = activeStyle.color;
      ctx.lineWidth = activeStyle.thickness;
      ctx.globalAlpha = activeTool === 'highlight' ? 0.3 : activeStyle.opacity;

      if (activeTool === 'rectangle' || activeTool === 'highlight') {
        if (activeTool === 'highlight') {
          ctx.fillStyle = activeStyle.color;
          ctx.fillRect(
            Math.min(startPoint.x, lastPoint.x),
            Math.min(startPoint.y, lastPoint.y),
            Math.abs(lastPoint.x - startPoint.x),
            Math.abs(lastPoint.y - startPoint.y)
          );
        } else {
          ctx.strokeRect(
            startPoint.x,
            startPoint.y,
            lastPoint.x - startPoint.x,
            lastPoint.y - startPoint.y
          );
        }
      } else if (activeTool === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(lastPoint.x, lastPoint.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [annotations, pageNumber, isDrawing, currentPoints, startPoint, activeTool, activeStyle]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'select') return;

    const point = getPoint(e);

    if (activeTool === 'comment') {
      const comment: CommentAnnotation = {
        ...createBaseAnnotation(),
        type: 'comment',
        position: point,
        content: '',
        isResolved: false,
      };
      onAddAnnotation(comment);
      if (onCommentClick) onCommentClick(comment);
      return;
    }

    if (activeTool === 'eraser') {
      // Find and remove annotation at click point
      const clickedAnnotation = annotations.find(a => {
        if (a.pageNumber !== pageNumber) return false;
        
        switch (a.type) {
          case 'comment':
            const dist = Math.sqrt(
              Math.pow(a.position.x - point.x, 2) + 
              Math.pow(a.position.y - point.y, 2)
            );
            return dist < 15;
          case 'rectangle':
          case 'highlight':
            return point.x >= Math.min(a.startPoint.x, a.endPoint.x) &&
                   point.x <= Math.max(a.startPoint.x, a.endPoint.x) &&
                   point.y >= Math.min(a.startPoint.y, a.endPoint.y) &&
                   point.y <= Math.max(a.startPoint.y, a.endPoint.y);
          case 'drawing':
            return a.points.some(p => {
              const d = Math.sqrt(Math.pow(p.x - point.x, 2) + Math.pow(p.y - point.y, 2));
              return d < 10;
            });
          default:
            return false;
        }
      });
      
      if (clickedAnnotation) {
        onRemoveAnnotation(clickedAnnotation.id);
      }
      return;
    }

    setIsDrawing(true);
    setStartPoint(point);
    setCurrentPoints([point]);
  }, [activeTool, getPoint, createBaseAnnotation, onAddAnnotation, onCommentClick, annotations, pageNumber, onRemoveAnnotation]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing) return;
    
    const point = getPoint(e);
    setCurrentPoints(prev => [...prev, point]);
  }, [isDrawing, getPoint]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !startPoint) {
      setIsDrawing(false);
      return;
    }

    const endPoint = currentPoints[currentPoints.length - 1] || startPoint;

    switch (activeTool) {
      case 'draw':
        if (currentPoints.length > 1) {
          const drawing: DrawingAnnotation = {
            ...createBaseAnnotation(),
            type: 'drawing',
            points: currentPoints,
            style: activeStyle,
          };
          onAddAnnotation(drawing);
        }
        break;

      case 'highlight':
        const highlight: HighlightAnnotation = {
          ...createBaseAnnotation(),
          type: 'highlight',
          startPoint,
          endPoint,
          style: { color: activeStyle.color, opacity: activeStyle.opacity },
        };
        onAddAnnotation(highlight);
        break;

      case 'rectangle':
        const rectangle: RectangleAnnotation = {
          ...createBaseAnnotation(),
          type: 'rectangle',
          startPoint,
          endPoint,
          style: activeStyle,
        };
        onAddAnnotation(rectangle);
        break;

      case 'arrow':
        const arrow: ArrowAnnotation = {
          ...createBaseAnnotation(),
          type: 'arrow',
          startPoint,
          endPoint,
          style: activeStyle,
        };
        onAddAnnotation(arrow);
        break;
    }

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoints([]);
  }, [isDrawing, startPoint, currentPoints, activeTool, createBaseAnnotation, activeStyle, onAddAnnotation]);

  const getCursor = () => {
    switch (activeTool) {
      case 'select': return 'default';
      case 'comment': return 'crosshair';
      case 'highlight': return 'text';
      case 'draw': return 'crosshair';
      case 'rectangle': return 'crosshair';
      case 'arrow': return 'crosshair';
      case 'eraser': return 'pointer';
      default: return 'default';
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={cn('absolute inset-0', className)}
      style={{ cursor: getCursor() }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}
