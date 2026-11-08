import React, { useEffect, useState } from 'react';

type OfficeDocxEditorProps = {
  syllabusId: string;
  className?: string;
};

export function OfficeDocxEditor(props: OfficeDocxEditorProps) {
  const { syllabusId, className } = props;
  const [editUrl, setEditUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
        const res = await fetch(`${base}/docs/${syllabusId}/edit-link`, { method: 'GET' });
        if (!res.ok) throw new Error(`Failed to get edit link`);
        const data = await res.json();
        if (!data?.url) throw new Error('No edit URL');
        if (aborted) return;
        setEditUrl(String(data.url));
      } catch (e: unknown) {
        setError((e as Error)?.message || 'Failed to get edit link');
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    load();
    return () => {
      aborted = true;
    };
  }, [syllabusId]);

  if (loading) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading editor…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center h-full">
          <div className="text-sm">
            <div className="text-destructive mb-2">{error}</div>
            <button
              className="inline-flex items-center h-9 px-3 rounded-md border bg-background text-foreground text-sm"
              onClick={() => setEditUrl(null)}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!editUrl) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No edit link</div>
      </div>
    );
  }

  return (
    <div className={className} style={{ overflow: 'hidden' }}>
      <iframe
        src={editUrl}
        title="Word Online Editor"
        style={{ width: '100%', height: '100%', border: '0' }}
        allow="fullscreen"
      />
    </div>
  );
}

