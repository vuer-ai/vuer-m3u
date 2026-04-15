/**
 * Find the keyframe bracket for time `t` with temporal coherence.
 *
 * Returns `[index, alpha]`:
 * - `index`: left keyframe index in the times array
 * - `alpha`: interpolation factor 0..1 between times[index] and times[index+1]
 *
 * Performance:
 * - O(1) amortized during sequential playback (temporal coherence via hint)
 * - O(log n) on seeks or large jumps (binary search fallback)
 *
 * Ported from vuer-ts animation_tracks/utils/findBracket.ts
 *
 * @param times  Sorted array of keyframe timestamps
 * @param t      Current time to look up
 * @param hint   Last returned index (for temporal coherence)
 */
export function findBracket(
  times: Float32Array,
  t: number,
  hint: number,
): [index: number, alpha: number] {
  const len = times.length;
  if (len === 0) return [0, 0];
  if (len === 1) return [0, 0];

  // Clamp to range
  if (t <= times[0]) return [0, 0];
  if (t >= times[len - 1]) return [len - 2, 1];

  // Fast path: check hint position (O(1) — works during sequential playback)
  if (hint >= 0 && hint < len - 1) {
    if (times[hint] <= t && t <= times[hint + 1]) {
      const dt = times[hint + 1] - times[hint];
      return [hint, dt > 0 ? (t - times[hint]) / dt : 0];
    }
    // Check next position (common during forward playback)
    const next = hint + 1;
    if (next < len - 1 && times[next] <= t && t <= times[next + 1]) {
      const dt = times[next + 1] - times[next];
      return [next, dt > 0 ? (t - times[next]) / dt : 0];
    }
  }

  // Fallback: binary search (O(log n))
  let lo = 0;
  let hi = len - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }

  const dt = times[lo + 1] - times[lo];
  return [lo, dt > 0 ? (t - times[lo]) / dt : 0];
}
