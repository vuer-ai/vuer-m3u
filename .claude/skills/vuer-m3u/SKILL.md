---
name: vuer-m3u
description: "Use @vuer-ai/vuer-m3u to build time-synchronized views for any data format. Covers TimelineClock, Playlist, ClockProvider, React hooks (useTimeline, useSegment, useSegmentTrack, useMergedTrack, useTrackSample, useClockValue), pre-built robot-data views, custom decoders, and m3u8 playlist authoring."
paths: "**/*.ts,**/*.tsx,**/*.m3u8"
---

# @vuer-ai/vuer-m3u — Usage Guide

You are helping a developer use the `@vuer-ai/vuer-m3u` library. This library generalizes HLS m3u8 playlists beyond video — any time-segmented data (JSONL, VTT, binary, sensor data) can be loaded, cached, prefetched, and played back through a shared timeline.

## Install

```bash
pnpm add @vuer-ai/vuer-m3u
```

Peer dependency: React 18+. Core engine works without React.

## Quick Start — React

```tsx
import {
  useTimeline,
  ClockProvider,
  TimelineController,
  ActionLabelView,
  JointAngleView,
} from '@vuer-ai/vuer-m3u';

function App() {
  const { clock, state, play, pause, seek, setPlaybackRate, setLoop } = useTimeline();
  return (
    <ClockProvider clock={clock}>
      <ActionLabelView src="/annotations.m3u8" />
      <JointAngleView src="/joints.m3u8" />
      <TimelineController
        state={state}
        onPlay={play}
        onPause={pause}
        onSeek={seek}
        onSpeedChange={setPlaybackRate}
        onLoopChange={setLoop}
      />
    </ClockProvider>
  );
}
```

- Duration is auto-detected from playlist.
- Multiple views on the same clock → `max(allDurations)`.
- `ClockProvider` injects the clock via React context. Every hook and view treats `clock` as optional and falls back to the provider. Pass `clock={…}` explicitly when you need to override (for example, a preview timeline alongside the main one).

## Core API (no React)

```typescript
import { Playlist, TimelineClock } from '@vuer-ai/vuer-m3u';

const engine = new Playlist({ url: '/data.m3u8' });
const playlist = await engine.init();

const result = await engine.getDataAtTime(15.3);
console.log(result?.decoded);
console.log(result?.segment);

const clock = new TimelineClock();
clock.extendDuration(playlist.totalDuration);
clock.play();
```

## Hooks Reference

### useTimeline(duration?)
Creates a TimelineClock. Returns discrete state that only re-renders on seek events.
- `clock` — wrap the subtree in `<ClockProvider clock={clock}>`
- `state` — `{ duration, playing, playbackRate, loop }` (NO currentTime)
- Control: `play`, `pause`, `seek`, `setPlaybackRate`, `setLoop`

### useClockValue(fps, clock?)
Returns `clock.time` throttled to N fps. This is how you get currentTime.
```tsx
const time = useClockValue(30);  // scrubber UI (clock from context)
const time = useClockValue(10);  // segment boundary check
const time = useClockValue(4);   // highlight update
```

### usePlaylist(options, clock?)
Creates a Playlist. Auto-extends `clock.duration` from playlist.
```tsx
const { engine, playlist, loading, error } = usePlaylist({ url });
```

### useSegment(engine, clock?) — discrete data
One decoded segment at a time. For JSONL events, VTT cues.
```tsx
const { data, segment, loading, error } = useSegment<MyType[]>(engine);
```

### useSegmentTrack(engine, clock?, options?) — current segment, columnar
Normalizes the current segment into `Map<string, TrackSamples>`. No merging — use when you want binary-search lookup inside one chunk without the prefetch+merge window.
```tsx
const { tracks, segment, loading } = useSegmentTrack(engine);
```

### useMergedTrack(engine, clock?, options?) — current + neighbors, columnar
Fetches a window of segments around the current position, normalizes each, and merges contiguous ones into single Float32Arrays. This is the workhorse for smooth interpolation across chunk boundaries.
```tsx
const { tracks, mergedRange, loading } = useMergedTrack(engine);            // default = one track named 'data'
const { tracks } = useMergedTrack(engine, null, { normalize: poseNormalizer }); // multi-track via custom normalizer
```

### useTrackSample(track, time, interp?) — query at a time
```tsx
const sample = useTrackSample(tracks.get('data'), time);          // lerp
const rot = useTrackSample(tracks.get('orientation'), time, slerpQuat);
```

Output is a reused `Float32Array` sized `track.stride` — don't retain across renders.

### ClockProvider + useClockContext
```tsx
<ClockProvider clock={clock}>  ...  </ClockProvider>
```
Resolves the clock for hooks and views in the subtree. Priority: explicit arg → context → throw.

## Which hook for which data?

| Your data is… | Use | Example |
|---|---|---|
| Discrete events per segment | `useSegment` | Action labels, VTT cues, log lines |
| One chunk, columnar | `useSegmentTrack` | Inspector view, custom merge logic |
| Cross-chunk merged, columnar | `useMergedTrack` | IMU, joints, pose (default use) |
| Have a merged track, want a precise value | `useTrackSample` | Canvas 60fps, imperative loops |

## Pre-built View Components

All accept `{ src: string; clock?: TimelineClock }` — omit `clock` when inside `<ClockProvider>`.

| Component | JSONL shape | Interpolator |
|-----------|-------------|--------------|
| `VideoPlayer` | HLS video (hls.js) | — |
| `SubtitleView` | WebVTT cues | — |
| `ActionLabelView` | `{ts, te, label, ...}` | — (discrete) |
| `DetectionBoxView` | `{ts, te, label, bbox:[x,y,w,h]}` overlay | — (discrete) |
| `BarTrackView` | generic `{ts, data: number[] \| number}` | lerp |
| `ImuView` | `{ts, data: [ax,ay,az, gx,gy,gz]}` stride=6 | lerp |
| `JointAngleView` | `{ts, data: number[]}` stride=N | lerp |
| `PoseView` | `{ts, data: [x,y,z, qx,qy,qz,qw]}` stride=7 | lerp + slerpQuat |
| `TimelineController` | scrubber + play/pause + rate + loop | — |

## Custom Decoder

```typescript
import { registerDecoder } from '@vuer-ai/vuer-m3u';
registerDecoder('mpk', (raw) => decode(new Uint8Array(raw)));

new Playlist({
  url: '/data.m3u8',
  decoder: (raw, segment, playlist) => myCustomDecode(raw),
});
```

## Custom View Component

Pattern: accept optional clock → `useClockContext` → `usePlaylist` → `useSegment` / `useSegmentTrack` / `useMergedTrack` → render with `useClockValue` or `useTrackSample`.

```tsx
import {
  type TimelineClock,
  useClockContext,
  usePlaylist,
  useSegment,
  useClockValue,
} from '@vuer-ai/vuer-m3u';

function SensorView({ src, clock }: { src: string; clock?: TimelineClock | null }) {
  const resolvedClock = useClockContext(clock);
  const { engine } = usePlaylist({ url: src }, resolvedClock);
  const { data } = useSegment<{ ts: number; value: number }[]>(engine, resolvedClock);
  const time = useClockValue(4, resolvedClock);

  if (!data) return <div>Loading...</div>;
  const current = data.reduce((a, b) =>
    Math.abs(b.ts - time) < Math.abs(a.ts - time) ? b : a,
  );
  return <div>{current.value}</div>;
}
```

## M3U8 Playlist Format

Standard HLS playlists. Chunk format is auto-detected from segment file extensions:

```m3u8
#EXTM3U
#EXT-X-TARGETDURATION:10

#EXTINF:10.000,segments=50
chunk-001.jsonl
#EXTINF:10.000,segments=48
chunk-002.jsonl
#EXT-X-ENDLIST
```

No `#EXT-X-ENDLIST` → live playlist, engine polls automatically.

## Live Streaming

```tsx
const { engine, playlist } = usePlaylist(
  { url: '/live/stream.m3u8', pollInterval: 3000 },
);
// Duration auto-extends as new segments arrive.
// Polling stops when #EXT-X-ENDLIST appears.
```

## Key Architecture Rules

1. **TimelineClock** is pure time. No playlist/segment knowledge.
2. **Segment boundaries** tracked per-hook, not on clock. Multiple playlists work correctly.
3. **Prefetch** automatic in `getDataAtTime()`.
4. **VideoPlayer** uses hls.js directly (not Playlist) — different decode pipeline.
5. **useTimeline state** has no currentTime. Use `useClockValue(fps)`.
6. **Clock resolution** is uniform — every consumer accepts optional clock, resolves via `useClockContext`. Errors thrown at render when neither explicit nor context is present.
7. **useSegment** = raw discrete payload (events, cues). **useSegmentTrack** = one segment → columnar. **useMergedTrack** = current + neighbors merged (IMU, joints, pose). **useTrackSample** = query a track at a time.

## Documentation

Full docs at [docs.dreamlake.ai/vuer-m3u](https://docs.dreamlake.ai/vuer-m3u).
