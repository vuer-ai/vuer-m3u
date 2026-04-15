# Building Custom Players

The built-in player components (`JsonlPlayer`, `SubtitlePlayer`, `CanvasTrackPlayer`) are intentionally minimal — they exist as reference implementations and demos. For production use, you'll build your own player that renders data in the way your application needs.

This guide explains the two patterns for building custom players, when to use each, and walks through complete examples.

---

## The Two Patterns

Every custom player follows one of two patterns, depending on the data type:

| Pattern | Hook | Data type | Example use cases |
|---------|------|-----------|-------------------|
| **Discrete** | `useSegment` | Each entry has its own time range | Event logs, annotations, subtitles, chat messages, state snapshots |
| **Continuous** | `useTrackData` | Keyframed samples that need interpolation | Position/rotation tracks, sensor readings, loss curves, joint angles |

**How to choose:** If your data entries have their own `start`/`end` fields and you display them as-is, use `useSegment`. If your data is sampled at regular intervals and you need to interpolate between samples, use `useTrackData`.

The one exception is `VideoPlayer`, which uses neither — it delegates to hls.js because video decoding requires a completely different pipeline (demux → remux → MediaSource Extensions → hardware GPU decoder). You cannot build a video player with `useSegment` or `useTrackData`.

---

## Pattern 1: Discrete Data (`useSegment`)

### The 3-step recipe

```
1. usePlaylistEngine(options, clock)  → creates engine, syncs duration
2. useSegment(engine, clock)          → loads one decoded segment at a time
3. useClockValue(clock, fps)          → time for highlighting the active entry
```

### Minimal example

```tsx
import { usePlaylistEngine, useSegment, useClockValue } from '@vuer-ai/tinyplay';
import type { TimelineClock } from '@vuer-ai/tinyplay';

interface MyPlayerProps {
  playlistUrl: string;
  clock: TimelineClock;
}

function MyPlayer({ playlistUrl, clock }: MyPlayerProps) {
  // Step 1: load and parse the m3u8 playlist
  const { engine } = usePlaylistEngine({ url: playlistUrl }, clock);

  // Step 2: get the decoded segment data for the current time
  const { data, loading, error } = useSegment<MyEntry[]>(engine, clock);

  // Step 3: get current time for highlighting (at your chosen fps)
  const time = useClockValue(clock, 10);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!data) return null;

  // Render your data however you want
  return (
    <div>
      {data.map((entry, i) => (
        <div key={i} style={{ opacity: isActive(entry, time) ? 1 : 0.3 }}>
          {renderEntry(entry)}
        </div>
      ))}
    </div>
  );
}
```

### What happens under the hood

```
t=0s   → useSegment detects segment 0 → engine.getDataAtTime(0)
           → fetch chunk-001.jsonl → decode → return [{...}, {...}, ...]
           → also prefetches chunk-002, chunk-003 in background

t=0-9s → useClockValue(clock, 10) updates ~10x/sec
           → you re-render to highlight the active entry
           → segment data doesn't change, no refetch

t=10s  → useSegment detects segment boundary (index 0→1)
           → engine.getDataAtTime(10) → chunk-002 already cached from prefetch → instant
           → new data array returned, React re-renders
```

### Concrete example: Chat Message Player

A player that shows timestamped chat messages, highlighting the current one.

**m3u8 playlist:**
```m3u8
#EXTM3U
#BSS-CHUNK-FORMAT:jsonl
#EXT-X-TARGETDURATION:60

#EXTINF:60.000,messages=24
chat-001.jsonl
#EXTINF:60.000,messages=31
chat-002.jsonl
#EXT-X-ENDLIST
```

**JSONL chunk:**
```jsonl
{"start":0.0,"end":3.2,"user":"Alice","text":"Hey, the robot is starting up"}
{"start":3.2,"end":8.1,"user":"Bob","text":"I see it moving to position A"}
{"start":8.1,"end":12.0,"user":"Alice","text":"Gripper looks good, proceeding"}
```

**Player component:**
```tsx
import { usePlaylistEngine, useSegment, useClockValue } from '@vuer-ai/tinyplay';
import type { TimelineClock } from '@vuer-ai/tinyplay';

interface ChatMessage {
  start: number;
  end: number;
  user: string;
  text: string;
}

export function ChatPlayer({ playlistUrl, clock }: { playlistUrl: string; clock: TimelineClock }) {
  const { engine } = usePlaylistEngine({ url: playlistUrl }, clock);
  const { data } = useSegment<ChatMessage[]>(engine, clock);
  const time = useClockValue(clock, 4);

  if (!data) return <div>Loading chat...</div>;

  return (
    <div style={{ maxHeight: 300, overflow: 'auto' }}>
      {data.map((msg, i) => {
        const active = time >= msg.start && time < msg.end;
        return (
          <div key={i} style={{
            padding: '8px 12px',
            background: active ? '#1e3a5f' : 'transparent',
            borderLeft: active ? '3px solid #60a5fa' : '3px solid transparent',
          }}>
            <strong>{msg.user}</strong>
            <span style={{ color: '#888', marginLeft: 8 }}>{msg.start.toFixed(1)}s</span>
            <div>{msg.text}</div>
          </div>
        );
      })}
    </div>
  );
}
```

### Concrete example: State Snapshot Player

A player that shows the full state of a system at the current time — only one entry visible at once.

```tsx
interface RobotState {
  start: number;
  end: number;
  phase: string;
  joints: Record<string, number>;
  gripper_open: boolean;
}

export function StatePlayer({ playlistUrl, clock }: { playlistUrl: string; clock: TimelineClock }) {
  const { engine } = usePlaylistEngine({ url: playlistUrl }, clock);
  const { data } = useSegment<RobotState[]>(engine, clock);
  const time = useClockValue(clock, 10);

  if (!data) return <div>Loading...</div>;

  // Find the active state entry
  const current = data.find(s => time >= s.start && time < s.end);
  if (!current) return <div>No state at {time.toFixed(1)}s</div>;

  return (
    <div>
      <h3>Phase: {current.phase}</h3>
      <p>Gripper: {current.gripper_open ? 'Open' : 'Closed'}</p>
      <table>
        <tbody>
          {Object.entries(current.joints).map(([name, value]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{(value as number).toFixed(2)} rad</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Pattern 2: Continuous Data (`useTrackData`)

### The 3-step recipe

```
1. usePlaylistEngine(options, clock)  → creates engine, syncs duration
2. useTrackData(engine, clock)        → merged Float32Arrays from contiguous segments
3. findBracket + interpolation        → query the merged data at any time
```

### What `useTrackData` returns

```typescript
const { tracks, mergedRange, loading } = useTrackData(engine, clock);

// tracks: Map<string, TrackSamples>
// Each TrackSamples: { times: Float32Array, values: Float32Array, stride: number }
//
// Example for position data (stride=3):
//   times:  [0.0, 0.1, 0.2, ...]
//   values: [x0, y0, z0, x1, y1, z1, x2, y2, z2, ...]
//   stride: 3
//
// To get position at index i:
//   x = values[i * stride + 0]
//   y = values[i * stride + 1]
//   z = values[i * stride + 2]
```

### How to query the merged data

`useTrackData` only loads and merges. Querying is up to you:

```typescript
import { findBracket } from '@vuer-ai/tinyplay';

const track = tracks.get('position');
const [idx, alpha] = findBracket(track.times, currentTime, hint);

// Method 1: Linear interpolation (most common)
const x = track.values[idx * 3] + (track.values[(idx+1) * 3] - track.values[idx * 3]) * alpha;

// Method 2: Nearest neighbor (no interpolation)
const nearestIdx = alpha < 0.5 ? idx : idx + 1;
const x = track.values[nearestIdx * 3];

// Method 3: Step (hold previous value)
const x = track.values[idx * 3];  // ignore alpha
```

### Rendering approaches

For continuous data, you have two rendering strategies:

**React rendering (~10-30fps)** — good enough for numeric displays, tables, gauges:
```tsx
const time = useClockValue(clock, 15);
// read data at `time`, render in JSX
```

**Canvas rendering (~60fps)** — needed for smooth animations, charts, trajectories:
```tsx
useEffect(() => {
  const unsub = clock.on('tick', () => {
    // read data at clock.time, draw on canvas imperatively
  });
  return unsub;
}, [clock, tracks]);
```

The key difference: React rendering goes through React's reconciliation on every update. Canvas rendering bypasses React entirely — you draw directly on the canvas element.

### Concrete example: Gauge Display (React, ~15fps)

A numeric dashboard showing interpolated sensor values.

**JSONL chunk format:**
```jsonl
{"t":0.0,"temperature":22.5,"pressure":1013.2,"humidity":45.0}
{"t":0.1,"temperature":22.6,"pressure":1013.1,"humidity":45.1}
```

**Player:**
```tsx
import { useRef } from 'react';
import { usePlaylistEngine, useTrackData, useClockValue, findBracket } from '@vuer-ai/tinyplay';
import type { TimelineClock } from '@vuer-ai/tinyplay';

export function GaugePlayer({ playlistUrl, clock }: { playlistUrl: string; clock: TimelineClock }) {
  const { engine } = usePlaylistEngine({ url: playlistUrl }, clock);
  const { tracks } = useTrackData(engine, clock);
  const time = useClockValue(clock, 15);
  const hintRef = useRef(0);

  // Helper: interpolate a scalar track at current time
  function readTrack(name: string): number | null {
    const track = tracks.get(name);
    if (!track || track.times.length < 2) return null;
    const [idx, alpha] = findBracket(track.times, time, hintRef.current);
    hintRef.current = idx;
    return track.values[idx] + (track.values[idx + 1] - track.values[idx]) * alpha;
  }

  const temp = readTrack('temperature');
  const pressure = readTrack('pressure');
  const humidity = readTrack('humidity');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
      <Gauge label="Temperature" value={temp} unit="C" />
      <Gauge label="Pressure" value={pressure} unit="hPa" />
      <Gauge label="Humidity" value={humidity} unit="%" />
    </div>
  );
}

function Gauge({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: '#888' }}>{label}</div>
      <div style={{ fontSize: 28, fontFamily: 'monospace' }}>
        {value != null ? value.toFixed(1) : '--'}{unit}
      </div>
    </div>
  );
}
```

### Concrete example: Waveform Visualizer (Canvas, ~60fps)

A smooth scrolling waveform drawn imperatively on canvas.

```tsx
import { useEffect, useRef } from 'react';
import { usePlaylistEngine, useTrackData, findBracket } from '@vuer-ai/tinyplay';
import type { TimelineClock } from '@vuer-ai/tinyplay';

export function WaveformPlayer({ playlistUrl, clock }: { playlistUrl: string; clock: TimelineClock }) {
  const { engine } = usePlaylistEngine({ url: playlistUrl }, clock);
  const { tracks } = useTrackData(engine, clock);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hintRef = useRef(0);

  // Imperative draw loop — 60fps, zero React re-renders
  useEffect(() => {
    const unsub = clock.on('tick', () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const signal = tracks.get('signal');  // scalar track, stride=1
      if (!signal || signal.times.length < 2) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;

      const t = clock.time;
      const windowSec = 5;  // show 5 seconds of data
      const tStart = Math.max(0, t - windowSec);
      const tEnd = t;

      // Background
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, w, h);

      // Draw waveform
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let px = 0; px < w; px++) {
        const sampleT = tStart + (px / w) * (tEnd - tStart);
        const [idx, alpha] = findBracket(signal.times, sampleT, hintRef.current);
        hintRef.current = idx;
        const v = signal.values[idx] + (signal.values[idx + 1] - signal.values[idx]) * alpha;
        const y = h / 2 - v * (h / 2);  // assume signal is normalized [-1, 1]
        if (px === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.stroke();
    });

    return unsub;
  }, [clock, tracks]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: 200 }} />;
}
```

---

## The Decoder Contract

Both `useSegment` and `useTrackData` rely on the decoder to transform raw bytes into usable data.

### For `useSegment`

The decoder can return **anything**. `useSegment<T>` passes the decoded value through as-is:

```typescript
// Decoder returns JSON array → useSegment<MyEntry[]> gets MyEntry[]
// Decoder returns string → useSegment<string> gets string
// Decoder returns custom object → useSegment<MyObject> gets MyObject
```

### For `useTrackData`

The decoder must return one of two shapes:

**Shape 1: Array of timestamped entries** (auto-converted)
```typescript
// Each entry must have a `t` field. Other numeric/array fields become tracks.
[
  { t: 0.0, position: [1, 2, 3], velocity: [0.1, 0.2, 0.3] },
  { t: 0.1, position: [1.1, 2.1, 3.1], velocity: [0.1, 0.2, 0.3] },
]
// → tracks: Map { "position" → {times, values, stride:3}, "velocity" → {times, values, stride:3} }
```

**Shape 2: Pre-structured track dict** (used directly)
```typescript
{
  position: { times: [0, 0.1, 0.2], values: [1,2,3, 1.1,2.1,3.1, 1.2,2.2,3.2], stride: 3 },
  temperature: { times: [0, 0.1, 0.2], values: [22.5, 22.6, 22.7], stride: 1 },
}
```

The built-in `jsonl` decoder outputs Shape 1 (array of JSON objects). If your data is binary, write a per-engine decoder that outputs Shape 2.

---

## Choosing the Right fps

`useClockValue(clock, fps)` controls how often your component re-renders. Pick the lowest fps that looks acceptable:

| Use case | fps | Why |
|----------|-----|-----|
| Highlight active list entry | 4 | Human perception of "which item is active" doesn't need 60fps |
| Subtitle cue change | 10 | Text changes are discrete — 100ms latency is fine |
| Numeric gauge | 15 | Numbers updating faster than 15fps are hard to read |
| Scrubber bar position | 30 | Visual smoothness for a moving element |
| Canvas animation | 60 | Use `clock.on('tick')` directly, not `useClockValue` |

For Canvas players, don't use `useClockValue` at all — subscribe to `clock.on('tick')` imperatively. This bypasses React entirely and gives you 60fps with zero re-render cost.

---

## Summary

```
Your data has start/end per entry?
  YES → useSegment → render in React at useClockValue(clock, N)
  NO  → useTrackData → findBracket + interpolate
            → React display: useClockValue(clock, N)
            → Canvas animation: clock.on('tick') imperative

VideoPlayer is special — uses hls.js, not our hooks.
Everything else follows one of the two patterns above.
```
