import type { Fetcher } from './types';
import { rangeFetch, rangeFetchTail } from './range-fetch';

// Duck-typed structural type — avoids cross-package import friction since
// @mcap/core only exposes IReadable through a deep internal path.
export interface IReadable {
  size(): Promise<bigint>;
  read(offset: bigint, length: bigint): Promise<Uint8Array>;
}

/**
 * Adapter that lets `@mcap/core`'s `McapIndexedReader` read an MCAP file
 * over HTTP using Range requests. Only the bytes requested by the reader
 * are fetched — typically just the footer + summary section.
 */
export function makeMcapReadable(
  url: string,
  fetcher: Fetcher,
  totalSize?: number | null,
): IReadable {
  // Cache the resolved size in a closure so repeat `size()` calls don't
  // re-issue HEAD requests. The promise itself is cached so concurrent
  // callers share one in-flight resolution.
  let sizePromise: Promise<bigint> | null = null;

  const resolveSize = async (): Promise<bigint> => {
    if (totalSize != null) return BigInt(totalSize);

    // Try HEAD first — cheapest path when the server supports it.
    try {
      const res = await fetcher(url, { method: 'HEAD' });
      if (res.ok) {
        const len = res.headers.get('Content-Length');
        if (len) {
          const n = Number(len);
          if (Number.isFinite(n) && n >= 0) return BigInt(n);
        }
      }
    } catch {
      // fall through to range probe
    }

    // Fallback: a tiny ranged GET. Servers that don't expose Content-Length
    // on HEAD often still return Content-Range on a 206.
    try {
      const probe = await rangeFetchTail(url, 1, fetcher);
      if (probe.totalSize != null) return BigInt(probe.totalSize);
    } catch {
      // fall through
    }

    throw new Error(
      'Could not determine MCAP file size: HEAD and Range probe both failed.',
    );
  };

  return {
    size(): Promise<bigint> {
      if (!sizePromise) sizePromise = resolveSize();
      return sizePromise;
    },
    async read(offset: bigint, length: bigint): Promise<Uint8Array> {
      // MCAP files preview-able in a browser fit comfortably under 2^53,
      // so the bigint→number conversion is safe here.
      const start = Number(offset);
      const len = Number(length);
      const result = await rangeFetch(url, start, start + len, fetcher);
      return new Uint8Array(result.bytes);
    },
  };
}
