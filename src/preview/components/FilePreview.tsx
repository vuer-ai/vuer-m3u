import { lazy, Suspense, useEffect, useMemo, useState, useCallback } from 'react';
import type {
  FilePreviewProps,
  ResolvedFileMeta,
  PreviewLimits,
  PreviewerProps,
} from '../types';
import { detectKind, extractExtension, extractFilename } from '../detect';
import { mergeLimits } from '../limits';
import { PreviewFrame } from './PreviewFrame';
import { LoadingState } from './states/LoadingState';
import { ErrorState } from './states/ErrorState';
import { TooLargeState } from './states/TooLargeState';
import { UnsupportedState } from './states/UnsupportedState';
import { TruncatedNotice } from './states/TruncatedNotice';

const ImagePreview = lazy(() =>
  import('./previewers/ImagePreview').then((m) => ({ default: m.ImagePreview })),
);
const VideoPreview = lazy(() =>
  import('./previewers/VideoPreview').then((m) => ({ default: m.VideoPreview })),
);
const AudioPreview = lazy(() =>
  import('./previewers/AudioPreview').then((m) => ({ default: m.AudioPreview })),
);
const TextPreview = lazy(() =>
  import('./previewers/TextPreview').then((m) => ({ default: m.TextPreview })),
);
const MarkdownPreview = lazy(() =>
  import('./previewers/MarkdownPreview').then((m) => ({ default: m.MarkdownPreview })),
);
const CsvPreview = lazy(() =>
  import('./previewers/CsvPreview').then((m) => ({ default: m.CsvPreview })),
);
const JsonlPreview = lazy(() =>
  import('./previewers/JsonlPreview').then((m) => ({ default: m.JsonlPreview })),
);
const NpyPreview = lazy(() =>
  import('./previewers/NpyPreview').then((m) => ({ default: m.NpyPreview })),
);
const McapPreview = lazy(() =>
  import('./previewers/McapPreview').then((m) => ({ default: m.McapPreview })),
);

type ProbeState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'done'; size: number | null; contentType: string | null }
  | { status: 'failed'; message: string };

// Module-level so the default reference is stable across renders. Inlining
// `fetch.bind(globalThis)` into a destructuring default created a fresh
// function each render, which propagated into every previewer's useEffect
// deps and caused unbounded re-fetch loops.
const DEFAULT_FETCHER: ((url: string, init?: RequestInit) => Promise<Response>) | undefined =
  typeof fetch !== 'undefined' ? (url, init) => fetch(url, init) : undefined;

export function FilePreview(props: FilePreviewProps) {
  const {
    url,
    filename,
    size,
    contentType,
    fetcher: userFetcher,
    limits: limitOverrides,
    probe = false,
    onDownload,
    className,
    accentColor,
  } = props;

  const fetcher = userFetcher ?? DEFAULT_FETCHER;

  const limits = useMemo<PreviewLimits>(() => mergeLimits(limitOverrides), [limitOverrides]);

  const [probed, setProbed] = useState<ProbeState>(
    probe ? { status: 'pending' } : { status: 'idle' },
  );
  const [truncation, setTruncation] = useState<{ shown: number; total: number | null } | null>(
    null,
  );

  // Reset truncation state when URL changes
  useEffect(() => {
    setTruncation(null);
  }, [url]);

  // Optional HEAD probe
  useEffect(() => {
    // No-op when probing is disabled — initial state is already 'idle'.
    // Calling setProbed here would create a new object reference and trigger
    // a render loop combined with anything else in deps changing.
    if (!probe) return;
    if (!fetcher) {
      setProbed({ status: 'failed', message: 'No fetch implementation available' });
      return;
    }
    let cancelled = false;
    setProbed({ status: 'pending' });
    fetcher(url, { method: 'HEAD' })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setProbed({ status: 'failed', message: `HEAD ${res.status} ${res.statusText}` });
          return;
        }
        const len = res.headers.get('Content-Length');
        const ct = res.headers.get('Content-Type');
        setProbed({
          status: 'done',
          size: len ? Number(len) : null,
          contentType: ct,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setProbed({ status: 'failed', message: String(err?.message ?? err) });
      });
    return () => {
      cancelled = true;
    };
  }, [probe, fetcher, url]);

  const meta = useMemo<ResolvedFileMeta>(() => {
    const resolvedFilename = extractFilename(url, filename);
    const extension = extractExtension(filename || url);
    const probedSize = probed.status === 'done' ? probed.size : null;
    const probedCT = probed.status === 'done' ? probed.contentType : null;
    const finalSize = size != null ? size : probedSize;
    const finalCT = contentType ?? probedCT;
    const kind = detectKind(filename || url, finalCT);
    return {
      url,
      filename: resolvedFilename,
      extension,
      kind,
      size: finalSize,
      contentType: finalCT,
    };
  }, [url, filename, size, contentType, probed]);

  const handleDownload = useCallback(() => {
    if (onDownload) {
      onDownload(meta);
      return;
    }
    if (typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = url;
    a.download = meta.filename || '';
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [onDownload, meta, url]);

  const handleTruncate = useCallback((shown: number, total: number | null) => {
    setTruncation({ shown, total });
  }, []);

  // Probe still pending — show loading frame
  if (probed.status === 'pending') {
    return (
      <PreviewFrame meta={meta} accentColor={accentColor} onDownload={handleDownload} className={className}>
        <LoadingState label="Probing file…" />
      </PreviewFrame>
    );
  }

  // Unsupported kind
  if (meta.kind === 'unsupported') {
    return (
      <PreviewFrame meta={meta} accentColor={accentColor} onDownload={handleDownload} className={className}>
        <UnsupportedState filename={meta.filename} extension={meta.extension} onDownload={handleDownload} />
      </PreviewFrame>
    );
  }

  // Hard size limits (image only — video/audio stream natively)
  if (meta.kind === 'image' && meta.size != null && meta.size > limits.image) {
    return (
      <PreviewFrame meta={meta} accentColor={accentColor} onDownload={handleDownload} className={className}>
        <TooLargeState size={meta.size} limit={limits.image} onDownload={handleDownload} />
      </PreviewFrame>
    );
  }

  if (!fetcher) {
    return (
      <PreviewFrame meta={meta} accentColor={accentColor} onDownload={handleDownload} className={className}>
        <ErrorState message="No fetch implementation available" onDownload={handleDownload} />
      </PreviewFrame>
    );
  }

  const previewerProps: PreviewerProps = {
    meta,
    fetcher,
    limits,
    onTruncate: handleTruncate,
  };

  const notice =
    truncation != null ? (
      <TruncatedNotice
        shownBytes={truncation.shown}
        totalBytes={truncation.total}
        onDownload={handleDownload}
      />
    ) : null;

  return (
    <PreviewFrame
      meta={meta}
      accentColor={accentColor}
      onDownload={handleDownload}
      notice={notice}
      className={className}
    >
      <Suspense fallback={<LoadingState />}>
        {renderPreviewer(meta.kind, previewerProps)}
      </Suspense>
    </PreviewFrame>
  );
}

function renderPreviewer(
  kind: ResolvedFileMeta['kind'],
  p: PreviewerProps,
): React.ReactNode {
  switch (kind) {
    case 'image':
      return <ImagePreview {...p} />;
    case 'video':
      return <VideoPreview {...p} />;
    case 'audio':
      return <AudioPreview {...p} />;
    case 'markdown':
      return <MarkdownPreview {...p} />;
    case 'text':
    case 'code':
    case 'json':
      return <TextPreview {...p} />;
    case 'csv':
    case 'tsv':
      return <CsvPreview {...p} />;
    case 'jsonl':
      return <JsonlPreview {...p} />;
    case 'npy':
      return <NpyPreview {...p} />;
    case 'mcap':
      return <McapPreview {...p} />;
    default:
      return null;
  }
}
