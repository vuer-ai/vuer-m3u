import { describe, expect, it } from 'vitest';
import { samplesNormalizer } from '../src/core/normalize';
import type { ContinuousSample } from '../src/core/samples';

describe('samplesNormalizer', () => {
  it('returns null for null input', () => {
    expect(samplesNormalizer(null as unknown as ContinuousSample[])).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(samplesNormalizer([])).toBeNull();
  });

  it('returns null when first sample is missing ts', () => {
    const bad = [{ data: [1, 2, 3] }] as unknown as ContinuousSample[];
    expect(samplesNormalizer(bad)).toBeNull();
  });

  it('infers stride=1 for scalar data', () => {
    const samples: ContinuousSample[] = [
      { ts: 0, data: 10 },
      { ts: 0.1, data: 20 },
      { ts: 0.2, data: 30 },
    ];

    const result = samplesNormalizer(samples);
    expect(result).not.toBeNull();
    const track = result!.get('data')!;
    expect(track.stride).toBe(1);
    expect(track.times[0]).toBeCloseTo(0);
    expect(track.times[1]).toBeCloseTo(0.1);
    expect(track.times[2]).toBeCloseTo(0.2);
    expect(track.values[0]).toBe(10);
    expect(track.values[1]).toBe(20);
    expect(track.values[2]).toBe(30);
  });

  it('infers stride from first sample for vec3 data', () => {
    const samples: ContinuousSample[] = [
      { ts: 0, data: [1, 2, 3] },
      { ts: 0.5, data: [4, 5, 6] },
    ];

    const result = samplesNormalizer(samples);
    const track = result!.get('data')!;
    expect(track.stride).toBe(3);
    expect(track.times.length).toBe(2);
    expect(track.values.length).toBe(6);
    expect(Array.from(track.values)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('produces a single track named "data"', () => {
    const samples: ContinuousSample[] = [{ ts: 0, data: [0, 0] }];
    const result = samplesNormalizer(samples);
    expect([...result!.keys()]).toEqual(['data']);
  });

  it('returns Float32Array buffers', () => {
    const samples: ContinuousSample[] = [
      { ts: 0, data: [1, 2] },
      { ts: 1, data: [3, 4] },
    ];
    const track = samplesNormalizer(samples)!.get('data')!;
    expect(track.times).toBeInstanceOf(Float32Array);
    expect(track.values).toBeInstanceOf(Float32Array);
  });

  it('stable top-level reference', () => {
    // Reference should be identical across imports — enables zero-config default
    expect(samplesNormalizer).toBe(samplesNormalizer);
  });
});
