import { usePlaylist } from '../hooks/use-playlist';
import { useMergedTrack } from '../hooks/use-merged-track';
import { useTrackSample } from '../hooks/use-track-sample';
import { useClockValue } from '../hooks/use-clock-value';
import { useClockContext } from '../clock-context';
import type { TimelineClock } from '../../core/timeline';

/**
 * One joint-angle sample. `data` is the full joint vector in radians.
 */
export interface JointAngleSample {
  ts: number;
  data: number[];
}

export interface JointAngleViewProps {
  src: string;
  clock?: TimelineClock | null;
  className?: string;
  /** Display fps. Defaults to 30. */
  fps?: number;
  /** Optional per-joint names. Defaults to `J0`, `J1`, …. */
  jointNames?: string[];
}

const DEFAULT_NAMES_7 = [
  'shoulder_pan',
  'shoulder_lift',
  'elbow',
  'wrist_1',
  'wrist_2',
  'wrist_3',
  'gripper',
];

// Planar link lengths, side view (pixels within viewBox).
const LINK_LENS = [70, 62, 46, 26];
const LINK_COLORS = ['#60a5fa', '#34d399', '#facc15', '#f87171'];

/**
 * JointAngleView — 2.5-D stick-figure of a 7-DoF serial arm.
 *
 * Layout (side view):
 *  • joint[0] `shoulder_pan`    — base yaw, drawn as a rotating pedestal ellipse
 *  • joint[1] `shoulder_lift`   — first planar hinge
 *  • joint[2] `elbow`           — second planar hinge
 *  • joint[3] `wrist_1`         — third planar hinge
 *  • joint[4] `wrist_2`         — end-effector yaw (affects wedge width)
 *  • joint[5] `wrist_3`         — end-effector roll (wedge rotates)
 *  • joint[6] `gripper`         — parallel-finger opening width
 *
 * Data shapes with other DoF counts are still drawn by chaining the first
 * four available angles as planar hinges; the base pedestal, wrist details
 * and gripper are only shown when their indices exist.
 *
 * ## Data format
 * JSONL lines `{ ts: number, data: number[] }`. Stride is inferred from the
 * first sample. Recommended source rate: 30–250 Hz.
 *
 * ## Hooks used
 * `useMergedTrack` + `useTrackSample` (lerp) + `useClockValue` for React
 * paint. No Canvas — the arm is plain SVG so transforms stay cheap and
 * crisp at any zoom level.
 */
export function JointAngleView({
  src,
  clock,
  className,
  fps = 30,
  jointNames,
}: JointAngleViewProps) {
  const resolvedClock = useClockContext(clock);
  const { engine } = usePlaylist({ url: src }, resolvedClock);
  const { tracks } = useMergedTrack(engine, resolvedClock);
  const time = useClockValue(fps, resolvedClock);
  const track = tracks.get('data');
  const sample = useTrackSample(track, time);

  const dof = track?.stride ?? 0;
  const names = jointNames ?? (dof === 7 ? DEFAULT_NAMES_7 : Array.from({ length: dof }, (_, i) => `J${i}`));

  // Forward kinematics for the visual chain. Computed inline — `sample` is a
  // reused Float32Array whose reference is stable across renders (only its
  // contents change), so useMemo would return a stale geometry. The math is
  // tiny (4 planar rotations) so re-running each render is fine.
  const geo = computeGeometry(sample, dof);

  return (
    <div className={`bg-zinc-900 text-zinc-100 text-xs font-mono ${className ?? ''}`}>
      <div className="px-3 py-1.5 flex gap-4 border-b border-zinc-800 text-[10px]">
        <span className="text-zinc-400">Arm · {dof} DoF @ {time.toFixed(2)}s</span>
      </div>
      <div className="flex">
        <div className="flex-1 min-w-0" style={{ minHeight: 260 }}>
          <svg viewBox="0 0 320 280" className="w-full h-full" role="img" aria-label="Robot arm">
            {/* Floor + pedestal */}
            <line x1={20} y1={250} x2={300} y2={250} stroke="#3f3f46" strokeWidth={1} />
            <Pedestal yaw={geo.baseYaw} />
            {/* Links */}
            {geo.points.slice(1).map((p, i) => (
              <line
                key={`link-${i}`}
                x1={geo.points[i].x}
                y1={geo.points[i].y}
                x2={p.x}
                y2={p.y}
                stroke={LINK_COLORS[i % LINK_COLORS.length]}
                strokeWidth={5}
                strokeLinecap="round"
              />
            ))}
            {/* Joint pivots */}
            {geo.points.map((p, i) => (
              <circle key={`pivot-${i}`} cx={p.x} cy={p.y} r={i === 0 ? 4 : 5} fill="#18181b" stroke="#a1a1aa" strokeWidth={1.5} />
            ))}
            {/* Gripper */}
            {geo.end && (
              <EndEffector
                x={geo.end.x}
                y={geo.end.y}
                heading={geo.end.heading}
                gripper={geo.gripper}
              />
            )}
            {/* Joint name labels */}
            {geo.points.slice(1, 5).map((p, i) => {
              const name = names[i + 1] ?? `J${i + 1}`;
              return (
                <text
                  key={`lbl-${i}`}
                  x={p.x + 8}
                  y={p.y - 8}
                  fill="#d4d4d8"
                  fontSize={9}
                  fontFamily="ui-monospace, monospace"
                >
                  {name}
                </text>
              );
            })}
          </svg>
        </div>
        <div className="w-44 shrink-0 p-3 border-l border-zinc-800 space-y-0.5">
          {sample && names.map((name, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="text-zinc-400 truncate" title={name}>{name}</span>
              <span className="tabular-nums text-zinc-200">{sample[i].toFixed(3)}</span>
            </div>
          ))}
          {!sample && <div className="text-zinc-500">waiting for samples…</div>}
        </div>
      </div>
    </div>
  );
}

// ---- Internals --------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

interface Geometry {
  baseYaw: number;
  points: Point[];
  end: { x: number; y: number; heading: number } | null;
  gripper: number;
}

function computeGeometry(sample: Float32Array | null, dof: number): Geometry {
  const base: Point = { x: 160, y: 230 };

  // Default (no sample yet) — arm resting pose
  if (!sample || dof === 0) {
    const rest: Point[] = [base];
    let theta = -Math.PI / 2;
    for (let i = 0; i < LINK_LENS.length; i++) {
      const prev = rest[rest.length - 1];
      rest.push({
        x: prev.x + LINK_LENS[i] * Math.cos(theta),
        y: prev.y + LINK_LENS[i] * Math.sin(theta),
      });
    }
    return { baseYaw: 0, points: rest, end: null, gripper: 0 };
  }

  // Planar chain
  const angles = [
    sample[1] ?? 0, // shoulder_lift
    sample[2] ?? 0, // elbow
    sample[3] ?? 0, // wrist_1
    sample[4] ?? 0, // wrist_2 (used as last bend)
  ];
  const pts: Point[] = [base];
  let theta = -Math.PI / 2; // upward
  for (let i = 0; i < LINK_LENS.length; i++) {
    theta += angles[i];
    const prev = pts[pts.length - 1];
    pts.push({
      x: prev.x + LINK_LENS[i] * Math.cos(theta),
      y: prev.y + LINK_LENS[i] * Math.sin(theta),
    });
  }

  const endIdx = pts.length - 1;
  const end = {
    x: pts[endIdx].x,
    y: pts[endIdx].y,
    heading: theta + (sample[5] ?? 0) * 0.6, // wrist_3 tweaks the heading a bit
  };

  const gripper = Math.max(0, Math.min(1, (sample[6] ?? 0)));

  return {
    baseYaw: sample[0] ?? 0,
    points: pts,
    end,
    gripper,
  };
}

function Pedestal({ yaw }: { yaw: number }) {
  const cx = 160;
  const cy = 238;
  // Rotating pedestal shown as an ellipse whose x-scale depends on cos(yaw).
  const rx = 22 * Math.abs(Math.cos(yaw));
  return (
    <g>
      <ellipse cx={cx} cy={cy + 10} rx={26} ry={4} fill="#27272a" />
      <ellipse cx={cx} cy={cy} rx={Math.max(4, rx)} ry={8} fill="#3f3f46" stroke="#71717a" strokeWidth={1} />
      <line
        x1={cx}
        y1={cy}
        x2={cx + 18 * Math.cos(yaw)}
        y2={cy - 2}
        stroke="#fbbf24"
        strokeWidth={2}
      />
    </g>
  );
}

function EndEffector({
  x,
  y,
  heading,
  gripper,
}: {
  x: number;
  y: number;
  heading: number;
  gripper: number;
}) {
  // Perpendicular direction (for finger offset)
  const nx = -Math.sin(heading);
  const ny = Math.cos(heading);
  // Along direction (for finger tips)
  const dx = Math.cos(heading);
  const dy = Math.sin(heading);
  const half = 4 + gripper * 10;
  const tipLen = 14;
  const f1 = {
    bx: x + nx * half,
    by: y + ny * half,
    tx: x + nx * half + dx * tipLen,
    ty: y + ny * half + dy * tipLen,
  };
  const f2 = {
    bx: x - nx * half,
    by: y - ny * half,
    tx: x - nx * half + dx * tipLen,
    ty: y - ny * half + dy * tipLen,
  };
  return (
    <g>
      {/* palm */}
      <line
        x1={f1.bx}
        y1={f1.by}
        x2={f2.bx}
        y2={f2.by}
        stroke="#e4e4e7"
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* fingers */}
      <line x1={f1.bx} y1={f1.by} x2={f1.tx} y2={f1.ty} stroke="#e4e4e7" strokeWidth={3} strokeLinecap="round" />
      <line x1={f2.bx} y1={f2.by} x2={f2.tx} y2={f2.ty} stroke="#e4e4e7" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}
