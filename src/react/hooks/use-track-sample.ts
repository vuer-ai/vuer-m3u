import { useRef } from 'react';
import type { TrackSamples } from '../../core/types';
import { lerp, sampleTrack, type Interpolator, type BracketHint } from '../../core/interpolators';

/**
 * Query a merged track at a precise time.
 *
 * Returns a `Float32Array` of length `track.stride` — the interpolated sample
 * at `time`. Returns `null` when the track is absent or has fewer than 2
 * samples.
 *
 * The output buffer is reused across renders; the interpolator writes into it
 * in place. Do not retain the returned array across renders — it mutates.
 *
 * Default interpolator is `lerp` (per-component linear). For quaternion
 * orientation data pass `slerpQuat`; for categorical data pass `step` or
 * `nearest`.
 *
 * @example
 * ```tsx
 * const time = useClockValue(clock, 30);
 * const { tracks } = useMergedTrack(engine, clock);
 * const position = useTrackSample(tracks.get('data'), time);
 * const orientation = useTrackSample(quatTrack, time, slerpQuat);
 * ```
 */
export function useTrackSample(
  track: TrackSamples | undefined,
  time: number,
  interp: Interpolator = lerp,
): Float32Array | null {
  const hintRef = useRef<BracketHint>({ value: 0 });
  const outRef = useRef<Float32Array | null>(null);

  if (!track || track.times.length < 2) return null;

  if (outRef.current == null || outRef.current.length !== track.stride) {
    outRef.current = new Float32Array(track.stride);
  }

  sampleTrack(track, time, interp, hintRef.current, outRef.current);
  return outRef.current;
}
