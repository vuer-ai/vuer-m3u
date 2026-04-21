// Core
export { parsePlaylist } from './core/parser';
export { resolveSegment, resolveSegmentRange, resolveSegmentWindow } from './core/segment-resolver';
export { SegmentLoader } from './core/segment-loader';
export { Playlist } from './core/playlist';
export { TimelineClock } from './core/timeline';
export { findBracket } from './core/find-bracket';
export { getDecoder, registerDecoder, jsonlDecoder, textDecoder, rawDecoder } from './core/decoders';

// Line-level JSONL types
export type { ContinuousSample, EventEntry } from './core/samples';

// Track normalization
export { samplesNormalizer } from './core/normalize';
export type { Normalizer } from './core/normalize';

// Interpolators
export { lerp, step, nearest, slerpQuat, sampleTrack } from './core/interpolators';
export type { Interpolator, BracketHint } from './core/interpolators';

// Core types
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
  TrackSamples,
} from './core/types';

// React hooks
export { usePlaylist } from './react/hooks/use-playlist';
export { useSegment } from './react/hooks/use-segment';
export { useSegmentTrack } from './react/hooks/use-segment-track';
export type {
  SegmentTrackState,
  SegmentTrackOptions,
} from './react/hooks/use-segment-track';
export { useTimeline } from './react/hooks/use-timeline';
export { useClockValue } from './react/hooks/use-clock-value';
export { useMergedTrack } from './react/hooks/use-merged-track';
export type {
  MergedTrackState,
  MergedTrackOptions,
} from './react/hooks/use-merged-track';
export { useTrackSample } from './react/hooks/use-track-sample';

// React context
export { ClockProvider, useClockContext } from './react/clock-context';
export type { ClockProviderProps } from './react/clock-context';

// React components
export { TimelineController } from './react/TimelineController';
export { VideoPlayer } from './react/players/VideoPlayer';
export { SubtitleView } from './react/players/SubtitleView';

// Robot-focused pre-built views
export { ImuView } from './react/players/ImuView';
export type { ImuViewProps, ImuSample } from './react/players/ImuView';
export { JointAngleView } from './react/players/JointAngleView';
export type { JointAngleViewProps, JointAngleSample } from './react/players/JointAngleView';
export { PoseView } from './react/players/PoseView';
export type { PoseViewProps, PoseSample } from './react/players/PoseView';
export { ActionLabelView } from './react/players/ActionLabelView';
export type { ActionLabelViewProps, ActionEvent } from './react/players/ActionLabelView';
export { BarTrackView } from './react/players/BarTrackView';
export type { BarTrackViewProps, BarTrackSample } from './react/players/BarTrackView';
export { DetectionBoxView } from './react/players/DetectionBoxView';
export type { DetectionBoxViewProps, DetectionEvent } from './react/players/DetectionBoxView';
