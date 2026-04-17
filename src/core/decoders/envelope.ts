import type { SegmentDecoder } from '../types';
import type { ChunkEnvelope } from '../../robot/shapes';

export const envelopeDecoder: SegmentDecoder<ChunkEnvelope> = (raw) => {
  const text = new TextDecoder().decode(raw);
  return JSON.parse(text) as ChunkEnvelope;
};
