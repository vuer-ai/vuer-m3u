import { findBracket } from './find-bracket';
import type { TrackSamples } from './types';

/**
 * An interpolator produces a sample between two keyframes.
 *
 * - `a`, `b`: bracket keyframe values, each of length = `stride`
 * - `alpha`: interpolation factor in [0, 1]
 * - `out`: caller-owned output buffer, length = `stride`; the function writes into it in place
 */
export type Interpolator = (
  a: Float32Array,
  b: Float32Array,
  alpha: number,
  out: Float32Array,
) => void;

/** Per-component linear interpolation. Works for scalar (stride=1) and any vec length. */
export const lerp: Interpolator = (a, b, alpha, out) => {
  const n = out.length;
  for (let i = 0; i < n; i++) {
    out[i] = a[i] + (b[i] - a[i]) * alpha;
  }
};

/** Step — hold the previous sample. */
export const step: Interpolator = (a, _b, _alpha, out) => {
  out.set(a);
};

/** Nearest — pick whichever bracket endpoint is closer. */
export const nearest: Interpolator = (a, b, alpha, out) => {
  out.set(alpha < 0.5 ? a : b);
};

/**
 * Spherical linear interpolation for unit quaternions `[x, y, z, w]`.
 *
 * - Inputs are assumed to have length 4. Out buffer must also be length 4.
 * - Picks the shortest-arc path by flipping sign of `b` when `dot(a, b) < 0`.
 * - Falls back to `lerp` (and re-normalizes) when the two quats are very close
 *   to avoid division-by-zero.
 */
export const slerpQuat: Interpolator = (a, b, alpha, out) => {
  let ax = a[0], ay = a[1], az = a[2], aw = a[3];
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];

  let dot = ax * bx + ay * by + az * bz + aw * bw;

  // Shortest-arc: if the dot product is negative, flip one side
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    dot = -dot;
  }

  let s0: number;
  let s1: number;

  if (dot > 0.9995) {
    // Quaternions are very close — use lerp + normalize to avoid sin(~0) in denom
    s0 = 1 - alpha;
    s1 = alpha;
  } else {
    const theta0 = Math.acos(dot);
    const sinTheta0 = Math.sin(theta0);
    const theta = theta0 * alpha;
    const sinTheta = Math.sin(theta);
    s1 = sinTheta / sinTheta0;
    s0 = Math.cos(theta) - dot * s1;
  }

  let ox = s0 * ax + s1 * bx;
  let oy = s0 * ay + s1 * by;
  let oz = s0 * az + s1 * bz;
  let ow = s0 * aw + s1 * bw;

  // Normalize to protect against drift
  const len = Math.hypot(ox, oy, oz, ow);
  if (len > 0) {
    const inv = 1 / len;
    ox *= inv;
    oy *= inv;
    oz *= inv;
    ow *= inv;
  }

  out[0] = ox;
  out[1] = oy;
  out[2] = oz;
  out[3] = ow;
};

export interface BracketHint {
  value: number;
}

/**
 * Sample a track at a given time, writing the interpolated value into `out`.
 *
 * Pure function — no React, safe to call inside `clock.on('tick')` or any
 * imperative render loop. Keeps the `findBracket` hint in a caller-owned
 * container so multiple calls amortize to O(1) during sequential playback.
 *
 * Callers must provide `out` sized to `track.stride`.
 */
export function sampleTrack(
  track: TrackSamples,
  time: number,
  interp: Interpolator,
  hint: BracketHint,
  out: Float32Array,
): void {
  const { times, values, stride } = track;
  if (times.length < 2) {
    if (times.length === 1) {
      out.set(values.subarray(0, stride));
    }
    return;
  }

  const [idx, alpha] = findBracket(times, time, hint.value);
  hint.value = idx;

  const aStart = idx * stride;
  const bStart = aStart + stride;
  const a = values.subarray(aStart, bStart) as Float32Array;
  const b = values.subarray(bStart, bStart + stride) as Float32Array;
  interp(a, b, alpha, out);
}
