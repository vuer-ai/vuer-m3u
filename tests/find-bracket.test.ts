import { describe, it, expect } from 'vitest';
import { findBracket } from '../src/core/find-bracket';

describe('findBracket', () => {
  const times = new Float32Array([0, 1, 2, 3, 4, 5]);

  it('finds the correct bracket at exact keyframes', () => {
    // At t=2, bracket is [1,2] with alpha=1.0 (end of bracket)
    // or [2,3] with alpha=0.0 (start of bracket) — both are valid.
    // Binary search finds [1, 1.0] when hint=0.
    const [idx, alpha] = findBracket(times, 2, 0);
    // Interpolation gives: values[idx] + (values[idx+1] - values[idx]) * alpha
    // = values[1] + (values[2] - values[1]) * 1.0 = values[2] ✓
    expect(idx).toBe(1);
    expect(alpha).toBeCloseTo(1);
  });

  it('interpolates between keyframes', () => {
    const [idx, alpha] = findBracket(times, 2.5, 0);
    expect(idx).toBe(2);
    expect(alpha).toBeCloseTo(0.5);
  });

  it('clamps to start when t < first keyframe', () => {
    const [idx, alpha] = findBracket(times, -1, 0);
    expect(idx).toBe(0);
    expect(alpha).toBe(0);
  });

  it('clamps to end when t > last keyframe', () => {
    const [idx, alpha] = findBracket(times, 10, 0);
    expect(idx).toBe(4); // len - 2
    expect(alpha).toBe(1);
  });

  it('uses hint for O(1) lookup during sequential playback', () => {
    // Simulate sequential playback: t advances slowly
    const [idx1, a1] = findBracket(times, 2.3, 2);
    expect(idx1).toBe(2);
    expect(a1).toBeCloseTo(0.3);

    // Next frame: hint = 2, time moves forward slightly
    const [idx2, a2] = findBracket(times, 2.7, 2);
    expect(idx2).toBe(2);
    expect(a2).toBeCloseTo(0.7);

    // Cross to next bracket: hint+1 check should catch it
    const [idx3, a3] = findBracket(times, 3.2, 2);
    expect(idx3).toBe(3);
    expect(a3).toBeCloseTo(0.2);
  });

  it('falls back to binary search on large seek', () => {
    // hint = 0 but time = 4.5 — hint is far off
    const [idx, alpha] = findBracket(times, 4.5, 0);
    expect(idx).toBe(4);
    expect(alpha).toBeCloseTo(0.5);
  });

  it('handles single-element array', () => {
    const single = new Float32Array([5]);
    const [idx, alpha] = findBracket(single, 5, 0);
    expect(idx).toBe(0);
    expect(alpha).toBe(0);
  });

  it('handles two-element array', () => {
    const two = new Float32Array([0, 10]);
    const [idx, alpha] = findBracket(two, 5, 0);
    expect(idx).toBe(0);
    expect(alpha).toBeCloseTo(0.5);
  });

  it('handles empty array', () => {
    const empty = new Float32Array([]);
    const [idx, alpha] = findBracket(empty, 5, 0);
    expect(idx).toBe(0);
    expect(alpha).toBe(0);
  });
});
