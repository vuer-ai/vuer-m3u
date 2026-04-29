import { describe, it, expect, vi } from 'vitest';
import {
  rangeFetch,
  rangeFetchTail,
  RangeFetchError,
} from '../src/preview/range-fetch';

function makeFetcher(responses: Response | Response[]) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const r = queue.length > 1 ? queue.shift()! : queue[0];
    return r;
  });
}

describe('rangeFetch', () => {
  it('handles 206 with parseable Content-Range and reports truncation', async () => {
    const body = new Uint8Array(100);
    const fetcher = makeFetcher(
      new Response(body, {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-99/500' },
      }),
    );
    const result = await rangeFetch('http://example.com/x', 0, 100, fetcher);
    expect(result.bytes.byteLength).toBe(100);
    expect(result.truncated).toBe(true);
    expect(result.totalSize).toBe(500);
  });

  it('reports truncated=false when 206 covers the whole resource', async () => {
    const body = new Uint8Array(100);
    const fetcher = makeFetcher(
      new Response(body, {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-99/100' },
      }),
    );
    const result = await rangeFetch('http://example.com/x', 0, 100, fetcher);
    expect(result.truncated).toBe(false);
  });

  it('returns null totalSize when Content-Range total is *', async () => {
    const body = new Uint8Array(10);
    const fetcher = makeFetcher(
      new Response(body, {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-9/*' },
      }),
    );
    const result = await rangeFetch('http://example.com/x', 0, 10, fetcher);
    expect(result.totalSize).toBeNull();
  });

  it('handles 200 OK with body smaller than the requested window', async () => {
    const body = new Uint8Array(50);
    const fetcher = makeFetcher(
      new Response(body, {
        status: 200,
        headers: { 'Content-Length': '50' },
      }),
    );
    const result = await rangeFetch('http://example.com/x', 0, 100, fetcher);
    expect(result.totalSize).toBe(50);
    expect(result.truncated).toBe(false);
  });

  it('slices locally when 200 OK returns more than the window and reports truncation', async () => {
    const body = new Uint8Array(1000);
    const fetcher = makeFetcher(
      new Response(body, {
        status: 200,
        headers: { 'Content-Length': '1000' },
      }),
    );
    const result = await rangeFetch('http://example.com/x', 0, 100, fetcher);
    expect(result.bytes.byteLength).toBe(100);
    expect(result.truncated).toBe(true);
    expect(result.totalSize).toBe(1000);
  });

  it('sets the Range header on the request', async () => {
    const body = new Uint8Array(100);
    const fetcher = makeFetcher(
      new Response(body, {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-99/100' },
      }),
    );
    await rangeFetch('http://example.com/x', 0, 100, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = fetcher.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Range')).toBe('bytes=0-99');
  });

  it('throws RangeFetchError when start < 0', async () => {
    const fetcher = makeFetcher(new Response(new Uint8Array(0)));
    await expect(
      rangeFetch('http://example.com/x', -1, 10, fetcher),
    ).rejects.toBeInstanceOf(RangeFetchError);
  });

  it('throws RangeFetchError when endExclusive <= start', async () => {
    const fetcher = makeFetcher(new Response(new Uint8Array(0)));
    await expect(
      rangeFetch('http://example.com/x', 10, 10, fetcher),
    ).rejects.toBeInstanceOf(RangeFetchError);
  });

  it('throws RangeFetchError on 404, exposing status', async () => {
    const fetcher = makeFetcher(
      new Response('not found', { status: 404, statusText: 'Not Found' }),
    );
    let err: unknown;
    try {
      await rangeFetch('http://example.com/x', 0, 100, fetcher);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RangeFetchError);
    expect((err as RangeFetchError).status).toBe(404);
  });
});

describe('rangeFetchTail', () => {
  it('sets a negative-offset Range header (bytes=-N)', async () => {
    const body = new Uint8Array(64);
    const fetcher = makeFetcher(
      new Response(body, {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-63/64' },
      }),
    );
    await rangeFetchTail('http://example.com/x', 64, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = fetcher.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Range')).toBe('bytes=-64');
  });
});
