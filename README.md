# @vuer-ai/vuer-m3u

Generalized m3u8 playlist engine for any time-segmented data — not just video.

Standard HLS maps time ranges to video segments. This library extends the m3u8 format to support **JSONL, WebVTT, MessagePack, Parquet, custom binary**, and more. A shared timeline clock synchronizes multiple "view" components, each rendering its own data type.

## Install

```bash
npm install @vuer-ai/vuer-m3u
```

React 18+ is a peer dependency for the hooks and components. The core engine (`Playlist`, `TimelineClock`) works without React.

## Quick Start

```tsx
import {
  useTimeline,
  ClockProvider,
  TimelineController,
  ActionLabelView,
} from '@vuer-ai/vuer-m3u';

function App() {
  const { clock, state, play, pause, seek, setPlaybackRate } = useTimeline();

  return (
    <ClockProvider clock={clock}>
      <ActionLabelView src="/annotations.m3u8" />
      <TimelineController
        state={state}
        onPlay={play}
        onPause={pause}
        onSeek={seek}
        onSpeedChange={setPlaybackRate}
      />
    </ClockProvider>
  );
}
```

`ClockProvider` hands the clock down to every hook and view in its subtree — no more passing `clock` through every component. You can still pass `clock={…}` explicitly to override.

Duration is auto-detected from the playlist. Multiple views on the same clock → `max(allDurations)`.

## Multi-Track Sync

```tsx
<ClockProvider clock={clock}>
  <VideoPlayer src="/video.m3u8" />
  <ActionLabelView src="/annotations.m3u8" />
  <JointAngleView src="/joints.m3u8" />
  <ImuView src="/imu.m3u8" />
  <PoseView src="/pose.m3u8" />
  <SubtitleView src="/subtitles.m3u8" />
  <TimelineController
    state={state}
    onPlay={play}
    onPause={pause}
    onSeek={seek}
    onSpeedChange={setPlaybackRate}
    onLoopChange={setLoop}
  />
</ClockProvider>
```

## Architecture

```
TimelineClock    Pure time source (tick + seek events). No playlist knowledge.
  ↓
Playlist         Parses m3u8, loads segments, LRU cache, auto-prefetch, live poll.
  ↓
useSegment       One segment at a time (JSONL events, VTT — discrete data).
useSegmentTrack  Current segment → columnar tracks (no merge).
useMergedTrack   Current + contiguous neighbors → merged columnar tracks.
useTrackSample   Query a merged track at a precise time with a pluggable interpolator.
  ↓
Pre-built views  VideoPlayer, SubtitleView, ImuView, JointAngleView, PoseView, ActionLabelView.
```

Each layer has one job. No circular dependencies.

## Core Concepts

### TimelineClock

Pure time source with two events: `tick` (~60fps) and `seek` (user actions).

```typescript
const clock = new TimelineClock();
clock.play();
clock.pause();
clock.seek(15.3);
clock.setRate(2);
clock.setLoop(true);
clock.tick(delta);
clock.on('tick', (e) => console.log(e.time));
```

### Playlist

Parses m3u8, loads + decodes segments on demand, prefetches ahead, polls for live updates.

```typescript
const engine = new Playlist({ url: '/data.m3u8', prefetchCount: 4 });
const playlist = await engine.init();
const result = await engine.getDataAtTime(15.3);
```

### M3U8 Format

Standard HLS playlists. Chunk format is auto-detected from segment file extensions (`.jsonl`, `.vtt`, `.parquet`, etc.):

```m3u8
#EXTM3U
#EXT-X-TARGETDURATION:10

#EXTINF:10.000,segments=50
chunk-001.jsonl
#EXTINF:10.000,segments=48
chunk-002.jsonl
#EXT-X-ENDLIST
```

No `#EXT-X-ENDLIST` → live playlist, engine polls for updates.

## React Hooks

| Hook | Purpose |
|------|---------|
| `useTimeline(duration?)` | Clock + discrete state (playing, rate, loop, duration) |
| `useClockValue(fps, clock?)` | Throttled `clock.time` at N fps |
| `usePlaylist(options, clock?)` | Engine lifecycle + auto duration sync |
| `useSegment(engine, clock?)` | One decoded segment at a time (discrete data) |
| `useSegmentTrack(engine, clock?, options?)` | Current segment → `Map<string, TrackSamples>` (no merge) |
| `useMergedTrack(engine, clock?, options?)` | Current + contiguous neighbors → `Map<string, TrackSamples>` |
| `useTrackSample(track, time, interp?)` | Interpolated sample at a precise time |
| `ClockProvider` + `useClockContext` | Hand a clock down the tree via React context |

All consumer hooks and views treat `clock` as optional — they fall back to the nearest `<ClockProvider>`. If neither is available the hook throws a descriptive error.

### Which hook for which data?

| Your data is… | Use | Example |
|---|---|---|
| Discrete events (each segment holds a list) | `useSegment` | Action labels, VTT cues, log lines |
| Continuous time-series, one chunk at a time | `useSegmentTrack` | Inspector view, custom merge logic |
| Continuous time-series, smooth across chunks | `useMergedTrack` | IMU, joints, pose (default) |
| Already have a `TrackSamples`, want the value at one time | `useTrackSample` | Canvas 60fps animations, imperative loops |

## Pre-built View Components

| Component | Data | Source fps (suggested) |
|-----------|------|------------|
| `VideoPlayer` | HLS video (hls.js) | native |
| `SubtitleView` | WebVTT cues | event-driven |
| `ActionLabelView` | `{ts, te, label}` discrete events | event-driven |
| `DetectionBoxView` | bbox overlay `{ts, te, label, bbox:[x,y,w,h]}` | event-driven |
| `BarTrackView` | generic N-channel continuous `{ts, data}` | any |
| `ImuView` | `{ts, data: [ax,ay,az, gx,gy,gz]}` | 50–200 Hz |
| `JointAngleView` | `{ts, data: number[]}` N-DoF angles | 30–250 Hz |
| `PoseView` | `{ts, data: [x,y,z, qx,qy,qz,qw]}` 6DoF | 30–120 Hz |
| `TimelineController` | scrubber + play/pause + rate + loop | — |

Each view's file JSDoc documents its JSONL schema. The full contract (including Python data-generation snippets) lives in the `views/` section of the docs.

## Custom Decoders

```typescript
import { registerDecoder } from '@vuer-ai/vuer-m3u';
registerDecoder('mpk', (raw) => decode(new Uint8Array(raw)));

new Playlist({
  url: '/data.m3u8',
  decoder: (raw, segment, playlist) => myCustomDecode(raw),
});
```

Built-in: `jsonl`, `vtt` (text), `ts` (raw ArrayBuffer).

## Custom Fetch

```typescript
new Playlist({
  url: 'https://api.example.com/data.m3u8',
  fetchFn: (url, init) => fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  }),
});
```

## Live Streaming

Omit `#EXT-X-ENDLIST` in the playlist. The engine polls at `pollInterval` (default: `targetDuration * 1000`ms) and emits `playlist-updated` events. Duration auto-extends on the clock.

```tsx
const { engine, playlist } = usePlaylist(
  { url: '/live/stream.m3u8', pollInterval: 3000 },
  clock,
);
```

## Documentation

Full documentation at [docs.dreamlake.ai/vuer-m3u](https://docs.dreamlake.ai/vuer-m3u).

## Development

```bash
pnpm install
pnpm dev          # demo at http://localhost:5173
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
pnpm build        # library build
```

## License

MIT
