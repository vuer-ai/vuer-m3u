import { useMemo } from 'react';
import { usePlaylistEngine } from '../hooks/use-playlist-engine';
import { useSegment } from '../hooks/use-segment';
import { useClockValue } from '../hooks/use-clock-value';
import type { TimelineClock } from '../../core/timeline';

interface VttCue {
  start: number;
  end: number;
  text: string;
}

interface SubtitlePlayerProps {
  playlistUrl: string;
  clock: TimelineClock;
  className?: string;
}

/**
 * Player component for WebVTT subtitle tracks.
 * Subscribes to tick at ~10fps to update the displayed cue.
 */
export function SubtitlePlayer({ playlistUrl, clock, className }: SubtitlePlayerProps) {
  const { engine } = usePlaylistEngine({ url: playlistUrl }, clock);
  const { data: rawVtt } = useSegment<string>(engine, clock);

  // ~10fps for subtitle cue changes
  const currentTime = useClockValue(clock, 10);

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
