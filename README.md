# @vuer-ai/m3u8

Generalized m3u8 playlist engine for any time-segmented data — not just video.

Standard HLS maps time ranges to video segments. This library extends the m3u8 format to support **JSONL, WebVTT, MessagePack, Parquet, custom binary**, and more. A shared timeline clock synchronizes multiple "player" components, each rendering its own data type.

## Install

```bash
npm install @vuer-ai/m3u8
```

React 18+ is a peer dependency for the hooks and components. The core engine (`PlaylistEngine`, `TimelineClock`) works without React.

## Quick Start

```tsx
import { useTimeline, TimelineController, JsonlPlayer } from '@vuer-ai/m3u8';

function App() {
  const { clock, state, play, pause, seek, setPlaybackRate } = useTimeline();

  return (
    <div>
      <JsonlPlayer playlistUrl="/annotations.m3u8" clock={clock} />
      <TimelineController clock={clock} state={state}
        onPlay={play} onPause={pause} onSeek={seek} onPlaybackRateChange={setPlaybackRate} />
    </div>
  );
}
```

Duration is auto-detected from the playlist. Multiple players on the same clock → `max(allDurations)`.

## Multi-Track Sync

```tsx
const { clock, state, play, pause, seek, setPlaybackRate, setLoop } = useTimeline();

<VideoPlayer playlistUrl="/video.m3u8" clock={clock} />
<JsonlPlayer playlistUrl="/annotations.m3u8" clock={clock} />
<CanvasTrackPlayer playlistUrl="/trajectory.m3u8" clock={clock} mode="both" />
<SubtitlePlayer playlistUrl="/subtitles.m3u8" clock={clock} />
<TimelineController clock={clock} state={state}
  onPlay={play} onPause={pause} onSeek={seek}
  onPlaybackRateChange={setPlaybackRate} onLoopChange={setLoop} />
```

## Architecture

```
TimelineClock         Pure time source (tick + seek events). No playlist knowledge.
  ↓
PlaylistEngine        Parses m3u8, loads segments, LRU cache, auto-prefetch, live poll.
  ↓
useSegment            One segment at a time (JSONL, VTT — discrete data).
useTrackData          Merged contiguous segments (position, sensor — continuous data).
  ↓
Player components     VideoPlayer, JsonlPlayer, SubtitlePlayer, CanvasTrackPlayer.
```

Each layer has one job. No circular dependencies.

## Core Concepts

### TimelineClock

Pure time source with two events: `tick` (~60fps) and `seek` (user actions).

```typescript
const clock = new TimelineClock();
clock.play();           // start RAF loop
clock.pause();
clock.seek(15.3);
clock.setRate(2);       // 2x speed
clock.setLoop(true);
clock.tick(delta);      // external drive (e.g. R3F useFrame)
clock.on('tick', (e) => console.log(e.time));
```

### PlaylistEngine

Parses m3u8, loads + decodes segments on demand, prefetches ahead, polls for live updates.

```typescript
const engine = new PlaylistEngine({ url: '/data.m3u8', prefetchCount: 4 });
const playlist = await engine.init();
const result = await engine.getDataAtTime(15.3);
// result.decoded → your data, result.segment → which segment
```

### M3U8 Format Extension

Two custom tags extend standard HLS:

```m3u8
#EXTM3U
#BSS-TRACK-TYPE:metrics
#BSS-CHUNK-FORMAT:jsonl
#EXT-X-TARGETDURATION:10

#EXTINF:10.000,segments=50
chunk-001.jsonl
#EXTINF:10.000,segments=48
chunk-002.jsonl
#EXT-X-ENDLIST
```

- `#BSS-TRACK-TYPE` — track type (`metrics`, `track`)
- `#BSS-CHUNK-FORMAT` — chunk format (`jsonl`, `mpk`, `parquet`, `vtt`)
- No `#EXT-X-ENDLIST` → live playlist, engine polls for updates

## React Hooks

| Hook | Purpose |
|------|---------|
| `useTimeline(duration?)` | Clock + discrete state (playing, rate, loop, duration) |
| `useClockValue(clock, fps)` | Throttled `clock.time` at N fps |
| `usePlaylistEngine(options, clock?)` | Engine lifecycle + auto duration sync |
| `useSegment(engine, clock)` | One decoded segment at a time (discrete data) |
| `useTrackData(engine, clock)` | Merged Float32Arrays for interpolation (continuous data) |

### useSegment vs useTrackData

| | useSegment | useTrackData |
|---|---|---|
| Data type | JSONL events, VTT cues | Position, rotation, sensors |
| Returns | One decoded segment (any type) | Merged `Float32Array`s per track |
| Needs interpolation? | No | Yes (`findBracket` + lerp) |

## Player Components

| Component | Data | Render fps |
|-----------|------|------------|
| `VideoPlayer` | hls.js native | 0 (seek events only) |
| `JsonlPlayer` | `useSegment` | ~10 |
| `SubtitlePlayer` | `useSegment` | ~10 |
| `CanvasTrackPlayer` | `useTrackData` | 60 (canvas, 0 React) |
| `TimelineController` | `useClockValue` | ~30 |

## Custom Decoders

```typescript
// Global — by chunkFormat name
import { registerDecoder } from '@vuer-ai/m3u8';
registerDecoder('mpk', (raw) => decode(new Uint8Array(raw)));

// Per-engine — for unnamed binary formats
new PlaylistEngine({
  url: '/data.m3u8',
  decoder: (raw, segment, playlist) => myCustomDecode(raw),
});
```

Built-in: `jsonl`, `vtt` (text), `ts` (raw ArrayBuffer).

## Custom Fetch

```typescript
new PlaylistEngine({
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
const { engine, playlist } = usePlaylistEngine(
  { url: '/live/stream.m3u8', pollInterval: 3000 },
  clock,
);
```

## Documentation

- **[DESIGN.md](docs/DESIGN.md)** — API reference and design overview
- **[EXAMPLES.md](docs/EXAMPLES.md)** — 13 usage examples
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — data flow diagrams, event model, performance analysis

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
