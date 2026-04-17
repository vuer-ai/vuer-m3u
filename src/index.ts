// Core
export { parsePlaylist } from './core/parser';
export { resolveSegment, resolveSegmentRange, resolveSegmentWindow } from './core/segment-resolver';
export { SegmentLoader } from './core/segment-loader';
export { Playlist } from './core/playlist';
export { TimelineClock } from './core/timeline';
export { findBracket } from './core/find-bracket';
export { getDecoder, registerDecoder, jsonlDecoder, textDecoder, rawDecoder, envelopeDecoder } from './core/decoders';

// Robot data layer
export { KINDS, getKind, registerKind } from './robot/kinds';
export type { Shape, ContinuousShape, ChunkEnvelope, ContinuousSample, EventEntry } from './robot/shapes';
export type { Kind, KindDefinition } from './robot/kinds';

// Types
export type {
  ChunkFormat,
  TrackType,
  PlaylistSegment,
  ParsedPlaylist,
  SegmentData,
  SegmentDecoder,
  PlaylistOptions,
  SegmentState,
  TimelineState,
} from './core/types';

// React hooks
export { usePlaylist } from './react/hooks/use-playlist';
export { useSegment } from './react/hooks/use-segment';
export { useTimeline } from './react/hooks/use-timeline';
export { useClockValue } from './react/hooks/use-clock-value';
export { useTrackReducer } from './react/hooks/use-track-reducer';
export type { TrackSamples, TrackReducerState } from './react/hooks/use-track-reducer';

// React components
export { TimelineController } from './react/TimelineController';
export { VideoPlayer } from './react/players/VideoPlayer';
export { JsonlView } from './react/players/JsonlView';
export { SubtitleView } from './react/players/SubtitleView';
export { CanvasView } from './react/players/CanvasView';
