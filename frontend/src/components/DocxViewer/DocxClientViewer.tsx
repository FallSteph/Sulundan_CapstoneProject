import React, { useEffect, useRef, useState } from 'react';

type DocxClientViewerProps = {
  fileUrl: string;
  className?: string;
  zoom?: number;
};

export function DocxClientViewer(props: DocxClientViewerProps) {
  const { fileUrl, className, zoom = 1 } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Ensure docx-preview styles are present (use CDN-matched to installed version)
  useEffect(() => {
    const id = 'docx-preview-css-link';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      // Match the installed version in package.json to avoid mismatches
      link.href = 'https://unpkg.com/docx-preview@0.3.7/dist/docx-preview.css';
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    let aborted = false;
    async function render() {
      setError(null);
      setLoading(true);
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`Failed to fetch ${fileUrl}: ${res.status}`);
        const buf = await res.arrayBuffer();
        const { renderAsync } = await import('docx-preview');
        if (aborted) return;
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';
        const style = document.createElement('style');
        style.setAttribute('data-docx-overrides', 'true');
        style.textContent = `
          .docx .header,
          .docx .footer,
          .docx header,
          .docx footer,
          .docx .hdr,
          .docx .ftr {
            display: block !important;
            visibility: visible !important;
            position: relative !important;
            overflow: visible !important;
            z-index: 100 !important;
          }
          .docx .page {
            overflow: visible !important;
            position: relative !important;
          }
          .docx .page .margin,
          .docx .page .content,
          .docx .content {
            position: relative !important;
            z-index: 1 !important;
          }
          .docx .section {
            position: relative !important;
            page-break-after: always;
          }
          .docx img {
            max-width: 100%;
            height: auto;
            z-index: 0;
          }
          /* Images placed inside headers should not cover text */
          .docx .header img,
          .docx header img,
          .docx .hdr img {
            display: block;
            max-width: 100%;
            height: auto;
            z-index: 1;
            position: relative;
          }
          .docx [class*="header"],
          .docx [class*="footer"] {
            display: block !important;
          }
          /* Ensure margins reserved for header/footer are not collapsing them */
          .docx .section .margin {
            overflow: visible !important;
          }
          /* Prevent any wrapper from clipping headers/footers */
          .docx, .docx-wrapper {
            overflow: visible !important;
          }
          /* Some themes set headers to pointer-events:none; ensure they render correctly */
          .docx .header, .docx header {
            pointer-events: auto;
          }
          /* Extra safety: keep headers above scaled content stacking contexts */
          .docx .page .header,
          .docx .page header,
          .docx .page .hdr {
            position: relative !important;
            z-index: 100 !important;
          }
        `;
        container.appendChild(style);
        await renderAsync(buf, container, container, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          experimental: true,
          trimXmlDeclaration: true,
          useBase64URL: true,
          debug: false,
        });
        container.scrollTop = 0;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to render document');
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    render();
    return () => {
      aborted = true;
    };
  }, [fileUrl]);

  return (
    <div className={className} style={{ overflow: 'auto', position: 'relative' }}>
      <div
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          width: `${100 / zoom}%`,
        }}
      >
        <div ref={containerRef} />
      </div>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <div className="text-sm text-muted-foreground">Loading document…</div>
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="text-sm text-destructive">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}

