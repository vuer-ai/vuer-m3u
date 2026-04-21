import type { ContinuousSample } from './samples';
import type { TrackSamples } from './types';

/**
 * Convert a decoded segment into columnar track data.
 *
 * Returns `null` when the decoded input has no usable samples. `useMergedTrack`
 * treats `null` as an empty segment (skipped during merging).
 *
 * Users with non-JSONL chunk formats (Parquet, Arrow, msgpack, custom binary)
 * write their own `Normalizer<T>` and pass it to `useMergedTrack` via
 * `options.normalize`. The hook's merging + gap-safety logic works with any
 * normalizer output shape.
 */
export type Normalizer<T = unknown> = (decoded: T) => Map<string, TrackSamples> | null;

/**
 * Default normalizer: each JSONL line is a `ContinuousSample` (`{ts, data}`).
 *
 * - Stride is inferred from the first sample's `data` field.
 * - Scalar `data` (number) produces stride=1 with `values[i] = data`.
 * - Array `data` (number[]) produces stride=data.length with samples interleaved.
 * - Returns a single track named `"data"`.
 *
 * Top-level `const` for reference stability — safe to pass as a default.
 */
export const samplesNormalizer: Normalizer<ContinuousSample[]> = (samples) => {
  if (!samples || samples.length === 0) return null;
  const first = samples[0];
  if (first == null || typeof first.ts !== 'number') return null;

  const stride = Array.isArray(first.data) ? first.data.length : 1;
  const n = samples.length;
  const times = new Float32Array(n);
  const values = new Float32Array(n * stride);

  for (let i = 0; i < n; i++) {
    const s = samples[i];
    times[i] = s.ts;
    const d = s.data;
    if (Array.isArray(d)) {
      values.set(d, i * stride);
    } else if (typeof d === 'number') {
      values[i * stride] = d;
    }
  }

  return new Map([['data', { times, values, stride }]]);
};
