import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  fileUrl: string;
  documentType?: 'word' | 'cell' | 'slide';
  mode?: 'view' | 'edit';
  documentServerUrl?: string;
  className?: string;
};

type OnlyOfficeNamespace = {
  DocEditor: new (element: HTMLElement, config: unknown) => { destroyEditor: () => void };
};

declare const DocsAPI: OnlyOfficeNamespace;

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if ((existing as HTMLScriptElement & { _loaded?: boolean })._loaded) return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load script')));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => {
      (s as HTMLScriptElement & { _loaded?: boolean })._loaded = true;
      resolve();
    };
    s.onerror = () => reject(new Error('Failed to load script'));
    document.body.appendChild(s);
  });

export function OnlyOfficeEditor({
  fileUrl,
  documentType = 'word',
  mode = 'view',
  documentServerUrl,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<{ destroyEditor: () => void } | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);

  const dsUrl = useMemo(
    () => (documentServerUrl || import.meta.env.VITE_ONLYOFFICE_DOCSERVER_URL || 'https://documentserver/').replace(/\/+$/, ''),
    [documentServerUrl]
  );

  const fileType = useMemo(() => {
    const ext = fileUrl.split('.').pop()?.toLowerCase();
    if (ext === 'docx' || ext === 'docm' || ext === 'dotx') return 'docx';
    if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xltx') return 'xlsx';
    if (ext === 'pptx' || ext === 'pptm' || ext === 'potx') return 'pptx';
    return 'docx';
  }, [fileUrl]);

  const key = useMemo(() => {
    try {
      return btoa(unescape(encodeURIComponent(`${fileUrl}|${mode}|${fileType}`))).slice(0, 32);
    } catch {
      return `${Date.now()}`;
    }
  }, [fileUrl, mode, fileType]);

  // Build a document URL reachable from the DocumentServer container.
  // If the incoming fileUrl is relative, make it absolute from the browser's origin.
  // If DocumentServer runs on localhost, rewrite origin host to host.docker.internal for Docker-to-host access.
  const effectiveDocUrl = useMemo(() => {
    try {
      let absoluteUrl: URL;
      if (/^https?:\/\//i.test(fileUrl)) {
        absoluteUrl = new URL(fileUrl);
      } else if (fileUrl.startsWith('/')) {
        absoluteUrl = new URL(fileUrl, window.location.origin);
      } else {
        absoluteUrl = new URL(`/${fileUrl}`, window.location.origin);
      }

      return absoluteUrl.toString();
    } catch {
      return fileUrl;
    }
  }, [fileUrl]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        await loadScript(`${dsUrl}/web-apps/apps/api/documents/api.js`);
        if (cancelled) return;
        setReady(true);
      } catch {
        setReady(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [dsUrl]);

  useEffect(() => {
    if (!ready || !containerRef.current || typeof DocsAPI === 'undefined') return;
    if (editorRef.current) {
      try {
        editorRef.current.destroyEditor();
      } catch {
        void 0;
      }
      editorRef.current = null;
    }
    const cfg = {
      document: {
        fileType,
        key,
        title: fileUrl.split('/').pop() || 'Document',
        url: effectiveDocUrl,
      },
      documentType: documentType === 'cell' ? 'cell' : documentType === 'slide' ? 'slide' : 'word',
      editorConfig: {
        mode: mode === 'edit' ? 'edit' : 'view',
        customization: {
          chat: false,
          comments: false,
          hideRightMenu: true,
          zoom: 100,
        },
      },
      width: '100%',
      height: '100%',
    };
    try {
      editorRef.current = new (DocsAPI as OnlyOfficeNamespace).DocEditor(containerRef.current, cfg);
    } catch {
      editorRef.current = null;
    }
    return () => {
      if (editorRef.current) {
        try {
          editorRef.current.destroyEditor();
        } catch {
          void 0;
        }
        editorRef.current = null;
      }
    };
  }, [ready, fileUrl, documentType, mode, fileType, key, effectiveDocUrl]);

  return (
    <div className={cn('relative h-full w-full bg-background', className)}>
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
          className="h-7 px-2 rounded border bg-card text-foreground text-xs"
          aria-label="Zoom out"
          title="Zoom out"
        >
          –
        </button>
        <span className="px-2 text-xs">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
          className="h-7 px-2 rounded border bg-card text-foreground text-xs"
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="h-7 px-2 rounded border bg-card text-foreground text-xs"
          aria-label="Reset zoom"
          title="Reset zoom"
        >
          Reset
        </button>
      </div>
      <div
        ref={containerRef}
        className="h-full w-full overflow-auto"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading editor…</div>
        </div>
      )}
    </div>
  );
}
