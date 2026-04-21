import { useMemo } from 'react';
import { usePlaylist } from '../hooks/use-playlist';
import { useSegment } from '../hooks/use-segment';
import { useClockValue } from '../hooks/use-clock-value';
import { useClockContext } from '../clock-context';
import type { TimelineClock } from '../../core/timeline';

interface VttCue {
  start: number;
  end: number;
  text: string;
}

interface SubtitleViewProps {
  src: string;
  clock?: TimelineClock | null;
  className?: string;
}

/**
 * SubtitleView
 *
 * ## Data format contract
 *
 * Chunks: WebVTT (`.vtt`), standard W3C WebVTT format — not JSONL.
 *
 * File shape:
 *   WEBVTT
 *
 *   HH:MM:SS.mmm --> HH:MM:SS.mmm
 *   Cue text
 *
 * Constraints:
 *   - Cue timestamps are absolute seconds on the playlist timeline
 *   - Only one active cue is displayed at a time
 *
 * How the view renders:
 *   Parses VTT once per segment. Polls `clock.time` at ~10fps and displays
 *   whichever cue's `[start, end)` contains the current time.
 */
export function SubtitleView({ src, clock, className }: SubtitleViewProps) {
  const resolvedClock = useClockContext(clock);
  const { engine } = usePlaylist({ url: src }, resolvedClock);
  const { data: rawVtt } = useSegment<string>(engine, resolvedClock);

  // ~10fps for subtitle cue changes
  const currentTime = useClockValue(10, resolvedClock);

  const cues = useMemo(() => {
    if (!rawVtt) return [];
    return parseVtt(rawVtt);
  }, [rawVtt]);

  const activeCue = useMemo(() => {
    return cues.find((cue) => currentTime >= cue.start && currentTime < cue.end);
  }, [cues, currentTime]);

  return (
    <div className={`flex items-center justify-center ${className ?? ''}`}>
      {activeCue ? (
        <div className="bg-black/80 px-4 py-2 rounded-lg">
          <p className="text-white text-center text-lg">{activeCue.text}</p>
        </div>
      ) : (
        <div className="text-zinc-600 text-sm">No subtitle</div>
      )}
    </div>
  );
}

/**
 * Minimal VTT parser — extracts timestamp + text cues.
 */
function parseVtt(vtt: string): VttCue[] {
  const cues: VttCue[] = [];
  const blocks = vtt.split('\n\n');

  for (const block of blocks) {
    const lines = block.trim().split('\n');

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(
        /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/,
      );
      if (match) {
        const start = parseVttTimestamp(match[1]);
        const end = parseVttTimestamp(match[2]);
        const text = lines
          .slice(i + 1)
          .join('\n')
          .trim();
        if (text) {
          cues.push({ start, end, text });
        }
      }
    }
  }

  return cues;
}

function parseVttTimestamp(ts: string): number {
  const parts = ts.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const [secs, ms] = parts[2].split('.');
  return hours * 3600 + minutes * 60 + parseInt(secs, 10) + parseInt(ms, 10) / 1000;
}
