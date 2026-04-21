import { useCallback, useSyncExternalStore } from 'react';
import type { TimelineClock } from '../../core/timeline';
import { useClockContext } from '../clock-context';

/**
 * Subscribe to clock.time at a throttled frame rate.
 *
 * Pass `clock` explicitly, or omit it and provide one via `<ClockProvider>`.
 *
 * @example
 * const time = useClockValue(4);   // 4fps — JSONL entry highlight (from context)
 * const time = useClockValue(10, clock);  // 10fps — explicit clock override
 */
export function useClockValue(fps: number, clock?: TimelineClock | null): number {
  const resolved = useClockContext(clock);
  const interval = 1000 / fps;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let lastNotify = 0;

      const unsubTick = resolved.on('tick', () => {
        const now = performance.now();
        if (now - lastNotify >= interval) {
          lastNotify = now;
          onStoreChange();
        }
      });

      const unsubSeek = resolved.on('seek', () => {
        lastNotify = performance.now();
        onStoreChange();
      });

      return () => {
        unsubTick();
        unsubSeek();
      };
    },
    [resolved, interval],
  );

  return useSyncExternalStore(subscribe, () => resolved.time);
}
