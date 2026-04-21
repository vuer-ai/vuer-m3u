import { usePlaylist } from '../hooks/use-playlist';
import { useSegment } from '../hooks/use-segment';
import { useClockValue } from '../hooks/use-clock-value';
import { useClockContext } from '../clock-context';
import type { TimelineClock } from '../../core/timeline';

/**
 * One detection event — a bounding-box annotation valid over `[ts, te)`.
 *
 * `bbox` is `[x, y, w, h]` in **normalized** coordinates (each in `[0, 1]`
 * relative to the overlay's width / height). This lets the view render
 * correctly regardless of the underlying image / video resolution.
 */
export interface DetectionEvent {
  ts: number;
  te: number;
  label: string;
  bbox: [number, number, number, number];
  /** 0..1 — shown next to the label when present. */
  confidence?: number;
  /** Stable identifier for the tracked object; used for color continuity. */
  id?: number | string;
  [key: string]: unknown;
}

export interface DetectionBoxViewProps {
  src: string;
  clock?: TimelineClock | null;
  className?: string;
  /** Refresh fps. Defaults to 10. */
  fps?: number;
  /** Hide the label pill if you only want rectangles. Defaults to false. */
  hideLabels?: boolean;
}

const PALETTE = [
  '#f87171', '#34d399', '#60a5fa', '#fbbf24',
  '#a78bfa', '#f472b6', '#22d3ee', '#fb923c',
];

function colorForKey(key: string | number): string {
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * DetectionBoxView — overlay bounding boxes on top of a sibling element
 * (typically a `VideoPlayer` or an `<img>`).
 *
 * The view is absolutely positioned and pointer-events-none by default, so
 * you compose it like this:
 *
 * ```tsx
 * <div className="relative">
 *   <VideoPlayer src="/video.m3u8" className="w-full h-full" />
 *   <DetectionBoxView src="/detections.m3u8" />
 * </div>
 * ```
 *
 * ## Data format
 * JSONL events of shape:
 * ```
 * { ts, te, label, bbox: [x, y, w, h], confidence?, id? }
 * ```
 * Bbox coordinates are normalized `[0, 1]`. For dense per-frame detections,
 * use short `te - ts` (e.g. one frame duration) and store consecutive
 * detections as separate events.
 *
 * ## Hooks used
 * `useSegment` — one segment's detections at a time; `useClockValue` at
 * `fps` drives the highlight refresh.
 */
export function DetectionBoxView({
  src,
  clock,
  className,
  fps = 10,
  hideLabels = false,
}: DetectionBoxViewProps) {
  const resolvedClock = useClockContext(clock);
  const { engine } = usePlaylist({ url: src }, resolvedClock);
  const { data } = useSegment<DetectionEvent[]>(engine, resolvedClock);
  const time = useClockValue(fps, resolvedClock);

  const list = data ?? [];
  const active = list.filter((e) => time >= e.ts && time < e.te);

  return (
    <div
      className={`absolute inset-0 pointer-events-none ${className ?? ''}`}
      aria-label="Detection overlay"
    >
      {active.map((e, i) => {
        const [x, y, w, h] = e.bbox;
        const key = e.id ?? e.label;
        const color = colorForKey(key);
        return (
          <div
            key={`${key}-${i}`}
            className="absolute"
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${w * 100}%`,
              height: `${h * 100}%`,
              border: `2px solid ${color}`,
              boxShadow: `0 0 0 1px rgba(0, 0, 0, 0.35) inset`,
            }}
          >
            {!hideLabels && (
              <span
                className="absolute left-0 -top-5 px-1.5 py-[1px] rounded-sm text-[10px] font-mono whitespace-nowrap text-zinc-950"
                style={{ background: color }}
              >
                {e.label}
                {typeof e.confidence === 'number' && (
                  <span className="ml-1 opacity-80">{e.confidence.toFixed(2)}</span>
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
