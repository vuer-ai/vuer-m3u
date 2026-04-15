import { useEffect, useRef } from 'react';
import { usePlaylistEngine } from '../hooks/use-playlist-engine';
import { useTrackData } from '../hooks/use-track-data';
import { findBracket } from '../../core/find-bracket';
import type { TimelineClock } from '../../core/timeline';
import type { TrackSamples } from '../hooks/use-track-data';

interface CanvasTrackPlayerProps {
  playlistUrl: string;
  clock: TimelineClock;
  mode?: 'chart' | 'path' | 'both';
  /** Seconds of data visible in the chart window. Default: 8 */
  chartWindow?: number;
  className?: string;
}

const COLORS = ['#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa', '#fb923c'];

/**
 * Canvas-based player for continuous animation/time-series data.
 *
 * Draws imperatively on Canvas at 60fps via clock tick events —
 * NO React re-renders per frame. React only re-renders when
 * new segment data is loaded (merged tracks change).
 */
export function CanvasTrackPlayer({
  playlistUrl,
  clock,
  mode = 'both',
  chartWindow = 8,
  className,
}: CanvasTrackPlayerProps) {
  const { engine } = usePlaylistEngine({ url: playlistUrl }, clock);
  const { tracks, loading } = useTrackData(engine, clock);

  const chartCanvasRef = useRef<HTMLCanvasElement>(null);
  const pathCanvasRef = useRef<HTMLCanvasElement>(null);
  const hintRef = useRef(0);

  // Imperative draw loop — subscribes to clock.tick directly, not via React
  useEffect(() => {
    const unsubTick = clock.on('tick', () => draw());
    const unsubSeek = clock.on('seek', () => draw());

    function draw() {
      if (mode === 'chart' || mode === 'both') drawChart();
      if (mode === 'path' || mode === 'both') drawPath();
    }

    function drawChart() {
      const canvas = chartCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Handle DPR
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      const t = clock.time;
      const windowStart = Math.max(0, t - chartWindow);
      const windowEnd = t + chartWindow * 0.2; // show a little ahead

      // Background
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 1;
      const gridStep = Math.max(1, Math.floor(chartWindow / 5));
      for (let gt = Math.ceil(windowStart / gridStep) * gridStep; gt <= windowEnd; gt += gridStep) {
        const x = ((gt - windowStart) / (windowEnd - windowStart)) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        // Time label
        ctx.fillStyle = '#52525b';
        ctx.font = '10px monospace';
        ctx.fillText(`${gt.toFixed(0)}s`, x + 2, h - 4);
      }

      // Draw each track
      let colorIdx = 0;
      const padding = 20;
      const plotH = h - padding * 2;

      for (const [name, trackData] of tracks) {
        if (trackData.times.length < 2) continue;
        const color = COLORS[colorIdx++ % COLORS.length];

        // Find value range for auto-scaling
        const { yMin, yMax } = getValueRange(trackData, windowStart, windowEnd);
        const yRange = yMax - yMin || 1;

        // Draw line for each dimension
        for (let dim = 0; dim < trackData.stride; dim++) {
          ctx.strokeStyle = trackData.stride > 1
            ? COLORS[(colorIdx - 1 + dim) % COLORS.length]
            : color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();

          let started = false;
          // Sample at pixel resolution
          for (let px = 0; px < w; px++) {
            const sampleT = windowStart + (px / w) * (windowEnd - windowStart);
            const [idx, alpha] = findBracket(trackData.times, sampleT, hintRef.current);
            hintRef.current = idx;

            const vIdx = idx * trackData.stride + dim;
            const v0 = trackData.values[vIdx] ?? 0;
            const v1 = trackData.values[vIdx + trackData.stride] ?? v0;
            const val = v0 + (v1 - v0) * alpha;

            const y = padding + plotH - ((val - yMin) / yRange) * plotH;

            if (!started) {
              ctx.moveTo(px, y);
              started = true;
            } else {
              ctx.lineTo(px, y);
            }
          }
          ctx.stroke();
        }

        // Legend
        ctx.fillStyle = color;
        ctx.font = '11px sans-serif';
        ctx.fillText(name, 6, 14 + (colorIdx - 1) * 14);
      }

      // Playback cursor
      const cursorX = ((t - windowStart) / (windowEnd - windowStart)) * w;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Current time label
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px monospace';
      ctx.fillText(t.toFixed(2) + 's', cursorX + 4, 14);
    }

    function drawPath() {
      const canvas = pathCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, w, h);

      // Find the first track with stride >= 2 (XY data)
      let posTrack: TrackSamples | null = null;
      for (const [, td] of tracks) {
        if (td.stride >= 2 && td.times.length >= 2) {
          posTrack = td;
          break;
        }
      }
      if (!posTrack) {
        ctx.fillStyle = '#52525b';
        ctx.font = '12px sans-serif';
        ctx.fillText('No XY track data', w / 2 - 50, h / 2);
        return;
      }

      // Auto-fit: find XY bounding box
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      for (let i = 0; i < posTrack.times.length; i++) {
        const x = posTrack.values[i * posTrack.stride];
        const y = posTrack.values[i * posTrack.stride + 1];
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
        yMin = Math.min(yMin, y);
        yMax = Math.max(yMax, y);
      }
      const xRange = xMax - xMin || 1;
      const yRange = yMax - yMin || 1;
      const padding = 30;
      const scale = Math.min((w - padding * 2) / xRange, (h - padding * 2) / yRange);
      const offsetX = (w - xRange * scale) / 2;
      const offsetY = (h - yRange * scale) / 2;

      const toCanvasX = (x: number) => offsetX + (x - xMin) * scale;
      const toCanvasY = (y: number) => offsetY + (yMax - y) * scale; // flip Y

      // Draw full path (faded)
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < posTrack.times.length; i++) {
        const cx = toCanvasX(posTrack.values[i * posTrack.stride]);
        const cy = toCanvasY(posTrack.values[i * posTrack.stride + 1]);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();

      // Draw trail (recent path, brighter)
      const t = clock.time;
      const trailDuration = 3; // seconds of trail
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      let trailStarted = false;
      for (let i = 0; i < posTrack.times.length; i++) {
        const ti = posTrack.times[i];
        if (ti < t - trailDuration || ti > t) continue;
        const cx = toCanvasX(posTrack.values[i * posTrack.stride]);
        const cy = toCanvasY(posTrack.values[i * posTrack.stride + 1]);
        if (!trailStarted) {
          ctx.moveTo(cx, cy);
          trailStarted = true;
        } else {
          ctx.lineTo(cx, cy);
        }
      }
      ctx.stroke();

      // Current position dot (interpolated)
      const [idx, alpha] = findBracket(posTrack.times, t, hintRef.current);
      hintRef.current = idx;
      const j = idx * posTrack.stride;
      const curX = posTrack.values[j] + (posTrack.values[j + posTrack.stride] - posTrack.values[j]) * alpha;
      const curY = posTrack.values[j + 1] + (posTrack.values[j + 1 + posTrack.stride] - posTrack.values[j + 1]) * alpha;

      const dotX = toCanvasX(curX);
      const dotY = toCanvasY(curY);

      // Glow
      ctx.shadowColor = '#60a5fa';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Coordinate label
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '10px monospace';
      ctx.fillText(`(${curX.toFixed(1)}, ${curY.toFixed(1)})`, dotX + 10, dotY - 6);
    }

    // Initial draw
    draw();

    return () => {
      unsubTick();
      unsubSeek();
    };
  }, [clock, tracks, mode, chartWindow]);

  const showChart = mode === 'chart' || mode === 'both';
  const showPath = mode === 'path' || mode === 'both';

  return (
    <div className={`flex flex-col h-full ${className ?? ''}`}>
      <div className="px-3 py-2 border-b border-zinc-700 text-xs font-medium text-zinc-400 uppercase tracking-wide">
        Canvas Track {loading && '(loading...)'}
      </div>

      <div className={`flex-1 flex ${mode === 'both' ? 'gap-px' : ''}`}>
        {showChart && (
          <div className={`relative ${mode === 'both' ? 'flex-1' : 'w-full h-full'}`}>
            <canvas
              ref={chartCanvasRef}
              className="w-full h-full"
            />
          </div>
        )}
        {showPath && (
          <div className={`relative ${mode === 'both' ? 'flex-1' : 'w-full h-full'}`}>
            <canvas
              ref={pathCanvasRef}
              className="w-full h-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Get the Y-axis range for all dimensions within a time window */
function getValueRange(
  track: TrackSamples,
  tStart: number,
  tEnd: number,
): { yMin: number; yMax: number } {
  let yMin = Infinity;
  let yMax = -Infinity;

  for (let i = 0; i < track.times.length; i++) {
    const t = track.times[i];
    if (t < tStart - 1 || t > tEnd + 1) continue;
    for (let d = 0; d < track.stride; d++) {
      const v = track.values[i * track.stride + d];
      yMin = Math.min(yMin, v);
      yMax = Math.max(yMax, v);
    }
  }

  if (!isFinite(yMin)) { yMin = -1; yMax = 1; }

  // Add 10% padding
  const padding = (yMax - yMin) * 0.1 || 0.1;
  return { yMin: yMin - padding, yMax: yMax + padding };
}
