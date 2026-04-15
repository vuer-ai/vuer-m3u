import { useCallback, useRef, useState } from 'react';
import type { TimelineClock } from '../core/timeline';
import type { TimelineState } from '../core/types';
import { useClockValue } from './hooks/use-clock-value';

interface TimelineControllerProps {
  clock: TimelineClock;
  state: TimelineState;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onLoopChange?: (loop: boolean) => void;
  markers?: Array<{ start: number; end: number; color?: string; label?: string }>;
  className?: string;
}

const PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2, 4];

export function TimelineController({
  clock,
  state,
  onPlay,
  onPause,
  onSeek,
  onPlaybackRateChange,
  onLoopChange,
  markers,
  className,
}: TimelineControllerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Scrubber position at ~30fps — TimelineController decides its own render frequency
  const currentTime = useClockValue(clock, 30);

  const progress = state.duration > 0 ? (currentTime / state.duration) * 100 : 0;

  const timeFromMouseEvent = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      return pct * state.duration;
    },
    [state.duration],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsScrubbing(true);
      onSeek(timeFromMouseEvent(e));

      const handleMouseMove = (ev: MouseEvent) => {
        onSeek(timeFromMouseEvent(ev));
      };
      const handleMouseUp = () => {
        setIsScrubbing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onSeek, timeFromMouseEvent],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      setHoverTime(timeFromMouseEvent(e));
    },
    [timeFromMouseEvent],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverTime(null);
  }, []);

  return (
    <div className={`select-none ${className ?? ''}`}>
      {/* Scrubber track */}
      <div
        ref={trackRef}
        className="relative h-2 bg-zinc-700 rounded-full cursor-pointer group mb-3"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {markers?.map((marker, i) => (
          <div
            key={i}
            className="absolute top-0 h-full rounded-full opacity-40"
            style={{
              left: `${(marker.start / state.duration) * 100}%`,
              width: `${((marker.end - marker.start) / state.duration) * 100}%`,
              backgroundColor: marker.color ?? '#3b82f6',
            }}
            title={marker.label}
          />
        ))}

        <div
          className="absolute top-0 left-0 h-full bg-white/90 rounded-full"
          style={{ width: `${progress}%` }}
        />

        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md
                     transition-transform group-hover:scale-125"
          style={{ left: `calc(${progress}% - 7px)` }}
        />

        {hoverTime !== null && !isScrubbing && (
          <div
            className="absolute -top-8 -translate-x-1/2 bg-zinc-800 px-2 py-0.5 rounded text-xs text-zinc-200 whitespace-nowrap"
            style={{ left: `${(hoverTime / state.duration) * 100}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={state.playing ? onPause : onPlay}
            className="text-zinc-300 hover:text-white transition-colors"
          >
            {state.playing ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {onLoopChange && (
            <button
              onClick={() => onLoopChange(!state.loop)}
              className={`transition-colors ${
                state.loop ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title={state.loop ? 'Loop on' : 'Loop off'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12V9a3 3 0 013-3h10l-3-3m0 0l3 3m-3-3M20 12v3a3 3 0 01-3 3H7l3 3m0 0l-3-3m3 3" />
              </svg>
            </button>
          )}

          <span className="font-mono text-zinc-400 text-xs">
            {formatTime(currentTime)} / {formatTime(state.duration)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {PLAYBACK_RATES.map((rate) => (
            <button
              key={rate}
              onClick={() => onPlaybackRateChange(rate)}
              className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                state.playbackRate === rate
                  ? 'bg-white text-zinc-900 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
