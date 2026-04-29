import type { PreviewKind } from './types';

/**
 * Suffix → PreviewKind. Lowercased keys; lookup is case-insensitive.
 *
 * Keep this conservative — only formats v1 actually renders. Anything not
 * listed here resolves to `'unsupported'`, which renders the download-only
 * state. Adding a new previewer = adding entries here AND wiring the
 * dispatcher in FilePreview.tsx.
 */
const EXTENSION_MAP: Record<string, PreviewKind> = {
  // images
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  avif: 'image',
  svg: 'image',

  // video
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  m4v: 'video',

  // audio
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  flac: 'audio',
  m4a: 'audio',

  // markdown
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',

  // plain text
  txt: 'text',
  log: 'text',

  // code
  py: 'code',
  js: 'code',
  mjs: 'code',
  cjs: 'code',
  ts: 'code',
  tsx: 'code',
  jsx: 'code',
  json: 'json',
  yaml: 'code',
  yml: 'code',
  toml: 'code',
  sh: 'code',
  bash: 'code',
  zsh: 'code',
  rs: 'code',
  go: 'code',
  c: 'code',
  cpp: 'code',
  cc: 'code',
  h: 'code',
  hpp: 'code',
  java: 'code',
  kt: 'code',
  swift: 'code',
  rb: 'code',
  php: 'code',
  css: 'code',
  scss: 'code',
  html: 'code',
  xml: 'code',
  sql: 'code',

  // tabular
  csv: 'csv',
  tsv: 'tsv',
  jsonl: 'jsonl',
  ndjson: 'jsonl',

  // robotics / ml
  npy: 'npy',
  mcap: 'mcap',
};

/**
 * MIME type → PreviewKind. Used when `contentType` is provided (either by
 * the caller or by an explicit HEAD probe). Patterns match by prefix or
 * exact match; first hit wins.
 */
const MIME_PATTERNS: Array<[RegExp, PreviewKind]> = [
  [/^image\/svg\+xml$/i, 'image'],
  [/^image\//i, 'image'],
  [/^video\//i, 'video'],
  [/^audio\//i, 'audio'],
  [/^text\/markdown$/i, 'markdown'],
  [/^text\/csv$/i, 'csv'],
  [/^text\/tab-separated-values$/i, 'tsv'],
  [/^application\/x-ndjson$/i, 'jsonl'],
  [/^application\/json$/i, 'json'],
  [/^application\/yaml$/i, 'code'],
  [/^application\/x-yaml$/i, 'code'],
  [/^text\/plain$/i, 'text'],
  [/^text\//i, 'code'],
  [/^application\/javascript$/i, 'code'],
  [/^application\/typescript$/i, 'code'],
  [/^application\/x-mcap$/i, 'mcap'],
];

/**
 * Extract the lower-cased extension (no leading dot) from a URL or filename.
 *
 * Strips query strings and fragments. Returns empty string if there is no
 * extension.
 */
export function extractExtension(input: string): string {
  if (!input) return '';
  // Strip query and fragment
  let path = input;
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  const h = path.indexOf('#');
  if (h >= 0) path = path.slice(0, h);
  // Last path segment
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const segment = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const dot = segment.lastIndexOf('.');
  if (dot <= 0) return '';
  return segment.slice(dot + 1).toLowerCase();
}

export function extractFilename(url: string, override?: string): string {
  if (override) return override;
  if (!url) return '';
  let path = url;
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  const h = path.indexOf('#');
  if (h >= 0) path = path.slice(0, h);
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const segment = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Resolve a `PreviewKind` for a given URL / filename / Content-Type.
 *
 * Resolution order:
 *   1. Content-Type, if provided and matched
 *   2. File extension, if known
 *   3. `'unsupported'`
 */
export function detectKind(
  urlOrFilename: string,
  contentType?: string | null,
): PreviewKind {
  if (contentType) {
    const trimmed = contentType.split(';')[0].trim();
    for (const [pattern, kind] of MIME_PATTERNS) {
      if (pattern.test(trimmed)) return kind;
    }
  }
  const ext = extractExtension(urlOrFilename);
  if (ext && Object.prototype.hasOwnProperty.call(EXTENSION_MAP, ext)) {
    return EXTENSION_MAP[ext];
  }
  return 'unsupported';
}

/**
 * Human-readable label for a kind, used in the header type badge.
 */
export function kindLabel(kind: PreviewKind, extension?: string): string {
  if (extension) return extension.toUpperCase();
  switch (kind) {
    case 'image':
      return 'Image';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    case 'markdown':
      return 'Markdown';
    case 'text':
      return 'Text';
    case 'code':
      return 'Code';
    case 'csv':
      return 'CSV';
    case 'tsv':
      return 'TSV';
    case 'jsonl':
      return 'JSONL';
    case 'json':
      return 'JSON';
    case 'npy':
      return 'NPY';
    case 'mcap':
      return 'MCAP';
    case 'unsupported':
      return 'File';
  }
}
