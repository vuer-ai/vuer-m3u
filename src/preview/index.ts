/**
 * @vuer-ai/vuer-m3u/preview — generic, URL-based file preview.
 *
 * This submodule is decoupled from timeline / dtype / lane. It dispatches
 * on file extension (and optionally Content-Type) to render a lightweight,
 * GitHub-style preview for any URL, with hard / soft size limits.
 *
 * Usage:
 *
 *   import { FilePreview } from '@vuer-ai/vuer-m3u/preview';
 *   <FilePreview url="https://s3.../path/file.mcap" />
 */

export { FilePreview } from './components/FilePreview';

export type {
  PreviewKind,
  PreviewLimits,
  ResolvedFileMeta,
  Fetcher,
  FilePreviewProps,
  PreviewerProps,
} from './types';

export {
  detectKind,
  extractExtension,
  extractFilename,
  kindLabel,
} from './detect';

export { DEFAULT_LIMITS, mergeLimits } from './limits';
export { formatBytes } from './format-bytes';
export { rangeFetch, rangeFetchTail, RangeFetchError } from './range-fetch';
export type { RangeFetchResult } from './range-fetch';
