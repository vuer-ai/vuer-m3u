# Architecture — Detailed Flow Guide

## 1. Component Hierarchy

```
App
├── useTimeline()
│     ├── clock: TimelineClock        (plain JS, owns RAF loop)
│     └── state: TimelineState        (playing/rate/loop/duration — seek events only)
│
├── VideoPlayer { clock }
│     ├── hls.js handles m3u8 parsing + segment loading + video buffering
│     │   (does NOT use PlaylistEngine — hls.js is a complete HLS implementation;
│     │    using both would duplicate m3u8 fetches and our decoders can't decode video)
│     ├── <video>.durationchange → clock.extendDuration()
│     └── clock seek events → video.play/pause/seek/playbackRate
│
├── JsonlPlayer { playlistUrl, clock }
│     ├── usePlaylistEngine(options, clock)  → engine + clock.extendDuration()
│     ├── useSegment(engine, clock)          → useClockValue(10) + resolveSegment()
│     └── useClockValue(clock, 4)            → highlight active entry
│
├── CanvasTrackPlayer { playlistUrl, clock }
│     ├── usePlaylistEngine(options, clock)
│     ├── useTrackData(engine, clock)        → merge Float32Arrays
│     └── clock.on('tick') → Canvas 2D draw at 60fps (imperative, no React)
│
├── SubtitlePlayer { playlistUrl, clock }
│     ├── usePlaylistEngine(options, clock)
│     ├── useSegment(engine, clock)
│     └── useClockValue(clock, 10)
│
└── TimelineController { clock, state, onPlay, onPause, onSeek, ... }
      └── useClockValue(clock, 30) → scrubber position
```

---

## 2. Data Flow: m3u8 URL → Pixels

### Discrete data (JsonlPlayer)

```
1. usePlaylistEngine({ url }, clock)
     ├─ engine.init() → fetch + parse m3u8 → PlaylistEngine
     └─ clock.extendDuration(totalDuration)

2. useSegment(engine, clock)
     ├─ useClockValue(clock, 10) → time at ~10fps
     └─ resolveSegment(playlist.segments, time)
          segment index changed?
            yes → engine.getDataAtTime(time)
                    ├─ loader.load(segment) → fetch + decode + LRU cache
                    └─ prefetchAhead() → background: fetch next N segments
            no  → skip (no React re-render)

3. useClockValue(clock, 4) → highlight active entry at ~4fps
     └─ data.findIndex(entry => time >= entry.start && time < entry.end)
```

### Continuous data (CanvasTrackPlayer)

```
1. usePlaylistEngine + clock.extendDuration — same as above

2. useTrackData(engine, clock)
     ├─ useClockValue(clock, 10) → segment boundary check at ~10fps
     ├─ On segment change → engine.getDataAtTime(time)
     │    → decoder returns [{t:0.0, position:[x,y,z]}, ...]
     │    → normalizeSegmentData() → { position: {times, values, stride:3} }
     │    → rebuildMerged() → contiguous Float32Arrays (gap-safe)
     └─ Returns: Map<"position", TrackSamples>

3. Canvas draw (imperative, NOT React)
     ├─ clock.on('tick') → 60fps
     ├─ findBracket(times, clock.time, hint) → [idx, alpha]
     └─ lerp + ctx.lineTo → draw
```

---

## 3. Clock Events

Two events. No segment tracking.

```
TimelineClock
├─ play()   → seek{source:'play'}  → starts RAF → tick at ~60fps
├─ RAF      → tick{time, playing, rate}
├─ seek(t)  → seek{source:'seek'} + tick{time}
├─ pause()  → seek{source:'pause'} → stops RAF
└─ end      → tick + seek{source:'pause'}
```

### Subscribers

```
                       tick (~60fps)                seek (explicit)
                       ────────────                 ───────────────
useTimeline                                         ✓ (state: playing/rate/loop/duration)
TimelineController     ✓ via useClockValue(30)      (via useTimeline state)
VideoPlayer                                         ✓ (play/pause/seek/rate)
JsonlPlayer            ✓ via useClockValue(10+4)    ✓ (force reload via useSegment)
SubtitlePlayer         ✓ via useClockValue(10)      ✓ (force reload via useSegment)
CanvasTrackPlayer      ✓ (60fps canvas draw)        ✓ (redraw)
```

---

## 4. Segment Boundary Tracking

Each hook tracks its **own** playlist's boundaries locally. No global state on the clock.

```
useSegment(engine for playlist A: segments at [0, 10, 20])
  → useClockValue(clock, 10) → resolveSegment(playlistA.segments, time)

useSegment(engine for playlist B: segments at [0, 15])
  → useClockValue(clock, 10) → resolveSegment(playlistB.segments, time)

Independent. Different playlists on the same clock work correctly.
```

---

## 5. Prefetch

Automatic in `getDataAtTime()`. No configuration needed.

```
Load segment 0 → prefetchAhead(0) → fetch segment 1, 2 (background)
Load segment 1 (cached) → prefetchAhead(1) → fetch segment 2 (cached), 3
Seek to segment 5 → prefetchAhead(5) → fetch segment 6, 7
```

---

## 6. Live Polling

Fixed interval timer (standard HLS, RFC 8216).

```
engine.init() detects isLive
  └─ schedulePoll(interval = targetDuration * 1000ms)
       └─ pollNow() → fetch playlist → new segments?
            yes → emit 'playlist-updated' → usePlaylistEngine → clock.extendDuration()
            #EXT-X-ENDLIST → stop polling
```

---

## 7. useTrackData: Merged Data Queries

`useTrackData` merges segments and returns `Map<string, TrackSamples>`. The consumer decides the query method:

```typescript
const pos = tracks.get('position');
// pos.times:  Float32Array [0, 0.1, 0.2, ..., 29.9]
// pos.values: Float32Array [x0,y0,z0, x1,y1,z1, ...]
// pos.stride: 3

// Method 1: findBracket + lerp (O(1), smooth)
const [idx, alpha] = findBracket(pos.times, clock.time, hint);
const x = pos.values[idx*3] + (pos.values[(idx+1)*3] - pos.values[idx*3]) * alpha;

// Method 2: nearest neighbor
const i = pos.times.findIndex(t => t >= clock.time);

// Method 3: custom interpolation
slerp(pos.values, idx, alpha, pos.stride); // quaternion
cubicInterp(pos.values, idx, alpha, pos.stride); // cubic bezier
```

**Gap safety**: only contiguous segments around the current position are merged:
```
Loaded: segment 0, 1, 3    Playing: segment 1
findContiguousRange(1) → [0, 1]    (segment 3 excluded — gap at segment 2)
```

---

## 8. Performance Model

| Component | React re-renders/sec | Canvas draws/sec |
|-----------|---------------------|-------------------|
| App | 0 | — |
| useTimeline state | ~0 (seek events only) | — |
| TimelineController | ~30 | — |
| VideoPlayer | 0 | — |
| JsonlPlayer | ~10 | — |
| SubtitlePlayer | ~10 | — |
| CanvasTrackPlayer | ~0 | ~60 |

### Duration auto-detection

```
useTimeline()                          → clock.duration = 0
usePlaylistEngine(jsonlUrl, clock)     → clock.extendDuration(30)   → duration = 30
usePlaylistEngine(subtitleUrl, clock)  → clock.extendDuration(25)   → max(30, 25) = 30
VideoPlayer (via <video>.durationchange) → clock.extendDuration(1800) → duration = 1800
live poll discovers new segments       → clock.extendDuration(1810) → duration = 1810
```

VideoPlayer uses `<video>.durationchange` because hls.js handles its own m3u8 parsing — see component hierarchy above for details.
