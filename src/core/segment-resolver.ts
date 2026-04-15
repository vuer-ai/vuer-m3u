import type { PlaylistSegment } from './types';

/**
 * Find the segment containing the given time using binary search.
 * Returns null if time is out of range.
 */
export function resolveSegment(
  segments: PlaylistSegment[],
  time: number,
): PlaylistSegment | null {
  if (segments.length === 0) return null;

  // Clamp to valid range
  if (time < 0) return segments[0];
  if (time >= segments[segments.length - 1].endTime) {
    return segments[segments.length - 1];
  }

  // Binary search: find the segment where startTime <= time < endTime
  let lo = 0;
  let hi = segments.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const seg = segments[mid];

    if (time < seg.startTime) {
      hi = mid - 1;
    } else if (time >= seg.endTime) {
      lo = mid + 1;
    } else {
      return seg;
    }
  }

  return null;
}

/**
 * Find all segments overlapping the time range [start, end).
 */
export function resolveSegmentRange(
  segments: PlaylistSegment[],
  start: number,
  end: number,
): PlaylistSegment[] {
  if (segments.length === 0 || start >= end) return [];

  return segments.filter(seg => seg.startTime < end && seg.endTime > start);
}

/**
 * Get the segment at `time` plus `count` subsequent segments.
 * Used for prefetching.
 */
export function resolveSegmentWindow(
  segments: PlaylistSegment[],
  time: number,
  count: number,
): PlaylistSegment[] {
  const current = resolveSegment(segments, time);
  if (!current) return [];

  const startIdx = current.index;
  const endIdx = Math.min(startIdx + 1 + count, segments.length);
  return segments.slice(startIdx, endIdx);
}
