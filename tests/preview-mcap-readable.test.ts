import { describe, it, expect, vi } from 'vitest';
import { makeMcapReadable } from '../src/preview/mcap-readable';

describe('makeMcapReadable.size()', () => {
  it('returns the supplied totalSize without issuing any fetch', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array(0)));
    const r = makeMcapReadable('http://example.com/x.mcap', fetcher, 1234);
    const size = await r.size();
    expect(size).toBe(1234n);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('issues a HEAD when totalSize is undefined and reads Content-Length', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('HEAD');
      return new Response(null, {
        status: 200,
        headers: { 'Content-Length': '4096' },
      });
    });
    const r = makeMcapReadable('http://example.com/x.mcap', fetcher);
    const size = await r.size();
    expect(size).toBe(4096n);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('caches the resolved size across repeated size() calls', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          status: 200,
          headers: { 'Content-Length': '512' },
        }),
    );
    const r = makeMcapReadable('http://example.com/x.mcap', fetcher);
    const a = await r.size();
    const b = await r.size();
    expect(a).toBe(512n);
    expect(b).toBe(512n);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('makeMcapReadable.read()', () => {
  it('issues a Range request for [offset, offset+length) and returns the bytes', async () => {
    const payload = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]);
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('Range')).toBe('bytes=10-13');
      return new Response(payload, {
        status: 206,
        headers: { 'Content-Range': 'bytes 10-13/100' },
      });
    });
    const r = makeMcapReadable('http://example.com/x.mcap', fetcher, 100);
    const bytes = await r.read(10n, 4n);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([0xaa, 0xbb, 0xcc, 0xdd]);
  });

  it('accepts bigint offset/length and converts correctly', async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('Range')).toBe('bytes=10-13');
      return new Response(payload, {
        status: 206,
        headers: { 'Content-Range': 'bytes 10-13/100' },
      });
    });
    const r = makeMcapReadable('http://example.com/x.mcap', fetcher, 100);
    const bytes = await r.read(10n, 4n);
    expect(bytes.length).toBe(4);
  });
});
