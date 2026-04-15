import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaylistEngine } from '../../core/playlist-engine';
import type { TimelineClock } from '../../core/timeline';
import { resolveSegment } from '../../core/segment-resolver';
import { useClockValue } from './use-clock-value';

/**
 * A single named track's interpolatable data.
 * `times` and `values` are contiguous Float32Arrays merged from
 * one or more m3u8 segments. Use with `findBracket` for O(1) lookup.
 */
export interface TrackSamples {
  times: Float32Array;
  values: Float32Array;
  stride: number;
}

export interface TrackDataState {
  /** Interpolatable data per track name */
  tracks: Map<string, TrackSamples>;
  /** Set of loaded segment indices */
  loadedSegments: Set<number>;
  /** Contiguous range that was merged [startIdx, endIdx] inclusive */
  mergedRange: [number, number] | null;
  loading: boolean;
}

interface RawSegmentData {
  [trackName: string]: {
    times: number[];
    values: number[];
    stride: number;
  };
}

/**
 * Load continuous, interpolatable track data from an m3u8 playlist.
 *
 * Returns contiguous `Float32Array` data suitable for `findBracket` + lerp.
 * Tracks segment boundaries locally (per-hook) — multiple useTrackData hooks
 * with different playlists on the same clock work correctly.
 *
 * **Gap safety**: Only merges the longest contiguous chain of loaded segments
 * around the current playback position.
 *
 * Decoder must return one of:
 * - `{ t: number, position: number[], ... }[]` — auto-extracted per field
 * - `{ [trackName]: { times: number[], values: number[], stride: number } }` — direct
 */
export function useTrackData(
  engine: PlaylistEngine | null,
  clock: TimelineClock,
): TrackDataState {
  const rawSegmentsRef = useRef(new Map<number, RawSegmentData>());
  const currentSegmentIndexRef = useRef(-1);
  const lastLoadedIndexRef = useRef(-1);

  const [state, setState] = useState<TrackDataState>({
    tracks: new Map(),
    loadedSegments: new Set(),
    mergedRange: null,
    loading: false,
  });

  // Poll clock.time at ~10fps to detect segment boundary crossings
  const currentTime = useClockValue(clock, 10);

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

  const rebuildMerged = useCallback(() => {
    const raw = rawSegmentsRef.current;
    const centerIdx = currentSegmentIndexRef.current;
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
    const result = new Map<string, TrackSamples>();
    const allTrackNames = new Set<string>();

    for (let i = lo; i <= hi; i++) {
      const segData = raw.get(i);
      if (segData) {
        for (const name of Object.keys(segData)) allTrackNames.add(name);
      }
    }

    for (const name of allTrackNames) {
      const allTimes: number[] = [];
      const allValues: number[] = [];
      let stride = 3;

      for (let i = lo; i <= hi; i++) {
        const segData = raw.get(i);
        if (!segData) continue;
        const td = segData[name];
        if (!td) continue;
        stride = td.stride;
        allTimes.push(...td.times);
        allValues.push(...td.values);
      }

      result.set(name, {
        times: new Float32Array(allTimes),
        values: new Float32Array(allValues),
        stride,
      });
    }

    setState({
      tracks: result,
      loadedSegments: new Set(raw.keys()),
      mergedRange: range,
      loading: false,
    });
  }, [findContiguousRange]);

  const normalizeSegmentData = useCallback(
    (decoded: unknown): RawSegmentData | null => {
      if (!decoded) return null;

      if (Array.isArray(decoded) && decoded.length > 0 && 't' in decoded[0]) {
        const entries = decoded as Array<Record<string, unknown>>;
        const result: RawSegmentData = {};
        const trackNames = Object.keys(entries[0]).filter((k) => k !== 't');

        for (const name of trackNames) {
          const sample = entries[0][name];
          if (!Array.isArray(sample) && typeof sample !== 'number') continue;
          const stride = Array.isArray(sample) ? sample.length : 1;

          const times: number[] = [];
          const values: number[] = [];

          for (const entry of entries) {
            times.push(entry.t as number);
            const val = entry[name];
            if (Array.isArray(val)) {
              values.push(...(val as number[]));
            } else if (typeof val === 'number') {
              values.push(val);
            }
          }

          result[name] = { times, values, stride };
        }
        return result;
      }

      if (typeof decoded === 'object' && decoded !== null && !Array.isArray(decoded)) {
        return decoded as RawSegmentData;
      }

      return null;
    },
    [],
  );

  /**
   * Load a segment and its already-cached neighbors into rawSegmentsRef.
   *
   * getDataAtTime() prefetches adjacent segments into the SegmentLoader cache.
   * For continuous data we need those neighbors in rawSegmentsRef too so that
   * rebuildMerged() can produce a wider Float32Array (e.g., canvas can draw
   * ahead of the current playback position without gaps).
   */
  const loadSegment = useCallback(
    async (time: number) => {
      if (!engine) return;

      const playlist = engine.getPlaylist();
      if (!playlist || playlist.segments.length === 0) return;

      const seg = resolveSegment(playlist.segments, time);
      if (!seg || seg.index === lastLoadedIndexRef.current) return;

      currentSegmentIndexRef.current = seg.index;
      lastLoadedIndexRef.current = seg.index;

      try {
        // Load current segment (triggers prefetch of next N into SegmentLoader cache)
        const result = await engine.getDataAtTime(time);
        if (result) {
          const normalized = normalizeSegmentData(result.decoded);
          if (normalized) {
            rawSegmentsRef.current.set(result.segment.index, normalized);
          }
        }

        // Pull already-cached adjacent segments into rawSegmentsRef.
        // These were prefetched by getDataAtTime → already in SegmentLoader cache → instant.
        const prefetchCount = engine.options.prefetchCount ?? 2;
        for (let i = 1; i <= prefetchCount; i++) {
          const adjIndex = seg.index + i;
          if (adjIndex >= playlist.segments.length) break;
          if (rawSegmentsRef.current.has(adjIndex)) continue;

          const adjSeg = playlist.segments[adjIndex];
          const adjResult = await engine.getDataAtTime(adjSeg.startTime);
          if (adjResult) {
            const normalized = normalizeSegmentData(adjResult.decoded);
            if (normalized) {
              rawSegmentsRef.current.set(adjResult.segment.index, normalized);
            }
          }
        }

        rebuildMerged();
      } catch {
        // Errors handled by engine events
      }
    },
    [engine, normalizeSegmentData, rebuildMerged],
  );

  // Check for segment change at ~10fps
  useEffect(() => {
    loadSegment(currentTime);
  }, [currentTime, loadSegment]);

  // Force reload on explicit seek
  useEffect(() => {
    const unsub = clock.on('seek', (e) => {
      lastLoadedIndexRef.current = -1;
      loadSegment(e.time);
    });
    return unsub;
  }, [clock, loadSegment]);

  return state;
}
