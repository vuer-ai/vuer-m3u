import { useEffect, useMemo, useRef, useState } from 'react';
import type { PreviewerProps } from '../../types';
import { rangeFetch } from '../../range-fetch';
import { LoadingState } from '../states/LoadingState';
import { ErrorState } from '../states/ErrorState';

const ROW_HEIGHT = 24;
const OVERSCAN = 10;
const MAX_HEIGHT = 600;

interface ParsedLine {
  raw: string;
  parsed: unknown;
  parseError: boolean;
}

interface FetchState {
  status: 'loading' | 'ready' | 'error';
  lines?: ParsedLine[];
  truncated?: boolean;
  error?: string;
}

export function JsonlPreview({ meta, fetcher, limits, onTruncate }: PreviewerProps) {
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [scrollTop, setScrollTop] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const truncateReportedRef = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    truncateReportedRef.current = false;
    setState({ status: 'loading' });
    setScrollTop(0);
    setExpandedIndex(null);

    rangeFetch(meta.url, 0, limits.jsonl, fetcher, { signal: ctrl.signal })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        const text = new TextDecoder('utf-8').decode(res.bytes);
        const allLines = text.split('\n').filter((l) => l.length > 0);
        // Drop possibly-incomplete last line when truncated.
        if (res.truncated && allLines.length > 0) allLines.pop();
        const lines: ParsedLine[] = allLines.map((raw) => {
          try {
            return { raw, parsed: JSON.parse(raw), parseError: false };
          } catch {
            return { raw, parsed: null, parseError: true };
          }
        });
        setState({ status: 'ready', lines, truncated: res.truncated });
        if (res.truncated && !truncateReportedRef.current) {
          truncateReportedRef.current = true;
          onTruncate?.(res.bytes.byteLength, res.totalSize);
        }
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setState({ status: 'error', error: String(err?.message ?? err) });
      });

    return () => ctrl.abort();
  }, [meta.url, limits.jsonl, fetcher, onTruncate]);

  const lines = state.status === 'ready' ? state.lines ?? [] : [];

  const totalHeight = lines.length * ROW_HEIGHT;
  const listHeight = Math.min(MAX_HEIGHT, Math.max(totalHeight, ROW_HEIGHT * 4));
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(listHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIdx = Math.min(lines.length, startIdx + visibleCount);
  const offsetY = startIdx * ROW_HEIGHT;

  const expandedContent = useMemo(() => {
    if (expandedIndex == null) return null;
    const line = lines[expandedIndex];
    if (!line) return null;
    if (line.parseError) return line.raw;
    try {
      return JSON.stringify(line.parsed, null, 2);
    } catch {
      return line.raw;
    }
  }, [expandedIndex, lines]);

  if (state.status === 'loading') return <LoadingState label="Loading JSONL…" />;
  if (state.status === 'error') return <ErrorState message={state.error ?? 'Failed to load'} />;
  if (lines.length === 0) {
    return <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">Empty file</div>;
  }

  return (
    <div className="flex flex-col">
      <div
        className="overflow-auto bg-white dark:bg-zinc-950"
        style={{ maxHeight: MAX_HEIGHT }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {lines.slice(startIdx, endIdx).map((line, i) => {
              const idx = startIdx + i;
              const isExpanded = idx === expandedIndex;
              return (
                <div
                  key={idx}
                  onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                  className={
                    'flex items-center px-2 text-xs font-mono cursor-pointer border-b border-zinc-100 dark:border-zinc-800 whitespace-nowrap overflow-hidden hover:bg-zinc-50 dark:hover:bg-zinc-900 ' +
                    (isExpanded
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                      : line.parseError
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-zinc-700 dark:text-zinc-300')
                  }
                  style={{ height: ROW_HEIGHT }}
                  title="Click to expand"
                >
                  <span className="shrink-0 w-12 text-right pr-2 text-zinc-400 dark:text-zinc-600 select-none tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="truncate" style={{ textOverflow: 'ellipsis' }}>
                    {line.parseError ? line.raw : compactPreview(line.parsed)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {expandedContent != null && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 max-h-[300px] overflow-auto">
          <div className="flex items-center justify-between px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
            <span>Line {expandedIndex! + 1}</span>
            <button
              type="button"
              onClick={() => setExpandedIndex(null)}
              className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              Close
            </button>
          </div>
          <pre className="px-3 py-2 text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre overflow-auto">
            {expandedContent}
          </pre>
        </div>
      )}

      <div className="px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
        {lines.length} lines{state.truncated ? ' (truncated)' : ''}
      </div>
    </div>
  );
}

function compactPreview(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
