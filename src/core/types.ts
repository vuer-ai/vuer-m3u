// ---- Playlist types ----

export type ChunkFormat = 'jsonl' | 'mpk' | 'parquet' | 'vtt' | 'ts' | (string & {});
export type TrackType = 'track' | 'metrics' | (string & {});

export interface PlaylistSegment {
  /** 0-based position in playlist */
  index: number;
  /** Duration in seconds */
  duration: number;
  /** Segment URI (hash or relative path) */
  uri: string;
  /** #EXTINF title field (e.g. "segments=46") */
  title: string;
  /** Computed: cumulative start time in seconds */
  startTime: number;
  /** Computed: startTime + duration */
  endTime: number;
}

export interface ParsedPlaylist {
  trackType?: TrackType;
  chunkFormat?: ChunkFormat;
  targetDuration: number;
  programDateTime?: string;
  mediaSequence: number;
  segments: PlaylistSegment[];
  /** true when #EXT-X-ENDLIST is absent (live/still-appending) */
  isLive: boolean;
  /** Sum of all segment durations */
  totalDuration: number;
  /** Any unrecognized custom tags preserved as key-value pairs */
  customTags: Record<string, string>;
}

// ---- Loader types ----

export interface SegmentData<T = unknown> {
  segment: PlaylistSegment;
  raw: ArrayBuffer;
  decoded: T;
  fetchedAt: number;
}

export type SegmentDecoder<T = unknown> = (
  raw: ArrayBuffer,
  segment: PlaylistSegment,
  playlist: ParsedPlaylist,
) => T | Promise<T>;

// ---- Engine options ----

export interface PlaylistEngineOptions {
  /** Playlist URL */
  url: string;
  /** Base URL for resolving relative segment URIs. Defaults to playlist URL's directory. */
  baseUrl?: string;
  /** Custom decoder. If not provided, auto-detected from chunkFormat. */
  decoder?: SegmentDecoder;
  /** Max cached segments. Default: 20 */
  cacheSize?: number;
  /**
   * Number of segments to prefetch ahead when a new segment is loaded.
   * Default: 2. Set to 0 to disable prefetch.
   * Prefetch happens automatically in getDataAtTime() — no clock needed.
   */
  prefetchCount?: number;
  /**
   * Live playlist poll interval in ms.
   * Default: targetDuration * 1000 (one segment duration).
   */
  pollInterval?: number;
  /** Custom fetch function (for auth headers, etc.) */
  fetchFn?: typeof fetch;
}

// ---- React state types ----

export interface SegmentState<T = unknown> {
  data: T | null;
  segment: PlaylistSegment | null;
  loading: boolean;
  error: Error | null;
}

export interface TimelineState {
  duration: number;
  playing: boolean;
  playbackRate: number;
  loop: boolean;
}
