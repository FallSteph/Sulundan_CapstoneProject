import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';

type OnlyOfficeEditorProps = {
  syllabusId: string;
  mode?: 'view' | 'edit';
  docType?: 'syllabus' | 'form17' | 'form18';
  className?: string;
  onStateChange?: (modified: boolean) => void;
  signatureUrl?: string;
  signatureSearchText?: string;
  version?: number;
};

type OnlyOfficeApi = {
  DocEditor: new (el: string | HTMLElement, config: unknown) => unknown;
};

type EditorInstance = {
  destroyEditor?: () => void;
  createConnector?: () => EditorConnector;
};

type EditorConnector = {
  callCommand: (fn: () => void, isNoCalc?: boolean, isAsync?: boolean) => void;
  disconnect: () => void;
};

type OnlyOfficeConfig = {
  token?: string;
  jwt?: string;
  editorConfig?: {
    events?: Record<string, unknown>;
    plugins?: unknown;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export interface OnlyOfficeEditorHandle {
  insertSignatureViaConnector: (imageUrl: string, searchText: string, inTable: boolean, align?: "left" | "center" | "right") => Promise<boolean>;
}

export const OnlyOfficeEditor = React.memo(forwardRef<OnlyOfficeEditorHandle, OnlyOfficeEditorProps>(function OnlyOfficeEditor(props, ref) {
  const { syllabusId, mode = 'edit', docType = 'syllabus', className, onStateChange, signatureUrl, signatureSearchText, version } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const containerIdRef = useRef<string>(`onlyoffice_${Math.random().toString(36).slice(2)}`);
  const editorRef = useRef<EditorInstance | null>(null);
  const connectorRef = useRef<EditorConnector | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [ready, setReady] = useState<boolean>(false);
  const onStateChangeRef = useRef<(modified: boolean) => void>();

  onStateChangeRef.current = onStateChange;

  // Expose insertSignatureViaConnector to parent via ref
  useImperativeHandle(ref, () => ({
    insertSignatureViaConnector: async (imageUrl: string, searchText: string, inTable: boolean, align?: "left" | "center" | "right"): Promise<boolean> => {
      const editor = editorRef.current as any;
      if (!editor) {
        console.warn('[SigConnector] No editor instance');
        return false;
      }

      // ONLYOFFICE macros have bugs with horizontal/vertical alignment inside table cells.
      // For tables, we immediately return false to fallback to the more accurate Python backend.
      if (inTable) {
        return false;
      }

      // DO NOT convert localhost to host.docker.internal!
      // The macro runs in the browser iframe context where localhost works fine.
      // host.docker.internal only resolves inside Docker containers.
      const finalUrl = imageUrl;

      // Image dimensions: 1.9 inches wide, proportional height
      const widthEMU = Math.round(1.9 * 914400);
      const heightEMU = Math.round(widthEMU / 2.34);
      const vertOffset = inTable
        ? -Math.round(heightEMU * 0.45)
        : -Math.round(heightEMU * 0.85);

      const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'");

      const rawLower = (searchText || '').toLowerCase();
      let candidates = [searchText];
      if (rawLower.includes('faculty') || rawLower.includes('instructor') || rawLower.includes('prepared')) {
        candidates = ['Lead Faculty', 'Course Instructor', 'Prepared by', 'Instructor', 'Faculty'];
      } else if (rawLower.includes('head') || rawLower.includes('chair')) {
        candidates = ['Department Head', 'Dept. Head', 'Dept Head', 'Program Chair', 'Reviewed by'];
      } else if (rawLower.includes('dean')) {
        candidates = ['College Dean', 'Dean'];
      } else if (rawLower.includes('citl') || rawLower.includes('fdis')) {
        candidates = ['CITL Director', 'Director, CITL', 'CITL', 'FDIS Chair'];
      } else if (rawLower.includes('vpaa') || rawLower.includes('academic')) {
        candidates = ['Vice President for Academic Affairs', 'VPAA', 'Approved by'];
      }

      const macroCode = [
        'var oDoc = Api.GetDocument();',
        `var candidates = ${JSON.stringify(candidates)};`,
        'var oPara = null;',
        'for (var i = 0; i < candidates.length; i++) {',
        '  var results = oDoc.Search(candidates[i]);',
        '  if (results && results.length > 0) {',
        '    oPara = results[results.length - 1].GetParagraph(0);',
        '    if (oPara) break;',
        '  }',
        '}',
        'if (oPara) {',
        `  var oDrawing = Api.CreateImage("${esc(finalUrl)}", ${widthEMU}, ${heightEMU});`,
        '  oDrawing.SetWrappingStyle("behind");',
        `  oDrawing.SetHorAlign("margin", "${align || "center"}");`,
        `  oDrawing.SetVerPosition("paragraph", ${vertOffset});`,
        '  oPara.AddDrawing(oDrawing);',
        '}',
      ].join('\n');

      // Approach 1: Try the connector API (OnlyOffice 7.2+)
      try {
        if (typeof editor.createConnector === 'function') {
          if (!connectorRef.current) {
            connectorRef.current = editor.createConnector();
          }
          const connector = connectorRef.current;
          if (connector) {
            console.log('[SigConnector] Using connector.callCommand');
            return new Promise<boolean>((resolve) => {
              try {
                // Use eval-style function for maximum compatibility
                const fn = new Function(macroCode);
                connector.callCommand(fn as () => void, false, true);
                setTimeout(() => resolve(true), 1200);
              } catch (e) {
                console.warn('[SigConnector] callCommand error:', e);
                resolve(false);
              }
            });
          }
        }
      } catch (e) {
        console.warn('[SigConnector] Connector approach failed:', e);
      }

      // Approach 2: Try sending a macro via the editor's executeCommand/runMacro
      try {
        if (typeof editor.executeCommand === 'function') {
          console.log('[SigConnector] Using editor.executeCommand');
          editor.executeCommand('macros', macroCode);
          return new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 1200));
        }
      } catch (e) {
        console.warn('[SigConnector] executeCommand not available:', e);
      }

      // Approach 3: Try finding the OnlyOffice iframe and posting a message
      try {
        const container = containerRef.current;
        if (container) {
          const iframe = container.querySelector('iframe') as HTMLIFrameElement | null;
          if (iframe?.contentWindow) {
            console.log('[SigConnector] Using iframe postMessage');
            // OnlyOffice plugin message format
            iframe.contentWindow.postMessage(JSON.stringify({
              type: 'plugin',
              guid: 'asc.{6339A683-1F4B-4E7B-8B3E-7D4F7F9D5E7A}',
              data: { type: 'executeCommand', command: macroCode }
            }), '*');
            return new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 1200));
          }
        }
      } catch (e) {
        console.warn('[SigConnector] iframe approach failed:', e);
      }

      console.warn('[SigConnector] All approaches failed');
      return false;
    }
  }), []);

  useEffect(() => {
    let aborted = false;
    async function loadScript() {
      const rawEnv1 = ((import.meta.env as any).VITE_ONLYOFFICE_URL as string | undefined) || '';
      const rawEnv2 = ((import.meta.env as any).VITE_ONLYOFFICE_DOCSERVER_URL as string | undefined) || '';
      const envBase = (rawEnv1 || rawEnv2).trim();
      const bases: string[] = [];
      if (envBase) bases.push(envBase.replace(/\/+$/, ''));
      bases.push('http://localhost:8089');
      bases.push('http://localhost:8085');
      for (const base of bases) {
        const src = `${base}/web-apps/apps/api/documents/api.js`;
        const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
        if (existing) {
          const win = window as unknown as { DocsAPI?: OnlyOfficeApi };
          if (win.DocsAPI) {
            setReady(true);
            return;
          }
        }
        const loaded = await new Promise<boolean>((resolve) => {
          const s = document.createElement('script');
          s.src = src;
          s.async = true;
          s.onload = () => resolve(true);
          s.onerror = () => resolve(false);
          document.body.appendChild(s);
        });
        if (aborted) return;
        const win = window as unknown as { DocsAPI?: OnlyOfficeApi };
        if (loaded && win.DocsAPI) {
          setReady(true);
          return;
        }
      }
      setError('ONLYOFFICE DocsAPI not available. Check VITE_ONLYOFFICE_URL and server status.');
    }
    loadScript();
    return () => {
      aborted = true;
    };
  }, []);

  useEffect(() => {
    let aborted = false;
    async function init() {
      if (!ready) return;
      setError(null);
      setLoading(true);
      try {
        const rawApi = (import.meta.env as any).VITE_API_BASE_URL as string | undefined;
        let apiBase = (rawApi ? rawApi.trim() : '') || 'http://localhost:5000';
        
        // DYNAMIC DETECTION: If apiBase is localhost but window is not, rewrite it to window.location.hostname
        if (apiBase.includes('localhost') && !window.location.hostname.includes('localhost')) {
          apiBase = apiBase.replace('localhost', window.location.hostname);
        }

        const params = new URLSearchParams({ 
          mode, 
          docType,
          ...(version ? { version: String(version) } : {}) 
        });
        const token = (() => {
          try {
            return localStorage.getItem('auth_token') || '';
          } catch {
            return '';
          }
        })();
        const userInfo = (() => {
          try {
            const raw = localStorage.getItem('auth_user');
            if (!raw) return null;
            const u = JSON.parse(raw) as { id?: string; firstName?: string; lastName?: string; email?: string };
            const name = `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || (u?.email || '');
            return { id: u?.id || '', name };
          } catch {
            return null;
          }
        })();
        const res = await fetch(`${apiBase}/docs/${encodeURIComponent(syllabusId)}/onlyoffice-config?${params.toString()}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(userInfo ? { 'X-User-Id': userInfo.id, 'X-User-Name': userInfo.name } : {}),
            Accept: 'application/json',
          },
        });
        if (!res.ok) throw new Error('Failed to load editor config');
        const config = (await res.json()) as OnlyOfficeConfig;
        
        // Removed the strict force replace because OnlyOffice (Docker) 
        // NEEDS host.docker.internal to reach the backend on the host machine.

        if (!config.token && (config as any).jwt) (config as any).token = (config as any).jwt as any;
        
        // Setup editorConfig
        const editorConfig = (config.editorConfig as Record<string, unknown>) || {};
        
        // Inject token if missing
        if (!(editorConfig as any).token && (config as any).token) {
          (editorConfig as any).token = (config as any).token;
        }

        // Setup plugins / autostart for signature
        if (signatureUrl) {
          const plugins = (editorConfig.plugins as Record<string, unknown>) || {};
          const autostart = Array.isArray((plugins as any).autostart) ? (plugins as any).autostart.slice() : [];
          
          // IMPORTANT: Plugins and Images are fetched by the BROWSER (client-side).
          // They should use the public URL (localhost), NOT host.docker.internal.
          const finalSigUrl = signatureUrl;
          const pluginOrigin = window.location.origin;
          
          const sigUrlWithParams = `${pluginOrigin}/plugins/signature-inserter/plugin.json?sig=${encodeURIComponent(finalSigUrl)}&search=${encodeURIComponent(signatureSearchText || "")}`;
          
          autostart.push({
            url: sigUrlWithParams,
            data: { signatureUrl: finalSigUrl, searchText: signatureSearchText }
          });
          
          editorConfig.plugins = {
            ...plugins,
            autostart
          };
        }

        // Setup events
        const events = (editorConfig.events as Record<string, unknown>) || {};
        events.onDocumentStateChange = (evt: unknown) => {
          let modified = false;
          if (evt && typeof evt === 'object' && 'data' in (evt as Record<string, unknown>)) {
            const d = (evt as { data?: unknown }).data;
            modified = d === true || d === 1 || d === 'true';
          } else {
            modified = !!evt;
          }
          if (onStateChangeRef.current) onStateChangeRef.current(modified);
        };
        editorConfig.events = events;

        // Finalize config
        (config as any).editorConfig = editorConfig;

        const win = window as unknown as { DocsAPI?: OnlyOfficeApi };
        if (!win.DocsAPI) throw new Error('ONLYOFFICE DocsAPI not available');
        const DocsAPI = win.DocsAPI;
        const el = containerRef.current;
        if (!el) return;
        if (!el.id) {
          el.id = containerIdRef.current;
        } else {
          containerIdRef.current = el.id;
        }
        if (editorRef.current?.destroyEditor) {
          try {
            editorRef.current.destroyEditor();
          } catch (e) {
            console.warn('Failed to destroy editor:', e);
          }
          editorRef.current = null;
        }

        // Disconnect old connector
        if (connectorRef.current) {
          try { connectorRef.current.disconnect(); } catch {}
          connectorRef.current = null;
        }

        // IMPORTANT: Clear the container before creating a new editor to avoid ONLYOFFICE initialization errors
        if (el) {
          el.innerHTML = '';
        }

        editorRef.current = new DocsAPI.DocEditor(el.id, config) as EditorInstance;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to initialize ONLYOFFICE editor';
        setError(msg);
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    init();
    return () => {
      if (connectorRef.current) {
        try { connectorRef.current.disconnect(); } catch {}
        connectorRef.current = null;
      }
      editorRef.current?.destroyEditor?.();
      editorRef.current = null;
      aborted = true;
    };
  }, [ready, syllabusId, mode, docType, signatureUrl, signatureSearchText]);

  if (error) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center h-full text-sm text-destructive">{error}</div>
      </div>
    );
  }

  return (
    <div className={(className ? className + ' ' : '') + 'relative'}>
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Loading editor…
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}));
