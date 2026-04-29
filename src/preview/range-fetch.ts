import type { Fetcher } from './types';

export interface RangeFetchResult {
  /** Raw bytes returned for this range. */
  bytes: ArrayBuffer;
  /** True if the server's response indicates more data exists past `endExclusive`. */
  truncated: boolean;
  /** Total file size in bytes if the server reported it (Content-Range or Content-Length). */
  totalSize: number | null;
}

/**
 * Fetch `[start, endExclusive)` bytes from `url` using a `Range` header.
 *
 * - If the server responds with `206 Partial Content`, parses Content-Range
 *   to determine truncation.
 * - If the server returns the full body (`200 OK` — common for small files
 *   or servers that ignore Range), uses Content-Length.
 * - On non-OK responses, throws `RangeFetchError` with the response status.
 */
export async function rangeFetch(
  url: string,
  start: number,
  endExclusive: number,
  fetcher: Fetcher = fetch,
  init?: RequestInit,
): Promise<RangeFetchResult> {
  if (start < 0 || endExclusive <= start) {
    throw new RangeFetchError(
      `Invalid range: ${start}-${endExclusive}`,
      0,
    );
  }
  const headers = new Headers(init?.headers);
  headers.set('Range', `bytes=${start}-${endExclusive - 1}`);
  const res = await fetcher(url, { ...init, headers });
  if (!res.ok && res.status !== 206) {
    throw new RangeFetchError(
      `Range fetch failed: ${res.status} ${res.statusText}`,
      res.status,
    );
  }

  const bytes = await res.arrayBuffer();
  const totalSize = parseTotalSize(res.headers);

  if (res.status === 206) {
    // Trust Content-Range over Content-Length for partial responses.
    const range = res.headers.get('Content-Range');
    if (range) {
      const m = range.match(/bytes\s+(\d+)-(\d+)\/(\d+|\*)/i);
      if (m) {
        const total = m[3] === '*' ? null : Number(m[3]);
        const last = Number(m[2]);
        const truncated = total != null && last + 1 < total;
        return { bytes, truncated, totalSize: total };
      }
    }
    // 206 without parseable Content-Range — assume not truncated.
    return { bytes, truncated: false, totalSize };
  }

  // 200 OK — server ignored the Range header and returned the full body.
  // Truncate locally to the requested window.
  const requestedLength = endExclusive - start;
  if (bytes.byteLength > requestedLength) {
    const sliced = bytes.slice(start, start + requestedLength);
    const truncated = totalSize != null && totalSize > endExclusive;
    return { bytes: sliced, truncated, totalSize };
  }
  // Server returned the whole file (smaller than the window). Not truncated.
  return { bytes, truncated: false, totalSize: totalSize ?? bytes.byteLength };
}

/**
 * Fetch the LAST `n` bytes of a resource. Mirrors HTTP's negative-offset
 * Range syntax (`Range: bytes=-N`). Used by the mcap previewer to read the
 * footer without first knowing the file size.
 */
export async function rangeFetchTail(
  url: string,
  n: number,
  fetcher: Fetcher = fetch,
  init?: RequestInit,
): Promise<RangeFetchResult> {
  const headers = new Headers(init?.headers);
  headers.set('Range', `bytes=-${n}`);
  const res = await fetcher(url, { ...init, headers });
  if (!res.ok && res.status !== 206) {
    throw new RangeFetchError(
      `Tail fetch failed: ${res.status} ${res.statusText}`,
      res.status,
    );
  }
  const bytes = await res.arrayBuffer();
  const totalSize = parseTotalSize(res.headers);
  return { bytes, truncated: false, totalSize };
}

function parseTotalSize(headers: Headers): number | null {
  const range = headers.get('Content-Range');
  if (range) {
    const m = range.match(/\/(\d+)$/);
    if (m) return Number(m[1]);
  }
  const len = headers.get('Content-Length');
  if (len) {
    const n = Number(len);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

export class RangeFetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'RangeFetchError';
    this.status = status;
  }
}
