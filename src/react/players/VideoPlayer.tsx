import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import type { TimelineClock } from '../../core/timeline';
import { useClockContext } from '../clock-context';

interface VideoPlayerProps {
  src: string;
  clock?: TimelineClock | null;
  className?: string;
}

/**
 * VideoPlayer
 *
 * ## Data format contract
 *
 * Chunks: MPEG-TS (`.ts`) HLS video segments — not JSONL.
 *
 * The playlist must conform to standard HLS (`#EXTM3U`, `#EXT-X-VERSION`,
 * `#EXTINF`, optional `#EXT-X-ENDLIST` for VOD).
 *
 * Constraints:
 *   - Segment codecs must be supported by the browser's MediaSource Extensions
 *     (H.264 + AAC is the safest baseline)
 *   - Playlist URL is fetched by hls.js, not by the library's Playlist engine
 *
 * How the view renders:
 *   Uses hls.js for demux / remux / ABR / MSE buffering — a complete HLS
 *   implementation. The library's own playlist/decoder machinery is bypassed
 *   for video because our decoders cannot handle video media.
 *
 * Clock sync:
 *   - Duration: `<video>.durationchange` → `clock.extendDuration()`
 *   - Playback: `clock.on('seek')` → `video.play/pause/seek/playbackRate`
 */
export function VideoPlayer({ src, clock, className }: VideoPlayerProps) {
  const resolvedClock = useClockContext(clock);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Initialize HLS + sync duration to clock
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncDuration = () => {
      if (video.duration && isFinite(video.duration)) {
        resolvedClock.extendDuration(video.duration);
      }
    };

    video.addEventListener('durationchange', syncDuration);
    video.addEventListener('loadedmetadata', syncDuration);

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    }

    return () => {
      video.removeEventListener('durationchange', syncDuration);
      video.removeEventListener('loadedmetadata', syncDuration);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src, resolvedClock]);

  // Subscribe to clock seek events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const unsubSeek = resolvedClock.on('seek', (e) => {
      switch (e.source) {
        case 'play':
          video.currentTime = e.time;
          video.playbackRate = resolvedClock.rate;
          video.play().catch(() => {});
          break;
        case 'pause':
          video.pause();
          break;
        case 'seek':
          video.currentTime = e.time;
          break;
        case 'rate':
          video.playbackRate = resolvedClock.rate;
          break;
      }
    });

    if (resolvedClock.playing) {
      video.currentTime = resolvedClock.time;
      video.playbackRate = resolvedClock.rate;
      video.play().catch(() => {});
    }

    return unsubSeek;
  }, [resolvedClock]);

  return (
    <video
      ref={videoRef}
      className={className}
      controls={false}
      muted
    />
  );
}
