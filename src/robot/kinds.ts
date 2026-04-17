import type { Shape } from './shapes';

export interface KindDefinition {
  shape: Shape;
  label: string;
  defaultView?: string;
}

export const KINDS: Record<string, KindDefinition> = {
  position:       { shape: 'vec3',       label: 'Position',       defaultView: 'Trajectory3D' },
  velocity:       { shape: 'vec3',       label: 'Velocity',       defaultView: 'LineChart' },
  orientation:    { shape: 'quaternion', label: 'Orientation',    defaultView: 'OrientationView' },
  joints:         { shape: 'vecN',       label: 'Joint angles',   defaultView: 'LineChart' },
  joint_velocity: { shape: 'vecN',       label: 'Joint velocity', defaultView: 'LineChart' },
  gripper_width:  { shape: 'scalar',     label: 'Gripper width',  defaultView: 'Dial' },
  gripper_force:  { shape: 'scalar',     label: 'Gripper force',  defaultView: 'Dial' },
  imu_accel:      { shape: 'vec3',       label: 'Accel',          defaultView: 'LineChart' },
  imu_gyro:       { shape: 'vec3',       label: 'Gyro',           defaultView: 'LineChart' },
  detection:      { shape: 'event',      label: 'Detection',      defaultView: 'BBoxOverlay' },
  action:         { shape: 'event',      label: 'Action',         defaultView: 'EventsList' },
};

export type Kind = keyof typeof KINDS;

export function getKind(dtype: string): KindDefinition | undefined {
  return KINDS[dtype];
}

export function registerKind(dtype: string, def: KindDefinition): void {
  KINDS[dtype] = def;
}
