import { usePlaylist } from '../hooks/use-playlist';
import { useMergedTrack } from '../hooks/use-merged-track';
import { useTrackSample } from '../hooks/use-track-sample';
import { useClockValue } from '../hooks/use-clock-value';
import { useClockContext } from '../clock-context';
import type { TimelineClock } from '../../core/timeline';

export interface BarTrackSample {
  ts: number;
  data: number[] | number;
}

export interface BarTrackViewProps {
  src: string;
  clock?: TimelineClock | null;
  className?: string;
  /** Display fps. Defaults to 15. */
  fps?: number;
  /** Which merged track to read. Defaults to `"data"`. */
  trackName?: string;
  /** Per-channel labels. Defaults to `C0`, `C1`, …, `C{N-1}`. */
  channelNames?: string[];
  /**
   * Soft limit used to scale the signed bar width. Values in `[-range, range]`
   * fill half the bar. Defaults to `1`.
   */
  range?: number;
  /** Tailwind background-class for the filled bar. Defaults to `bg-emerald-400`. */
  accentColor?: string;
  /** Optional header label shown next to the timestamp. */
  title?: string;
}

/**
 * BarTrackView — generic N-channel continuous-data view.
 *
 * The same bar UI that `JointAngleView` used to ship with, promoted to a
 * reusable view for any shape of continuous time-series data (sensor,
 * actuator, feature vector, loss curve, ...).
 *
 * ## Data format
 * JSONL lines of shape `{ ts: number, data: number | number[] }`. Stride is
 * inferred from the first sample. Keep `data.length` constant across chunks.
 *
 * ## Hooks used
 * `useMergedTrack` + `useTrackSample` (lerp). Reads the track named
 * `trackName` (default `"data"`).
 */
export function BarTrackView({
  src,
  clock,
  className,
  fps = 15,
  trackName = 'data',
  channelNames,
  range = 1,
  accentColor = 'bg-emerald-400',
  title,
}: BarTrackViewProps) {
  const resolvedClock = useClockContext(clock);
  const { engine } = usePlaylist({ url: src }, resolvedClock);
  const { tracks } = useMergedTrack(engine, resolvedClock);
  const time = useClockValue(fps, resolvedClock);
  const track = tracks.get(trackName);
  const sample = useTrackSample(track, time);

  const n = track?.stride ?? 0;
  const names = channelNames ?? Array.from({ length: n }, (_, i) => `C${i}`);

  return (
    <div className={`p-3 bg-zinc-900 text-zinc-100 text-xs font-mono rounded ${className ?? ''}`}>
      <div className="mb-2 text-zinc-400">
        {title ?? 'Channels'} @ {time.toFixed(2)}s · {n} ch
      </div>
      {n === 0 && <div className="text-zinc-500">no samples loaded</div>}
      {sample && names.map((name, i) => {
        const v = sample[i];
        const pct = Math.max(-1, Math.min(1, v / range));
        return (
          <div key={i} className="flex items-center gap-2 mb-0.5">
            <span className="w-20 text-zinc-400 truncate" title={name}>{name}</span>
            <span className="w-16 text-right tabular-nums">{v.toFixed(3)}</span>
            <div className="flex-1 h-2 relative bg-zinc-800 rounded">
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-zinc-600" />
              <div
                className={`absolute top-0 bottom-0 rounded ${accentColor}`}
                style={{
                  left: pct >= 0 ? '50%' : `${50 + pct * 50}%`,
                  width: `${Math.abs(pct) * 50}%`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
