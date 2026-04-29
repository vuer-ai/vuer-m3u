import { useEffect, useMemo, useRef, useState } from 'react';
import type { PreviewerProps } from '../../types';
import { rangeFetch } from '../../range-fetch';
import { LoadingState } from '../states/LoadingState';
import { ErrorState } from '../states/ErrorState';

const ROW_HEIGHT = 28;
const OVERSCAN = 10;
const MAX_HEIGHT = 600;

interface FetchState {
  status: 'loading' | 'ready' | 'error';
  rows?: string[][];
  truncated?: boolean;
  error?: string;
}

export function CsvPreview({ meta, fetcher, limits, onTruncate }: PreviewerProps) {
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [scrollTop, setScrollTop] = useState(0);
  const truncateReportedRef = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    truncateReportedRef.current = false;
    setState({ status: 'loading' });
    setScrollTop(0);

    rangeFetch(meta.url, 0, limits.csv, fetcher, { signal: ctrl.signal })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        const text = new TextDecoder('utf-8').decode(res.bytes);
        const delimiter = meta.kind === 'tsv' ? '\t' : ',';
        const rows = parseCsv(text, delimiter);
        // Drop possibly-incomplete last row when truncated.
        if (res.truncated && rows.length > 0) rows.pop();
        setState({ status: 'ready', rows, truncated: res.truncated });
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
  }, [meta.url, meta.kind, limits.csv, fetcher, onTruncate]);

  const { header, body } = useMemo(() => {
    if (state.status !== 'ready' || !state.rows || state.rows.length === 0) {
      return { header: [] as string[], body: [] as string[][] };
    }
    return { header: state.rows[0], body: state.rows.slice(1) };
  }, [state]);

  const totalHeight = body.length * ROW_HEIGHT;
  const viewportHeight = Math.min(MAX_HEIGHT, Math.max(totalHeight + ROW_HEIGHT, ROW_HEIGHT * 4));
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIdx = Math.min(body.length, startIdx + visibleCount);
  const offsetY = startIdx * ROW_HEIGHT;

  if (state.status === 'loading') return <LoadingState label="Loading table…" />;
  if (state.status === 'error') return <ErrorState message={state.error ?? 'Failed to load'} />;
  if (header.length === 0) {
    return (
      <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">Empty file</div>
    );
  }

  return (
    <div className="flex flex-col">
      <div
        className="overflow-auto bg-white dark:bg-zinc-950"
        style={{ maxHeight: MAX_HEIGHT }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: totalHeight + ROW_HEIGHT, position: 'relative' }}>
          <table className="w-full border-collapse" style={{ tableLayout: 'auto' }}>
            <thead>
              <tr style={{ height: ROW_HEIGHT }}>
                {header.map((cell, i) => (
                  <th
                    key={i}
                    className="px-2 py-1 text-xs font-mono font-bold text-left border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 whitespace-nowrap"
                    style={{ position: 'sticky', top: 0, zIndex: 1 }}
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ transform: `translateY(${offsetY}px)` }}>
              {body.slice(startIdx, endIdx).map((row, i) => (
                <tr key={startIdx + i} style={{ height: ROW_HEIGHT }}>
                  {header.map((_, c) => (
                    <td
                      key={c}
                      className="px-2 py-1 text-xs font-mono border-b border-zinc-100 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 whitespace-nowrap"
                    >
                      {row[c] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
        {body.length} rows{state.truncated ? ' (truncated)' : ''}
      </div>
    </div>
  );
}

// Minimal CSV/TSV parser: quoted fields, embedded delimiters, "" escape, CRLF/LF.
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      if (i + 1 < n && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Trailing field — emit only if any content was accumulated on this line.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
