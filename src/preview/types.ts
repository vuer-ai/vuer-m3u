/**
 * Public types for the @vuer-ai/vuer-m3u/preview submodule.
 *
 * The preview system is intentionally decoupled from timeline / dtype / lane.
 * It dispatches on file extension (and optionally Content-Type) to render a
 * lightweight, GitHub-style preview for any URL — independent of business
 * semantics or playback time.
 */

import type { ReactNode } from 'react';

/**
 * Discrete categories the preview dispatcher resolves to.
 * `unsupported` falls through to the download-only state.
 */
export type PreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'markdown'
  | 'text'
  | 'code'
  | 'csv'
  | 'tsv'
  | 'jsonl'
  | 'json'
  | 'npy'
  | 'mcap'
  | 'unsupported';

/**
 * Per-kind size thresholds (in bytes).
 *
 * - Hard limits (image): if `props.size` is provided and exceeds the limit,
 *   the previewer is skipped and `<TooLargeState>` is shown. When `size` is
 *   not provided we let the browser handle progressive loading.
 * - Soft limits (text/code/markdown/csv/tsv/jsonl): the previewer fetches
 *   only `Range: bytes=0-{limit-1}` and shows `<TruncatedNotice>` if the
 *   server's `Content-Range` indicates the file is larger.
 * - npy / mcap have their own bounded read patterns (header / footer+summary).
 */
export interface PreviewLimits {
  image: number;
  video: number;
  audio: number;
  text: number;
  csv: number;
  jsonl: number;
  npyHeader: number;
  npyData: number;
  mcapSummary: number;
}

export interface ResolvedFileMeta {
  url: string;
  filename: string;
  extension: string;
  kind: PreviewKind;
  size: number | null;
  contentType: string | null;
}

/**
 * Pluggable fetcher. Defaults to the global `fetch`. Used to inject
 * Authorization headers, sign URLs, or proxy through a backend.
 */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface FilePreviewProps {
  /** Absolute URL of the file to preview. */
  url: string;
  /**
   * Display name. Defaults to the last path segment of `url`. Also used to
   * infer the extension when the URL itself has no extension.
   */
  filename?: string;
  /**
   * Pre-known file size in bytes. When provided, image hard-limit checks
   * are enforced without any HEAD request. DreamLake-style backends usually
   * have this from their listing API.
   */
  size?: number;
  /**
   * Pre-known Content-Type. When provided, takes precedence over
   * extension-based detection.
   */
  contentType?: string;
  /**
   * Custom fetcher (e.g., to inject Authorization headers). Defaults to
   * the global `fetch`.
   */
  fetcher?: Fetcher;
  /** Override default size limits per kind. */
  limits?: Partial<PreviewLimits>;
  /**
   * Opt-in HEAD probe. Default `false`. When true, FilePreview issues a
   * HEAD request to populate Content-Length and Content-Type. Most callers
   * should leave this off and pass `size` / `contentType` directly.
   */
  probe?: boolean;
  /**
   * Custom download handler. Defaults to navigating to the URL with the
   * `download` attribute on a synthetic anchor.
   */
  onDownload?: (meta: ResolvedFileMeta) => void;
  /** Tailwind / CSS class for the outer wrapper. */
  className?: string;
  /**
   * Optional accent color (semantic name from `timeline/colors.ts` or any
   * CSS color string). Used for the type badge in the header.
   */
  accentColor?: string;
}

/**
 * Props passed by `<FilePreview>` to each previewer component.
 *
 * Each previewer is responsible for its own fetch (using `fetcher`) and
 * for reporting truncation back to the frame via the optional `onTruncate`
 * callback when applicable.
 */
export interface PreviewerProps {
  meta: ResolvedFileMeta;
  fetcher: Fetcher;
  limits: PreviewLimits;
  onTruncate?: (truncatedAt: number, totalSize: number | null) => void;
}

/**
 * Element renderable inside the frame body. Plain ReactNode, kept as a
 * dedicated alias for documentation.
 */
export type PreviewBody = ReactNode;
