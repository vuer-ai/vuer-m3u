---
name: tinyplay
description: "Use @vuer-ai/tinyplay to build time-synchronized players for any data format. Covers TimelineClock, PlaylistEngine, React hooks (useTimeline, useSegment, useTrackData, useClockValue), player components, custom decoders, and m3u8 playlist authoring."
paths: "**/*.ts,**/*.tsx,**/*.m3u8"
---

# @vuer-ai/tinyplay — Usage Guide

You are helping a developer use the `@vuer-ai/tinyplay` library. This library generalizes HLS m3u8 playlists beyond video — any time-segmented data (JSONL, VTT, binary, sensor data) can be loaded, cached, prefetched, and played back through a shared timeline.

## Install

```bash
pnpm add @vuer-ai/tinyplay
```

Peer dependency: React 18+. Core engine works without React.

## Quick Start — React

```tsx
import { useTimeline, TimelineController, JsonlPlayer } from '@vuer-ai/tinyplay';

function App() {
  const { clock, state, play, pause, seek, setPlaybackRate, setLoop } = useTimeline();
  return (
    <div>
      <JsonlPlayer playlistUrl="/annotations.m3u8" clock={clock} />
      <TimelineController clock={clock} state={state}
        onPlay={play} onPause={pause} onSeek={seek}
        onPlaybackRateChange={setPlaybackRate} onLoopChange={setLoop} />
    </div>
  );
}
```

- Duration is auto-detected from playlist. No hardcoded value needed.
- Multiple players on the same clock → `max(allDurations)`.
- All player components accept a `clock` prop (not `currentTime`).

## Core API (no React)

```typescript
import { PlaylistEngine, TimelineClock } from '@vuer-ai/tinyplay';

const engine = new PlaylistEngine({ url: '/data.m3u8' });
const playlist = await engine.init();

const result = await engine.getDataAtTime(15.3);
console.log(result?.decoded);  // your data
console.log(result?.segment);  // which segment

const clock = new TimelineClock();
clock.extendDuration(playlist.totalDuration);
clock.play();
```

## Hooks Reference

### useTimeline(duration?)
Creates a TimelineClock. Returns discrete state that only re-renders on seek events.
- `clock` — pass to player components
- `state` — `{ duration, playing, playbackRate, loop }` (NO currentTime)
- Control: `play`, `pause`, `seek`, `setPlaybackRate`, `setLoop`

### useClockValue(clock, fps)
Returns `clock.time` throttled to N fps. This is how you get currentTime.
```tsx
const time = useClockValue(clock, 30);  // scrubber UI
const time = useClockValue(clock, 10);  // segment boundary check
const time = useClockValue(clock, 4);   // highlight update
```

### usePlaylistEngine(options, clock?)
Creates a PlaylistEngine. Auto-extends `clock.duration` from playlist.
```tsx
const { engine, playlist, loading, error } = usePlaylistEngine({ url }, clock);
```

Options: `url`, `decoder`, `cacheSize` (20), `prefetchCount` (2), `pollInterval`, `fetchFn`.

### useSegment(engine, clock) — discrete data
One decoded segment at a time. For JSONL events, VTT cues.
```tsx
const { data, segment, loading, error } = useSegment<MyType[]>(engine, clock);
```

### useTrackData(engine, clock) — continuous data
Merged contiguous segments as Float32Arrays. For position, rotation, sensors.
```tsx
const { tracks, mergedRange, loading } = useTrackData(engine, clock);
const pos = tracks.get('position');
// pos.times: Float32Array, pos.values: Float32Array, pos.stride: number
```

Query methods on merged data:
```typescript
// Interpolation (O(1) with findBracket)
const [idx, alpha] = findBracket(pos.times, clock.time, hint);
const x = pos.values[idx * stride] + (pos.values[(idx+1) * stride] - pos.values[idx * stride]) * alpha;

// Nearest neighbor
const i = pos.times.findIndex(t => t >= clock.time);
```

## Player Components

All accept `{ playlistUrl: string, clock: TimelineClock }`:

| Component | Data | Use case |
|-----------|------|----------|
| `VideoPlayer` | hls.js | Standard HLS video |
| `JsonlPlayer` | useSegment | JSONL events/annotations |
| `SubtitlePlayer` | useSegment | WebVTT subtitles |
| `CanvasTrackPlayer` | useTrackData | Chart + 2D trajectory (mode: 'chart'/'path'/'both') |
| `TimelineController` | useClockValue | Scrubber UI (also needs `state` from useTimeline) |

## Custom Decoder

```typescript
// Global — by chunkFormat name in m3u8 header
import { registerDecoder } from '@vuer-ai/tinyplay';
registerDecoder('mpk', (raw) => decode(new Uint8Array(raw)));

// Per-engine — for unnamed binary formats
new PlaylistEngine({
  url: '/data.m3u8',
  decoder: (raw, segment, playlist) => myCustomDecode(raw),
});
```

## Custom Player Component

Pattern: `usePlaylistEngine` + `useSegment` or `useTrackData` + `useClockValue`.

```tsx
function SensorPlayer({ playlistUrl, clock }: { playlistUrl: string; clock: TimelineClock }) {
  const { engine } = usePlaylistEngine({ url: playlistUrl }, clock);
  const { data } = useSegment<{ start: number; value: number }[]>(engine, clock);
  const time = useClockValue(clock, 4);

  if (!data) return <div>Loading...</div>;
  const current = data.reduce((a, b) =>
    Math.abs(b.start - time) < Math.abs(a.start - time) ? b : a
  );
  return <div>{current.value}</div>;
}
```

## M3U8 Playlist Format

Standard HLS with two custom tags:

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#BSS-TRACK-TYPE:metrics
#BSS-CHUNK-FORMAT:jsonl
#EXT-X-TARGETDURATION:10

#EXTINF:10.000,segments=50
chunk-001.jsonl
#EXTINF:10.000,segments=48
chunk-002.jsonl
#EXT-X-ENDLIST
```

- `#BSS-TRACK-TYPE` — track type (metrics, track)
- `#BSS-CHUNK-FORMAT` — chunk format (jsonl, mpk, parquet, vtt)
- No `#EXT-X-ENDLIST` → live playlist, engine polls automatically

## Live Streaming

```tsx
const { engine, playlist } = usePlaylistEngine(
  { url: '/live/stream.m3u8', pollInterval: 3000 },
  clock,
);
// Duration auto-extends as new segments arrive.
// Polling stops when #EXT-X-ENDLIST appears.
```

## Key Architecture Rules

1. **TimelineClock** is pure time. No playlist/segment knowledge.
2. **Segment boundaries** tracked per-hook, not on clock. Multiple playlists work correctly.
3. **Prefetch** automatic in `getDataAtTime()`. No configuration needed for basic use.
4. **VideoPlayer** uses hls.js directly (not PlaylistEngine) — different decode pipeline.
5. **useTimeline state** has no currentTime. Use `useClockValue(clock, fps)`.
6. **useSegment** = discrete (events, cues). **useTrackData** = continuous (position, sensors).

## Documentation

- `docs/DESIGN.md` — API reference
- `docs/EXAMPLES.md` — 13 usage examples
- `docs/ARCHITECTURE.md` — data flow, event model, performance
