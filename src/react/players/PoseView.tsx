import { useMemo } from 'react';
import { usePlaylist } from '../hooks/use-playlist';
// `useMemo` is still used for `mergeOptions` (stable normalizer reference).
import { useMergedTrack } from '../hooks/use-merged-track';
import { useTrackSample } from '../hooks/use-track-sample';
import { useClockValue } from '../hooks/use-clock-value';
import { useClockContext } from '../clock-context';
import { slerpQuat } from '../../core/interpolators';
import type { Normalizer } from '../../core/normalize';
import type { ContinuousSample } from '../../core/samples';
import type { TimelineClock } from '../../core/timeline';

/**
 * One 6-DoF pose sample. `data` is `[x, y, z, qx, qy, qz, qw]`.
 * Translation in meters (convention); quaternion unit-length, scalar last.
 */
export interface PoseSample {
  ts: number;
  data: [number, number, number, number, number, number, number];
}

export interface PoseViewProps {
  src: string;
  clock?: TimelineClock | null;
  className?: string;
  /** Display fps. Defaults to 30. */
  fps?: number;
  /** XY extent (± meters) shown on the top-down grid. Defaults to 1. */
  gridExtent?: number;
}

// Split 7-tuple into position (stride 3, lerp) + orientation (stride 4, slerpQuat).
const poseNormalizer: Normalizer<ContinuousSample[]> = (samples) => {
  if (!samples || samples.length === 0) return null;
  const first = samples[0];
  if (first == null || !Array.isArray(first.data) || first.data.length !== 7) return null;

  const n = samples.length;
  const times = new Float32Array(n);
  const pos = new Float32Array(n * 3);
  const quat = new Float32Array(n * 4);

  for (let i = 0; i < n; i++) {
    const s = samples[i];
    times[i] = s.ts;
    const d = s.data as number[];
    pos[i * 3] = d[0];
    pos[i * 3 + 1] = d[1];
    pos[i * 3 + 2] = d[2];
    quat[i * 4] = d[3];
    quat[i * 4 + 1] = d[4];
    quat[i * 4 + 2] = d[5];
    quat[i * 4 + 3] = d[6];
  }

  return new Map([
    ['position', { times, values: pos, stride: 3 }],
    ['orientation', { times, values: quat, stride: 4 }],
  ]);
};

/**
 * PoseView — 6-DoF pose gizmo + top-down position grid.
 *
 * Left panel: a 3-axis gizmo (R=X, G=Y, B=Z) rotated by the current
 * quaternion using an isometric projection. Right panel: a top-down XY grid
 * showing the trajectory tail and current position crosshair, plus a Z
 * altitude bar.
 *
 * ## Data format
 * JSONL lines of shape `{ ts: number, data: [x, y, z, qx, qy, qz, qw] }`.
 * Quaternion is scalar-last (`qw` at index 6) and must be unit-length.
 *
 * ## Hooks used
 * `useMergedTrack` with a normalizer that splits each 7-tuple into
 * `"position"` (stride 3) and `"orientation"` (stride 4). Position uses
 * `lerp`; orientation uses `slerpQuat`.
 */
export function PoseView({
  src,
  clock,
  className,
  fps = 30,
  gridExtent = 1,
}: PoseViewProps) {
  const resolvedClock = useClockContext(clock);
  const { engine } = usePlaylist({ url: src }, resolvedClock);
  const mergeOptions = useMemo(() => ({ normalize: poseNormalizer }), []);
  const { tracks } = useMergedTrack(engine, resolvedClock, mergeOptions);
  const time = useClockValue(fps, resolvedClock);
  const posTrack = tracks.get('position');
  const orientTrack = tracks.get('orientation');
  const position = useTrackSample(posTrack, time);
  const orientation = useTrackSample(orientTrack, time, slerpQuat);

  // Trail and axes are computed inline each render — `position`/`orientation`
  // are reused Float32Arrays with mutated contents, so useMemo would return
  // stale results. Both are cheap (linear passes + 3 vec3 rotations).
  const trail = buildTrail(posTrack, time, 60);
  const axes = orientation ? rotateAxesIso(orientation) : null;

  return (
    <div className={`bg-zinc-900 text-zinc-100 text-xs font-mono ${className ?? ''}`}>
      <div className="px-3 py-1.5 flex gap-4 border-b border-zinc-800 text-[10px]">
        <span className="text-zinc-400">Pose @ {time.toFixed(2)}s</span>
        <span className="ml-auto flex gap-3">
          <LegendSwatch color="#f87171" label="X" />
          <LegendSwatch color="#34d399" label="Y" />
          <LegendSwatch color="#60a5fa" label="Z" />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-0" style={{ minHeight: 240 }}>
        {/* Gizmo */}
        <div className="border-r border-zinc-800 flex items-center justify-center">
          <svg viewBox="-120 -120 240 240" width="100%" height="100%" style={{ maxHeight: 240 }}>
            <defs>
              <marker id="arrowX" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#f87171" />
              </marker>
              <marker id="arrowY" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#34d399" />
              </marker>
              <marker id="arrowZ" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#60a5fa" />
              </marker>
            </defs>
            {/* Faint reference axes */}
            <AxisGhost />
            {axes && (
              <>
                <AxisArrow to={axes.x} color="#f87171" marker="arrowX" />
                <AxisArrow to={axes.y} color="#34d399" marker="arrowY" />
                <AxisArrow to={axes.z} color="#60a5fa" marker="arrowZ" />
              </>
            )}
            {!axes && (
              <text x={0} y={0} fill="#52525b" fontSize={10} textAnchor="middle">waiting…</text>
            )}
          </svg>
        </div>
        {/* Top-down grid */}
        <TopDownGrid
          extent={gridExtent}
          trail={trail}
          x={position ? position[0] : null}
          y={position ? position[1] : null}
          z={position ? position[2] : null}
        />
      </div>
      <div className="px-3 py-2 border-t border-zinc-800 grid grid-cols-2 gap-x-6 gap-y-0.5">
        <div className="space-y-0.5">
          <div className="text-zinc-400">position (m)</div>
          {(['x', 'y', 'z'] as const).map((l, i) => (
            <div key={l} className="flex justify-between">
              <span className="text-zinc-500">{l}</span>
              <span className="tabular-nums">{position ? position[i].toFixed(3) : '—'}</span>
            </div>
          ))}
        </div>
        <div className="space-y-0.5">
          <div className="text-zinc-400">orientation (quat, xyzw)</div>
          {(['qx', 'qy', 'qz', 'qw'] as const).map((l, i) => (
            <div key={l} className="flex justify-between">
              <span className="text-zinc-500">{l}</span>
              <span className="tabular-nums">{orientation ? orientation[i].toFixed(3) : '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- helpers ---------------------------------------------------------------

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
      <span className="text-zinc-500">{label}</span>
    </span>
  );
}

function AxisGhost() {
  return (
    <g stroke="#27272a" strokeWidth={1}>
      <line x1={-100} y1={0} x2={100} y2={0} />
      <line x1={0} y1={-100} x2={0} y2={100} />
      <circle cx={0} cy={0} r={60} fill="none" />
    </g>
  );
}

function AxisArrow({ to, color, marker }: { to: { px: number; py: number }; color: string; marker: string }) {
  return (
    <line
      x1={0}
      y1={0}
      x2={to.px}
      y2={to.py}
      stroke={color}
      strokeWidth={3}
      strokeLinecap="round"
      markerEnd={`url(#${marker})`}
    />
  );
}

/**
 * Isometric 3D→2D projection.
 * World axes (after quaternion rotation): each length=1.
 * Screen: X right, Y up (SVG flip), Z as isometric diagonal.
 */
function rotateAxesIso(q: Float32Array) {
  const ax = rotateVec(q, [1, 0, 0]);
  const ay = rotateVec(q, [0, 1, 0]);
  const az = rotateVec(q, [0, 0, 1]);
  const scale = 80;
  return {
    x: projectIso(ax, scale),
    y: projectIso(ay, scale),
    z: projectIso(az, scale),
  };
}

/** Rotate vector `v` by quaternion `q = [x, y, z, w]`. Returns `[vx, vy, vz]`. */
function rotateVec(q: Float32Array, v: [number, number, number]): [number, number, number] {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const [vx, vy, vz] = v;
  // v' = q * v * q^-1, expanded
  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;
  const rx = ix * w + iw * -x + iy * -z - iz * -y;
  const ry = iy * w + iw * -y + iz * -x - ix * -z;
  const rz = iz * w + iw * -z + ix * -y - iy * -x;
  return [rx, ry, rz];
}

function projectIso([x, y, z]: [number, number, number], scale: number) {
  // Classic 30° isometric. y-up in world → y-down in SVG.
  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);
  const px = (x - y) * cos30 * scale;
  const py = -((x + y) * sin30 - z) * scale;
  return { px, py };
}

function buildTrail(
  posTrack: { times: Float32Array; values: Float32Array; stride: number } | undefined,
  now: number,
  maxPoints: number,
): Array<{ x: number; y: number }> {
  if (!posTrack || posTrack.times.length < 2) return [];
  const { times, values, stride } = posTrack;
  const tail: Array<{ x: number; y: number }> = [];
  const tailWindow = 4; // seconds
  const t0 = now - tailWindow;
  const step = Math.max(1, Math.floor((times.length - 1) / maxPoints));
  for (let i = 0; i < times.length; i += step) {
    const t = times[i];
    if (t < t0) continue;
    if (t > now) break;
    tail.push({ x: values[i * stride], y: values[i * stride + 1] });
  }
  return tail;
}

function TopDownGrid({
  extent,
  trail,
  x,
  y,
  z,
}: {
  extent: number;
  trail: Array<{ x: number; y: number }>;
  x: number | null;
  y: number | null;
  z: number | null;
}) {
  const W = 200;
  const H = 200;
  const scaleX = (v: number) => (v / extent) * (W / 2) + W / 2;
  const scaleY = (v: number) => -((v / extent) * (H / 2)) + H / 2;

  const path = trail.length
    ? trail.map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(p.x).toFixed(1)},${scaleY(p.y).toFixed(1)}`).join(' ')
    : '';

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ maxHeight: 240 }}>
        {/* Grid */}
        <g stroke="#27272a" strokeWidth={1}>
          {[0.25, 0.5, 0.75].map((f) => (
            <g key={f}>
              <line x1={W * f} y1={0} x2={W * f} y2={H} />
              <line x1={0} y1={H * f} x2={W} y2={H * f} />
            </g>
          ))}
        </g>
        <g stroke="#3f3f46" strokeWidth={1}>
          <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} />
        </g>
        {/* Trail */}
        {path && <path d={path} stroke="#fbbf24" strokeWidth={1.5} fill="none" opacity={0.7} />}
        {/* Cursor */}
        {x != null && y != null && (
          <g>
            <circle cx={scaleX(x)} cy={scaleY(y)} r={5} fill="#facc15" />
            <circle cx={scaleX(x)} cy={scaleY(y)} r={10} fill="none" stroke="#facc15" strokeWidth={1} opacity={0.5} />
          </g>
        )}
        {/* Extent label */}
        <text x={6} y={12} fill="#71717a" fontSize={9}>±{extent.toFixed(1)} m (xy)</text>
      </svg>
      {/* Z altitude bar */}
      {z != null && (
        <div className="absolute top-2 right-2 bottom-2 w-1.5 bg-zinc-800 rounded">
          <div
            className="absolute left-0 right-0 bg-blue-400 rounded"
            style={{
              top: '50%',
              height: Math.abs(z / extent) * 50 + '%',
              transform: z >= 0 ? 'translateY(-100%)' : 'translateY(0)',
            }}
          />
          <div className="absolute -left-6 top-0 text-zinc-500 text-[9px]">+z</div>
          <div className="absolute -left-6 bottom-0 text-zinc-500 text-[9px]">-z</div>
        </div>
      )}
    </div>
  );
}
