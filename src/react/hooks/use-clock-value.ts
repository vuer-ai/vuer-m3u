import { useCallback, useSyncExternalStore } from 'react';
import type { TimelineClock } from '../../core/timeline';

/**
 * Subscribe to clock.time at a throttled frame rate.
 *
 * Returns a stable number that updates at most `fps` times per second
 * during playback (tick events), and immediately on seek events.
 *
 * @example
 * const time = useClockValue(clock, 4);   // 4fps — JSONL entry highlight
 * const time = useClockValue(clock, 10);  // 10fps — subtitle cue check
 * const time = useClockValue(clock, 30);  // 30fps — scrubber UI
 */
export function useClockValue(clock: TimelineClock, fps: number): number {
  const interval = 1000 / fps;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let lastNotify = 0;

      const unsubTick = clock.on('tick', () => {
        const now = performance.now();
        if (now - lastNotify >= interval) {
          lastNotify = now;
          onStoreChange();
        }
      });

      // Seek always triggers immediate update
      const unsubSeek = clock.on('seek', () => {
        lastNotify = performance.now();
        onStoreChange();
      });

      return () => {
        unsubTick();
        unsubSeek();
      };
    },
    [clock, interval],
  );

  return useSyncExternalStore(subscribe, () => clock.time);
}
