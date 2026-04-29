import { useEffect, useMemo, useState } from 'react';
import type { PreviewerProps } from '../../types';
import { makeMcapReadable } from '../../mcap-readable';
import { LoadingState } from '../states/LoadingState';
import { ErrorState } from '../states/ErrorState';

interface ChannelRow {
  id: number;
  topic: string;
  schemaName: string;
  encoding: string;
  messageCount: number;
  frequency: number | null;
}

interface SchemaRow {
  id: number;
  name: string;
  encoding: string;
}

interface ReadyState {
  status: 'ready';
  totalMessages: number;
  durationSec: number;
  channelCount: number;
  schemaCount: number;
  startTimeNs: bigint;
  endTimeNs: bigint;
  channels: ChannelRow[];
  schemas: SchemaRow[];
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | ReadyState;

export function McapPreview({ meta, fetcher }: PreviewerProps) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    // AbortController doesn't propagate into @mcap/core's reads, so we also
    // guard with a `cancelled` flag and check after each await.
    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        const { McapIndexedReader } = await import('@mcap/core');
        if (cancelled) return;

        const readable = makeMcapReadable(meta.url, fetcher, meta.size);
        const reader = await McapIndexedReader.Initialize({
          readable: readable as unknown as Parameters<
            typeof McapIndexedReader.Initialize
          >[0]['readable'],
        });
        if (cancelled) return;

        const stats = reader.statistics;
        const startNs = stats?.messageStartTime ?? 0n;
        const endNs = stats?.messageEndTime ?? 0n;
        const durationNs = endNs > startNs ? endNs - startNs : 0n;
        const durationSec = Number(durationNs) / 1e9;

        const schemas: SchemaRow[] = [];
        for (const [, schema] of reader.schemasById) {
          schemas.push({
            id: schema.id,
            name: schema.name || '(unnamed)',
            encoding: schema.encoding || '—',
          });
        }
        schemas.sort((a, b) => a.id - b.id);

        const channelMessageCounts = stats?.channelMessageCounts ?? new Map();
        const channels: ChannelRow[] = [];
        for (const [, channel] of reader.channelsById) {
          const schema = channel.schemaId
            ? reader.schemasById.get(channel.schemaId)
            : undefined;
          const countBig = channelMessageCounts.get(channel.id) ?? 0n;
          const count =
            typeof countBig === 'bigint' ? Number(countBig) : Number(countBig);
          channels.push({
            id: channel.id,
            topic: channel.topic,
            schemaName: schema?.name ?? '—',
            encoding: channel.messageEncoding || '—',
            messageCount: count,
            frequency: durationSec > 0 ? count / durationSec : null,
          });
        }
        channels.sort((a, b) => b.messageCount - a.messageCount);

        const totalMessages = stats?.messageCount
          ? Number(stats.messageCount)
          : channels.reduce((s, c) => s + c.messageCount, 0);

        setState({
          status: 'ready',
          totalMessages,
          durationSec,
          channelCount: channels.length,
          schemaCount: schemas.length,
          startTimeNs: startNs,
          endTimeNs: endNs,
          channels,
          schemas,
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setState({
          status: 'error',
          message: `${msg}. This MCAP file may not have a summary section.`,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meta.url, meta.size, fetcher]);

  const timeRangeLabel = useMemo(() => {
    if (state.status !== 'ready') return '';
    return formatTimeRange(state.startTimeNs, state.endTimeNs);
  }, [state]);

  if (state.status === 'loading') return <LoadingState label="Reading MCAP summary…" />;
  if (state.status === 'error') return <ErrorState message={state.message} />;

  return (
    <div
      className="p-4 overflow-auto text-sm text-zinc-800 dark:text-zinc-200"
      style={{ maxHeight: 600 }}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <StatTile label="Total Messages" value={state.totalMessages.toLocaleString()} />
        <StatTile label="Duration" value={formatDuration(state.durationSec)} />
        <StatTile label="Channels" value={String(state.channelCount)} />
        <StatTile label="Schemas" value={String(state.schemaCount)} />
      </div>

      <div className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">Time range: </span>
        {timeRangeLabel}
      </div>

      <section className="mb-6">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
          Channels
        </h3>
        {state.channels.length === 0 ? (
          <div className="text-xs text-zinc-500 dark:text-zinc-400">No channels.</div>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-900 font-medium text-left">
                  <th className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800">Topic</th>
                  <th className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800">Schema</th>
                  <th className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800">Encoding</th>
                  <th className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800 text-right">Messages</th>
                  <th className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800 text-right">Frequency (Hz)</th>
                </tr>
              </thead>
              <tbody>
                {state.channels.map((c) => (
                  <tr key={c.id}>
                    <td className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800">{c.topic}</td>
                    <td className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800">{c.schemaName}</td>
                    <td className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800">{c.encoding}</td>
                    <td className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800 text-right tabular-nums">
                      {c.messageCount.toLocaleString()}
                    </td>
                    <td className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800 text-right tabular-nums">
                      {c.frequency != null ? c.frequency.toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
          Schemas
        </h3>
        {state.schemas.length === 0 ? (
          <div className="text-xs text-zinc-500 dark:text-zinc-400">No schemas.</div>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-900 font-medium text-left">
                  <th className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800 text-right">ID</th>
                  <th className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800">Name</th>
                  <th className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800">Encoding</th>
                </tr>
              </thead>
              <tbody>
                {state.schemas.map((s) => (
                  <tr key={s.id}>
                    <td className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800 text-right tabular-nums">
                      {s.id}
                    </td>
                    <td className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800">{s.name}</td>
                    <td className="px-2 py-1 border-b border-zinc-100 dark:border-zinc-800">{s.encoding}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-200 dark:border-zinc-700 px-3 py-2">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTimeRange(startNs: bigint, endNs: bigint): string {
  // Treat startTime === 0 as a relative-time recording (no wall clock anchor).
  if (startNs === 0n) {
    const endSec = Number(endNs) / 1e9;
    return `0s — ${endSec.toFixed(3)}s`;
  }
  // MCAP timestamps are nanoseconds; JS Date wants milliseconds.
  const startMs = Number(startNs / 1_000_000n);
  const endMs = Number(endNs / 1_000_000n);
  try {
    return `${new Date(startMs).toISOString()} — ${new Date(endMs).toISOString()}`;
  } catch {
    return `${startNs.toString()}ns — ${endNs.toString()}ns`;
  }
}
