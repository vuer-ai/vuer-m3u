import { describe, it, expect } from 'vitest';
import { resolveClock } from '../src/react/clock-context';
import { TimelineClock } from '../src/core/timeline';

describe('resolveClock', () => {
  it('returns the explicit argument when provided, ignoring context', () => {
    const explicit = new TimelineClock(10);
    const ctx = new TimelineClock(20);
    expect(resolveClock(explicit, ctx)).toBe(explicit);
  });

  it('falls back to the context value when explicit is undefined', () => {
    const ctx = new TimelineClock(5);
    expect(resolveClock(undefined, ctx)).toBe(ctx);
  });

  it('falls back to the context value when explicit is null', () => {
    const ctx = new TimelineClock(5);
    expect(resolveClock(null, ctx)).toBe(ctx);
  });

  it('throws a descriptive error when neither is available', () => {
    expect(() => resolveClock(undefined, null)).toThrow(/No TimelineClock/);
    expect(() => resolveClock(null, null)).toThrow(/ClockProvider/);
  });
});
