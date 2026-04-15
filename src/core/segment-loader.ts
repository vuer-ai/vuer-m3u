import { LRUCache } from 'lru-cache';
import type { ParsedPlaylist, PlaylistSegment, SegmentData, SegmentDecoder } from './types';

export interface SegmentLoaderOptions {
  cacheSize?: number;
  decoder: SegmentDecoder;
  baseUrl: string;
  fetchFn?: typeof fetch;
}

export class SegmentLoader {
  private cache: LRUCache<string, SegmentData>;
  private inflight = new Map<string, Promise<ArrayBuffer>>();
  private abortControllers = new Map<string, AbortController>();
  private decoder: SegmentDecoder;
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(options: SegmentLoaderOptions) {
    this.cache = new LRUCache<string, SegmentData>({ max: options.cacheSize ?? 20 });
    this.decoder = options.decoder;
    this.baseUrl = options.baseUrl;
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);
  }

  setDecoder(decoder: SegmentDecoder): void {
    this.decoder = decoder;
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  /**
   * Load a segment: returns cached data if available, otherwise fetches + decodes.
   */
  async load(segment: PlaylistSegment, playlist: ParsedPlaylist): Promise<SegmentData> {
    const cached = this.cache.get(segment.uri);
    if (cached) return cached;

    const raw = await this.fetchRaw(segment.uri);
    const decoded = await this.decoder(raw, segment, playlist);

    const data: SegmentData = {
      segment,
      raw,
      decoded,
      fetchedAt: Date.now(),
    };

    this.cache.set(segment.uri, data);
    return data;
  }

  /**
   * Prefetch segments in the background. Errors are silently ignored.
   */
  prefetch(segments: PlaylistSegment[], playlist: ParsedPlaylist): void {
    for (const seg of segments) {
      if (this.cache.has(seg.uri) || this.inflight.has(seg.uri)) continue;
      // Fire-and-forget
      this.load(seg, playlist).catch(() => {});
    }
  }

  /**
   * Abort all inflight fetch requests.
   */
  abortAll(): void {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.inflight.clear();
  }

  has(uri: string): boolean {
    return this.cache.has(uri);
  }

  clear(): void {
    this.abortAll();
    this.cache.clear();
  }

  private resolveUrl(uri: string): string {
    // If URI is already absolute, use it directly
    if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
    // Resolve relative to baseUrl
    return new URL(uri, this.baseUrl).href;
  }

  private fetchRaw(uri: string): Promise<ArrayBuffer> {
    // Deduplicate concurrent requests for the same URI
    const existing = this.inflight.get(uri);
    if (existing) return existing;

    const controller = new AbortController();
    this.abortControllers.set(uri, controller);

    const promise = this.fetchFn(this.resolveUrl(uri), {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
        return res.arrayBuffer();
      })
      .finally(() => {
        this.inflight.delete(uri);
        this.abortControllers.delete(uri);
      });

    this.inflight.set(uri, promise);
    return promise;
  }
}
