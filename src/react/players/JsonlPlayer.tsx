import { usePlaylistEngine } from '../hooks/use-playlist-engine';
import { useSegment } from '../hooks/use-segment';
import { useClockValue } from '../hooks/use-clock-value';
import type { TimelineClock } from '../../core/timeline';

interface JsonlEntry {
  start: number;
  end?: number;
  text?: string;
  [key: string]: unknown;
}

interface JsonlPlayerProps {
  playlistUrl: string;
  clock: TimelineClock;
  className?: string;
}

/**
 * Player component for JSONL m3u8 tracks.
 *
 * Re-renders only when:
 * - The active segment changes (useSegment tracks boundaries locally at ~10fps)
 * - The highlighted entry changes (useClockValue at ~4fps)
 */
export function JsonlPlayer({ playlistUrl, clock, className }: JsonlPlayerProps) {
  const { engine, loading: playlistLoading, error: playlistError } = usePlaylistEngine(
    { url: playlistUrl },
    clock,
  );

  const { data, loading: segmentLoading, error: segmentError } = useSegment<JsonlEntry[]>(
    engine,
    clock,
  );

  // ~4fps for highlighting the active entry within a segment
  const currentTime = useClockValue(clock, 4);

  const activeIndex = data
    ? data.findIndex((entry) => {
        const end = entry.end ?? entry.start;
        return currentTime >= entry.start && currentTime < end;
      })
    : -1;

  const loading = playlistLoading || segmentLoading;
  const error = playlistError || segmentError;

  return (
    <div className={`flex flex-col h-full ${className ?? ''}`}>
      <div className="px-3 py-2 border-b border-zinc-700 text-xs font-medium text-zinc-400 uppercase tracking-wide">
        JSONL Track
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && !data && (
          <div className="flex items-center justify-center h-full text-zinc-500">
            Loading...
          </div>
        )}

        {error && (
          <div className="p-3 text-red-400 text-sm">
            Error: {error.message}
          </div>
        )}

        {data && data.length === 0 && (
          <div className="flex items-center justify-center h-full text-zinc-500">
            No entries in segment
          </div>
        )}

        {data && data.map((entry, i) => (
          <div
            key={i}
            className={`px-3 py-2 border-b border-zinc-800 text-sm transition-colors ${
              i === activeIndex
                ? 'bg-blue-500/20 border-l-2 border-l-blue-400'
                : 'hover:bg-zinc-800/50'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-zinc-500">
                {formatTime(entry.start)}
                {entry.end != null && ` - ${formatTime(entry.end)}`}
              </span>
              {'type' in entry && entry.type != null && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">
                  {String(entry.type)}
                </span>
              )}
            </div>
            {entry.text && (
              <div className="text-zinc-200">{entry.text}</div>
            )}
            {!entry.text && (
              <pre className="text-xs text-zinc-400 overflow-x-auto">
                {JSON.stringify(entry, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
