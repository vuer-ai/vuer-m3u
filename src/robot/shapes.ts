export type Shape =
  | 'scalar'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'vecN'
  | 'quaternion'
  | 'event';

export type ContinuousShape = Exclude<Shape, 'event'>;

export interface ChunkEnvelope<T = unknown> {
  ts: number;
  te: number;
  fs?: number;
  fe?: number;
  dtype: string;
  shape: Shape;
  payload: T[];
}

export interface ContinuousSample {
  ts: number;
  data: number | number[];
}

export interface EventEntry {
  ts: number;
  te?: number;
  label?: string;
  [key: string]: unknown;
}
