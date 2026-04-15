# M3U8 Extended Player — Design Document

## Overview

A pure client-side TypeScript library that generalizes the HLS m3u8 playlist format beyond video. Standard HLS maps time ranges to `.ts` video segments; this library extends that to support **any time-segmented data**: JSONL, WebVTT, MessagePack, Parquet, custom binary, and more.

Each data format gets its own "player" component. All players share a single `TimelineClock` for synchronization.

---

## Architecture

```
src/
├── core/                           # Framework-agnostic
│   ├── types.ts                    # Shared interfaces
│   ├── timeline.ts                 # TimelineClock — pure time source
│   ├── find-bracket.ts             # O(1) keyframe lookup for interpolation
│   ├── parser.ts                   # m3u8 text → ParsedPlaylist
│   ├── segment-resolver.ts         # time → segment (binary search)
│   ├── segment-loader.ts           # fetch + LRU cache + dedup
│   ├── playlist-engine.ts          # orchestrator: parse + load + prefetch + live poll
│   └── decoders/                   # pluggable: jsonl, text, raw (+ registerDecoder)
├── react/
│   ├── hooks/
│   │   ├── use-timeline.ts         # clock lifecycle + discrete state (playing/rate/loop/duration)
│   │   ├── use-clock-value.ts      # throttled clock.time at N fps
│   │   ├── use-playlist-engine.ts  # engine lifecycle + duration sync
│   │   ├── use-segment.ts          # discrete data (one segment at a time)
│   │   └── use-track-data.ts       # continuous data (merged segments for interpolation)
│   ├── players/
│   │   ├── VideoPlayer.tsx
│   │   ├── JsonlPlayer.tsx
│   │   ├── SubtitlePlayer.tsx
│   │   └── CanvasTrackPlayer.tsx
│   └── TimelineController.tsx       # scrubber + play/pause + rate + loop
└── index.ts
```

---

## TimelineClock

Pure time source. Two events: `tick` (every frame) and `seek` (user actions). Knows nothing about playlists or segments.

```typescript
clock.time / clock.playing / clock.rate / clock.duration / clock.loop

clock.play() / clock.pause() / clock.seek(t) / clock.setRate(r) / clock.setLoop(v)
clock.setDuration(d)       // set to exactly d
clock.extendDuration(d)    // extend to d if d > current (safe for multiple engines)
clock.tick(delta)           // external driving (e.g. R3F useFrame)

clock.on('tick', ({ time, playing, rate }) => {})   // ~60fps
clock.on('seek', ({ time, source }) => {})           // play/pause/seek/rate/loop
```

---

## PlaylistEngine

Passive service. Parses m3u8, loads segments on demand, caches in LRU, prefetches ahead, polls for live updates.

```
engine.getDataAtTime(15.3)
  → resolveSegment(segments, 15.3)     → segment 1
  → loader.load(segment1)              → fetch + decode + cache
  → prefetchAhead(1)                   → background: fetch segment 2, 3
  → return { decoded, segment, raw }
```

**Prefetch**: automatic in `getDataAtTime()`. When segment N loads, N+1..N+prefetchCount are fetched in background.

**Live polling**: fixed interval (`pollInterval`, default `targetDuration * 1000`ms). Stops on `#EXT-X-ENDLIST`.

**Decoders**: global (`registerDecoder('mpk', fn)`) or per-engine (`{ decoder: fn }`). Built-in: `jsonl`, `vtt` (text), `ts` (raw).

| Option | Default | Description |
|--------|---------|-------------|
| `url` | required | Playlist URL |
| `decoder` | auto | Per-engine decoder |
| `cacheSize` | 20 | LRU max segments |
| `prefetchCount` | 2 | Segments to prefetch ahead |
| `pollInterval` | `targetDuration * 1000` | Live poll interval (ms) |
| `fetchFn` | `fetch` | Custom fetch function |

---

## React Hooks

### useTimeline(duration?)

Creates a `TimelineClock`. Returns discrete state (playing, rate, loop, duration) that only re-renders on `seek` events — NOT on every frame.

```tsx
const { clock, state, play, pause, seek, setPlaybackRate, setLoop } = useTimeline();
```

`state` does NOT contain `currentTime`. For time, consumers use `useClockValue(clock, fps)` at the frequency they need.

### useClockValue(clock, fps)

The foundational time hook. Returns `clock.time` throttled to N fps.

```tsx
const time = useClockValue(clock, 30);  // scrubber
const time = useClockValue(clock, 10);  // segment boundary check
const time = useClockValue(clock, 4);   // highlight update
```

### usePlaylistEngine(options, clock?)

Creates a `PlaylistEngine`. When `clock` is provided, calls `clock.extendDuration()` on init and live updates.

```tsx
const { engine, playlist, loading, error } = usePlaylistEngine({ url }, clock);
```

### useSegment(engine, clock) — discrete data

Returns one decoded segment at a time. Tracks boundaries locally at ~10fps via `useClockValue` + `resolveSegment`. Multiple hooks with different playlists on the same clock work correctly.

```tsx
const { data, segment, loading, error } = useSegment<MyType[]>(engine, clock);
```

### useTrackData(engine, clock) — continuous data

Loads and merges contiguous segments into `Float32Array`s for interpolation. Returns a `Map<string, TrackSamples>` where each entry has `{ times, values, stride }`.

```tsx
const { tracks, mergedRange, loading } = useTrackData(engine, clock);
const pos = tracks.get('position'); // { times: Float32Array, values: Float32Array, stride: 3 }
```

The consumer decides how to query the merged data:
- `findBracket(pos.times, t, hint)` + lerp → smooth interpolation
- Nearest-neighbor lookup
- Custom interpolation (slerp, cubic, etc.)

`useTrackData` only handles loading + merging. It does not interpolate.

### When to use which

| Data type | Has own start/end? | Needs interpolation? | Hook |
|-----------|--------------------|---------------------|------|
| JSONL events | Yes | No | `useSegment` |
| VTT subtitles | Yes | No | `useSegment` |
| Position/rotation | No (keyframes) | Yes | `useTrackData` |
| Sensor series | No (samples) | Yes | `useTrackData` |

---

## Player Components

| Component | Data hook | Rendering | Render fps |
|-----------|-----------|-----------|------------|
| `VideoPlayer` | hls.js (not PlaylistEngine*) | `<video>` native | 0 (seek events only) |
| `JsonlPlayer` | `useSegment` | React list | ~10 |
| `SubtitlePlayer` | `useSegment` | React text | ~10 |
| `CanvasTrackPlayer` | `useTrackData` | Canvas 2D imperative | 60 (0 React) |
| `TimelineController` | `useClockValue(30)` | React scrubber | ~30 |

All receive `clock` as a prop. `TimelineController` also receives `state` from `useTimeline`.

*\*VideoPlayer does NOT use PlaylistEngine — hls.js is a complete HLS implementation that handles m3u8 parsing, segment loading, ABR, and video buffering via MediaSource Extensions. Using PlaylistEngine alongside it would duplicate network requests and our decoders cannot decode video media. Duration is synced to the clock via `<video>.durationchange` → `clock.extendDuration()`.*

---

## M3U8 Format Extension

Two custom tags:

| Tag | Example |
|-----|---------|
| `#BSS-TRACK-TYPE` | `metrics`, `track` |
| `#BSS-CHUNK-FORMAT` | `jsonl`, `mpk`, `parquet`, `vtt` |

VOD: ends with `#EXT-X-ENDLIST`. Live: omits it — engine polls for updates.

---

## Dependencies

| Package | Purpose | Required |
|---------|---------|----------|
| `lru-cache` | Segment caching | Yes |
| `hls.js` | VideoPlayer | Yes |
| `react` | Hooks + components | Peer |
| `@msgpack/msgpack` | MessagePack decoder | Optional |
| `apache-arrow` | Parquet decoder | Optional |
