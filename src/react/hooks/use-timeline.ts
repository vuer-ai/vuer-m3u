import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { TimelineClock } from '../../core/timeline';
import type { TimelineState } from '../../core/types';

/**
 * Creates and manages a TimelineClock.
 *
 * Returns:
 * - `clock` — pass to player components (they subscribe at the fps they need)
 * - `state` — discrete playback state (playing, rate, loop, duration).
 *             Only re-renders when these values change (on seek events),
 *             NOT on every frame. For currentTime, use `useClockValue(clock, fps)`.
 *
 * Duration is auto-detected from playlists via `usePlaylistEngine(options, clock)`.
 */
export function useTimeline(duration = 0) {
  const clockRef = useRef<TimelineClock | null>(null);
  if (!clockRef.current) {
    clockRef.current = new TimelineClock(duration);
  }
  const clock = clockRef.current;

  useEffect(() => {
    if (duration > 0) clock.setDuration(duration);
  }, [clock, duration]);

  useEffect(() => {
    return () => clock.destroy();
  }, [clock]);

  // State snapshot — only updates on seek events (play/pause/seek/rate/loop).
  // Does NOT include currentTime — consumers use useClockValue for that.
  const snapRef = useRef<TimelineState>({
    duration,
    playing: false,
    playbackRate: 1,
    loop: false,
  });

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return clock.on('seek', () => {
        const prev = snapRef.current;
        const next: TimelineState = {
          duration: clock.duration,
          playing: clock.playing,
          playbackRate: clock.rate,
          loop: clock.loop,
        };
        if (
          prev.duration !== next.duration ||
          prev.playing !== next.playing ||
          prev.playbackRate !== next.playbackRate ||
          prev.loop !== next.loop
        ) {
          snapRef.current = next;
        }
        onStoreChange();
      });
    },
    [clock],
  );

  const getSnapshot = useCallback(() => snapRef.current, []);
  const state = useSyncExternalStore(subscribe, getSnapshot);

  const play = useCallback(() => clock.play(), [clock]);
  const pause = useCallback(() => clock.pause(), [clock]);
  const seek = useCallback((t: number) => clock.seek(t), [clock]);
  const setPlaybackRate = useCallback((r: number) => clock.setRate(r), [clock]);
  const setLoop = useCallback((v: boolean) => clock.setLoop(v), [clock]);

  return { clock, state, play, pause, seek, setPlaybackRate, setLoop };
}
