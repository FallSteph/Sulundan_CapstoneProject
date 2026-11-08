import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, Save, Bold, Italic, Underline } from 'lucide-react';
import mammoth from 'mammoth';
import htmlToDocx from 'html-to-docx';

type DocxHtmlEditorProps = {
  fileUrl: string;
  className?: string;
};

export function DocxHtmlEditor(props: DocxHtmlEditorProps) {
  const { fileUrl, className } = props;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentHtml, setContentHtml] = useState<string>('');
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let aborted = false;
    async function loadDocx() {
      setError(null);
      setLoading(true);
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`Failed to fetch ${fileUrl}: ${res.status}`);
        const buf = await res.arrayBuffer();

        const { value } = await mammoth.convertToHtml({ arrayBuffer: buf }, {
          includeDefaultStyleMap: true,
        });

        if (aborted) return;
        setContentHtml(value || '<p></p>');
      } catch (e: unknown) {
        setError(e?.message || 'Failed to load document');
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    loadDocx();
    return () => {
      aborted = true;
    };
  }, [fileUrl]);

  const execInline = (cmd: 'bold' | 'italic' | 'underline') => {
    document.execCommand(cmd);
  };

  const handleSaveDocx = async () => {
    try {
      const html = editorRef.current?.innerHTML || contentHtml;
      const blob = await htmlToDocx(html, undefined, {
        orientation: 'portrait',
        margins: { top: 720, right: 720, bottom: 720, left: 720 },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'edited.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e?.message || 'Failed to export DOCX');
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2 p-2 border-b bg-background sticky top-0 z-10">
        <Button variant="outline" size="sm" onClick={() => execInline('bold')} className="gap-1">
          <Bold className="h-4 w-4" /> Bold
        </Button>
        <Button variant="outline" size="sm" onClick={() => execInline('italic')} className="gap-1">
          <Italic className="h-4 w-4" /> Italic
        </Button>
        <Button variant="outline" size="sm" onClick={() => execInline('underline')} className="gap-1">
          <Underline className="h-4 w-4" /> Underline
        </Button>
        <Separator orientation="vertical" className="mx-2 h-6" />
        <Button size="sm" onClick={handleSaveDocx} className="gap-2">
          <Save className="h-4 w-4" /> Save as DOCX
        </Button>
        {loading && (
          <div className="ml-auto flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        )}
      </div>
      {error && (
        <div className="p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="p-3">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="prose max-w-none min-h-[400px] border rounded-md p-4 focus:outline-none"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
        <p className="text-xs text-muted-foreground mt-2">
          Editing is based on an HTML conversion of the DOCX body. Complex layouts, headers, footers, and exact pagination are not preserved here.
        </p>
      </div>
    </div>
  );
}

