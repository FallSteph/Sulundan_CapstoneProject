import React, { useMemo } from 'react';

type DocxViewerProps = {
  fileUrl: string;
  className?: string;
  zoom?: number;
};

export function DocxViewer(props: DocxViewerProps) {
  const { fileUrl, className, zoom = 1 } = props;
  const absoluteUrl = useMemo(() => {
    try {
      return new URL(fileUrl, window.location.origin).href;
    } catch {
      return fileUrl;
    }
  }, [fileUrl]);

  const officeEmbedUrl = useMemo(() => {
    const base = 'https://view.officeapps.live.com/op/embed.aspx?src=';
    return `${base}${encodeURIComponent(absoluteUrl)}&wdPrint=1&wdEmbedCode=0`;
  }, [absoluteUrl]);

  return (
    <div className={className} style={{ overflow: 'hidden' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}
      >
        <iframe
          src={officeEmbedUrl}
          title="DOCX Viewer"
          style={{ width: '100%', height: '100%', border: '0' }}
          allow="fullscreen"
          loading="eager"
        />
      </div>
    </div>
  );
}

