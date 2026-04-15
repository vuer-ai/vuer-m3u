import type {
  ParsedPlaylist,
  PlaylistEngineOptions,
  SegmentData,
  SegmentDecoder,
} from './types';
import { parsePlaylist } from './parser';
import { resolveSegment } from './segment-resolver';
import { SegmentLoader } from './segment-loader';
import { getDecoder } from './decoders';

/**
 * PlaylistEngine orchestrates playlist parsing, segment resolution,
 * data loading/caching, prefetching, and live polling.
 *
 * - Prefetch: automatic in getDataAtTime(). No configuration needed.
 * - Live polling: fixed-interval timer (standard HLS). No clock needed.
 * - Duration: exposed via playlist.totalDuration. The React hook syncs it to the clock.
 */
export class PlaylistEngine extends EventTarget {
  readonly options: PlaylistEngineOptions;
  private playlist: ParsedPlaylist | null = null;
  private loader: SegmentLoader;
  private lastSegmentUri: string | null = null;
  private fetchFn: typeof fetch;
  private destroyed = false;

  // Live polling
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;

  constructor(options: PlaylistEngineOptions) {
    super();
    this.options = options;
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);

    const baseUrl = options.baseUrl ?? this.deriveBaseUrl(options.url);

    this.loader = new SegmentLoader({
      cacheSize: options.cacheSize ?? 20,
      decoder: options.decoder ?? getDecoder(),
      baseUrl,
      fetchFn: this.fetchFn,
    });
  }

  /**
   * Fetch and parse the playlist. Starts live polling if needed.
   */
  async init(): Promise<ParsedPlaylist> {
    const res = await this.fetchFn(this.options.url);
    if (!res.ok) throw new Error(`Playlist fetch failed: ${res.status}`);

    const text = await res.text();
    this.playlist = parsePlaylist(text);

    if (!this.options.decoder) {
      this.loader.setDecoder(getDecoder(this.playlist.chunkFormat));
    }

    if (this.playlist.isLive) {
      this.schedulePoll();
    }

    return this.playlist;
  }

  /**
   * Get decoded data for the segment at the given time.
   * Automatically prefetches the next `prefetchCount` segments.
   */
  async getDataAtTime<T = unknown>(time: number): Promise<SegmentData<T> | null> {
    if (!this.playlist || this.playlist.segments.length === 0) return null;

    const segment = resolveSegment(this.playlist.segments, time);
    if (!segment) return null;

    if (segment.uri === this.lastSegmentUri && this.loader.has(segment.uri)) {
      return await this.loader.load(segment, this.playlist) as SegmentData<T>;
    }

    this.lastSegmentUri = segment.uri;

    const data = await this.loader.load(segment, this.playlist);
    this.prefetchAhead(segment.index);

    this.dispatchEvent(new CustomEvent('segment-loaded', { detail: data }));
    return data as SegmentData<T>;
  }

  getPlaylist(): ParsedPlaylist | null {
    return this.playlist;
  }

  setDecoder(decoder: SegmentDecoder): void {
    this.loader.setDecoder(decoder);
  }

  abort(): void {
    this.loader.abortAll();
  }

  destroy(): void {
    this.destroyed = true;
    this.stopPoll();
    this.loader.clear();
  }

  // ---- Prefetch ----

  private prefetchAhead(currentIndex: number): void {
    if (!this.playlist) return;
    const count = this.options.prefetchCount ?? 2;
    if (count <= 0) return;

    const segments = this.playlist.segments;
    const start = currentIndex + 1;
    const end = Math.min(start + count, segments.length);

    if (start < end) {
      this.loader.prefetch(segments.slice(start, end), this.playlist);
    }
  }

  // ---- Live polling (fixed interval, standard HLS) ----

  private schedulePoll(): void {
    if (this.destroyed || !this.playlist?.isLive) return;

    const interval = this.options.pollInterval
      ?? this.playlist.targetDuration * 1000;

    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      await this.pollNow();
      this.schedulePoll();
    }, interval);
  }

  private async pollNow(): Promise<void> {
    if (this.destroyed || this.polling) return;
    this.polling = true;

    try {
      const res = await this.fetchFn(this.options.url, {
        cache: 'no-cache',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) throw new Error(`Poll failed: ${res.status}`);

      const text = await res.text();
      const updated = parsePlaylist(text);

      if (
        this.playlist &&
        updated.segments.length > this.playlist.segments.length
      ) {
        this.playlist = updated;

        if (!this.options.decoder) {
          this.loader.setDecoder(getDecoder(updated.chunkFormat));
        }

        this.dispatchEvent(
          new CustomEvent('playlist-updated', { detail: updated }),
        );
      }

      if (!updated.isLive) {
        this.playlist = updated;
        this.stopPoll();
      }
    } catch (err) {
      if (!this.destroyed) {
        this.dispatchEvent(
          new CustomEvent('error', {
            detail: err instanceof Error ? err : new Error(String(err)),
          }),
        );
      }
    } finally {
      this.polling = false;
    }
  }

  private stopPoll(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private deriveBaseUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const lastSlash = url.lastIndexOf('/');
      return lastSlash >= 0 ? url.slice(0, lastSlash + 1) : url;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const absolute = new URL(url, origin).href;
    const lastSlash = absolute.lastIndexOf('/');
    return lastSlash >= 0 ? absolute.slice(0, lastSlash + 1) : absolute;
  }
}
