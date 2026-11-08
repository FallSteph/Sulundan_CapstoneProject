import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Loader2, Upload, CheckCircle2, AlertCircle, Download, X, FileText, FileType, ExternalLink, RefreshCw } from 'lucide-react';
import { renderAsync } from 'docx-preview';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

type TemplateItem = {
  id: string;
  type: 'syllabus' | 'form17' | 'form18';
  title: string;
  version: number;
  isActive: boolean;
  url: string;
  createdAt: string;
};

const API = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:5000';

function FileViewerModal({ 
  isOpen, 
  onClose, 
  fileUrl, 
  fileType, 
  title 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  fileUrl: string; 
  fileType: 'pdf' | 'docx' | 'doc'; 
  title: string;
}) {
  const [iframeKey, setIframeKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const docxContainerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && (fileType === 'docx' || fileType === 'doc') && docxContainerRef.current) {
      renderDocx();
    }
  }, [isOpen, fileUrl, fileType]);

  const renderDocx = async () => {
    if (!docxContainerRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error('Failed to fetch document');
      const arrayBuffer = await response.arrayBuffer();
      
      docxContainerRef.current.innerHTML = '';
      
      // Add a style block to ensure the preview looks like a real document
      const style = document.createElement('style');
      style.innerHTML = `
        .docx-preview {
          background-color: white !important;
          color: black !important;
          padding: 50px !important;
          margin: 20px auto !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
          width: 100% !important;
          max-width: 816px !important;
          min-height: 1056px !important;
          height: auto !important;
          box-sizing: border-box !important;
          border: 1px solid #e2e8f0 !important;
        }
        .docx-preview p, .docx-preview span, .docx-preview h1, .docx-preview h2, .docx-preview h3 {
          color: black !important;
          word-break: break-word !important;
        }
        .docx-preview table {
          border-collapse: collapse !important;
          width: 100% !important;
          table-layout: fixed !important;
          word-break: break-word !important;
          border: 1px solid black !important;
        }
        .docx-preview td, .docx-preview th {
          border: 1px solid black !important;
          padding: 4px !important;
        }
        .docx-preview img {
          max-width: 100% !important;
          height: auto !important;
        }
      `;
      docxContainerRef.current.appendChild(style);

      await renderAsync(arrayBuffer, docxContainerRef.current, undefined, {
        className: "docx-preview",
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        debug: false,
        experimental: false,
        trimXmlDeclaration: true,
        useBase64URL: false,
      });
    } catch (err: any) {
      console.error('Docx preview error:', err);
      setError(err.message || 'Failed to render document preview');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInNewTab = () => {
    window.open(fileUrl, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden flex flex-col border-none shadow-2xl">
        <DialogHeader className="p-4 border-b bg-background flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              {fileType === 'pdf' ? <FileText className="h-5 w-5" /> : <FileType className="h-5 w-5" />}
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {fileType.toUpperCase()} Document • Preview Mode
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pr-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenInNewTab}
              className="h-8 w-8 p-0"
              title="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive">
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="flex-1 bg-muted/30 relative overflow-hidden flex flex-col">
          {fileType === 'pdf' ? (
            <iframe
              key={iframeKey}
              src={`${fileUrl}#toolbar=0&navpanes=0`}
              className="w-full h-full border-none bg-card"
              title="PDF Viewer"
            />
          ) : (
            <div className="w-full h-full overflow-auto bg-[#525659] p-4 sm:p-8 flex flex-col items-center">
              {loading && (
                <div className="absolute inset-0 z-10 bg-background/80 flex flex-col items-center justify-center">
                  <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                  <p className="text-sm font-medium text-muted-foreground">Rendering preview...</p>
                </div>
              )}
              
              {error ? (
                <div className="flex flex-col items-center justify-center p-8 text-center max-w-md my-auto">
                  <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6">
                    <AlertCircle className="h-10 w-10 text-destructive" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3">Preview Failed</h3>
                  <p className="text-muted-foreground mb-8">{error}</p>
                  <div className="flex flex-col sm:flex-row gap-3 w-full">
                    <Button onClick={renderDocx} className="flex-1">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Try Again
                    </Button>
                    <Button variant="outline" onClick={() => window.open(fileUrl, '_blank')} className="flex-1">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>
              ) : (
                <div 
                  ref={docxContainerRef} 
                  className="docx-preview-container w-full max-w-[816px] shadow-2xl bg-white h-fit mb-8"
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Uploader({ type }: { type: 'syllabus' | 'form17' | 'form18' }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const { toast } = useToast();
  
  // Preview Modal State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewType, setPreviewType] = useState<'pdf' | 'docx' | 'doc'>('docx');

  const display = useMemo(() => {
    return type === 'syllabus' ? 'Syllabus' : (type === 'form17' ? 'Form 17' : 'Form 18');
  }, [type]);

  const load = async () => {
    try {
      const res = await fetch(`${API}/templates-api?type=${encodeURIComponent(type)}`);
      const data = await res.json();
      if (data?.success && Array.isArray(data.templates)) {
        setItems(data.templates);
      }
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const onPreview = (it: TemplateItem) => {
    let url = it.url;
    // Prepend API base URL if the path is relative
    if (url.startsWith('/')) {
      url = `${API}${url}`;
    }
    
    if (url.includes('host.docker.internal')) {
      url = url.replace('host.docker.internal', 'localhost');
    }
    
    const fileType = url.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx';
    setPreviewUrl(url);
    setPreviewTitle(it.title || `${display} v${it.version}`);
    setPreviewType(fileType);
    setIsPreviewOpen(true);
  };

  const onDownload = (it: TemplateItem) => {
    let url = it.url;
    // Prepend API base URL if the path is relative
    if (url.startsWith('/')) {
      url = `${API}${url}`;
    }

    if (url.includes('host.docker.internal')) {
      url = url.replace('host.docker.internal', 'localhost');
    }
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${it.type}-v${it.version}${url.toLowerCase().endsWith('.pdf') ? '.pdf' : '.docx'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const onUpload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      // Use FileReader for robust base64 encoding
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const fileData = await base64Promise;

      const body = { type, title: title.trim(), fileName: file.name, fileData };
      const res = await fetch(`${API}/templates-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      const data = await res.json();
      if (res.ok && data?.success) {
        toast({
          title: 'Template Uploaded',
          description: `Successfully uploaded ${display} template and notified users.`,
        });
        await load();
        setTitle('');
        setFile(null);
        // Reset file input
        const input = document.getElementById(`${type}-file`) as HTMLInputElement;
        if (input) input.value = '';
      } else {
        throw new Error(data?.error || 'Failed to upload template');
      }
    } catch (err: any) {
      toast({
        title: 'Upload Failed',
        description: err.message || 'An error occurred during upload.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const onActivate = async (id: string) => {
    try {
      const res = await fetch(`${API}/templates-api/${id}/activate`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (data?.success) {
        toast({
          title: 'Template Activated',
          description: 'This template is now the default for all new syllabi.',
        });
        await load();
      }
    } catch {
      toast({
        title: 'Activation Failed',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle>{display} Template</CardTitle>
        <CardDescription>Upload a new {display} template and notify all faculty/reviewers</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label htmlFor={`${type}-title`}>Title (optional)</Label>
            <Input id={`${type}-title`} value={title} onChange={e => setTitle(e.target.value)} placeholder={`${display} Template v…`} />
          </div>
          <div>
            <Label htmlFor={`${type}-file`}>File (.docx or .pdf)</Label>
            <Input id={`${type}-file`} type="file" accept=".docx,.doc,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" className="w-full" disabled={!file || busy} onClick={onUpload}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading & Notifying...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload & Notify
              </>
            )}
          </Button>
        </div>
        <div className="pt-2">
          <div className="text-sm font-medium mb-2 flex items-center justify-between">
            <span>Recent Versions</span>
            {items.length > 0 && <Badge variant="outline">{items.length}</Badge>}
          </div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {items.map(it => (
              <div key={it.id} className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${it.isActive ? 'bg-primary/5 border-primary/20' : 'bg-card'}`}>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={it.isActive ? 'default' : 'secondary'} className="text-[10px] uppercase">
                      {it.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">v{it.version}</span>
                  </div>
                  <div className="text-sm font-medium truncate" title={it.title}>{it.title || `${display} v${it.version}`}</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(it.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onPreview(it)} title="Preview">
                    <Eye className="h-4 w-4" />
                  </Button>
                  {!it.isActive && (
                    <Button size="sm" variant="outline" className="h-8 text-xs px-2" onClick={() => onActivate(it.id)}>
                      Activate
                    </Button>
                  )}
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => onDownload(it)} title="Download">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <div className="text-center py-8 rounded-lg border border-dashed">
                <div className="text-xs text-muted-foreground">No templates uploaded yet.</div>
              </div>
            )}
          </div>
        </div>
      </CardContent>

      <FileViewerModal 
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        fileUrl={previewUrl}
        fileType={previewType}
        title={previewTitle}
      />
    </Card>
  );
}

export default function TemplatesAdminPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Template Manager
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Manage syllabus and form templates. Uploading a new template will notify all faculty and reviewers with a download link.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Uploader type="syllabus" />
        <Uploader type="form17" />
        <Uploader type="form18" />
      </div>
    </div>
  );
}
