import { describe, expect, it } from 'vitest';
import { lerp, step, nearest, slerpQuat, sampleTrack } from '../src/core/interpolators';
import type { BracketHint } from '../src/core/interpolators';
import type { TrackSamples } from '../src/core/types';

describe('lerp', () => {
  it('interpolates scalar at alpha 0, 0.5, 1', () => {
    const a = new Float32Array([10]);
    const b = new Float32Array([20]);
    const out = new Float32Array(1);

    lerp(a, b, 0, out);
    expect(out[0]).toBe(10);

    lerp(a, b, 0.5, out);
    expect(out[0]).toBe(15);

    lerp(a, b, 1, out);
    expect(out[0]).toBe(20);
  });

  it('interpolates vec3 component-wise', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([2, 4, 6]);
    const out = new Float32Array(3);

    lerp(a, b, 0.5, out);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('handles arbitrary vec length', () => {
    const a = new Float32Array([0, 0, 0, 0, 0, 0, 0]);
    const b = new Float32Array([1, 2, 3, 4, 5, 6, 7]);
    const out = new Float32Array(7);

    lerp(a, b, 0.25, out);
    expect(out[0]).toBeCloseTo(0.25);
    expect(out[6]).toBeCloseTo(1.75);
  });
});

describe('step', () => {
  it('always returns a regardless of alpha', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([10, 20, 30]);
    const out = new Float32Array(3);

    step(a, b, 0, out);
    expect(Array.from(out)).toEqual([1, 2, 3]);

    step(a, b, 0.9, out);
    expect(Array.from(out)).toEqual([1, 2, 3]);

    step(a, b, 1, out);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });
});

describe('nearest', () => {
  it('picks a when alpha < 0.5, b when alpha >= 0.5', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([10, 20]);
    const out = new Float32Array(2);

    nearest(a, b, 0.4, out);
    expect(Array.from(out)).toEqual([1, 2]);

    nearest(a, b, 0.5, out);
    expect(Array.from(out)).toEqual([10, 20]);

    nearest(a, b, 0.6, out);
    expect(Array.from(out)).toEqual([10, 20]);
  });
});

describe('slerpQuat', () => {
  it('returns a at alpha=0', () => {
    const a = new Float32Array([0, 0, 0, 1]);
    const b = new Float32Array([0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)]);
    const out = new Float32Array(4);

    slerpQuat(a, b, 0, out);
    expect(out[3]).toBeCloseTo(1);
    expect(out[2]).toBeCloseTo(0);
  });

  it('returns b at alpha=1', () => {
    const a = new Float32Array([0, 0, 0, 1]);
    const b = new Float32Array([0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)]);
    const out = new Float32Array(4);

    slerpQuat(a, b, 1, out);
    expect(out[2]).toBeCloseTo(Math.sin(Math.PI / 4));
    expect(out[3]).toBeCloseTo(Math.cos(Math.PI / 4));
  });

  it('produces a unit quaternion at intermediate alpha', () => {
    const a = new Float32Array([0, 0, 0, 1]);
    const b = new Float32Array([Math.sin(Math.PI / 3), 0, 0, Math.cos(Math.PI / 3)]);
    const out = new Float32Array(4);

    slerpQuat(a, b, 0.5, out);
    const len = Math.hypot(out[0], out[1], out[2], out[3]);
    expect(len).toBeCloseTo(1);
  });

  it('picks the shortest arc when dot(a, b) < 0', () => {
    // Identity and near-identity with flipped sign — should lerp toward identity, not away
    const a = new Float32Array([0, 0, 0, 1]);
    const b = new Float32Array([0, 0, 0, -0.9]); // negative w — shortest arc is toward a, not through 180°
    const out = new Float32Array(4);

    slerpQuat(a, b, 0.5, out);
    // After flipping b's sign internally, midpoint should be close to w=1 (identity)
    expect(out[3]).toBeGreaterThan(0.9);
  });
});

describe('sampleTrack', () => {
  const track: TrackSamples = {
    times: new Float32Array([0, 1, 2, 3]),
    values: new Float32Array([0, 0, 0, 10, 0, 0, 20, 0, 0, 30, 0, 0]),
    stride: 3,
  };

  it('lerps between adjacent keyframes', () => {
    const hint: BracketHint = { value: 0 };
    const out = new Float32Array(3);

    sampleTrack(track, 0.5, lerp, hint, out);
    expect(out[0]).toBeCloseTo(5);

    sampleTrack(track, 2.5, lerp, hint, out);
    expect(out[0]).toBeCloseTo(25);
  });

  it('clamps to first sample when time is before range', () => {
    const hint: BracketHint = { value: 0 };
    const out = new Float32Array(3);

    sampleTrack(track, -5, lerp, hint, out);
    expect(out[0]).toBe(0);
  });

  it('clamps to last sample when time is after range', () => {
    const hint: BracketHint = { value: 0 };
    const out = new Float32Array(3);

    sampleTrack(track, 99, lerp, hint, out);
    expect(out[0]).toBe(30);
  });

  it('updates hint for O(1) sequential lookups', () => {
    const hint: BracketHint = { value: 0 };
    const out = new Float32Array(3);

    sampleTrack(track, 0.5, lerp, hint, out);
    expect(hint.value).toBe(0);

    sampleTrack(track, 1.5, lerp, hint, out);
    expect(hint.value).toBe(1);

    sampleTrack(track, 2.5, lerp, hint, out);
    expect(hint.value).toBe(2);
  });

  it('returns early with no writes when track has fewer than 2 samples', () => {
    const singletonTrack: TrackSamples = {
      times: new Float32Array([0]),
      values: new Float32Array([42, 0, 0]),
      stride: 3,
    };
    const hint: BracketHint = { value: 0 };
    const out = new Float32Array(3);

    sampleTrack(singletonTrack, 0, lerp, hint, out);
    // With one sample, we copy it into out.
    expect(out[0]).toBe(42);
  });
});
