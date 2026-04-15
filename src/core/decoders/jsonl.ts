import type { SegmentDecoder } from '../types';

export const jsonlDecoder: SegmentDecoder<Record<string, unknown>[]> = (raw) => {
  const text = new TextDecoder().decode(raw);
  const results: Record<string, unknown>[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      results.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed lines
    }
  }
  return results;
};
