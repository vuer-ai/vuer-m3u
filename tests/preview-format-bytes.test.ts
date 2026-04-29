import { describe, it, expect } from 'vitest';
import { formatBytes } from '../src/preview/format-bytes';

describe('formatBytes', () => {
  it('formats zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('returns em dash for null', () => {
    expect(formatBytes(null)).toBe('—');
  });

  it('returns em dash for undefined', () => {
    expect(formatBytes(undefined)).toBe('—');
  });

  it('returns em dash for NaN', () => {
    expect(formatBytes(NaN)).toBe('—');
  });

  it('returns em dash for negative numbers', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(-1024)).toBe('—');
  });

  it('formats bytes under 1 KB without decimals', () => {
    expect(formatBytes(100)).toBe('100 B');
  });

  it('formats exactly 1 KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  it('formats 1.5 KB', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats 1 MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats 1 TB', () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.0 TB');
  });

  it('honors fractionDigits=0', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB');
  });
});
