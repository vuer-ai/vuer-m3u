import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import type { TimelineClock } from '../../core/timeline';

interface VideoPlayerProps {
  playlistUrl: string;
  clock: TimelineClock;
  className?: string;
}

/**
 * HLS video player synced with a TimelineClock.
 *
 * Does NOT use usePlaylistEngine — hls.js is a complete HLS implementation
 * that handles m3u8 parsing, segment loading, ABR, and video buffering
 * internally via MediaSource Extensions. Using PlaylistEngine alongside it
 * would duplicate the m3u8 fetch, double-load .ts segments as unusable
 * ArrayBuffers, and our decoders cannot decode video media anyway.
 *
 * Duration sync: obtained from <video>.durationchange → clock.extendDuration().
 * Playback sync: clock seek events → video.play/pause/seek/playbackRate.
 */
export function VideoPlayer({ playlistUrl, clock, className }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Initialize HLS + sync duration to clock
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncDuration = () => {
      if (video.duration && isFinite(video.duration)) {
        clock.extendDuration(video.duration);
      }
    };

    video.addEventListener('durationchange', syncDuration);
    video.addEventListener('loadedmetadata', syncDuration);

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(playlistUrl);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playlistUrl;
    }

    return () => {
      video.removeEventListener('durationchange', syncDuration);
      video.removeEventListener('loadedmetadata', syncDuration);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [playlistUrl, clock]);

  // Subscribe to clock seek events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const unsubSeek = clock.on('seek', (e) => {
      switch (e.source) {
        case 'play':
          video.currentTime = e.time;
          video.playbackRate = clock.rate;
          video.play().catch(() => {});
          break;
        case 'pause':
          video.pause();
          break;
        case 'seek':
          video.currentTime = e.time;
          break;
        case 'rate':
          video.playbackRate = clock.rate;
          break;
      }
    });

    if (clock.playing) {
      video.currentTime = clock.time;
      video.playbackRate = clock.rate;
      video.play().catch(() => {});
    }

    return unsubSeek;
  }, [clock]);

  return (
    <video
      ref={videoRef}
      className={className}
      controls={false}
      muted
    />
  );
}
