import type { SegmentDecoder } from '../types';

export const textDecoder: SegmentDecoder<string> = (raw) => {
  return new TextDecoder().decode(raw);
};
