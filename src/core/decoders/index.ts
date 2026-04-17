import type { SegmentDecoder } from '../types';
import { jsonlDecoder } from './jsonl';
import { textDecoder } from './text';
import { rawDecoder } from './raw';
import { envelopeDecoder } from './envelope';

const DECODERS: Record<string, SegmentDecoder> = {
  json: envelopeDecoder,
  jsonl: jsonlDecoder,
  vtt: textDecoder,
  ts: rawDecoder,
};

/**
 * Get the decoder for a given chunk format.
 * Falls back to rawDecoder for unknown formats.
 */
export function getDecoder(format?: string): SegmentDecoder {
  return (format && DECODERS[format]) || rawDecoder;
}

/**
 * Register a custom decoder for a format.
 * Use this to add support for MessagePack, Parquet, etc.
 *
 * @example
 * ```ts
 * import { decode } from '@msgpack/msgpack';
 * registerDecoder('mpk', (raw) => decode(raw));
 * ```
 */
export function registerDecoder(format: string, decoder: SegmentDecoder): void {
  DECODERS[format] = decoder;
}

export { jsonlDecoder, textDecoder, rawDecoder, envelopeDecoder };
