import { useMemo } from 'react';
import type { Playlist } from '../../core/playlist';
import type { PlaylistSegment, TrackSamples } from '../../core/types';
import type { TimelineClock } from '../../core/timeline';
import { samplesNormalizer, type Normalizer } from '../../core/normalize';
import { useSegment } from './use-segment';

export interface SegmentTrackState {
  /** Columnar track data for the current segment (may contain multiple named tracks). */
  tracks: Map<string, TrackSamples>;
  /** Which segment produced `tracks`, or null when nothing has loaded yet. */
  segment: PlaylistSegment | null;
  loading: boolean;
  error: Error | null;
}

export interface SegmentTrackOptions<T = unknown> {
  /**
   * Convert the decoded current segment into columnar track samples.
   * Default: `samplesNormalizer` — expects JSONL lines shaped `{ts, data}`.
   */
  normalize?: Normalizer<T>;
}

const EMPTY_TRACKS: Map<string, TrackSamples> = new Map();

/**
 * Normalize the **current segment only** into columnar `{times, values, stride}`
 * tracks. No merging across segment boundaries.
 *
 * Use when:
 *  - you want ordered samples for fast binary-search lookup inside one chunk
 *  - you're OK with discontinuities at chunk boundaries (events, previews)
 *  - you want to drive your own cross-segment logic
 *
 * For smooth scrubbing with interpolation across chunk boundaries, use
 * `useMergedTrack` instead.
 */
export function useSegmentTrack<T = unknown>(
  engine: Playlist | null,
  clock?: TimelineClock | null,
  options?: SegmentTrackOptions<T>,
): SegmentTrackState {
  const { data, segment, loading, error } = useSegment<T>(engine, clock);
  const normalize =
    options?.normalize ?? (samplesNormalizer as unknown as Normalizer<T>);

  const tracks = useMemo<Map<string, TrackSamples>>(() => {
    if (data == null) return EMPTY_TRACKS;
    const out = normalize(data);
    return out ?? EMPTY_TRACKS;
    // The normalize reference is intentionally excluded — we re-run when the
    // decoded payload changes. Callers that swap normalizers per render should
    // do so together with a new segment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return { tracks, segment, loading, error };
}
