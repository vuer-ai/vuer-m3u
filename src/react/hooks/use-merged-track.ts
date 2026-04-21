import { useCallback, useEffect, useRef, useState } from 'react';
import type { Playlist } from '../../core/playlist';
import type { TimelineClock } from '../../core/timeline';
import type { TrackSamples } from '../../core/types';
import { samplesNormalizer, type Normalizer } from '../../core/normalize';
import { useSegment } from './use-segment';
import { useClockContext } from '../clock-context';

export type { TrackSamples } from '../../core/types';
export type { Normalizer } from '../../core/normalize';

export interface MergedTrackState {
  /** Interpolatable data per track name. */
  tracks: Map<string, TrackSamples>;
  /** Set of loaded segment indices. */
  loadedSegments: Set<number>;
  /** Contiguous range that was merged [startIdx, endIdx] inclusive. */
  mergedRange: [number, number] | null;
  loading: boolean;
}

export interface MergedTrackOptions<T = unknown> {
  /**
   * Convert a decoded segment into columnar track samples.
   * Default: `samplesNormalizer` — expects JSONL lines shaped `{ts, data}`.
   * Pass a custom normalizer to emit multiple tracks from one stream
   * (e.g. split `[x,y,z, qx,qy,qz,qw]` into `position` + `orientation`)
   * or to support non-JSONL formats (Parquet, Arrow, msgpack, ...).
   */
  normalize?: Normalizer<T>;
}

/**
 * Load continuous time-series data from an m3u8 playlist and merge the
 * current segment plus its contiguous neighbors into `Float32Array`s suitable
 * for `findBracket` + interpolation.
 *
 * Built on `useSegment` — that hook handles segment-boundary detection; this
 * one adds neighbor prefetch, per-segment normalization, and contiguous merge.
 *
 * **Gap safety**: only the longest contiguous chain of loaded segments around
 * the current playback position is merged. This prevents interpolation across
 * a missing chunk.
 *
 * The decoded segment shape is governed by the decoder (`jsonlDecoder` by
 * default) and normalized by `options.normalize`. Returns a `Map` keyed by
 * track name so a single normalizer can emit multiple named channels from
 * one stream (see `PoseView`). Multiple `useMergedTrack` hooks with different
 * playlists on the same clock work independently.
 */
export function useMergedTrack<T = unknown>(
  engine: Playlist | null,
  clock?: TimelineClock | null,
  options?: MergedTrackOptions<T>,
): MergedTrackState {
  const resolvedClock = useClockContext(clock);
  const rawSegmentsRef = useRef(new Map<number, Map<string, TrackSamples>>());

  // Keep the latest normalize in a ref so callers can pass fresh closures each render
  // without invalidating effects. Default = samplesNormalizer (stable top-level const).
  const normalizeRef = useRef<Normalizer<T>>(
    (options?.normalize ?? (samplesNormalizer as unknown as Normalizer<T>)),
  );
  normalizeRef.current =
    options?.normalize ?? (samplesNormalizer as unknown as Normalizer<T>);

  const [state, setState] = useState<MergedTrackState>({
    tracks: new Map(),
    loadedSegments: new Set(),
    mergedRange: null,
    loading: false,
  });

  // Primitive: follow the current segment via useSegment.
  const { segment } = useSegment<T>(engine, resolvedClock);

  const findContiguousRange = useCallback(
    (centerIdx: number): [number, number] | null => {
      const loaded = rawSegmentsRef.current;
      if (!loaded.has(centerIdx)) return null;
      let lo = centerIdx;
      let hi = centerIdx;
      while (lo > 0 && loaded.has(lo - 1)) lo--;
      while (loaded.has(hi + 1)) hi++;
      return [lo, hi];
    },
    [],
  );

  const rebuildMerged = useCallback(
    (centerIdx: number) => {
      const raw = rawSegmentsRef.current;
      const range = findContiguousRange(centerIdx);

      if (!range) {
        setState({
          tracks: new Map(),
          loadedSegments: new Set(raw.keys()),
          mergedRange: null,
          loading: false,
        });
        return;
      }

      const [lo, hi] = range;
      const merged = new Map<string, TrackSamples>();
      const trackNames = new Set<string>();

      for (let i = lo; i <= hi; i++) {
        const segTracks = raw.get(i);
        if (!segTracks) continue;
        for (const name of segTracks.keys()) trackNames.add(name);
      }

      for (const name of trackNames) {
        const allTimes: number[] = [];
        const allValues: number[] = [];
        let stride = 1;

        for (let i = lo; i <= hi; i++) {
          const segTracks = raw.get(i);
          if (!segTracks) continue;
          const td = segTracks.get(name);
          if (!td) continue;
          stride = td.stride;
          for (let j = 0; j < td.times.length; j++) allTimes.push(td.times[j]);
          for (let j = 0; j < td.values.length; j++) allValues.push(td.values[j]);
        }

        merged.set(name, {
          times: new Float32Array(allTimes),
          values: new Float32Array(allValues),
          stride,
        });
      }

      setState({
        tracks: merged,
        loadedSegments: new Set(raw.keys()),
        mergedRange: range,
        loading: false,
      });
    },
    [findContiguousRange],
  );

  // Load the current segment + N neighbors whenever the active segment index changes.
  useEffect(() => {
    if (!engine || !segment) return;

    const playlist = engine.getPlaylist();
    if (!playlist || playlist.segments.length === 0) return;

    const centerIdx = segment.index;
    const windowSize = engine.options.prefetchCount ?? 2;
    let cancelled = false;

    const loadWindow = async () => {
      const indices: number[] = [];
      for (let offset = -windowSize; offset <= windowSize; offset++) {
        const i = centerIdx + offset;
        if (i < 0 || i >= playlist.segments.length) continue;
        if (rawSegmentsRef.current.has(i)) continue;
        indices.push(i);
      }

      if (indices.length === 0) {
        rebuildMerged(centerIdx);
        return;
      }

      setState((prev) => ({ ...prev, loading: true }));

      await Promise.all(
        indices.map(async (i) => {
          try {
            const seg = playlist.segments[i];
            const result = await engine.getDataAtTime<T>(seg.startTime);
            if (cancelled || !result) return;
            const normalized = normalizeRef.current(result.decoded);
            if (normalized) {
              rawSegmentsRef.current.set(result.segment.index, normalized);
            }
          } catch {
            // Errors surfaced via engine events; skip this segment.
          }
        }),
      );

      if (!cancelled) rebuildMerged(centerIdx);
    };

    loadWindow();
    return () => {
      cancelled = true;
    };
  }, [engine, segment?.index, rebuildMerged]);

  // Seek resets the loaded window — drop cache so the next effect rebuilds fresh
  // around the new position (gap safety in case seek lands far away).
  useEffect(() => {
    const unsub = resolvedClock.on('seek', () => {
      rawSegmentsRef.current.clear();
    });
    return unsub;
  }, [resolvedClock]);

  return state;
}
