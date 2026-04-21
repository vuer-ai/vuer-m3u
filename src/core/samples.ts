/**
 * Line-level types for JSONL chunks.
 *
 * Each line of a `.jsonl` chunk file is a single JSON object. The library
 * does not impose an outer envelope — chunks are just streams of samples
 * or entries. Chunk time range comes from the m3u8 `#EXTINF` durations,
 * which `parsePlaylist` already parses into `PlaylistSegment.startTime`
 * and `endTime`.
 */

/** One continuous sample — for interpolatable time-series data. */
export interface ContinuousSample {
  /** Absolute timestamp in seconds on the playlist timeline. */
  ts: number;
  /** Sample value — scalar or array. Layout is an app-level convention. */
  data: number | number[];
}

/** One discrete event entry — instantaneous or time-ranged. */
export interface EventEntry {
  /** Event start time (absolute seconds). */
  ts: number;
  /** Event end time (absolute seconds). Omit for instantaneous events. */
  te?: number;
  /** Short identifier (e.g., "grasp", "person"). */
  label?: string;
  /** App-specific fields allowed. */
  [key: string]: unknown;
}
