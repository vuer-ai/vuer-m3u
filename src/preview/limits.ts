import type { PreviewLimits } from './types';

const MB = 1024 * 1024;
const KB = 1024;

export const DEFAULT_LIMITS: PreviewLimits = {
  image: 20 * MB,
  video: 500 * MB,
  audio: 50 * MB,
  text: 5 * MB,
  csv: 10 * MB,
  jsonl: 10 * MB,
  npyHeader: 4 * KB,
  npyData: 256 * KB,
  mcapSummary: 32 * MB,
};

export function mergeLimits(overrides?: Partial<PreviewLimits>): PreviewLimits {
  if (!overrides) return DEFAULT_LIMITS;
  return { ...DEFAULT_LIMITS, ...overrides };
}
