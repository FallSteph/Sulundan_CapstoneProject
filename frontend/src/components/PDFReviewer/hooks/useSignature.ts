import { useState, useCallback, useRef } from 'react';
import { Signature, Point } from '../types';
import { UserRole } from '@/types';
import { format } from 'date-fns';

interface UseSignatureProps {
  userId: string;
  userName: string;
  userRole: UserRole;
}

interface UseSignatureReturn {
  signature: Signature | null;
  isDrawing: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  startDrawing: (e: React.MouseEvent | React.TouchEvent) => void;
  draw: (e: React.MouseEvent | React.TouchEvent) => void;
  stopDrawing: () => void;
  clearSignature: () => void;
  saveSignature: (position: Point, pageNumber: number) => void;
  hasSignature: boolean;
}

export function useSignature({ userId, userName, userRole }: UseSignatureProps): UseSignatureReturn {
  const [signature, setSignature] = useState<Signature | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPointRef = useRef<Point | null>(null);

  const getPoint = useCallback((e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const point = getPoint(e);
    lastPointRef.current = point;
    setIsDrawing(true);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    }
  }, [getPoint]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !lastPointRef.current) return;

    const point = getPoint(e);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPointRef.current = point;
  }, [isDrawing, getPoint]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    lastPointRef.current = null;
  }, []);

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setSignature(null);
  }, []);

  const getSignatureWithDateDataUrl = useCallback((originalCanvas: HTMLCanvasElement, dateStr?: string): string => {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return originalCanvas.toDataURL('image/png');

    const width = originalCanvas.width;
    const height = originalCanvas.height;

    // Same total size — signature left 58%, date right next to it, no divider.
    tempCanvas.width = width;
    tempCanvas.height = height;

    // Draw the full signature to scan its pixels
    tempCtx.drawImage(originalCanvas, 0, 0);

    // Scan pixels to find where the rightmost ink stroke actually is
    const imgData = tempCtx.getImageData(0, 0, width, height);
    let rightmostX = 0;
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] > 10) {
        const x = (i / 4) % width;
        if (x > rightmostX) rightmostX = x;
      }
    }

    // Clear temp canvas to redraw properly scaled
    tempCtx.clearRect(0, 0, width, height);

    const resolvedDate = dateStr || format(new Date(), 'MM/dd/yyyy');
    
    // Set font to measure required text width
    const fontSize = Math.max(13, Math.round(height * 0.13));
    tempCtx.font = `bold ${fontSize}px 'Book Antiqua', 'Palatino Linotype', Palatino, serif`;
    const textWidth = tempCtx.measureText(resolvedDate).width;
    
    const gap = 8;
    const margin = 12;
    
    // Check if the drawing is too wide to fit the date
    const maxAllowedX = width - textWidth - gap - margin;
    let scale = 1;
    if (rightmostX > maxAllowedX && rightmostX > 0) {
      scale = maxAllowedX / rightmostX;
    }

    // Draw signature (scaled and centered vertically if needed)
    const yOffset = (height - (height * scale)) / 2;
    tempCtx.drawImage(originalCanvas, 0, yOffset, width * scale, height * scale);

    // Place the date immediately after the signature
    const dateStartX = (rightmostX * scale) + gap;

    tempCtx.fillStyle = '#111111';
    tempCtx.textAlign = 'left';
    tempCtx.textBaseline = 'middle';
    // No maxWidth passed so it never gets squeezed
    tempCtx.fillText(resolvedDate, dateStartX, height / 2);

    return tempCanvas.toDataURL('image/png');
  }, []);

  const saveSignature = useCallback((position: Point, pageNumber: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const imageData = getSignatureWithDateDataUrl(canvas);
    
    const newSignature: Signature = {
      id: crypto.randomUUID(),
      imageData,
      signerId: userId,
      signerName: userName,
      signerRole: userRole,
      timestamp: new Date().toISOString(),
      position,
      pageNumber,
    };

    setSignature(newSignature);
  }, [userId, userName, userRole, getSignatureWithDateDataUrl]);

  const hasSignature = signature !== null || (() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return imageData.data.some((value, index) => index % 4 === 3 && value > 0);
  })();

  return {
    signature,
    isDrawing,
    canvasRef,
    startDrawing,
    draw,
    stopDrawing,
    clearSignature,
    saveSignature,
    hasSignature,
  };
}
