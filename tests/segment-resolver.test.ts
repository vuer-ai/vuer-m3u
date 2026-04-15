import { describe, it, expect } from 'vitest';
import { resolveSegment, resolveSegmentRange, resolveSegmentWindow } from '../src/core/segment-resolver';
import type { PlaylistSegment } from '../src/core/types';

function makeSegments(durations: number[]): PlaylistSegment[] {
  let cumulative = 0;
  return durations.map((d, i) => {
    const seg: PlaylistSegment = {
      index: i,
      duration: d,
      uri: `seg${i}`,
      title: '',
      startTime: cumulative,
      endTime: cumulative + d,
    };
    cumulative += d;
    return seg;
  });
}

describe('resolveSegment', () => {
  const segments = makeSegments([10, 10, 10]); // 0-10, 10-20, 20-30

  it('finds the correct segment for a given time', () => {
    expect(resolveSegment(segments, 0)?.index).toBe(0);
    expect(resolveSegment(segments, 5)?.index).toBe(0);
    expect(resolveSegment(segments, 9.999)?.index).toBe(0);
    expect(resolveSegment(segments, 10)?.index).toBe(1);
    expect(resolveSegment(segments, 15)?.index).toBe(1);
    expect(resolveSegment(segments, 20)?.index).toBe(2);
    expect(resolveSegment(segments, 25)?.index).toBe(2);
  });

  it('clamps negative time to first segment', () => {
    expect(resolveSegment(segments, -5)?.index).toBe(0);
  });

  it('clamps time past end to last segment', () => {
    expect(resolveSegment(segments, 35)?.index).toBe(2);
    expect(resolveSegment(segments, 30)?.index).toBe(2);
  });

  it('returns null for empty segments', () => {
    expect(resolveSegment([], 5)).toBeNull();
  });
});

describe('resolveSegmentRange', () => {
  const segments = makeSegments([10, 10, 10]);

  it('finds overlapping segments', () => {
    const result = resolveSegmentRange(segments, 5, 15);
    expect(result).toHaveLength(2);
    expect(result[0].index).toBe(0);
    expect(result[1].index).toBe(1);
  });

  it('returns single segment for contained range', () => {
    const result = resolveSegmentRange(segments, 2, 8);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(0);
  });

  it('returns all segments for full range', () => {
    const result = resolveSegmentRange(segments, 0, 30);
    expect(result).toHaveLength(3);
  });

  it('returns empty for non-overlapping range', () => {
    expect(resolveSegmentRange(segments, 30, 40)).toHaveLength(0);
  });
});

describe('resolveSegmentWindow', () => {
  const segments = makeSegments([10, 10, 10, 10]);

  it('returns current + next N segments', () => {
    const result = resolveSegmentWindow(segments, 5, 2);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('clamps at end of playlist', () => {
    const result = resolveSegmentWindow(segments, 25, 5);
    expect(result).toHaveLength(2); // segment 2 and 3
  });

  it('returns just current if count=0', () => {
    const result = resolveSegmentWindow(segments, 5, 0);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(0);
  });
});
