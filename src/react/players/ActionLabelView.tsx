import { useMemo } from 'react';
import { usePlaylist } from '../hooks/use-playlist';
import { useSegment } from '../hooks/use-segment';
import { useClockValue } from '../hooks/use-clock-value';
import { useClockContext } from '../clock-context';
import type { TimelineClock } from '../../core/timeline';

/**
 * One action-label event — a time-bounded discrete annotation.
 * `ts` and `te` are absolute seconds on the playlist timeline.
 */
export interface ActionEvent {
  ts: number;
  te: number;
  label: string;
  [key: string]: unknown;
}

export interface ActionLabelViewProps {
  src: string;
  clock?: TimelineClock | null;
  className?: string;
  /** Highlight-check fps. Defaults to 10. */
  fps?: number;
}

const PALETTE = [
  '#f97316', // orange
  '#22c55e', // green
  '#3b82f6', // blue
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#eab308', // yellow
  '#ef4444', // red
];

function colorForLabel(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * ActionLabelView — ribbon timeline of discrete action / phase annotations.
 *
 * Top: a full-width ribbon spanning the playlist duration, with segment
 * boundaries as tick marks, the current segment's events drawn as colored
 * spans, and a yellow playhead. Bottom: the active event(s) as a badge plus
 * the full event list for the current segment.
 *
 * ## Data format
 * JSONL lines `{ ts: number, te: number, label: string, ...extras }`.
 * Events must stay inside their enclosing segment's `[startTime, endTime)`.
 *
 * ## Hooks used
 * `usePlaylist` (for segment boundaries & duration), `useSegment` (events of
 * the current chunk), `useClockValue` (playhead refresh).
 */
export function ActionLabelView({ src, clock, className, fps = 10 }: ActionLabelViewProps) {
  const resolvedClock = useClockContext(clock);
  const { engine, playlist } = usePlaylist({ url: src }, resolvedClock);
  const { data: events, segment } = useSegment<ActionEvent[]>(engine, resolvedClock);
  const time = useClockValue(fps, resolvedClock);

  const total = playlist?.totalDuration ?? 0;
  const list = events ?? [];
  const active = useMemo(() => list.filter((e) => time >= e.ts && time < e.te), [list, time]);

  return (
    <div className={`bg-zinc-900 text-zinc-100 text-xs font-mono ${className ?? ''}`}>
      <div className="px-3 py-1.5 flex items-center gap-3 border-b border-zinc-800 text-[10px]">
        <span className="text-zinc-400">Actions @ {time.toFixed(2)}s</span>
        <span className="text-zinc-500">
          segment {segment ? `#${segment.index}` : '—'} · {list.length} events
        </span>
        {active.length > 0 && (
          <span className="ml-auto flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: colorForLabel(active[0].label) }}
            />
            <span className="text-zinc-100">{active.map((e) => e.label).join(' · ')}</span>
          </span>
        )}
      </div>

      {/* Ribbon */}
      <div className="px-3 py-3">
        <Ribbon
          total={total}
          segments={playlist?.segments ?? []}
          activeSegment={segment?.index ?? -1}
          events={list}
          time={time}
        />
      </div>

      {/* Event list for the current chunk */}
      <ul className="px-3 pb-3 space-y-0.5 max-h-40 overflow-auto">
        {list.length === 0 && <li className="text-zinc-500">no events in this segment</li>}
        {list.map((e, i) => {
          const isActive = time >= e.ts && time < e.te;
          const color = colorForLabel(e.label);
          return (
            <li
              key={i}
              className={`px-2 py-1 rounded flex items-center gap-2 ${
                isActive ? 'bg-zinc-800/80 text-zinc-100' : 'text-zinc-400'
              }`}
            >
              <span className="w-1.5 h-4 rounded-sm" style={{ background: color }} />
              <span className="flex-1 truncate">{e.label}</span>
              <span className="tabular-nums text-zinc-500">
                {e.ts.toFixed(2)}–{e.te.toFixed(2)}s
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- Ribbon ---------------------------------------------------------------

function Ribbon({
  total,
  segments,
  activeSegment,
  events,
  time,
}: {
  total: number;
  segments: Array<{ index: number; startTime: number; endTime: number }>;
  activeSegment: number;
  events: ActionEvent[];
  time: number;
}) {
  const W = 1000;
  const H = 48;
  const t2x = (t: number) => (total > 0 ? (t / total) * W : 0);

  if (total === 0) {
    return <div className="text-zinc-500">loading playlist…</div>;
  }

  const playheadX = t2x(time);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-10">
      {/* Segment backgrounds */}
      {segments.map((s) => (
        <rect
          key={s.index}
          x={t2x(s.startTime)}
          y={12}
          width={t2x(s.endTime) - t2x(s.startTime) - 1}
          height={24}
          fill={s.index === activeSegment ? '#27272a' : '#18181b'}
          rx={2}
        />
      ))}

      {/* Segment boundary ticks */}
      {segments.map((s) => (
        <line
          key={`tick-${s.index}`}
          x1={t2x(s.startTime)}
          y1={8}
          x2={t2x(s.startTime)}
          y2={H - 4}
          stroke="#3f3f46"
          strokeWidth={1}
        />
      ))}

      {/* Event spans (current segment only) */}
      {events.map((e, i) => (
        <rect
          key={i}
          x={t2x(e.ts)}
          y={14}
          width={Math.max(2, t2x(e.te) - t2x(e.ts))}
          height={20}
          fill={colorForLabel(e.label)}
          opacity={0.85}
          rx={1}
        >
          <title>{e.label} · {e.ts.toFixed(2)}–{e.te.toFixed(2)}s</title>
        </rect>
      ))}

      {/* Playhead */}
      <line
        x1={playheadX}
        y1={4}
        x2={playheadX}
        y2={H - 4}
        stroke="#facc15"
        strokeWidth={1.5}
      />
      <polygon
        points={`${playheadX - 4},4 ${playheadX + 4},4 ${playheadX},10`}
        fill="#facc15"
      />
    </svg>
  );
}
