import { useEffect, useMemo, useState } from 'react';
import type { PreviewerProps } from '../../types';
import { rangeFetch } from '../../range-fetch';
import { formatBytes } from '../../format-bytes';
import { LoadingState } from '../states/LoadingState';
import { ErrorState } from '../states/ErrorState';
import {
  parseNpyHeader,
  decodeNpyData,
  npyDtypeMap,
  NpyParseError,
  type NpyHeader,
} from '../../npy-parse';

const PREVIEW_ELEMENT_CAP = 1024;
const DISPLAY_CELLS = 64;

interface PreviewState {
  status: 'loading' | 'ready' | 'error';
  header?: NpyHeader;
  total?: number;
  values?: number[] | bigint[];
  /** Reason why we did not decode data, if applicable. */
  skipReason?: string;
  error?: string;
}

export function NpyPreview({ meta, fetcher, limits }: PreviewerProps) {
  const [state, setState] = useState<PreviewState>({ status: 'loading' });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: 'loading' });

    (async () => {
      try {
        const stage1 = await rangeFetch(meta.url, 0, limits.npyHeader, fetcher, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        const header = parseNpyHeader(stage1.bytes);
        const total = header.shape.length === 0 ? 1 : header.shape.reduce((a, b) => a * b, 1);

        // Decide whether stage 2 is worth attempting. We only decode small,
        // C-contiguous, little-endian, simple-dtype arrays — anything fancier
        // gets a metadata-only display.
        const skipReason = decideSkipReason(header, total);
        if (skipReason) {
          setState({ status: 'ready', header, total, skipReason });
          return;
        }

        const take = Math.min(total, PREVIEW_ELEMENT_CAP);
        const need = header.dataOffset + take * header.itemSize;
        // Cap stage 2 at the configured npyData budget — even small arrays
        // shouldn't trigger surprise multi-MB requests if the header is huge.
        const end = Math.min(need, limits.npyData);
        const stage2 = await rangeFetch(meta.url, 0, end, fetcher, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        const decoded = decodeNpyData(stage2.bytes, header, PREVIEW_ELEMENT_CAP);
        setState({ status: 'ready', header, total, values: decoded.values });
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const message = err instanceof NpyParseError ? err.message : String((err as Error)?.message ?? err);
        setState({ status: 'error', error: message });
      }
    })();

    return () => ctrl.abort();
  }, [meta.url, fetcher, limits.npyHeader, limits.npyData]);

  const dtypeLabel = useMemo(() => {
    if (!state.header) return '';
    return npyDtypeMap(state.header.descr).humanLabel;
  }, [state.header]);

  if (state.status === 'loading') return <LoadingState label="Loading npy header…" />;
  if (state.status === 'error') return <ErrorState message={state.error ?? 'Failed to parse npy file'} />;

  const header = state.header!;
  const total = state.total ?? 0;
  const byteSize = total * header.itemSize;

  return (
    <div className="p-4 text-sm text-zinc-800 dark:text-zinc-200 overflow-auto" style={{ maxHeight: 600 }}>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 mb-4">
        <dt className="font-medium text-zinc-600 dark:text-zinc-400">dtype</dt>
        <dd className="font-mono">{dtypeLabel}</dd>
        <dt className="font-medium text-zinc-600 dark:text-zinc-400">shape</dt>
        <dd className="font-mono">{formatShape(header.shape)}</dd>
        <dt className="font-medium text-zinc-600 dark:text-zinc-400">elements</dt>
        <dd className="font-mono">{total.toLocaleString()}</dd>
        <dt className="font-medium text-zinc-600 dark:text-zinc-400">size</dt>
        <dd className="font-mono">{header.itemSize > 0 ? formatBytes(byteSize) : '—'}</dd>
        <dt className="font-medium text-zinc-600 dark:text-zinc-400">order</dt>
        <dd className="font-mono">{header.fortranOrder ? 'fortran (column-major)' : 'C (row-major)'}</dd>
      </dl>

      {state.values ? (
        <DataPreview values={state.values} dtype={header.descr} />
      ) : (
        <div className="text-xs text-zinc-500 dark:text-zinc-400 italic">
          Data preview unavailable: {state.skipReason}
        </div>
      )}
    </div>
  );
}

function decideSkipReason(header: NpyHeader, total: number): string | null {
  if (header.typedArrayCtor === null) {
    // npyDtypeMap already encoded the *what* in the human label; we restate
    // *why we skipped* in the user-visible reason for clarity.
    if (!header.isLittleEndian) return 'big-endian dtype not yet supported';
    if (header.descr.includes('c8') || header.descr.includes('c16')) return 'complex/structured dtype not supported';
    return 'complex/structured dtype not supported';
  }
  if (header.fortranOrder) return 'fortran-order array (skip)';
  if (total > PREVIEW_ELEMENT_CAP) return `shape too large (${total.toLocaleString()} elements; preview cap ${PREVIEW_ELEMENT_CAP})`;
  return null;
}

function DataPreview({ values, dtype }: { values: number[] | bigint[]; dtype: string }) {
  const isBigInt = values.length > 0 && typeof values[0] === 'bigint';
  const isBool = dtype.endsWith('b1');

  // Stats only make sense for ordinary numeric arrays — bool and bigint aren't
  // meaningful here even though we still preview the values themselves.
  const stats = useMemo(() => {
    if (isBigInt || isBool) return null;
    const nums = values as number[];
    if (nums.length === 0) return null;
    let min = Infinity, max = -Infinity, sum = 0;
    for (const v of nums) { if (v < min) min = v; if (v > max) max = v; sum += v; }
    return { min, max, mean: sum / nums.length };
  }, [values, isBigInt, isBool]);

  const display = values.slice(0, DISPLAY_CELLS);

  return (
    <>
      {stats && (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 mb-3 text-xs">
          <dt className="font-medium text-zinc-600 dark:text-zinc-400">min</dt>
          <dd className="font-mono">{formatNumber(stats.min)}</dd>
          <dt className="font-medium text-zinc-600 dark:text-zinc-400">max</dt>
          <dd className="font-mono">{formatNumber(stats.max)}</dd>
          <dt className="font-medium text-zinc-600 dark:text-zinc-400">mean</dt>
          <dd className="font-mono">{formatNumber(stats.mean)}</dd>
        </dl>
      )}

      <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
        First {display.length} of {values.length} value{values.length === 1 ? '' : 's'}
      </div>
      <div className="flex flex-wrap gap-1">
        {display.map((v, i) => (
          <span
            key={i}
            className="tabular-nums font-mono text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          >
            {isBigInt ? (v as bigint).toString() : isBool ? ((v as number) ? 'T' : 'F') : formatNumber(v as number)}
          </span>
        ))}
      </div>
    </>
  );
}

function formatShape(shape: number[]): string {
  if (shape.length === 0) return '()';
  if (shape.length === 1) return `(${shape[0]},)`;
  return `(${shape.join(', ')})`;
}

function formatNumber(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e4 || a < 1e-3)) return x.toExponential(3);
  return x.toFixed(4);
}
