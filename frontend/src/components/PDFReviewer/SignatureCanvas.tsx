import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Trash2, Check, User, Calendar, Download, Upload, Image as ImageIcon, Maximize2, X, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Signature, Point } from './types';
import { UserRole, ROLE_LABELS } from '@/types';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface SignatureCanvasProps {
  userId: string;
  userName: string;
  userRole: UserRole;
  existingSignature?: Signature | null;
  onSignatureCreate: (signature: Signature) => void;
  onSignatureClear: () => void;
  className?: string;
  isModal?: boolean;
}

export function SignatureCanvas({
  userId,
  userName,
  userRole,
  existingSignature,
  onSignatureCreate,
  onSignatureClear,
  className,
  isModal = false,
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isFsDrawing, setIsFsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [fHasDrawn, setFHasDrawn] = useState(false);
  const [isFullscreenModalOpen, setIsFullscreenModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'draw' | 'upload'>('draw');
  const [isDragging, setIsDragging] = useState(false);
  const lastPointRef = useRef<Point | null>(null);
  const fsLastPointRef = useRef<Point | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    // Draw existing signature if present
    if (existingSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
      };
      // Prefer raw ink data if available, so we don't draw the date back onto the canvas
      img.src = existingSignature.rawImageData || existingSignature.imageData;
      setHasDrawn(true);
    }
  }, [existingSignature]);

  // Initialize fullscreen canvas when modal opens
  useEffect(() => {
    if (!isFullscreenModalOpen) return;
    // Wait for DOM to mount
    const timer = setTimeout(() => {
      const c = fullscreenCanvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      c.width = c.offsetWidth * 2;
      c.height = c.offsetHeight * 2;
      ctx.scale(2, 2);
    }, 50);
    return () => clearTimeout(timer);
  }, [isFullscreenModalOpen]);

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

    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPointRef.current = point;
    setHasDrawn(true);
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
    setHasDrawn(false);
    onSignatureClear();
  }, [onSignatureClear]);

  const getSignatureWithDateDataUrl = useCallback((originalCanvas: HTMLCanvasElement, dateStr: string): string => {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return originalCanvas.toDataURL('image/png');

    const width = originalCanvas.width;
    const height = originalCanvas.height;
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

    // Set font to measure required text width
    const fontSize = Math.max(13, Math.round(height * 0.13));
    tempCtx.font = `bold ${fontSize}px 'Book Antiqua', 'Palatino Linotype', Palatino, serif`;
    const textWidth = tempCtx.measureText(dateStr).width;
    
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
    tempCtx.fillText(dateStr, dateStartX, height / 2);

    return tempCanvas.toDataURL('image/png');
  }, []);

  const saveSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;

    const dateStr = format(new Date(), 'MM/dd/yyyy');
    const rawImageData = canvas.toDataURL('image/png');
    const imageData = getSignatureWithDateDataUrl(canvas, dateStr);
    
    const signature: Signature = {
      id: crypto.randomUUID(),
      imageData,
      rawImageData,
      signerId: userId,
      signerName: userName,
      signerRole: userRole,
      timestamp: new Date().toISOString(),
      position: { x: 0, y: 0 },
      pageNumber: 1,
    };

    onSignatureCreate(signature);
  }, [hasDrawn, userId, userName, userRole, onSignatureCreate, getSignatureWithDateDataUrl]);

  const handleImageUpload = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas first
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw image onto canvas maintaining aspect ratio if needed, 
        // but here we just fill it or fit it
        const hRatio = (canvas.width / 2) / img.width;
        const vRatio = (canvas.height / 2) / img.height;
        const ratio = Math.min(hRatio, vRatio);
        const centerShift_x = ((canvas.width / 2) - img.width * ratio) / 2;
        const centerShift_y = ((canvas.height / 2) - img.height * ratio) / 2;

        ctx.drawImage(img, 0, 0, img.width, img.height,
          centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);
        
        setHasDrawn(true);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageUpload(file);
  };

  const downloadSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dateStr = format(new Date(), 'MM/dd/yyyy');
    const dataUrl = getSignatureWithDateDataUrl(canvas, dateStr);
    const a = document.createElement('a');
    const safeName = (userName || 'signature').replace(/[^a-z0-9_\-]+/gi, '_');
    a.href = dataUrl;
    a.download = `${safeName}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [userName, getSignatureWithDateDataUrl]);

  return (
    <>
    <Card className={cn('shadow-soft', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4" />
          Digital Signature
        </CardTitle>
        <CardDescription>
          Sign below to authorize your review action
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Signer info */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">{userName}</Badge>
          <Badge variant="outline">{ROLE_LABELS[userRole]}</Badge>
          <span className="text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(new Date(), 'MMM d, yyyy')}
          </span>
        </div>

        {/* Signature Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="draw" className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Draw
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload
            </TabsTrigger>
          </TabsList>

          <div className="relative h-32">
            {/* Draw Mode - Always in DOM to preserve canvas reference */}
            <div 
              className={cn(
                'absolute inset-0 border-2 border-dashed rounded-xl overflow-hidden transition-all duration-200',
                activeTab === 'draw' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none',
                hasDrawn ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'
              )}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full touch-none cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              {!hasDrawn && activeTab === 'draw' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-muted-foreground text-sm">Draw your signature here</p>
                </div>
              )}
            </div>

            {/* Upload Mode */}
            <div 
              className={cn(
                'absolute inset-0 border-2 border-dashed rounded-xl overflow-hidden transition-all duration-200 flex flex-col items-center justify-center gap-2 cursor-pointer',
                activeTab === 'upload' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none',
                isDragging ? 'border-primary bg-primary/10 scale-[0.99]' : 'border-border bg-muted/30 hover:bg-muted/50',
                hasDrawn && !isDragging && 'border-primary bg-primary/5'
              )}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={onFileChange}
              />
              {hasDrawn ? (
                <div className="flex flex-col items-center gap-1">
                  <Check className="h-8 w-8 text-success" />
                  <p className="text-sm font-medium text-success">Signature ready</p>
                  <p className="text-xs text-muted-foreground">Click to change or switch to draw</p>
                </div>
              ) : (
                <>
                  <div className="p-2 rounded-full bg-primary/10">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-center px-4">
                    <p className="text-sm font-medium">Upload or drag and drop</p>
                    <p className="text-xs text-muted-foreground">PNG/JPG signature</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </Tabs>

        {/* Actions */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row lg:flex-col min-[1400px]:flex-row items-stretch gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={clearSignature}
              disabled={!hasDrawn}
              className="flex-1 bg-warning/10 text-warning hover:bg-warning hover:text-warning-foreground border-warning/20 px-4 py-2"
            >
              <Trash2 className="h-4 w-4 mr-2 shrink-0" />
              <span>Clear</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={saveSignature}
              disabled={!hasDrawn}
              className="flex-1 bg-[#1e293b] hover:bg-[#0f172a] px-4 py-2"
            >
              <Check className="h-4 w-4 mr-2 shrink-0" />
              <span>Save Signature</span>
            </Button>
          </div>
          {!isModal && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.preventDefault(); setIsFullscreenModalOpen(true); }}
              className="w-full px-4 py-2"
            >
              <Maximize2 className="h-4 w-4 mr-2 shrink-0" />
              <span>Fullscreen Mode</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={downloadSignature}
            disabled={!hasDrawn}
            className="w-full px-4 py-2"
          >
            <Download className="h-4 w-4 mr-2 shrink-0" />
            <span>Download PNG</span>
          </Button>
        </div>

        {/* Signature status */}
        {existingSignature && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
            <Check className="h-4 w-4 text-success" />
            <span className="text-sm text-success font-medium">
              Signature saved
            </span>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Fullscreen Drawing Pad Modal */}
    {!isModal && (
      <Dialog open={isFullscreenModalOpen} onOpenChange={(open) => {
        setIsFullscreenModalOpen(open);
        if (!open) { setFHasDrawn(false); }
      }}>
        <DialogContent className="sm:max-w-4xl max-w-[95vw] w-full h-[85vh] max-h-[720px] flex flex-col p-5 md:p-6 gap-4 overflow-hidden bg-background border shadow-2xl rounded-2xl">
          <DialogHeader className="shrink-0 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <FileSignature className="h-5 w-5 text-primary" />
              Draw Your Signature
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
              Use the large canvas below to sign. Click <strong>Save Signature</strong> when done.
            </DialogDescription>
          </DialogHeader>

          {/* Fullscreen canvas */}
          <div 
            className="relative flex-1 w-full border-2 border-dashed rounded-xl overflow-hidden bg-white shadow-inner transition-colors duration-200"
            style={{ borderColor: fHasDrawn ? 'hsl(var(--primary))' : undefined }}
          >
            <canvas
              ref={fullscreenCanvasRef}
              className="w-full h-full touch-none cursor-crosshair"
              onMouseDown={(e) => {
                e.preventDefault();
                const c = fullscreenCanvasRef.current;
                if (!c) return;
                const rect = c.getBoundingClientRect();
                const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                fsLastPointRef.current = pt;
                setIsFsDrawing(true);
                const ctx = c.getContext('2d');
                ctx?.beginPath();
                ctx?.moveTo(pt.x, pt.y);
              }}
              onMouseMove={(e) => {
                if (!isFsDrawing) return;
                e.preventDefault();
                const c = fullscreenCanvasRef.current;
                const ctx = c?.getContext('2d');
                if (!ctx || !fsLastPointRef.current) return;
                const rect = c!.getBoundingClientRect();
                const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                ctx.strokeStyle = '#1a1a2e';
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineTo(pt.x, pt.y);
                ctx.stroke();
                fsLastPointRef.current = pt;
                setFHasDrawn(true);
              }}
              onMouseUp={() => { setIsFsDrawing(false); fsLastPointRef.current = null; }}
              onMouseLeave={() => { setIsFsDrawing(false); fsLastPointRef.current = null; }}
              onTouchStart={(e) => {
                e.preventDefault();
                const c = fullscreenCanvasRef.current;
                if (!c) return;
                const rect = c.getBoundingClientRect();
                const t = e.touches[0];
                const pt = { x: t.clientX - rect.left, y: t.clientY - rect.top };
                fsLastPointRef.current = pt;
                setIsFsDrawing(true);
                const ctx = c.getContext('2d');
                ctx?.beginPath();
                ctx?.moveTo(pt.x, pt.y);
              }}
              onTouchMove={(e) => {
                if (!isFsDrawing) return;
                e.preventDefault();
                const c = fullscreenCanvasRef.current;
                const ctx = c?.getContext('2d');
                if (!ctx || !fsLastPointRef.current) return;
                const rect = c!.getBoundingClientRect();
                const t = e.touches[0];
                const pt = { x: t.clientX - rect.left, y: t.clientY - rect.top };
                ctx.strokeStyle = '#1a1a2e';
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineTo(pt.x, pt.y);
                ctx.stroke();
                fsLastPointRef.current = pt;
                setFHasDrawn(true);
              }}
              onTouchEnd={() => { setIsFsDrawing(false); fsLastPointRef.current = null; }}
            />
            {!fHasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-muted-foreground text-base sm:text-lg select-none">Draw your signature here</p>
              </div>
            )}
          </div>

          {/* Fullscreen actions */}
          <div className="flex flex-col sm:flex-row gap-2 shrink-0 pt-1">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-10 font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setIsFullscreenModalOpen(false)}
            >
              <X className="h-4 w-4 mr-2" /> Cancel
            </Button>
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-10 font-medium bg-warning/10 text-warning hover:bg-warning hover:text-warning-foreground border-warning/20"
              onClick={() => {
                const c = fullscreenCanvasRef.current;
                if (!c) return;
                const ctx = c.getContext('2d');
                ctx?.clearRect(0, 0, c.width, c.height);
                setFHasDrawn(false);
              }}
              disabled={!fHasDrawn}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Clear
            </Button>
            <Button
              className="flex-1 rounded-xl h-10 font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              disabled={!fHasDrawn}
              onClick={() => {
                const c = fullscreenCanvasRef.current;
                if (!c || !fHasDrawn) return;
                const dateStr = format(new Date(), 'MM/dd/yyyy');
                const rawImageData = c.toDataURL('image/png');
                const imageData = getSignatureWithDateDataUrl(c, dateStr);
                const sig: Signature = {
                  id: crypto.randomUUID(),
                  imageData,
                  rawImageData,
                  signerId: userId,
                  signerName: userName,
                  signerRole: userRole,
                  timestamp: new Date().toISOString(),
                  position: { x: 0, y: 0 },
                  pageNumber: 1,
                };
                onSignatureCreate(sig);
                setIsFullscreenModalOpen(false);
                setFHasDrawn(false);
              }}
            >
              <Check className="h-4 w-4 mr-2" /> Save Signature
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}
