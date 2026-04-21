import { useCallback, useEffect, useRef, useState } from 'react';
import type { Playlist } from '../../core/playlist';
import type { SegmentState } from '../../core/types';
import type { TimelineClock } from '../../core/timeline';
import { resolveSegment } from '../../core/segment-resolver';
import { useClockValue } from './use-clock-value';
import { useClockContext } from '../clock-context';

/**
 * React hook that returns decoded segment data for the current time.
 *
 * Tracks segment boundaries locally (per-hook, per-playlist) — does NOT
 * rely on a global clock event. This means multiple useSegment hooks with
 * different playlists on the same clock work correctly.
 *
 * Re-renders only when the active segment changes, plus at ~4fps for
 * boundary checking during playback.
 *
 * Clock is resolved from the explicit argument or `<ClockProvider>`.
 */
export function useSegment<T = unknown>(
  engine: Playlist | null,
  clock?: TimelineClock | null,
): SegmentState<T> {
  const resolvedClock = useClockContext(clock);
  const [state, setState] = useState<SegmentState<T>>({
    data: null,
    segment: null,
    loading: false,
    error: null,
  });

  const lastSegmentIndexRef = useRef(-1);
  const loadingRef = useRef(false);

  const currentTime = useClockValue(10, resolvedClock);

  const loadSegment = useCallback(
    async (time: number) => {
      if (!engine || loadingRef.current) return;

      const playlist = engine.getPlaylist();
      if (!playlist || playlist.segments.length === 0) return;

      const seg = resolveSegment(playlist.segments, time);
      if (!seg || seg.index === lastSegmentIndexRef.current) return;

      lastSegmentIndexRef.current = seg.index;
      loadingRef.current = true;
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const result = await engine.getDataAtTime<T>(time);
        if (result) {
          setState({
            data: result.decoded,
            segment: result.segment,
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        setState({
          data: null,
          segment: null,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      } finally {
        loadingRef.current = false;
      }
    },
    [engine],
  );

  // Check for segment change whenever currentTime updates (~10fps)
  useEffect(() => {
    loadSegment(currentTime);
  }, [currentTime, loadSegment]);

  // Also reload on explicit seek
  useEffect(() => {
    const unsub = resolvedClock.on('seek', (e) => {
      lastSegmentIndexRef.current = -1; // force reload
      loadSegment(e.time);
    });
    return unsub;
  }, [resolvedClock, loadSegment]);

  return state;
}
